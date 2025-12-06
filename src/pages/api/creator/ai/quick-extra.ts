import type { NextApiRequest, NextApiResponse } from "next";
import { AiTemplateUsage, AI_TEMPLATE_USAGES, AI_TURN_MODES, type AiTurnMode } from "../../../../lib/aiTemplateTypes";
import {
  getTemplateSuggestionForCreator,
  normalizeTone,
  AiTone,
  ACTION_TYPE_FOR_USAGE,
} from "../../../../lib/aiQuickExtra";
import { getExtraLadderStatusForFan } from "../../../../lib/extraLadder";
import type { ExtraTier } from "@prisma/client";
import prisma from "../../../../lib/prisma";

const DEFAULT_CREATOR_ID = "creator-1";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const toneRaw = (req.body?.tone as string | undefined) ?? "cercano";
  const tone = normalizeTone(toneRaw) as AiTone;
  const fanId = typeof req.body?.fanId === "string" ? req.body.fanId : undefined;
  const usageRaw = typeof req.body?.usage === "string" ? (req.body.usage as AiTemplateUsage) : undefined;
  const fallbackUsageRaw = typeof req.body?.fallbackUsage === "string" ? (req.body.fallbackUsage as AiTemplateUsage) : undefined;
  const usage: AiTemplateUsage | undefined = usageRaw && AI_TEMPLATE_USAGES.includes(usageRaw) ? usageRaw : undefined;
  const fallbackUsage: AiTemplateUsage | undefined =
    fallbackUsageRaw && AI_TEMPLATE_USAGES.includes(fallbackUsageRaw) ? fallbackUsageRaw : undefined;
  const finalUsage: AiTemplateUsage = usage ?? fallbackUsage ?? "extra_quick";
  const modeRaw = typeof req.body?.mode === "string" ? (req.body.mode as AiTurnMode) : null;
  const mode: AiTurnMode =
    modeRaw && (AI_TURN_MODES as readonly string[]).includes(modeRaw) ? modeRaw : (await getDefaultTurnMode());
  let suggestedTier: ExtraTier | null = null;

  try {
    if (fanId) {
      const ladder = await getExtraLadderStatusForFan(prisma, DEFAULT_CREATOR_ID, fanId);
      suggestedTier = (ladder?.suggestedTier as ExtraTier | null) ?? (ladder?.maxTierBought as ExtraTier | null) ?? null;
      if (!suggestedTier) suggestedTier = "T0";
    }
  } catch (err) {
    console.error("Error computing ladder for quick-extra", err);
  }

  try {
    const result = await getTemplateSuggestionForCreator({
      creatorId: DEFAULT_CREATOR_ID,
      usage: finalUsage,
      tone,
      fanId,
      tier: suggestedTier ?? null,
      mode,
    });

    if (!result?.suggestedText) {
      return res.status(404).json({ error: "NO_TEMPLATES_FOR_USAGE" });
    }

    return res.status(200).json({ suggestedText: result.suggestedText, actionType: ACTION_TYPE_FOR_USAGE[finalUsage] });
  } catch (err) {
    console.error("Error getting quick extra suggestion", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

async function getDefaultTurnMode(): Promise<AiTurnMode> {
  try {
    const settings =
      (await prisma.creatorAiSettings.findUnique({
        where: { creatorId: DEFAULT_CREATOR_ID },
        select: { turnMode: true },
      })) ||
      (await prisma.creatorAiSettings.create({
        data: { creatorId: DEFAULT_CREATOR_ID },
        select: { turnMode: true },
      }));

    return (settings?.turnMode as AiTurnMode) ?? "HEATUP";
  } catch (err) {
    console.error("Error loading default turn mode", err);
    return "HEATUP";
  }
}
