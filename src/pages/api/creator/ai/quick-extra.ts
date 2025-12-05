import type { NextApiRequest, NextApiResponse } from "next";
import { AiTemplateUsage, AI_TEMPLATE_USAGES } from "../../../../lib/aiTemplateTypes";
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
  const usageRaw = typeof req.body?.usage === "string" ? (req.body.usage as AiTemplateUsage) : "extra_quick";
  const usage: AiTemplateUsage = AI_TEMPLATE_USAGES.includes(usageRaw) ? usageRaw : "extra_quick";
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
      usage,
      tone,
      fanId,
      tier: suggestedTier ?? null,
    });

    if (!result?.suggestedText) {
      return res.status(404).json({ error: "NO_TEMPLATES_FOR_USAGE" });
    }

    return res.status(200).json({ suggestedText: result.suggestedText, actionType: ACTION_TYPE_FOR_USAGE[usage] });
  } catch (err) {
    console.error("Error getting quick extra suggestion", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
