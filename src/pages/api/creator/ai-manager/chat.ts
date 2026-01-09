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
import { buildOllamaOpenAiRequest } from "../../../../lib/ai/providers/ollama";
import { sanitizeForOpenAi } from "../../../../server/ai/sanitizeForOpenAi";
import { toSafeErrorMessage } from "../../../../server/ai/openAiError";

type ManagerReply = ManagerDemoReply & { mode: "STRATEGY" | "CONTENT" | "GROWTH"; text: string };

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatOkResponse = {
  ok: true;
  message: { role: "assistant"; content: string };
  items: Array<{ role: "assistant"; content: string }>;
  messages: ChatMessage[];
  reply?: ManagerReply;
  creditsUsed?: number;
  creditsRemaining?: number;
  usedFallback?: boolean;
  settingsStatus?: "ok" | "settings_missing" | "decrypt_failed";
  aiMode?: "demo" | "live";
};

type ChatErrorResponse = {
  ok: false;
  code: "bad_request" | "empty_ai_response" | "ai_error" | "method_not_allowed";
  message: string;
  error?: string;
  details?: string;
};

const HISTORY_LIMIT = 20;
const DEFAULT_MAX_TOKENS = 300;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatOkResponse | ChatErrorResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      code: "method_not_allowed",
      message: "Method not allowed",
      error: "Method not allowed",
    });
  }

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  const creatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
  if (!creatorId) {
    return sendBadRequest(res, "creatorId is required");
  }

  const rawTab = typeof body.tab === "string" ? body.tab : "";
  const tab = rawTab ? normalizeTab(rawTab) : null;
  if (rawTab && !tab) {
    return sendBadRequest(res, "tab must be STRATEGY, CONTENT or GROWTH");
  }

  const rawText = typeof body.text === "string" ? body.text.trim() : "";
  const rawLegacyMessage = typeof body.message === "string" ? body.message.trim() : "";
  const incomingText = rawText || rawLegacyMessage;

  const incomingMessages = normalizeChatMessages(body.messages);
  const hasText = Boolean(incomingText);
  const hasMessages = incomingMessages.length > 0;

  if (!hasText && !hasMessages) {
    return sendBadRequest(res, "text or messages is required");
  }

  const fanIdRaw = typeof body.fanId === "string" ? body.fanId.trim() : "";
  if (!tab && !fanIdRaw) {
    return sendBadRequest(res, "fanId is required");
  }
  const fanId = fanIdRaw || null;

  try {
    const selection = await getCortexProviderSelection({ creatorId });

    if (!tab) {
      const requestMessages =
        incomingMessages.length > 0 ? incomingMessages : [{ role: "user", content: incomingText }];
      const debugInfo =
        selection.provider === "ollama"
          ? buildOllamaOpenAiRequest({
              baseUrl: selection.baseUrl || "",
              path: "chat/completions",
              payload: {
                model: selection.model ?? "ollama",
                messages: requestMessages,
                temperature: resolveTemperature(),
                max_tokens: DEFAULT_MAX_TOKENS,
              },
              creatorId,
            }).debug
          : null;

      const aiResult = await requestCortexCompletion({
        messages: requestMessages,
        creatorId,
        fanId,
        route: "/api/creator/ai-manager/chat",
        selection,
      });

      const usedFallback = aiResult.provider === "demo";

      if (!aiResult.ok) {
        console.error("manager_ai_provider_error", {
          creatorId,
          fanId,
          provider: aiResult.provider,
          status: aiResult.status ?? null,
          code: aiResult.errorCode ?? "ai_error",
          message: aiResult.errorMessage ?? "ai_error",
        });
        logDevManagerRequest({
          route: "/api/creator/ai-manager/chat",
          creatorId,
          fanId,
          hasText,
          hasMessages,
          usedFallback,
          debug: debugInfo,
        });
        return res.status(502).json({
          ok: false,
          code: "ai_error",
          message: "No se pudo procesar el chat del Manager IA",
          error: "No se pudo procesar el chat del Manager IA",
          details: formatDetails([
            aiResult.provider ? `provider=${aiResult.provider}` : null,
            aiResult.status ? `status=${aiResult.status}` : null,
            aiResult.errorCode ? `code=${aiResult.errorCode}` : null,
            aiResult.errorMessage ? `message=${aiResult.errorMessage}` : null,
          ]),
        });
      }

      const assistantText = typeof aiResult.text === "string" ? aiResult.text.trim() : "";
      if (!assistantText) {
        logDevManagerRequest({
          route: "/api/creator/ai-manager/chat",
          creatorId,
          fanId,
          hasText,
          hasMessages,
          usedFallback,
          debug: debugInfo,
        });
        return res.status(502).json({
          ok: false,
          code: "empty_ai_response",
          message: "empty_ai_response",
          error: "empty_ai_response",
        });
      }

      const assistantMessage = { role: "assistant" as const, content: assistantText };
      const responseMessages = [...requestMessages, assistantMessage];
      logDevManagerRequest({
        route: "/api/creator/ai-manager/chat",
        creatorId,
        fanId,
        hasText,
        hasMessages,
        usedFallback,
        debug: debugInfo,
      });

      return res.status(200).json({
        ok: true,
        message: assistantMessage,
        items: [assistantMessage],
        messages: responseMessages,
        usedFallback,
      });
    }

    const incomingMessage = incomingText;
    if (!incomingMessage) {
      return sendBadRequest(res, "message is required");
    }

    const rawAction = typeof body.action === "string" ? body.action : null;
    const action = normalizeManagerAction(rawAction);
    const growthAction = rawAction && rawAction.startsWith("growth_") ? rawAction : null;

    const context = await buildManagerContext(creatorId);
    const safeContext = sanitizeForOpenAi(context, { creatorId }) as any;

    await logMessage({
      creatorId,
      tab,
      role: ManagerAiRole.CREATOR,
      content: incomingMessage,
      meta: action ? { action: rawAction ?? action ?? growthAction ?? undefined } : rawAction ? { action: rawAction } : undefined,
    });

    const settingsStatus: ChatOkResponse["settingsStatus"] =
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

      const assistantText = typeof demoReply.text === "string" ? demoReply.text.trim() : "";
      if (!assistantText) {
        logDevManagerRequest({
          route: "/api/creator/ai-manager/chat",
          creatorId,
          fanId,
          hasText,
          hasMessages,
          usedFallback: true,
          debug: null,
        });
        return res.status(502).json({
          ok: false,
          code: "empty_ai_response",
          message: "empty_ai_response",
          error: "empty_ai_response",
        });
      }

      const assistantMessage = { role: "assistant" as const, content: assistantText };
      const baseMessages =
        incomingMessages.length > 0 ? incomingMessages : [{ role: "user" as const, content: incomingMessage }];
      const responseMessages = [...baseMessages, assistantMessage];

      logDevManagerRequest({
        route: "/api/creator/ai-manager/chat",
        creatorId,
        fanId,
        hasText,
        hasMessages,
        usedFallback: true,
        debug: null,
      });

      return res.status(200).json({
        ok: true,
        message: assistantMessage,
        items: [assistantMessage],
        messages: responseMessages,
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
      ? (() => {
          const prompts = buildGrowthPrompts({
            context: safeContext,
            metrics: incomingMessage,
            action: growthAction as any,
          });
          return { systemPrompt: prompts.system, userPrompt: prompts.user };
        })()
      : {
          systemPrompt: buildManagerSystemPrompt(tabToString(tab), safeContext.settings, action),
          userPrompt: buildManagerUserPrompt(safeContext, incomingMessage, action),
        };

    const historyMessages: Array<{ role: "user" | "assistant"; content: string }> = history
      .slice(-HISTORY_LIMIT)
      .map((msg) => ({
        role: msg.role === ManagerAiRole.CREATOR ? "user" : "assistant",
        content: msg.content,
      }));

    const rawOpenAiMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: userPrompt },
    ];

    const debugInfo =
      selection.provider === "ollama"
        ? buildOllamaOpenAiRequest({
            baseUrl: selection.baseUrl || "",
            path: "chat/completions",
            payload: {
              model: selection.model ?? "ollama",
              messages: rawOpenAiMessages,
              temperature: resolveTemperature(),
              max_tokens: DEFAULT_MAX_TOKENS,
            },
            creatorId,
          }).debug
        : null;

    const aiResult = await requestCortexCompletion({
      messages: rawOpenAiMessages,
      creatorId,
      fanId: null,
      route: "/api/creator/ai-manager/chat",
      selection,
    });

    if (!aiResult.ok) {
      console.error("manager_ai_provider_error", {
        creatorId,
        provider: aiResult.provider,
        status: aiResult.status ?? null,
        code: aiResult.errorCode ?? "ai_error",
        message: aiResult.errorMessage ?? "ai_error",
      });
      logDevManagerRequest({
        route: "/api/creator/ai-manager/chat",
        creatorId,
        fanId,
        hasText,
        hasMessages,
        usedFallback: false,
        debug: debugInfo,
      });
      return res.status(502).json({
        ok: false,
        code: "ai_error",
        message: "No se pudo procesar el chat del Manager IA",
        error: "No se pudo procesar el chat del Manager IA",
        details: formatDetails([
          aiResult.provider ? `provider=${aiResult.provider}` : null,
          aiResult.status ? `status=${aiResult.status}` : null,
          aiResult.errorCode ? `code=${aiResult.errorCode}` : null,
          aiResult.errorMessage ? `message=${aiResult.errorMessage}` : null,
        ]),
      });
    }

    const assistantText = typeof aiResult.text === "string" ? aiResult.text.trim() : "";
    if (!assistantText) {
      logDevManagerRequest({
        route: "/api/creator/ai-manager/chat",
        creatorId,
        fanId,
        hasText,
        hasMessages,
        usedFallback: false,
        debug: debugInfo,
      });
      return res.status(502).json({
        ok: false,
        code: "empty_ai_response",
        message: "empty_ai_response",
        error: "empty_ai_response",
      });
    }

    const reply: ManagerReply = parseManagerReply(aiResult.text ?? "", tab);
    const totalTokens = (aiResult.tokensIn ?? 0) + (aiResult.tokensOut ?? 0);
    const creditsUsed = calculateCredits(totalTokens);
    const usedFallback = false;
    const aiMode: ChatOkResponse["aiMode"] = "live";

    await logMessage({
      creatorId,
      tab,
      role: ManagerAiRole.ASSISTANT,
      content: reply.text,
      meta: reply
        ? { ...reply, action: rawAction ?? action ?? growthAction ?? undefined }
        : { action: rawAction ?? action ?? growthAction ?? undefined },
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

    const assistantMessage = { role: "assistant" as const, content: assistantText };
    const baseMessages =
      incomingMessages.length > 0 ? incomingMessages : [{ role: "user" as const, content: incomingMessage }];
    const responseMessages = [...baseMessages, assistantMessage];

    logDevManagerRequest({
      route: "/api/creator/ai-manager/chat",
      creatorId,
      fanId,
      hasText,
      hasMessages,
      usedFallback,
      debug: debugInfo,
    });

    return res.status(200).json({
      ok: true,
      message: assistantMessage,
      items: [assistantMessage],
      messages: responseMessages,
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
      ok: false,
      code: "ai_error",
      message: "No se pudo procesar el chat del Manager IA",
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

function normalizeChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const out: ChatMessage[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const roleRaw = typeof record.role === "string" ? record.role.trim().toLowerCase() : "";
    const content = typeof record.content === "string" ? record.content.trim() : "";
    if (!content) continue;
    if (roleRaw === "system" || roleRaw === "user" || roleRaw === "assistant") {
      out.push({ role: roleRaw as ChatMessage["role"], content });
    }
  }
  return out;
}

function sendBadRequest(res: NextApiResponse<ChatErrorResponse>, message: string) {
  return res.status(400).json({
    ok: false,
    code: "bad_request",
    message,
    error: message,
  });
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

function resolveTemperature(): number {
  const raw = process.env.AI_TEMPERATURE ?? process.env.CORTEX_AI_TEMPERATURE;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed)) return parsed;
  return 0.4;
}

function logDevManagerRequest(params: {
  route: string;
  creatorId: string;
  fanId: string | null;
  hasText: boolean;
  hasMessages: boolean;
  usedFallback: boolean;
  debug: { url: string; maxTokensType: string; maxTokensValue: unknown } | null;
}) {
  if (process.env.NODE_ENV !== "development") return;
  console.debug("manager_ai_request_debug", {
    route: params.route,
    creatorId: params.creatorId,
    fanId: params.fanId,
    hasText: params.hasText,
    hasMessages: params.hasMessages,
    finalUrl: params.debug?.url ?? null,
    maxTokensType: params.debug?.maxTokensType ?? null,
    maxTokensValue: params.debug?.maxTokensValue ?? null,
    usedFallback: params.usedFallback,
  });
}
