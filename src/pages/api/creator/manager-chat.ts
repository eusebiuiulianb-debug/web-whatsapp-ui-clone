import type { NextApiRequest, NextApiResponse } from "next";
import { ManagerSender, type ManagerMessage as PrismaManagerMessage } from "@prisma/client";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { getCreatorBusinessSnapshot } from "../../../lib/creatorManager";
import { BUSINESS_MANAGER_SYSTEM_PROMPT } from "../../../lib/ai/prompts";
import { maybeDecrypt } from "../../../server/crypto/maybeDecrypt";
import { toSafeErrorMessage } from "../../../server/ai/openAiError";
import { sanitizeForOpenAi } from "../../../server/ai/sanitizeForOpenAi";
import { OPENAI_FALLBACK_MESSAGE } from "../../../server/ai/openAiClient";
import { runAiCompletion, type AiAdapterResult } from "../../../server/ai/aiAdapter";
import { AI_ENABLED, sendAiDisabled } from "../../../lib/features";

type SerializedMessage = {
  id: string;
  sender: ManagerSender;
  content: string;
  createdAt: string;
};

const HISTORY_LIMIT = 20;
const HISTORY_RESPONSE_LIMIT = 50;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!AI_ENABLED) {
    return sendAiDisabled(res);
  }
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

    const apiKey = maybeDecrypt(process.env.OPENAI_API_KEY, { creatorId, label: "OPENAI_API_KEY" });
    const wantsOpenAi = ["openai", "live"].includes((process.env.AI_MODE || "mock").toLowerCase());
    if (wantsOpenAi && (!apiKey || !process.env.OPENAI_MODEL)) {
      return res.status(500).json({ error: "AI not configured", hint: "Set AI_MODE=mock or configure OPENAI_*" });
    }
    const aiResult = await askManagerAi({
      systemPrompt,
      context: contextBlock,
      history,
      userMessage: incomingMessage,
      apiKey,
      creatorId,
    });
    if (aiResult.needsConfig) {
      return res.status(500).json({ error: "AI not configured", hint: "Set AI_MODE=mock or configure OPENAI_*" });
    }
    const managerReply = aiResult.text;
    const usedFallback = aiResult.usedFallback || aiResult.mode === "demo";
    const aiMode = aiResult.mode;

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
      aiMode,
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
  apiKey: string | null;
  creatorId?: string;
}): Promise<AiAdapterResult> {
  const { systemPrompt, context, history, userMessage, apiKey, creatorId } = params;

  const historyMessages = history.slice(-HISTORY_LIMIT).map((msg) => ({
    role: msg.sender === ManagerSender.CREATOR ? ("user" as const) : ("assistant" as const),
    content: msg.content,
  }));

  return runAiCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "system", content: context },
      ...historyMessages,
      { role: "user", content: userMessage },
    ],
    apiKey,
    creatorId,
    aiMode: process.env.AI_MODE,
    model: process.env.OPENAI_MODEL,
    route: "/api/creator/manager-chat",
    fallbackMessage: OPENAI_FALLBACK_MESSAGE,
  });
}
