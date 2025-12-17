import type { NextApiRequest, NextApiResponse } from "next";
import { ManagerSender, type ManagerMessage as PrismaManagerMessage } from "@prisma/client";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { getCreatorBusinessSnapshot, type CreatorBusinessSnapshot } from "../../../lib/creatorManager";
import { BUSINESS_MANAGER_SYSTEM_PROMPT } from "../../../lib/ai/prompts";
import { maybeDecrypt } from "../../../server/crypto/maybeDecrypt";
import { isInvalidEncryptedContentError, parseOpenAiError, toSafeErrorMessage } from "../../../server/ai/openAiError";
import { sanitizeForOpenAi } from "../../../server/ai/sanitizeForOpenAi";

type SerializedMessage = {
  id: string;
  sender: ManagerSender;
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
    const messagesDesc = await prisma.managerMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_RESPONSE_LIMIT,
    });
    const messages = messagesDesc.reverse().map(serializeMessage);

    return res.status(200).json({ conversationId: conversation.id, messages });
  } catch (err) {
    console.error("Error loading manager chat history", err);
    return sendServerError(res, "No se pudo cargar el chat del Manager IA");
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

    const creatorMessage = await prisma.managerMessage.create({
      data: {
        conversationId: conversation.id,
        sender: ManagerSender.CREATOR,
        content: incomingMessage,
      },
    });

    // Tomamos historial sin duplicar el mensaje recién creado.
    const historyDesc = await prisma.managerMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT + 1,
    });
    const history = historyDesc.filter((m) => m.id !== creatorMessage.id).reverse();

    const snapshot = await getCreatorBusinessSnapshot(creatorId, { prismaClient: prisma });
    const systemPrompt = BUSINESS_MANAGER_SYSTEM_PROMPT;
    const safeSnapshot = sanitizeForOpenAi(snapshot, { creatorId });
    const contextBlock = `Snapshot del negocio del creador:\n${JSON.stringify(safeSnapshot, null, 2)}`;

    let managerReply = "";
    let usedFallback = false;

    const apiKey = maybeDecrypt(process.env.OPENAI_API_KEY, { creatorId, label: "OPENAI_API_KEY" });
    if (!apiKey) {
      usedFallback = true;
      managerReply = getManagerFallbackReply(incomingMessage, snapshot);
    } else {
      try {
        managerReply = await askManagerAi({
          systemPrompt,
          context: contextBlock,
          history,
          userMessage: incomingMessage,
          apiKey,
          creatorId,
        });
      } catch (err) {
        usedFallback = true;
        if (isInvalidEncryptedContentError(err)) {
          console.warn("manager_ai_invalid_encrypted_content", {
            creatorId,
            status: (err as any)?.status ?? null,
            code: (err as any)?.code ?? "invalid_encrypted_content",
            message: "[redacted]",
          });
        } else {
          console.error("Error calling Manager IA", toSafeErrorMessage(err, { creatorId }));
        }
        managerReply = getManagerFallbackReply(incomingMessage, snapshot);
      }
    }

    const managerMessage = await prisma.managerMessage.create({
      data: {
        conversationId: conversation.id,
        sender: ManagerSender.MANAGER,
        content: managerReply,
      },
    });

    // Actualizamos updatedAt para que refleje actividad reciente.
    void prisma.managerConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return res.status(200).json({
      conversationId: conversation.id,
      messages: [serializeMessage(creatorMessage), serializeMessage(managerMessage)],
      usedFallback,
    });
  } catch (err) {
    console.error("Error processing manager chat", toSafeErrorMessage(err));
    return sendServerError(res, "No se pudo enviar el mensaje al Manager IA");
  }
}

async function getOrCreateConversation(creatorId: string) {
  return prisma.managerConversation.upsert({
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

function serializeMessage(message: PrismaManagerMessage): SerializedMessage {
  return {
    id: message.id,
    sender: message.sender,
    content: message.content,
    createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : String(message.createdAt),
  };
}

async function askManagerAi(params: {
  systemPrompt: string;
  context: string;
  history: PrismaManagerMessage[];
  userMessage: string;
  apiKey: string;
  creatorId?: string;
}): Promise<string> {
  const { systemPrompt, context, history, userMessage, apiKey, creatorId } = params;

  const historyMessages = history.slice(-HISTORY_LIMIT).map((msg) => ({
    role: msg.sender === ManagerSender.CREATOR ? "user" : "assistant",
    content: msg.content,
  }));

  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "system", content: context },
      ...historyMessages,
      { role: "user", content: userMessage },
    ],
  };

  const safePayload = sanitizeForOpenAi(payload, { creatorId });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(safePayload),
  });

  if (!response.ok) {
    const errorInfo = await parseOpenAiError(response, { creatorId });
    const error = new Error(`OpenAI error ${errorInfo.status}: ${errorInfo.message}`);
    (error as any).code = errorInfo.code;
    (error as any).status = errorInfo.status;
    (error as any).safeMessage = errorInfo.message;
    throw error;
  }

  const data = (await response.json()) as any;
  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error("Empty response from Manager IA");
  }

  return reply.trim();
}

function getManagerFallbackReply(input: string, snapshot: CreatorBusinessSnapshot): string {
  const lower = input.toLowerCase();
  const prioritized = (snapshot.prioritizedFansToday || []).slice(0, 3);
  const topNames = prioritized.map((f) => f.name).join(", ");
  const resumenBasico = `Resumen 30d (modo demo): ${snapshot.newFansLast30Days} fans nuevos, ${snapshot.fansAtRisk} en riesgo, ${snapshot.vipActiveCount} VIP activos, ${Math.round(snapshot.ingresosUltimos30Dias)} € de ingresos.`;

  const isWhoQuestion =
    lower.includes("a quién") ||
    lower.includes("a quien") ||
    lower.includes("debería escribir") ||
    lower.includes("deberia escribir") ||
    lower.includes("con quién") ||
    lower.includes("con quien") ||
    lower.includes("prioridad") ||
    lower.includes("cola");
  const isSummaryQuestion = lower.includes("resumen") || lower.includes("números") || lower.includes("numeros") || lower.includes("recap");
  const isActionQuestion =
    lower.includes("acción") ||
    lower.includes("accion") ||
    lower.includes("ingresos") ||
    lower.includes("concreta") ||
    lower.includes("hoy");

  const baseLine = resumenBasico;
  const defaultTarget = prioritized.length > 0 ? topNames : "fans en riesgo o VIP que caducan pronto";
  const actionVip = `2) Envía un audio breve a tus VIP activos (${snapshot.vipActiveCount}) para mantener vínculo.`;
  const actionExtra = `3) Oferta táctica: un extra rápido para quienes han gastado algo en 30d (${snapshot.ingresosUltimos30Dias} € totales).`;

  if (isWhoQuestion) {
    const action1 = `1) Prioriza hoy a: ${defaultTarget}.`;
    return [baseLine, action1, actionVip, actionExtra].join("\n");
  }

  if (isSummaryQuestion) {
    const action1 = prioritized.length > 0 ? `1) Toca primero a: ${topNames}.` : "1) Revisa quién caduca pronto y escribe ya.";
    return [baseLine, action1, actionVip, actionExtra].join("\n");
  }

  if (isActionQuestion) {
    const action1 = prioritized.length > 0 ? `1) Habla hoy con ${topNames} y guíalos a renovar/comprar.` : "1) Busca al fan en riesgo con caducidad más cercana y proponle renovar hoy.";
    return [baseLine, action1, actionVip, actionExtra].join("\n");
  }

  const action1 = prioritized.length > 0 ? `1) Prioriza a ${topNames} hoy mismo.` : "1) Identifica a los fans en riesgo y escribe primero.";
  return [
    baseLine,
    action1,
    actionVip,
    "3) Pide una pequeña acción (renovación o extra) a quienes te hayan escrito esta semana.",
  ].join("\n");
}
