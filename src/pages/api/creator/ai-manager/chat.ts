import type { NextApiRequest, NextApiResponse } from "next";
import { AiUsageOrigin, AiUsageType, ManagerAiRole, ManagerAiTab } from "@prisma/client";
import prisma from "../../../../lib/prisma.server";
import { buildManagerContext } from "../../../../lib/ai/manager/context";
import {
  buildGrowthPrompts,
  buildManagerSystemPrompt,
  buildManagerUserPrompt,
  normalizeManagerAction,
} from "../../../../lib/ai/manager/prompts";
import { buildDemoManagerReply, type ManagerDemoReply } from "../../../../lib/ai/manager/demo";
import { registerAiUsage } from "../../../../lib/ai/registerAiUsage";
import { getCortexProviderSelection, requestCortexCompletion } from "../../../../lib/ai/cortexProvider";
import { sanitizeForOpenAi } from "../../../../server/ai/sanitizeForOpenAi";
import { toSafeErrorMessage } from "../../../../server/ai/openAiError";

type ManagerReply = ManagerDemoReply & { mode: "STRATEGY" | "CONTENT" | "GROWTH"; text: string };

type ChatResponseBody = {
  reply: ManagerReply;
  creditsUsed: number;
  creditsRemaining: number;
  usedFallback?: boolean;
  settingsStatus?: "ok" | "settings_missing" | "decrypt_failed";
  aiMode?: "demo" | "live";
};

type ErrorResponse = { error: string; details?: string };

const HISTORY_LIMIT = 20;

export default async function handler(req: NextApiRequest, res: NextApiResponse<ChatResponseBody | ErrorResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", details: "Use POST" });
  }

  const rawTab = typeof req.body?.tab === "string" ? req.body.tab : "";
  const incomingMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const rawAction = typeof req.body?.action === "string" ? req.body.action : null;
  const action = normalizeManagerAction(rawAction);
  const growthAction = rawAction && rawAction.startsWith("growth_") ? rawAction : null;
  const tab = normalizeTab(rawTab);

  if (!tab) {
    return res.status(400).json({ error: "Invalid tab", details: "tab must be STRATEGY, CONTENT or GROWTH" });
  }
  if (!incomingMessage) {
    return res.status(400).json({ error: "Invalid message", details: "message is required" });
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

    const selection = await getCortexProviderSelection({ creatorId });
    const settingsStatus: ChatResponseBody["settingsStatus"] =
      selection.decryptFailed
        ? "decrypt_failed"
        : selection.provider === "demo" || !selection.configured
        ? "settings_missing"
        : "ok";

    if (selection.decryptFailed || selection.provider === "demo" || !selection.configured) {
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
        aiMode: "demo",
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
    const aiResult = await requestCortexCompletion({
      messages: rawOpenAiMessages,
      creatorId,
      fanId: null,
      route: "/api/creator/ai-manager/chat",
      selection,
    });

    if (!aiResult.ok || !aiResult.text) {
      console.error("manager_ai_provider_error", {
        creatorId,
        provider: aiResult.provider,
        status: aiResult.status ?? null,
        code: aiResult.errorCode ?? "ai_error",
        message: aiResult.errorMessage ?? "ai_error",
      });
      return res.status(500).json({
        error: "No se pudo procesar el chat del Manager IA",
        details: formatDetails([
          aiResult.provider ? `provider=${aiResult.provider}` : null,
          aiResult.status ? `status=${aiResult.status}` : null,
          aiResult.errorCode ? `code=${aiResult.errorCode}` : null,
          aiResult.errorMessage ? `message=${aiResult.errorMessage}` : null,
        ]),
      });
    }

    const reply: ManagerReply = parseManagerReply(aiResult.text ?? "", tab);
    const totalTokens = (aiResult.tokensIn ?? 0) + (aiResult.tokensOut ?? 0);
    const creditsUsed = calculateCredits(totalTokens);
    const usedFallback = false;
    const aiMode: ChatResponseBody["aiMode"] = "live";

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
    return res.status(500).json({
      error: "No se pudo procesar el chat del Manager IA",
      details: toSafeErrorMessage(err),
    });
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

function formatDetails(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part && part.trim().length > 0)).join(" | ");
}
