import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { runAiCompletion } from "../../../server/ai/aiAdapter";
import { maybeDecrypt } from "../../../server/crypto/maybeDecrypt";

type CopyTarget = "TAGLINE" | "CTA" | "DESCRIPTION" | "FAQ";

const CREATOR_ID = "creator-1";
const RATE_LIMIT_MS = 10_000;
const rateLimits = new Map<string, number>();

const FALLBACK_OPTIONS: Record<CopyTarget, string[]> = {
  TAGLINE: [
    "Charlas 1:1 y contenido a tu ritmo.",
    "Conecta conmigo en un chat privado.",
    "Conversaciones cercanas y directas.",
  ],
  CTA: ["Abrir chat", "Entrar al chat", "Hablar conmigo"],
  DESCRIPTION: [
    "Respuestas claras, contenido pensado para ti.",
    "Un espacio privado para conversar y recibir novedades.",
    "Mensajes directos y contenido seleccionado contigo.",
  ],
  FAQ: [
    "Conversaciones directas | Respuestas claras | Cercania real",
    "Chat privado | Contenido seleccionado | Trato cercano",
    "Mensajes 1:1 | Novedades seleccionadas | Respuesta clara",
  ],
};

const TARGET_PROMPTS: Record<CopyTarget, string> = {
  TAGLINE: "Genera 3 opciones de tagline (maximo 70 caracteres).",
  CTA: "Genera 3 opciones para el texto de un boton (maximo 6 palabras).",
  DESCRIPTION: "Genera 3 opciones de descripcion corta (maximo 160 caracteres).",
  FAQ: "Genera 3 opciones. Cada opcion contiene 3 respuestas FAQ cortas separadas por ' | '. Maximo 12 palabras por respuesta.",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const target = req.body?.target as CopyTarget | undefined;
  const tone = typeof req.body?.tone === "string" ? req.body.tone.trim().slice(0, 120) : "";

  if (!target || !Object.keys(TARGET_PROMPTS).includes(target)) {
    return sendBadRequest(res, "target must be TAGLINE, CTA, DESCRIPTION, or FAQ");
  }

  const creator = await prisma.creator.findUnique({ where: { id: CREATOR_ID } });
  if (!creator) {
    return res.status(401).json({ error: "Creator not authorized" });
  }

  if (isRateLimited(CREATOR_ID)) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  const systemPrompt = [
    "Eres un asistente de copy para bio-links en espanol.",
    "Responde SOLO JSON valido con la forma {\"options\":[\"...\",\"...\",\"...\"]}.",
    "Opciones breves y claras. No menciones IA.",
    "No prometas cosas falsas ni uses contenido sexual explicito.",
  ].join("\n");

  const userPrompt = [
    TARGET_PROMPTS[target],
    `Nombre del creador: ${creator.name || "Creador"}.`,
    creator.subtitle ? `Subtitulo actual: ${creator.subtitle}.` : "",
    tone ? `Estilo/tono: ${tone}.` : "Estilo/tono: neutro.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const apiKey = maybeDecrypt(process.env.OPENAI_API_KEY, { creatorId: CREATOR_ID, label: "OPENAI_API_KEY" });
    const fallbackPayload = JSON.stringify({ options: FALLBACK_OPTIONS[target] });
    const aiResult = await runAiCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      apiKey,
      creatorId: CREATOR_ID,
      aiMode: process.env.AI_MODE,
      model: process.env.OPENAI_MODEL,
      temperature: 0.6,
      route: "/api/creator/bio-link-copy",
      fallbackMessage: fallbackPayload,
    });

    const parsedOptions = normalizeOptions(parseOptions(aiResult.text));
    const options = [...parsedOptions, ...FALLBACK_OPTIONS[target]].slice(0, 3);
    return res.status(200).json({ options });
  } catch (err) {
    console.error("Error generating bio link copy", err);
    return sendServerError(res, "No se pudo generar copy");
  }
}

function isRateLimited(creatorId: string) {
  const now = Date.now();
  const last = rateLimits.get(creatorId) || 0;
  if (now - last < RATE_LIMIT_MS) return true;
  rateLimits.set(creatorId, now);
  return false;
}

function normalizeOptions(options: string[]): string[] {
  return options.map((option) => option.trim()).filter((option) => option.length > 0);
}

function parseOptions(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const stripped = trimmed.replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = tryParseJson(stripped) || tryParseJsonFromBlock(stripped);
  if (parsed && Array.isArray((parsed as any).options)) {
    return normalizeOptions((parsed as any).options.filter((item: unknown) => typeof item === "string"));
  }

  const lines = stripped
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length >= 3) return lines.slice(0, 3);

  return [];
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch (_err) {
    return null;
  }
}

function tryParseJsonFromBlock(text: string): unknown | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return tryParseJson(match[0]);
}
