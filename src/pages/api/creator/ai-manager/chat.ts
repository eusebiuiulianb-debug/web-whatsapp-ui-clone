import type { NextApiRequest, NextApiResponse } from "next";
import { AiUsageOrigin, AiUsageType, ManagerAiRole, ManagerAiTab } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { buildManagerContext } from "../../../../lib/ai/manager/context";
import { buildManagerSystemPrompt, buildManagerUserPrompt } from "../../../../lib/ai/manager/prompts";
import { buildDemoManagerReply, type ManagerDemoReply } from "../../../../lib/ai/manager/demo";
import { registerAiUsage } from "../../../../lib/ai/registerAiUsage";

type ManagerReply = ManagerDemoReply & { mode: "STRATEGY" | "CONTENT"; text: string };

type ChatResponseBody = {
  reply: ManagerReply;
  creditsUsed: number;
  creditsRemaining: number;
  usedFallback?: boolean;
};

const HISTORY_LIMIT = 20;

export default async function handler(req: NextApiRequest, res: NextApiResponse<ChatResponseBody | { error: string }>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawTab = typeof req.body?.tab === "string" ? req.body.tab : "";
  const incomingMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const tab = normalizeTab(rawTab);

  if (!tab) {
    return sendBadRequest(res, "tab must be STRATEGY or CONTENT");
  }
  if (!incomingMessage) {
    return sendBadRequest(res, "message is required");
  }

  try {
    const creatorId = await resolveCreatorId();
    const context = await buildManagerContext(creatorId);

    await prisma.managerAiMessage.create({
      data: {
        creatorId,
        tab,
        role: ManagerAiRole.CREATOR,
        content: incomingMessage,
      },
    });

    if (!process.env.OPENAI_API_KEY) {
      const demoReply = buildDemoManagerReply(tabToString(tab), context) as ManagerReply;
      await prisma.managerAiMessage.create({
        data: {
          creatorId,
          tab,
          role: ManagerAiRole.ASSISTANT,
          content: demoReply.text,
          meta: demoReply,
          creditsUsed: 0,
        },
      });
      return res.status(200).json({
        reply: demoReply,
        creditsUsed: 0,
        creditsRemaining: context.settings.creditsAvailable,
        usedFallback: true,
      });
    }

    const history = await prisma.managerAiMessage.findMany({
      where: { creatorId, tab },
      orderBy: { createdAt: "asc" },
      take: HISTORY_LIMIT + 1,
    });

    const systemPrompt = buildManagerSystemPrompt(tabToString(tab), context.settings);
    const userPrompt = buildManagerUserPrompt(context, incomingMessage);
    const historyMessages: Array<{ role: "user" | "assistant"; content: string }> = history.slice(-HISTORY_LIMIT).map((msg) => ({
      role: msg.role === ManagerAiRole.CREATOR ? "user" : "assistant",
      content: msg.content,
    }));

    let usedFallback = false;
    let reply: ManagerReply;
    let creditsUsed = 0;
    try {
      const { completionText, totalTokens } = await callOpenAiChat([
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: userPrompt },
      ]);
      reply = parseManagerReply(completionText, tab);
      creditsUsed = calculateCredits(totalTokens);
    } catch (err) {
      console.error("Error calling Manager IA", err);
      usedFallback = true;
      reply = buildDemoManagerReply(tabToString(tab), context) as ManagerReply;
      creditsUsed = 0;
    }

    await prisma.managerAiMessage.create({
      data: {
        creatorId,
        tab,
        role: ManagerAiRole.ASSISTANT,
        content: reply.text,
        meta: reply,
        creditsUsed,
      },
    });

    if (!usedFallback && creditsUsed > 0) {
      await registerAiUsage({
        creatorId,
        fanId: null,
        type: AiUsageType.MANAGER,
        origin: tab === ManagerAiTab.STRATEGY ? AiUsageOrigin.MANAGER_STRATEGY : AiUsageOrigin.MANAGER_CONTENT,
        creditsUsed,
        context: { tab: tabToString(tab), reply },
      });
    }

    return res.status(200).json({
      reply,
      creditsUsed,
      creditsRemaining: context.settings.creditsAvailable - creditsUsed,
      usedFallback,
    });
  } catch (err) {
    console.error("Error processing manager chat", err);
    return sendServerError(res, "No se pudo procesar el chat del Manager IA");
  }
}

function normalizeTab(tab: string): ManagerAiTab | null {
  const upper = (tab || "").toUpperCase();
  if (upper === "STRATEGY") return ManagerAiTab.STRATEGY;
  if (upper === "CONTENT") return ManagerAiTab.CONTENT;
  return null;
}

function tabToString(tab: ManagerAiTab): "STRATEGY" | "CONTENT" {
  return tab === ManagerAiTab.CONTENT ? "CONTENT" : "STRATEGY";
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

function parseManagerReply(raw: string, tab: ManagerAiTab): ManagerReply {
  try {
    const parsed = JSON.parse(raw) as Partial<ManagerReply>;
    const text = typeof parsed.text === "string" && parsed.text.trim().length > 0 ? parsed.text : raw;
    return {
      ...(parsed as any),
      mode: tabToString(tab),
      text,
    };
  } catch (_err) {
    return {
      mode: tabToString(tab),
      text: raw,
      suggestedFans: [],
      dailyScripts: [],
      packIdeas: [],
      meta: { parseError: true },
    } as ManagerReply;
  }
}

async function callOpenAiChat(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) {
  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.4,
    messages,
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as any;
  const completionText = data?.choices?.[0]?.message?.content;
  const totalTokens = data?.usage?.total_tokens;

  if (typeof completionText !== "string" || !completionText.trim()) {
    throw new Error("Empty response from Manager IA");
  }

  return { completionText: completionText.trim(), totalTokens: typeof totalTokens === "number" ? totalTokens : null };
}

function calculateCredits(totalTokens: number | null): number {
  if (!totalTokens || totalTokens <= 0) return 1;
  return Math.max(1, Math.ceil(totalTokens / 1000));
}
