import { prisma } from "@/server/prisma";
import type { AgencyIntensity, AgencyObjective, AgencyStage } from "@/lib/agency/types";
import {
  buildAgencyDraftFromBlocks,
  passesDraftHardRules,
  scoreDraft,
  type AgencyDraftResult,
  type AgencyOfferContext,
  type AgencyTemplateBlocks,
} from "@/lib/agency/drafts";

type AgencyTemplateRecord = {
  id: string;
  stage: AgencyStage;
  objective: AgencyObjective;
  intensity: AgencyIntensity;
  language: string;
  blocksJson: unknown;
  active: boolean;
};

export type BuildAgencyDraftInput = {
  creatorId: string;
  fanName?: string | null;
  lastFanMsg?: string | null;
  stage: AgencyStage;
  objective: AgencyObjective;
  intensity: AgencyIntensity;
  language?: string | null;
  offer?: AgencyOfferContext | null;
  variant?: number;
  mode?: "full" | "short";
  avoidText?: string | null;
};

export type AgencyDraftResponse = {
  text: string;
  qa: { score: number; warnings: string[] };
  templateId?: string | null;
  variant: number;
};

const OPENERS_BY_INTENSITY: Record<AgencyIntensity, string[]> = {
  SOFT: [
    "Hey {fanName}{hook}",
    "Hola {fanName}{hook}",
    "Ey {fanName}{hook}",
    "{fanName}, te leo{hook}",
    "Aquí estoy, {fanName}{hook}",
  ],
  MEDIUM: [
    "Hey {fanName}{hook}",
    "Ey {fanName}{hook}",
    "{fanName}, me gusta leerte{hook}",
    "Hey, {fanName}{hook}",
    "{fanName}, te tengo en mente{hook}",
  ],
  INTENSE: [
    "Ey {fanName}{hook}",
    "{fanName}, me enciendes{hook}",
    "Hey, {fanName}{hook}",
    "{fanName}, me dejas con ganas{hook}",
    "Ey {fanName}, ven{hook}",
  ],
};

const STAGE_OPENER_HOOKS: Record<AgencyStage, string[]> = {
  NEW: [", me encanta conocerte", ", vamos paso a paso", ", dime tu ritmo"],
  WARM_UP: [", vamos suave", ", me quedé con ganas", ", cerquita y sin prisa"],
  HEAT: [", subamos la tensión", ", me gusta cómo vamos", ", juguemos un poco más"],
  OFFER: [", tengo un plan en mente", ", puedo prepararte algo rico", ", se me ocurrió algo"],
  CLOSE: [", si quieres lo dejamos listo", ", lo cerramos cuando digas", ", lo dejamos hecho hoy"],
  AFTERCARE: [", me gusta cuidarte", ", te leo con calma", ", respiramos un poco"],
  RECOVERY: [", retomemos suave", ", sin presión", ", volvemos con calma"],
  BOUNDARY: [", con límites claros", ", sin ir a lo explícito", ", cuidando el ritmo"],
};

const BRIDGES_BY_INTENSITY: Record<AgencyIntensity, string[]> = {
  SOFT: [
    "Sobre lo de {context}, me quedé pensando{hook}",
    "Lo de {context} me dejó con curiosidad{hook}",
    "Me quedé con {context}{hook}",
    "Lo de {context} me gustó{hook}",
    "Sobre {context}, me apetece seguir{hook}",
  ],
  MEDIUM: [
    "Lo de {context} me dejó con ganas{hook}",
    "Sobre {context}, me encendió la curiosidad{hook}",
    "Me quedé con {context} en la cabeza{hook}",
    "Lo de {context} me hizo sonreír{hook}",
    "Sobre lo de {context}, me quedé con ganas{hook}",
  ],
  INTENSE: [
    "Lo de {context} me dejó con tensión{hook}",
    "Sobre {context}, me quedé con ganas de más{hook}",
    "Me quedé con {context} muy en la piel{hook}",
    "Lo de {context} me encendió{hook}",
    "Sobre {context}, me quedé con fuego{hook}",
  ],
};

const STAGE_BRIDGE_HOOKS: Record<AgencyStage, string[]> = {
  NEW: [" y con calma", " para ir poco a poco", " sin prisa"],
  WARM_UP: [" y despacio", " con ganas", " a fuego lento"],
  HEAT: [" y subiendo", " con más chispa", " con un poco más"],
  OFFER: [" y se me ocurrió algo", " y te tengo un plan", " y puedo prepararte algo"],
  CLOSE: [" y lo dejamos listo", " y lo cerramos", " y lo resolvemos hoy"],
  AFTERCARE: [" y te cuido", " y te leo cerca", " y quedo pendiente"],
  RECOVERY: [" y retomamos suave", " sin presión", " y volvemos poco a poco"],
  BOUNDARY: [" con límites", " sin cruzar líneas", " con respeto"],
};

const TEASES_BY_INTENSITY: Record<AgencyIntensity, string[]> = {
  SOFT: [
    "Podemos ir suave y subir si te apetece{hook}",
    "Te propongo algo suave y cercano{hook}",
    "Vamos con ritmo lento y rico{hook}",
    "Puedo guiarte con calma y picardía{hook}",
    "Me gusta empezar suave y jugar un poco{hook}",
  ],
  MEDIUM: [
    "Podemos subir un poco el tono{hook}",
    "Te preparo algo con chispa{hook}",
    "Subimos la tensión sin ir a lo explícito{hook}",
    "Me apetece jugar más contigo{hook}",
    "Vamos a un punto más atrevido{hook}",
  ],
  INTENSE: [
    "Puedo subir el tono con control{hook}",
    "Vamos con más fuego, sin pasarnos{hook}",
    "Te dejo en tensión y lo subo un paso{hook}",
    "Me apetece un punto más intenso{hook}",
    "Subimos claro y con cuidado{hook}",
  ],
};

const STAGE_TEASE_HOOKS: Record<AgencyStage, string[]> = {
  NEW: [", para empezar bien", ", paso a paso", ", sin correr"],
  WARM_UP: [", calentando despacio", ", poco a poco", ", para ir entrando"],
  HEAT: [", con más chispa", ", sin frenar", ", subiendo rico"],
  OFFER: [", y lo dejo listo", ", si quieres te lo preparo", ", y te lo paso"],
  CLOSE: [", y lo cerramos ya", ", si quieres lo cerramos", ", y lo dejamos hecho"],
  AFTERCARE: [", y luego te cuido", ", y luego bajamos", ", con calma después"],
  RECOVERY: [", y retomamos bien", ", sin presión", ", cuidando el ritmo"],
  BOUNDARY: [", con límites claros", ", sin cruzar líneas", ", siempre con respeto"],
};

const CTAS_BY_INTENSITY: Record<AgencyIntensity, string[]> = {
  SOFT: [
    "¿Te apetece seguir{hook}?",
    "¿Lo hacemos con calma{hook}?",
    "¿Te va algo suave{hook}?",
    "¿Quieres que lo lleve despacio{hook}?",
    "¿Te apetece que empecemos{hook}?",
  ],
  MEDIUM: [
    "¿Te apetece subir un poco{hook}?",
    "¿Lo dejamos suave o subimos{hook}?",
    "¿Te va un toque de chispa{hook}?",
    "¿Quieres que lo haga más intenso{hook}?",
    "¿Te apetece jugar un poco más{hook}?",
  ],
  INTENSE: [
    "¿Quieres que suba el tono{hook}?",
    "¿Te va algo más intenso{hook}?",
    "¿Subimos un paso más{hook}?",
    "¿Te apetece ir más fuerte{hook}?",
    "¿Lo llevamos a otro nivel{hook}?",
  ],
};

const STAGE_CTA_HOOKS: Record<AgencyStage, string[]> = {
  NEW: [" ahora", " aquí", " conmigo"],
  WARM_UP: [" ahora", " aquí", " un poquito"],
  HEAT: [" ahora", " esta noche", " un poco más"],
  OFFER: [" ahora", " aquí", " hoy"],
  CLOSE: [" ya", " ahora", " hoy"],
  AFTERCARE: [" ahora", " aquí", " con calma"],
  RECOVERY: [" ahora", " aquí", " con calma"],
  BOUNDARY: [" ahora", " aquí", " con calma"],
};

function buildFallbackPools(stage: AgencyStage, intensity: AgencyIntensity): Required<AgencyTemplateBlocks> {
  return {
    openers: combineWithHooks(OPENERS_BY_INTENSITY[intensity], STAGE_OPENER_HOOKS[stage]),
    bridges: combineWithHooks(BRIDGES_BY_INTENSITY[intensity], STAGE_BRIDGE_HOOKS[stage]),
    teases: combineWithHooks(TEASES_BY_INTENSITY[intensity], STAGE_TEASE_HOOKS[stage]),
    ctas: combineWithHooks(CTAS_BY_INTENSITY[intensity], STAGE_CTA_HOOKS[stage]),
  };
}

export async function buildAgencyDraft(input: BuildAgencyDraftInput): Promise<AgencyDraftResponse> {
  const baseVariant = typeof input.variant === "number" ? Math.max(0, Math.floor(input.variant)) : 0;
  const fallbackPools = buildFallbackPools(input.stage, input.intensity);
  let templateId: string | null = null;
  let blocks: Required<AgencyTemplateBlocks> = fallbackPools;

  if (prisma) {
    const language = (input.language || "es").trim() || "es";
    const templates = await prisma.agencyTemplate.findMany({
      where: { creatorId: input.creatorId, active: true, language },
      select: {
        id: true,
        stage: true,
        objective: true,
        intensity: true,
        language: true,
        blocksJson: true,
        active: true,
      },
    });

    const candidate = pickTemplate({
      templates,
      stage: input.stage,
      objective: input.objective,
      intensity: input.intensity,
      fanName: input.fanName ?? "",
      lastFanMsg: input.lastFanMsg ?? "",
      variant: baseVariant,
    });

    if (candidate?.blocksJson) {
      const normalized = normalizeBlocks(candidate.blocksJson);
      blocks = mergeBlocks(normalized, fallbackPools);
      templateId = candidate.id;
    }
  }

  const buildWithVariant = (variant: number): AgencyDraftResult =>
    buildAgencyDraftFromBlocks({
      fanName: input.fanName,
      lastFanMsg: input.lastFanMsg,
      stage: input.stage,
      objective: input.objective,
      intensity: input.intensity,
      offer: input.offer,
      blocks,
      variant,
      mode: input.mode ?? "full",
    });

  let result = buildWithVariant(baseVariant);
  const avoidText = (input.avoidText ?? "").trim();
  let usedVariant = baseVariant;
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const trimmed = result.text.trim();
    const isAvoid = avoidText.length > 0 && trimmed === avoidText;
    const hardRules = passesDraftHardRules(trimmed);
    if (!isAvoid && hardRules.ok) {
      usedVariant = baseVariant + attempt;
      break;
    }
    if (attempt === maxAttempts - 1) {
      usedVariant = baseVariant + attempt;
      break;
    }
    const candidateVariant = baseVariant + attempt + 1;
    result = buildWithVariant(candidateVariant);
    usedVariant = candidateVariant;
  }

  return {
    text: result.text,
    qa: scoreDraft(result.text),
    templateId,
    variant: usedVariant,
  };
}

function pickTemplate(args: {
  templates: AgencyTemplateRecord[];
  stage: AgencyStage;
  objective: AgencyObjective;
  intensity: AgencyIntensity;
  fanName: string;
  lastFanMsg: string;
  variant: number;
}): AgencyTemplateRecord | null {
  const { templates, stage, objective, intensity, fanName, lastFanMsg, variant } = args;
  if (!templates.length) return null;
  const filters: Array<(tpl: AgencyTemplateRecord) => boolean> = [
    (tpl) => tpl.stage === stage && tpl.objective === objective && tpl.intensity === intensity,
    (tpl) => tpl.stage === stage && tpl.intensity === intensity,
    (tpl) => tpl.stage === stage && tpl.objective === objective,
    (tpl) => tpl.stage === stage,
    (tpl) => tpl.objective === objective,
    () => true,
  ];

  let candidates: AgencyTemplateRecord[] = [];
  for (const predicate of filters) {
    candidates = templates.filter(predicate);
    if (candidates.length > 0) break;
  }
  if (!candidates.length) return null;

  const seed = hashString([fanName, lastFanMsg, stage, objective, intensity].join("|"));
  const index = (seed + variant) % candidates.length;
  return candidates[index] ?? candidates[0] ?? null;
}

function normalizeBlocks(raw: unknown): Required<AgencyTemplateBlocks> {
  if (!raw || typeof raw !== "object") {
    return { openers: [], bridges: [], teases: [], ctas: [] };
  }
  const record = raw as Record<string, unknown>;
  const openers = normalizePool(record.openers);
  const bridges = normalizePool(record.bridges);
  const teases = normalizePool(record.teases);
  const ctas = normalizePool(record.ctas);
  const legacyTeases = teases.length > 0 ? teases : normalizePool(record.escalations);
  const legacyCtas = ctas.length > 0 ? ctas : normalizePool(record.questions);
  return {
    openers,
    bridges,
    teases: legacyTeases,
    ctas: legacyCtas,
  };
}

function mergeBlocks(primary: Required<AgencyTemplateBlocks>, fallback: Required<AgencyTemplateBlocks>) {
  return {
    openers: mergePool(primary.openers, fallback.openers),
    bridges: mergePool(primary.bridges, fallback.bridges),
    teases: mergePool(primary.teases, fallback.teases),
    ctas: mergePool(primary.ctas, fallback.ctas),
  };
}

function mergePool(primary: string[], fallback: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of [...primary, ...fallback]) {
    const trimmed = typeof item === "string" ? item.trim() : "";
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function normalizePool(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function combineWithHooks(base: string[], hooks: string[]): string[] {
  const results: string[] = [];
  for (const baseItem of base) {
    for (const hook of hooks) {
      const combined = baseItem.replace("{hook}", hook);
      const normalized = combined.replace(/\s+/g, " ").trim();
      if (normalized.length > 0) results.push(normalized);
    }
  }
  return uniquePool(results);
}

function uniquePool(pool: string[]): string[] {
  const seen = new Set<string>();
  return pool.filter((item) => {
    if (!item) return false;
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(hash >>> 0);
}
