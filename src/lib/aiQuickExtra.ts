import prisma from "./prisma.server";
import { AiTemplateUsage, type AiTurnMode } from "./aiTemplateTypes";
import { DEFAULT_AI_TEMPLATES } from "./defaultAiTemplates";
import type { ExtraTier, CreatorAiTemplate } from "@prisma/client";

export type AiTone = "cercano" | "profesional" | "jugueton";

export const ACTION_TYPE_FOR_USAGE: Record<AiTemplateUsage, string> = {
  welcome: "welcome_suggestion",
  warmup: "warmup_suggestion",
  extra_quick: "quick_extra_suggestion",
  pack_offer: "pack_offer_suggestion",
  followup: "followup_suggestion",
  renewal: "renewal_suggestion",
  reactivation: "reactivation_suggestion",
  boundaries: "boundaries_suggestion",
  support: "support_suggestion",
};

export function normalizeTone(tone: string | null | undefined): AiTone {
  const value = (tone || "").toLowerCase().replace("ó", "o").replace("ò", "o");
  if (value === "profesional") return "profesional";
  if (value === "jugueton") return "jugueton";
  return "cercano";
}

export function getQuickExtraSuggestion(rawTone: string | null | undefined): string {
  const tone = normalizeTone(rawTone);
  const templates: Record<AiTone, string[]> = {
    cercano: [
      "Te propongo una foto extra muy cuidada solo para ti por 9 €. Si te apetece, te explico cómo hacer el pago y te la envío.",
      "Tengo una foto extra íntima que creo que te va a gustar. Son 9 €. Si quieres, te cuento ahora mismo cómo conseguirla.",
    ],
    profesional: [
      "Puedo ofrecerte una foto extra exclusiva por 9 €. Si te interesa, dime “sí” y te explico el proceso de pago.",
      "Tengo disponible una foto extra en alta calidad por 9 €. Confírmame si quieres que te comparta los pasos para recibirla.",
    ],
    jugueton: [
      "Tengo una foto extra un poco más íntima solo para ti por 9 €. Si te apetece jugar un poco más, dime y te explico cómo recibirla.",
      "Me ha quedado una foto extra bastante traviesa por 9 €. Si te tienta, dime “quiero” y te cuento cómo te la envío ;)",
    ],
  };

  const options = templates[tone] ?? templates.cercano;
  const index = Math.floor(Math.random() * options.length);
  return options[index];
}

type Template = {
  content: string;
  tone: AiTone;
  tier: ExtraTier | null;
  id: string;
  mode: AiTurnMode | null;
};

export async function getTemplateSuggestionForCreator(params: {
  creatorId: string;
  usage: AiTemplateUsage;
  tone: AiTone;
  fanId?: string | null;
  tier?: ExtraTier | null;
  limit?: number;
  mode?: AiTurnMode | null;
}): Promise<{ suggestedText: string; templateId?: string } | null> {
  const { creatorId, usage, tone, fanId, tier, limit = 1, mode = null } = params;

  const baseTemplates = await prisma.creatorAiTemplate.findMany({
    where: {
      creatorId,
      category: usage,
      isActive: true,
    },
  });

  const mapToTemplate = (tpl: CreatorAiTemplate): Template => ({
    content: tpl.content,
    tone: (tpl.tone as AiTone) ?? "cercano",
    tier: (tpl.tier as ExtraTier | null) ?? null,
    id: tpl.id,
    mode: (tpl.mode as AiTurnMode | null) ?? null,
  });

  let workingTemplates: Template[] = baseTemplates.map(mapToTemplate);

  if (workingTemplates.length === 0) {
    workingTemplates = DEFAULT_AI_TEMPLATES.filter((tpl) => tpl.usage === usage).map((tpl) => ({
      content: tpl.content,
      tone: (tpl.tone as AiTone) ?? "cercano",
      tier: (tpl.tier as ExtraTier | null) ?? null,
      id: `default-${tpl.name}`,
      mode: (tpl.mode as AiTurnMode | null) ?? null,
    }));
  }

  if (workingTemplates.length === 0) {
    return null;
  }

  let candidates = workingTemplates;

  if (mode) {
    const templatesWithMode = workingTemplates.filter((tpl) => Boolean(tpl.mode));
    if (templatesWithMode.length > 0) {
      const modeMatches = workingTemplates.filter((tpl) => tpl.mode === mode);
      const neutralTemplates = workingTemplates.filter((tpl) => !tpl.mode);
      if (modeMatches.length > 0) {
        candidates = modeMatches;
      } else if (neutralTemplates.length > 0) {
        candidates = neutralTemplates;
      }
    }
  }

  if (typeof tier !== "undefined") {
    const tierMatch = candidates.filter((tpl) => tpl.tier === tier);
    const tierNeutral = candidates.filter((tpl) => !tpl.tier);
    if (tierMatch.length > 0) {
      candidates = tierMatch;
    } else if (tierNeutral.length > 0) {
      candidates = tierNeutral;
    }
  }

  const toneKey = tone;
  const toneTemplates = candidates.filter((tpl) => tpl.tone === toneKey);
  if (toneTemplates.length > 0) {
    candidates = toneTemplates;
  }

  let recentlySuggested = new Set<string>();
  if (fanId) {
    const actionType = ACTION_TYPE_FOR_USAGE[usage];
    const recentLogs = await prisma.aiUsageLog.findMany({
      where: { creatorId, fanId, actionType },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    recentlySuggested = new Set(
      recentLogs
        .map((log) => (log.suggestedText || "").trim())
        .filter((text) => text.length > 0)
    );
  }

  let pool = candidates;
  if (pool.length > 1 && recentlySuggested.size > 0) {
    const unused = pool.filter((tpl) => !recentlySuggested.has((tpl.content || "").trim()));
    if (unused.length > 0) {
      pool = unused;
    }
  }

  if (pool.length === 0) {
    return null;
  }

  const picks: Template[] = [];
  const maxItems = Math.min(limit, pool.length);
  for (let i = 0; i < maxItems; i++) {
    const index = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(index, 1)[0]);
  }

  const chosen = picks[0];
  return { suggestedText: chosen.content, templateId: chosen.id };
}

export async function getQuickExtraSuggestionForCreator(
  creatorId: string,
  tone: AiTone,
  fanId?: string | null,
  tier?: ExtraTier | null,
  mode?: AiTurnMode | null
): Promise<string> {
  const result = await getTemplateSuggestionForCreator({ creatorId, usage: "extra_quick", tone, fanId, tier, mode });
  if (result?.suggestedText) return result.suggestedText;
  return getQuickExtraSuggestion(tone);
}
