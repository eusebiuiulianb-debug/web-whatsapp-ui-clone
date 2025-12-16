import type { NextApiRequest, NextApiResponse } from "next";
import { ContentManagerSender, type ContentManagerMessage as PrismaContentManagerMessage } from "@prisma/client";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { getCreatorContentSnapshot, type CreatorContentSnapshot } from "../../../lib/creatorContentManager";
import { CONTENT_MANAGER_SYSTEM_PROMPT } from "../../../lib/ai/prompts";
import { maybeDecrypt } from "../../../server/crypto/maybeDecrypt";
import { sanitizeForOpenAi, sanitizeOpenAiMessages } from "../../../server/ai/sanitizeForOpenAi";

type SerializedMessage = {
  id: string;
  sender: ContentManagerSender;
  content: string;
  createdAt: string;
};

const HISTORY_LIMIT = 20;
const HISTORY_RESPONSE_LIMIT = 50;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const creatorId = await resolveCreatorId();
    const conversation = await getOrCreateConversation(creatorId);
    const messagesDesc = await prisma.contentManagerMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_RESPONSE_LIMIT,
    });
    const messages = messagesDesc.reverse().map(serializeMessage);
    const snapshot = await getCreatorContentSnapshot(creatorId);

    return res.status(200).json({ conversationId: conversation.id, messages, snapshot });
  } catch (err) {
    console.error("Error loading content manager chat history", err);
    return sendServerError(res, "No se pudo cargar el chat del Manager IA de contenido");
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const incomingMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!incomingMessage) {
    return sendBadRequest(res, "message is required");
  }

  try {
    const creatorId = await resolveCreatorId();
    const conversation = await getOrCreateConversation(creatorId);

    const creatorMessage = await prisma.contentManagerMessage.create({
      data: {
        conversationId: conversation.id,
        sender: ContentManagerSender.CREATOR,
        content: incomingMessage,
      },
    });

    const historyDesc = await prisma.contentManagerMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT + 1,
    });
    const history = historyDesc.filter((m) => m.id !== creatorMessage.id).reverse();

    const snapshot = await getCreatorContentSnapshot(creatorId);

    let managerReply = "";
    let usedFallback = false;

    const apiKey = maybeDecrypt(process.env.OPENAI_API_KEY, { creatorId, label: "OPENAI_API_KEY" });
    if (!apiKey) {
      usedFallback = true;
      managerReply = getContentManagerFallbackReply(incomingMessage, snapshot);
    } else {
      try {
        const safeSnapshot = sanitizeForOpenAi(snapshot, { creatorId });
        managerReply = await askContentManagerAi({
          systemPrompt: CONTENT_MANAGER_SYSTEM_PROMPT,
          context: `Snapshot de contenido del creador:\n${JSON.stringify(safeSnapshot, null, 2)}`,
          history,
          userMessage: incomingMessage,
          apiKey,
          creatorId,
        });
      } catch (err) {
        console.error("Error calling Content Manager IA", err);
        usedFallback = true;
        managerReply = getContentManagerFallbackReply(incomingMessage, snapshot);
      }
    }

    const managerMessage = await prisma.contentManagerMessage.create({
      data: {
        conversationId: conversation.id,
        sender: ContentManagerSender.MANAGER,
        content: managerReply,
      },
    });

    void prisma.contentManagerConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return res.status(200).json({
      conversationId: conversation.id,
      messages: [serializeMessage(creatorMessage), serializeMessage(managerMessage)],
      usedFallback,
    });
  } catch (err) {
    console.error("Error processing content manager chat", err);
    return sendServerError(res, "No se pudo enviar el mensaje al Manager IA de contenido");
  }
}

async function getOrCreateConversation(creatorId: string) {
  return prisma.contentManagerConversation.upsert({
    where: { creatorId },
    create: {
      creatorId,
    },
    update: {
      updatedAt: new Date(),
    },
  });
}

async function resolveCreatorId(): Promise<string> {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;

  const defaultCreator = await prisma.creator.findUnique({
    where: { id: "creator-1" },
    select: { id: true },
  });
  if (defaultCreator?.id) return defaultCreator.id;

  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (!creator) {
    throw new Error("Creator not found");
  }
  return creator.id;
}

function serializeMessage(message: PrismaContentManagerMessage): SerializedMessage {
  return {
    id: message.id,
    sender: message.sender,
    content: message.content,
    createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : String(message.createdAt),
  };
}

async function askContentManagerAi(params: {
  systemPrompt: string;
  context: string;
  history: PrismaContentManagerMessage[];
  userMessage: string;
  apiKey: string;
  creatorId?: string;
}): Promise<string> {
  const { systemPrompt, context, history, userMessage, apiKey, creatorId } = params;

  const historyMessages = history.slice(-HISTORY_LIMIT).map((msg) => ({
    role: msg.sender === ContentManagerSender.CREATOR ? "user" : "assistant",
    content: msg.content,
  }));

  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.4,
    messages: sanitizeOpenAiMessages(
      [
        { role: "system", content: systemPrompt },
        { role: "system", content: context },
        ...historyMessages,
        { role: "user", content: userMessage },
      ],
      { creatorId }
    ),
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as any;
  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error("Empty response from Content Manager IA");
  }

  return reply.trim();
}

function getContentManagerFallbackReply(input: string, snapshot: CreatorContentSnapshot): string {
  const lower = input.toLowerCase();
  const bestPackName = snapshot.bestPack30d?.name ?? "ninguno";
  const packsToReviewNames = snapshot.packsToReview.map((p) => p.name).join(", ");
  const summary = `Resumen 30d (modo demo): ${snapshot.totalPacks} packs activos, pack fuerte: ${bestPackName}, packs a revisar: ${snapshot.packsToReview.length}, ingresos: ${Math.round(snapshot.ingresosTotales30d)} €.`;

  const isPromo = lower.includes("promocionar") || lower.includes("promocionar") || lower.includes("promover") || lower.includes("empujar");
  const isGap = lower.includes("huecos") || lower.includes("falta") || lower.includes("vacío") || lower.includes("vacío");
  const isNewPack = lower.includes("nuevo") || lower.includes("crear") || lower.includes("pack nuevo");

  const bestLine =
    snapshot.bestPack30d && (snapshot.bestPack30d.ingresos30d ?? 0) > 0
      ? `1) Empuja ${snapshot.bestPack30d.name} este finde: tiene ${snapshot.bestPack30d.activeFans} fans activos y ${snapshot.bestPack30d.ingresos30d} € en 30d.`
      : "1) No hay pack fuerte aún: ofrece primero el mensual con una promo simple.";

  const reviewLine =
    snapshot.packsToReview.length > 0
      ? `2) Revisa ${packsToReviewNames || "tus packs sin ventas"}: actualiza copy/precio o retíralos temporalmente.`
      : "2) No hay packs con 0 ventas/fans; mantén el catálogo y refresca el contenido del mensual.";

  const newLine =
    snapshot.totalPacks <= 2
      ? "3) Considera crear un pack especial nuevo para probar ticket alto este mes."
      : "3) Añade una variación rápida (pack especial o extra) para no depender solo del mensual.";

  if (isPromo) {
    return [summary, bestLine, reviewLine, newLine].join("\n");
  }
  if (isGap) {
    return [
      summary,
      "1) Detecta huecos: ¿tienes algo para bienvenida, algo mensual y algo premium? Si falta uno, créalo.",
      reviewLine,
      newLine,
    ].join("\n");
  }
  if (isNewPack) {
    return [
      summary,
      "1) Lanza un pack especial con ticket medio-alto y cupos limitados (3-5 plazas).",
      reviewLine,
      bestLine,
    ].join("\n");
  }

  return [summary, bestLine, reviewLine, newLine].join("\n");
}
