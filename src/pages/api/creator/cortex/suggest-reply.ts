import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "../../../../lib/prisma.server";
import { createDefaultCreatorPlatforms } from "../../../../lib/creatorPlatforms";
import { getEffectiveTranslateConfig } from "../../../../lib/ai/translateProvider";
import { requestCortexCompletion, type CortexSuggestContext } from "../../../../lib/ai/cortexProvider";
import { logCortexLlmUsage } from "../../../../lib/aiUsage.server";

type SuggestMode = "reply" | "sales" | "clarify";

type SuggestReplyResponse = {
  message: string;
  language: string;
  intent: string;
  follow_up_questions: string[];
};

type ErrorResponse = { error: string; details?: string };

const requestSchema = z.object({
  creatorId: z.string().min(1),
  fanId: z.string().optional(),
  chatId: z.string().optional(),
  mode: z.enum(["reply", "sales", "clarify"]).optional(),
  context: z
    .object({
      original: z.string().optional(),
      translation: z.string().optional(),
      detected: z
        .object({
          src: z.string().optional(),
          tgt: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

const responseSchema = z.object({
  message: z.string().min(1),
  language: z.string().min(1),
  intent: z.string().min(1),
  follow_up_questions: z.array(z.string()).default([]),
});

const HISTORY_LIMIT = 40;
const MAX_MESSAGE_CHARS = 700;

const MODE_LABELS: Record<SuggestMode, string> = {
  reply: "Responder al fan de forma clara y natural.",
  sales: "Responder con enfoque ventas/upsell suave y CTA.",
  clarify: "Responder pidiendo aclaraciones concretas (1-3 preguntas).",
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuggestReplyResponse | ErrorResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", details: "Use POST" });
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");

  if (resolveViewerRole(req) !== "creator") {
    return res.status(403).json({ error: "Forbidden", details: "Creator access required." });
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
      .join("; ");
    return res.status(400).json({ error: "Invalid payload", details });
  }

  const creatorId = parsed.data.creatorId.trim();
  if (!creatorId) {
    return res.status(400).json({ error: "creatorId is required", details: "creatorId must be a non-empty string." });
  }

  const fanIdRaw = normalizeOptional(parsed.data.fanId);
  const chatIdRaw = normalizeOptional(parsed.data.chatId);
  const mode: SuggestMode = parsed.data.mode ?? "reply";
  const context = normalizeContext(parsed.data.context);
  const targetFanId = chatIdRaw ?? fanIdRaw ?? null;

  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, select: { id: true } });
  if (!creator) {
    return res.status(404).json({ error: "Creator not found", details: `creatorId=${creatorId}` });
  }

  let fanName: string | null = null;
  if (targetFanId) {
    const fan = await prisma.fan.findUnique({
      where: { id: targetFanId },
      select: { id: true, creatorId: true, displayName: true, name: true },
    });
    if (!fan || fan.creatorId !== creatorId) {
      return res.status(404).json({ error: "Fan not found", details: `fanId=${targetFanId}` });
    }
    fanName = fan.displayName ?? fan.name ?? null;
  }

  const settings =
    (await prisma.creatorAiSettings.findUnique({ where: { creatorId } })) ??
    (await prisma.creatorAiSettings.create({
      data: { creatorId, platforms: createDefaultCreatorPlatforms() },
    }));

  const translateConfig = await getEffectiveTranslateConfig(creatorId);
  const creatorLang = translateConfig.creatorLang ?? "es";

  const history = targetFanId ? await loadRecentMessages(targetFanId) : [];
  const systemPrompt = buildSystemPrompt({ creatorLang, mode, settings });
  const userPrompt = buildUserPrompt({
    mode,
    creatorLang,
    fanName,
    history,
    context,
  });

  const llmResult = await requestCortexCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    creatorId,
    fanId: targetFanId,
    route: "/api/creator/cortex/suggest-reply",
    mockContext: context ?? null,
    mockMode: mode,
  });

  let status = 200;
  let responseBody: SuggestReplyResponse | ErrorResponse | null = null;
  let errorCode: string | null = null;

  if (!llmResult.ok || !llmResult.text) {
    status = 500;
    errorCode = llmResult.errorCode ?? "llm_failed";
    responseBody = {
      error: "No se pudo generar la sugerencia.",
      details: formatDetails([
        llmResult.provider ? `provider=${llmResult.provider}` : null,
        llmResult.status ? `status=${llmResult.status}` : null,
        errorCode ? `code=${errorCode}` : null,
        llmResult.errorMessage ? `message=${llmResult.errorMessage}` : null,
      ]),
    };
  } else {
    const parsedJson = safeParseJson(llmResult.text);
    const validated = responseSchema.safeParse(parsedJson);
    if (!validated.success) {
      status = 500;
      errorCode = "invalid_llm_response";
      responseBody = {
        error: "La respuesta de IA no tiene formato válido.",
        details: formatDetails([`code=${errorCode}`]),
      };
    } else {
      responseBody = {
        message: validated.data.message.trim(),
        language: validated.data.language.trim(),
        intent: validated.data.intent.trim(),
        follow_up_questions: validated.data.follow_up_questions.filter((q) => q && q.trim()),
      };
    }
  }

  try {
    await logCortexLlmUsage({
      creatorId,
      fanId: targetFanId,
      endpoint: "/api/creator/cortex/suggest-reply",
      provider: llmResult.provider,
      model: llmResult.model,
      tokensIn: llmResult.tokensIn,
      tokensOut: llmResult.tokensOut,
      latencyMs: llmResult.latencyMs,
      ok: status === 200,
      errorCode,
    });
  } catch (err) {
    console.warn("cortex_usage_log_failed", err);
  }

  if (!responseBody) {
    return res.status(500).json({ error: "No se pudo generar la sugerencia.", details: "response_body_missing" });
  }

  return res.status(status).json(responseBody);
}

function normalizeOptional(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeContext(raw?: CortexSuggestContext | null): CortexSuggestContext | null {
  if (!raw) return null;
  const original = normalizeOptional(raw.original);
  const translation = normalizeOptional(raw.translation);
  const src = normalizeOptional(raw.detected?.src ?? null);
  const tgt = normalizeOptional(raw.detected?.tgt ?? null);
  const hasDetected = Boolean(src || tgt);
  if (!original && !translation && !hasDetected) return null;
  return {
    original: original ?? undefined,
    translation: translation ?? undefined,
    detected: hasDetected ? { src: src ?? undefined, tgt: tgt ?? undefined } : undefined,
  };
}

async function loadRecentMessages(fanId: string) {
  const messages = await prisma.message.findMany({
    where: {
      OR: [{ fanId }, { id: { startsWith: `${fanId}-` } }],
      audience: { in: ["FAN", "CREATOR"] },
    },
    orderBy: { id: "desc" },
    take: HISTORY_LIMIT,
    select: {
      id: true,
      from: true,
      text: true,
      type: true,
      transcriptText: true,
      creatorTranslatedText: true,
      deliveredText: true,
      time: true,
    },
  });

  return messages
    .map((msg) => {
      const baseText = resolveMessageText(msg);
      if (!baseText) return null;
      const translation = normalizeOptional(msg.creatorTranslatedText) ?? null;
      const delivered = normalizeOptional(msg.deliveredText) ?? null;
      const content = translation && translation !== baseText ? `${baseText} (traducción: ${translation})` : baseText;
      const finalText = delivered && delivered !== baseText ? `${content} (entregado: ${delivered})` : content;
      return {
        role: msg.from === "creator" ? "CREATOR" : "FAN",
        text: truncate(finalText, MAX_MESSAGE_CHARS),
      };
    })
    .filter((msg): msg is { role: string; text: string } => Boolean(msg && msg.text))
    .reverse();
}

function resolveMessageText(message: {
  text?: string | null;
  type?: string | null;
  transcriptText?: string | null;
}) {
  if ((message.type || "").toUpperCase() === "VOICE") {
    return normalizeOptional(message.transcriptText) ?? normalizeOptional(message.text);
  }
  return normalizeOptional(message.text);
}

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function buildSystemPrompt(args: {
  creatorLang: string;
  mode: SuggestMode;
  settings: {
    tone?: string | null;
    spicinessLevel?: number | null;
    formalityLevel?: number | null;
    emojiUsage?: number | null;
    forbiddenTopics?: string | null;
    forbiddenPromises?: string | null;
    rulesManifest?: string | null;
    turnMode?: string | null;
  };
}) {
  const tone = args.settings.tone ?? "cercano";
  const spiciness = Number.isFinite(args.settings.spicinessLevel) ? args.settings.spicinessLevel : 1;
  const formality = Number.isFinite(args.settings.formalityLevel) ? args.settings.formalityLevel : 1;
  const emojiUsage = Number.isFinite(args.settings.emojiUsage) ? args.settings.emojiUsage : 1;
  const rules = normalizeOptional(args.settings.rulesManifest) ?? "";
  const forbiddenTopics = normalizeOptional(args.settings.forbiddenTopics) ?? "";
  const forbiddenPromises = normalizeOptional(args.settings.forbiddenPromises) ?? "";

  return [
    "Eres el Manager IA de NOVSY. Respondes con una sugerencia para escribir al fan.",
    "Devuelve SIEMPRE un JSON válido (un único objeto). No agregues texto fuera del JSON.",
    `Idioma objetivo del creador: ${args.creatorLang}. Si hay contexto de traducción con idioma detectado, responde en ese idioma.`,
    `Modo solicitado: ${args.mode}.`,
    `Tono base: ${tone}. Picante ${spiciness}/3. Formalidad ${formality}/3. Emojis ${emojiUsage}/3.`,
    forbiddenTopics ? `Temas prohibidos: ${forbiddenTopics}.` : null,
    forbiddenPromises ? `Promesas prohibidas: ${forbiddenPromises}.` : null,
    rules ? `Reglas del creador:\n${rules}` : null,
    'Formato estricto: {"message":string,"language":string,"intent":string,"follow_up_questions":string[]}',
    "El campo language debe reflejar el idioma real del mensaje sugerido.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUserPrompt(args: {
  mode: SuggestMode;
  creatorLang: string;
  fanName?: string | null;
  history: Array<{ role: string; text: string }>;
  context: CortexSuggestContext | null;
}) {
  const modeHint = MODE_LABELS[args.mode] ?? MODE_LABELS.reply;
  const historyLines = args.history.length
    ? args.history.map((line, idx) => `${idx + 1}. ${line.role}: ${line.text}`).join("\n")
    : "Sin historial reciente.";

  const contextBlock = args.context
    ? [
        args.context.original ? `Original (${args.context.detected?.src ?? "?"}): ${args.context.original}` : null,
        args.context.translation
          ? `Traducción (${args.context.detected?.tgt ?? "?"}): ${args.context.translation}`
          : null,
        args.context.detected?.src
          ? `Idioma detectado: ${args.context.detected.src}${args.context.detected.tgt ? ` → ${args.context.detected.tgt}` : ""}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "Sin contexto de traducción.";

  return [
    modeHint,
    args.fanName ? `Fan: ${args.fanName}` : null,
    `Idioma objetivo del creador: ${args.creatorLang}`,
    "Contexto de traducción:",
    contextBlock,
    "Historial reciente (hasta 40 mensajes):",
    historyLines,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function safeParseJson(input: string) {
  try {
    return JSON.parse(input);
  } catch (_err) {
    const start = input.indexOf("{");
    const end = input.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(input.slice(start, end + 1));
      } catch (_err2) {
        return null;
      }
    }
    return null;
  }
}

function formatDetails(parts: Array<string | null | undefined>) {
  const filtered = parts.filter((part) => typeof part === "string" && part.trim());
  return filtered.length ? filtered.join(" | ") : undefined;
}

function resolveViewerRole(req: NextApiRequest): "creator" | "fan" {
  const headerRaw = req.headers["x-novsy-viewer"];
  const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (typeof header === "string" && header.trim().toLowerCase() === "creator") return "creator";
  const viewerParamRaw = req.query.viewer;
  const viewerParam = Array.isArray(viewerParamRaw) ? viewerParamRaw[0] : viewerParamRaw;
  if (typeof viewerParam === "string" && viewerParam.trim().toLowerCase() === "creator") return "creator";
  return "fan";
}
