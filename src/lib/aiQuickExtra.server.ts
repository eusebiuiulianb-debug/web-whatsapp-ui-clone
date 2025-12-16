import type { ExtraTier, CreatorAiTemplate } from "@prisma/client";
import prisma from "./prisma.server";
import { ACTION_TYPE_FOR_USAGE, AiTone, getQuickExtraSuggestion, normalizeTone } from "./aiQuickExtra";
import type { AiTurnMode, AiTemplateUsage } from "./aiTemplateTypes";

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
    const { DEFAULT_AI_TEMPLATES } = await import("./defaultAiTemplates");
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

  const toneKey = normalizeTone(tone);
  const toneTemplates = candidates.filter((tpl) => tpl.tone === toneKey);
  if (toneTemplates.length > 0) {
    candidates = toneTemplates;
  }

  let recentlySuggested = new Set<string>();
  if (fanId) {
    const actionType = ACTION_TYPE_FOR_USAGE[usage as keyof typeof ACTION_TYPE_FOR_USAGE];
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
