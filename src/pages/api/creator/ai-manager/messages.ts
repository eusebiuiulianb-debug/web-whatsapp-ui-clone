import type { NextApiRequest, NextApiResponse } from "next";
import { ManagerAiTab } from "@prisma/client";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";

type ManagerMessage = {
  id: string;
  role: "CREATOR" | "ASSISTANT";
  content: string;
  createdAt: string;
};

type MessagesResponse = {
  messages: ManagerMessage[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<MessagesResponse | { error: string }>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const tab = normalizeTab(typeof req.query.tab === "string" ? req.query.tab : "");
  if (!tab) {
    return sendBadRequest(res, "tab must be STRATEGY or CONTENT");
  }

  try {
    const creatorId = await resolveCreatorId();
    const messages = await prisma.managerAiMessage.findMany({
      where: { creatorId, tab },
      orderBy: { createdAt: "asc" },
    });

    return res.status(200).json({
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : String(msg.createdAt),
      })),
    });
  } catch (err) {
    console.error("Error loading manager messages", err);
    return sendServerError(res, "No se pudo cargar el historial del Manager IA");
  }
}

function normalizeTab(tab: string): ManagerAiTab | null {
  const upper = (tab || "").toUpperCase();
  if (upper === "CONTENT") return ManagerAiTab.CONTENT;
  if (upper === "GROWTH") return ManagerAiTab.GROWTH;
  if (upper === "STRATEGY" || !upper) return ManagerAiTab.STRATEGY;
  return null;
}

async function resolveCreatorId(): Promise<string> {
  if (process.env.CREATOR_ID) {
    return process.env.CREATOR_ID;
  }

  const defaultCreator = await prisma.creator.findUnique({
    where: { id: "creator-1" },
    select: { id: true },
  });
  if (defaultCreator) return defaultCreator.id;

  const creator = await prisma.creator.findFirst({ select: { id: true }, orderBy: { id: "asc" } });
  if (!creator) throw new Error("Creator not found");
  return creator.id;
}
