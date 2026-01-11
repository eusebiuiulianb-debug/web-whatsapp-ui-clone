import type { AgencyIntensity, AgencyObjective, AgencyStage } from "./types";

export type AgencyTemplateBlocks = {
  openers?: string[];
  bridges?: string[];
  teases?: string[];
  ctas?: string[];
};

export type AgencyOfferContext = {
  title?: string | null;
  tier?: string | null;
  priceCents?: number | null;
  currency?: string | null;
};

export type BuildAgencyDraftOptions = {
  fanName?: string | null;
  lastFanMsg?: string | null;
  stage: AgencyStage;
  objective: AgencyObjective;
  intensity: AgencyIntensity;
  offer?: AgencyOfferContext | null;
  blocks: AgencyTemplateBlocks;
  variant?: number;
  mode?: "full" | "short";
};

export type AgencyDraftResult = {
  text: string;
  usedBlocks: Record<string, string | null>;
  contextSnippet: string | null;
};

export type DraftQaResult = {
  score: number;
  warnings: string[];
};

const MAX_CONTEXT_WORDS = 10;
const MAX_CONTEXT_CHARS = 80;
const MAX_DRAFT_CHARS = 220;
const MARKETING_WORDS = [
  "promoción",
  "promo",
  "oferta",
  "premium",
  "especial",
  "mensual",
  "aprovecha",
  "compra ya",
  "pack",
  "suscripción",
  "link",
];
const GENERIC_PATTERNS: RegExp[] = [
  /\bhola\b/i,
  /\bqué\s+tal\b/i,
  /\bc[oó]mo\s+est[aá]s\b/i,
  /\ben\s+qu[eé]\s+puedo\s+ayudar\b/i,
  /\bestoy\s+aquí\s+para\s+ayudar\b/i,
];
const HUMAN_DETAIL_PATTERNS: RegExp[] = [
  /\bhoy\b/i,
  /\bahora\b/i,
  /\baqu[ií]\b/i,
  /\bme\s+gusta\b/i,
  /\bme\s+apetece\b/i,
  /\bcontigo\b/i,
  /\bte\s+leo\b/i,
  /\bme\s+encanta\b/i,
];
const UNDERAGE_PATTERNS: RegExp[] = [
  /\b(tengo|cumplo)\s*1[0-7]\b/i,
  /\b(tengo|cumplo)\s*1[0-7]\s*(años|anos)\b/i,
  /\b1[0-7]\s*(años|anos)\b/i,
  /\bsoy\s*menor\b/i,
  /\bmenor\s+de\s+edad\b/i,
  /\bsoy\s*1[0-7]\b/i,
];
const COERCION_PATTERNS: RegExp[] = [
  /\bsin\s+consentimiento\b/i,
  /\bno\s+me\s+digas\s+que\s+no\b/i,
  /\bforzar\b/i,
  /\bobligar\b/i,
  /\bsin\s+permiso\b/i,
  /\bno\s+quiero\s+pero\b/i,
];

const SAFE_UNDERAGE_REPLY =
  "Antes de seguir: aquí solo +18. Si eres mayor de edad, confírmamelo y seguimos, ¿sí?";
const SAFE_CONSENT_REPLY =
  "Solo hago cosas consensuadas y cuidadas. Si te apetece algo sugerente y con calma, lo hacemos suave. ¿Te va?";

export function buildAgencyDraftFromBlocks(options: BuildAgencyDraftOptions): AgencyDraftResult {
  const fanName = normalizeName(options.fanName);
  const contextSnippet = buildContextSnippet(options.lastFanMsg ?? "");
  const unsafe = detectUnsafeContext(options.lastFanMsg ?? "");
  if (unsafe === "underage") {
    return {
      text: SAFE_UNDERAGE_REPLY,
      usedBlocks: { opener: null, bridge: null, escalation: null, question: null, softBoundary: null, closer: null },
      contextSnippet: null,
    };
  }
  if (unsafe === "coercion") {
    return {
      text: SAFE_CONSENT_REPLY,
      usedBlocks: { opener: null, bridge: null, escalation: null, question: null, softBoundary: null, closer: null },
      contextSnippet: null,
    };
  }

  const variant = typeof options.variant === "number" ? options.variant : 0;
  const baseSeed = hashString(
    [
      fanName || "fan",
      contextSnippet || "",
      options.stage,
      options.objective,
      options.intensity,
      options.offer?.title ?? "",
      options.offer?.tier ?? "",
      String(variant),
    ].join("|")
  );

  const normalizedBlocks = normalizeBlocks(options.blocks);
  const opener = pickFromPool(normalizedBlocks.openers, baseSeed, "openers", variant);
  const bridge = pickFromPool(normalizedBlocks.bridges, baseSeed, "bridges", variant);
  const tease = pickFromPool(normalizedBlocks.teases, baseSeed, "teases", variant);
  const cta = pickFromPool(normalizedBlocks.ctas, baseSeed, "ctas", variant);

  const baseReplacements = {
    fanName,
    context: contextSnippet ?? "",
    offerTitle: options.offer?.title ?? "",
    offerTier: options.offer?.tier ?? "",
  };

  const interpolatedBridge = interpolate(bridge, baseReplacements);
  const resolvedBridge = contextSnippet
    ? ensureContextReference(interpolatedBridge, contextSnippet)
    : bridge.includes("{context}")
    ? ""
    : interpolatedBridge;
  const resolvedOpener = interpolate(opener, baseReplacements);
  let resolvedTease = interpolate(tease, baseReplacements);
  if (contextSnippet && (!resolvedBridge || options.mode === "short")) {
    resolvedTease = ensureContextReference(resolvedTease, contextSnippet);
  }
  const resolvedCta = ensureQuestion(interpolate(cta, baseReplacements));

  const parts =
    options.mode === "short"
      ? [resolvedOpener, resolvedTease, resolvedCta]
      : [resolvedOpener, resolvedBridge, resolvedTease, resolvedCta];

  let draft = parts.map((part) => part.trim()).filter(Boolean).join(" ");
  draft = sanitizeBannedTerms(draft);
  draft = normalizeWhitespace(draft);
  draft = ensureQuestion(draft);

  return {
    text: draft.trim(),
    usedBlocks: {
      opener,
      bridge,
      tease,
      cta,
    },
    contextSnippet: contextSnippet ?? null,
  };
}

export function scoreDraft(text: string): DraftQaResult {
  const trimmed = normalizeWhitespace(text || "").trim();
  if (!trimmed) {
    return { score: 0, warnings: ["Sin contenido"] };
  }

  let score = 60;
  const warnings: string[] = [];
  const endsWithQuestion = /[?¿]$/.test(trimmed);
  if (endsWithQuestion) {
    score += 15;
  } else {
    score -= 15;
    warnings.push("Sin pregunta final");
  }

  const length = trimmed.length;
  if (length <= 180) {
    score += 12;
  } else if (length <= MAX_DRAFT_CHARS) {
    score += 6;
  } else {
    score -= 18;
    warnings.push("Demasiado largo");
  }

  const bannedHits = getBannedWordHits(trimmed);
  if (bannedHits.length > 0) {
    score -= 24;
    warnings.push(`Palabras prohibidas: ${bannedHits.join(", ")}`);
  }

  const hasHumanDetail = HUMAN_DETAIL_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (hasHumanDetail) {
    score += 8;
  } else {
    score -= 6;
    warnings.push("Poca calidez humana");
  }

  const hasMarketing = MARKETING_WORDS.some((word) => trimmed.toLowerCase().includes(word));
  if (hasMarketing) {
    score -= 18;
    warnings.push("Suena a anuncio");
  }

  const isGeneric = GENERIC_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (isGeneric) {
    score -= 14;
    warnings.push("Demasiado genérico");
  }

  score = Math.max(0, Math.min(100, score));
  return { score, warnings };
}

function normalizeBlocks(blocks: AgencyTemplateBlocks): Required<AgencyTemplateBlocks> {
  return {
    openers: normalizePool(blocks.openers),
    bridges: normalizePool(blocks.bridges),
    teases: normalizePool(blocks.teases),
    ctas: normalizePool(blocks.ctas),
  };
}

function normalizePool(pool?: string[]): string[] {
  if (!Array.isArray(pool)) return [];
  return pool.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function normalizeName(name?: string | null): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

function buildContextSnippet(value: string): string | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (detectUnsafeContext(cleaned)) return null;
  const words = cleaned.split(" ").slice(0, MAX_CONTEXT_WORDS);
  let snippet = words.join(" ").replace(/[.,;:!?]$/, "");
  if (snippet.length > MAX_CONTEXT_CHARS) {
    snippet = snippet.slice(0, MAX_CONTEXT_CHARS).trim();
    snippet = snippet.replace(/[.,;:!?]$/, "");
  }
  if (!snippet) return null;
  const sanitized = sanitizeBannedTerms(snippet);
  return sanitized || null;
}

function ensureContextReference(base: string, contextSnippet: string | null): string {
  if (!contextSnippet) return base.trim();
  if (base.includes("{context}")) {
    return base.replace("{context}", contextSnippet).trim();
  }
  if (base.trim().length === 0) {
    return `Sobre lo de ${contextSnippet},`.trim();
  }
  if (base.includes(contextSnippet)) return base.trim();
  return `${base.trim()} Sobre lo de ${contextSnippet},`.trim();
}

function ensureQuestion(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /[?¿]$/.test(trimmed) ? trimmed : `${trimmed}?`;
}

function interpolate(template: string, replacements: Record<string, string>): string {
  if (!template) return "";
  return template.replace(/\{(\w+)\}/g, (_, key: string) => replacements[key] ?? "");
}

function sanitizeBannedTerms(text: string): string {
  let next = text;
  next = next.replace(/\bofertas?\b/gi, (match) => (match.toLowerCase().endsWith("s") ? "ideas" : "idea"));
  next = next.replace(/\bmensual(es)?\b/gi, (match) => (match.toLowerCase().endsWith("es") ? "constantes" : "constante"));
  next = next.replace(/\bpromo\b/gi, "detalle");
  next = next.replace(/\bpremium\b/gi, "cuidado");
  next = next.replace(/\bespecial(es)?\b/gi, "a tu medida");
  return normalizeWhitespace(next);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getBannedWordHits(text: string): string[] {
  const hits: string[] = [];
  const normalized = text.toLowerCase();
  const patterns: Array<{ word: string; pattern: RegExp }> = [
    { word: "premium", pattern: /\bpremium\b/i },
    { word: "promo", pattern: /\bpromo\b/i },
    { word: "oferta", pattern: /\bofertas?\b/i },
    { word: "especial", pattern: /\bespecial(es)?\b/i },
    { word: "mensual", pattern: /\bmensual(es)?\b/i },
  ];
  for (const entry of patterns) {
    if (entry.pattern.test(normalized)) hits.push(entry.word);
  }
  return hits;
}

export function passesDraftHardRules(text: string): { ok: boolean; warnings: string[] } {
  const trimmed = normalizeWhitespace(text || "");
  const warnings: string[] = [];
  if (!trimmed) {
    warnings.push("Sin contenido");
    return { ok: false, warnings };
  }
  if (!/[?¿]$/.test(trimmed)) warnings.push("Sin pregunta final");
  if (trimmed.length > MAX_DRAFT_CHARS) warnings.push("Demasiado largo");
  const bannedHits = getBannedWordHits(trimmed);
  if (bannedHits.length > 0) {
    warnings.push(`Palabras prohibidas: ${bannedHits.join(", ")}`);
  }
  return { ok: warnings.length === 0, warnings };
}

function detectUnsafeContext(value: string): "underage" | "coercion" | null {
  const normalized = value.toLowerCase();
  if (UNDERAGE_PATTERNS.some((pattern) => pattern.test(normalized))) return "underage";
  if (COERCION_PATTERNS.some((pattern) => pattern.test(normalized))) return "coercion";
  return null;
}


function pickFromPool(pool: string[], baseSeed: number, salt: string, variant: number): string {
  if (!pool.length) return "";
  const seed = hashString(`${baseSeed}:${salt}`);
  const index = (seed + variant) % pool.length;
  return pool[index] ?? pool[0] ?? "";
}

function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(hash >>> 0);
}
