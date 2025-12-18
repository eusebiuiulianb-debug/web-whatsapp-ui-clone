import type { NextApiRequest, NextApiResponse } from "next";
import { AiUsageOrigin, AiUsageType, ManagerAiRole, ManagerAiTab } from "@prisma/client";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { buildManagerContext } from "../../../../lib/ai/manager/context";
import {
  buildGrowthPrompts,
  buildManagerSystemPrompt,
  buildManagerUserPrompt,
  normalizeManagerAction,
} from "../../../../lib/ai/manager/prompts";
import { buildDemoManagerReply, type ManagerDemoReply } from "../../../../lib/ai/manager/demo";
import { registerAiUsage } from "../../../../lib/ai/registerAiUsage";
import { toSafeErrorMessage } from "../../../../server/ai/openAiError";
import { maybeDecrypt } from "../../../../server/crypto/maybeDecrypt";
import { sanitizeForOpenAi } from "../../../../server/ai/sanitizeForOpenAi";
import { OPENAI_FALLBACK_MESSAGE } from "../../../../server/ai/openAiClient";
import { runAiCompletion, type AiAdapterResult } from "../../../../server/ai/aiAdapter";

type ManagerReply = ManagerDemoReply & { mode: "STRATEGY" | "CONTENT" | "GROWTH"; text: string };

type ChatResponseBody = {
  reply: ManagerReply;
  creditsUsed: number;
  creditsRemaining: number;
  usedFallback?: boolean;
  settingsStatus?: "ok" | "settings_missing";
  aiMode?: "demo" | "live";
};

const HISTORY_LIMIT = 20;

export default async function handler(req: NextApiRequest, res: NextApiResponse<ChatResponseBody | { error: string; hint?: string }>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawTab = typeof req.body?.tab === "string" ? req.body.tab : "";
  const incomingMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const rawAction = typeof req.body?.action === "string" ? req.body.action : null;
  const action = normalizeManagerAction(rawAction);
  const growthAction = rawAction && rawAction.startsWith("growth_") ? rawAction : null;
  const tab = normalizeTab(rawTab);

  if (!tab) {
    return sendBadRequest(res, "tab must be STRATEGY, CONTENT or GROWTH");
  }
  if (!incomingMessage) {
    return sendBadRequest(res, "message is required");
  }

  try {
    const creatorId = await resolveCreatorId();
    const context = await buildManagerContext(creatorId);
    const safeContext = sanitizeForOpenAi(context, { creatorId }) as any;

    await logMessage({
      creatorId,
      tab,
      role: ManagerAiRole.CREATOR,
      content: incomingMessage,
      meta: action ? { action: rawAction ?? action ?? growthAction ?? undefined } : rawAction ? { action: rawAction } : undefined,
    });

    const apiKey = maybeDecrypt(process.env.OPENAI_API_KEY, { creatorId, label: "OPENAI_API_KEY" });
    const settingsStatus: ChatResponseBody["settingsStatus"] = apiKey ? "ok" : "settings_missing";
    const wantsOpenAi = ["openai", "live"].includes((process.env.AI_MODE || "mock").toLowerCase());

    if (wantsOpenAi && (!apiKey || !process.env.OPENAI_MODEL)) {
      return res.status(500).json({ error: "AI not configured", hint: "Set AI_MODE=mock or configure OPENAI_*" });
    }

    if (!apiKey) {
      const demoReply = buildDemoManagerReply(tabToString(tab), context) as ManagerReply;
      await logMessage({
        creatorId,
        tab,
        role: ManagerAiRole.ASSISTANT,
        content: demoReply.text,
        meta: { ...demoReply, action: rawAction ?? action ?? growthAction ?? undefined },
        creditsUsed: 0,
      });
      return res.status(200).json({
        reply: demoReply,
        creditsUsed: 0,
        creditsRemaining: context.settings.creditsAvailable,
        usedFallback: true,
        settingsStatus,
      });
    }

    const history = await prisma.managerAiMessage.findMany({
      where: { creatorId, tab },
      orderBy: { createdAt: "asc" },
      take: HISTORY_LIMIT + 1,
    });

    const isGrowth = tab === ManagerAiTab.GROWTH;
    const { systemPrompt, userPrompt } = isGrowth
      ? ((): { systemPrompt: string; userPrompt: string } => {
          const prompts = buildGrowthPrompts({ context: safeContext, metrics: incomingMessage, action: growthAction as any });
          return { systemPrompt: prompts.system, userPrompt: prompts.user };
        })()
      : {
          systemPrompt: buildManagerSystemPrompt(tabToString(tab), safeContext.settings, action),
          userPrompt: buildManagerUserPrompt(safeContext, incomingMessage, action),
        };
    const historyMessages: Array<{ role: "user" | "assistant"; content: string }> = history.slice(-HISTORY_LIMIT).map((msg) => ({
      role: msg.role === ManagerAiRole.CREATOR ? "user" : "assistant",
      content: msg.content,
    }));

    const rawOpenAiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: userPrompt },
    ];
    const aiResult = await askManagerAiAdapter({
      messages: rawOpenAiMessages,
      apiKey,
      creatorId,
      fanId: null,
      fallbackMessage: OPENAI_FALLBACK_MESSAGE,
    });
    if (aiResult.needsConfig) {
      return res.status(500).json({ error: "AI not configured", hint: "Set AI_MODE=mock or configure OPENAI_*" });
    }
    const usedFallback = !!aiResult?.usedFallback || aiResult?.mode === "demo";
    const aiMode = aiResult?.mode ?? "live";
    const fallbackReply: ManagerReply = buildManagerFallback(tab, context);
    const reply: ManagerReply = usedFallback ? fallbackReply : parseManagerReply(aiResult?.text ?? "", tab);
    const creditsUsed = usedFallback ? 0 : calculateCredits(aiResult?.totalTokens ?? 0);

    await logMessage({
      creatorId,
      tab,
      role: ManagerAiRole.ASSISTANT,
      content: reply.text,
      meta: reply ? { ...reply, action: rawAction ?? action ?? growthAction ?? undefined } : { action: rawAction ?? action ?? growthAction ?? undefined },
      creditsUsed,
    });

    if (!usedFallback && creditsUsed > 0) {
      await registerAiUsage({
        creatorId,
        fanId: null,
        type: AiUsageType.MANAGER,
        origin:
          tab === ManagerAiTab.STRATEGY
            ? AiUsageOrigin.MANAGER_STRATEGY
            : tab === ManagerAiTab.CONTENT
            ? AiUsageOrigin.MANAGER_CONTENT
            : AiUsageOrigin.MANAGER_GROWTH,
        creditsUsed,
        context: { tab: tabToString(tab), reply },
      });
    }

    return res.status(200).json({
      reply,
      creditsUsed,
      creditsRemaining: context.settings.creditsAvailable - creditsUsed,
      usedFallback,
      settingsStatus,
      aiMode,
    });
  } catch (err) {
    console.error("Error processing manager chat", toSafeErrorMessage(err));
    return sendServerError(res, "No se pudo procesar el chat del Manager IA");
  }
}

async function logMessage(data: {
  creatorId: string;
  tab: ManagerAiTab;
  role: ManagerAiRole;
  content: string;
  meta?: Record<string, any> | null;
  creditsUsed?: number;
}) {
  try {
    await prisma.managerAiMessage.create({
      data: {
        creatorId: data.creatorId,
        tab: data.tab,
        role: data.role,
        content: data.content,
        meta: data.meta ?? undefined,
        creditsUsed: data.creditsUsed ?? 0,
      },
    });
  } catch (err) {
    console.error("Error saving manager AI message", err);
  }
}

function normalizeTab(tab: string): ManagerAiTab | null {
  const upper = (tab || "").toUpperCase();
  if (upper === "STRATEGY") return ManagerAiTab.STRATEGY;
  if (upper === "CONTENT") return ManagerAiTab.CONTENT;
  if (upper === "GROWTH") return ManagerAiTab.GROWTH;
  return null;
}

function tabToString(tab: ManagerAiTab): "STRATEGY" | "CONTENT" | "GROWTH" {
  if (tab === ManagerAiTab.CONTENT) return "CONTENT";
  if (tab === ManagerAiTab.GROWTH) return "GROWTH";
  return "STRATEGY";
}

function buildManagerFallback(tab: ManagerAiTab, context: any): ManagerReply {
  const tabString = tabToString(tab);
  if (tabString === "STRATEGY") {
    return { mode: "STRATEGY", text: OPENAI_FALLBACK_MESSAGE, suggestedFans: [], meta: { demo: true, context } } as ManagerReply;
  }
  if (tabString === "CONTENT") {
    return { mode: "CONTENT", text: OPENAI_FALLBACK_MESSAGE, dailyScripts: [], packIdeas: [], meta: { demo: true, context } } as ManagerReply;
  }
  return { mode: "GROWTH", text: OPENAI_FALLBACK_MESSAGE, meta: { demo: true, context } } as ManagerReply;
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
  if (tab === ManagerAiTab.GROWTH) {
    return { mode: "GROWTH", text: raw, meta: {} } as ManagerReply;
  }
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

function calculateCredits(totalTokens: number | null): number {
  if (!totalTokens || totalTokens <= 0) return 1;
  return Math.max(1, Math.ceil(totalTokens / 1000));
}

async function askManagerAiAdapter(params: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  apiKey: string | null;
  creatorId: string;
  fanId: string | null;
  fallbackMessage?: string;
}): Promise<AiAdapterResult> {
  return runAiCompletion({
    messages: params.messages,
    apiKey: params.apiKey,
    creatorId: params.creatorId,
    fanId: params.fanId,
    aiMode: process.env.AI_MODE,
    model: process.env.OPENAI_MODEL,
    route: "/api/creator/ai-manager/chat",
    fallbackMessage: params.fallbackMessage ?? OPENAI_FALLBACK_MESSAGE,
  });
}
