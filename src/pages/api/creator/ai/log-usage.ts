import type { NextApiRequest, NextApiResponse } from "next";
import { logAiUsage } from "../../../../lib/aiUsage.server";
import { AI_TURN_MODES, type AiTurnMode } from "../../../../lib/aiTemplateTypes";
import { normalizeAiTurnMode } from "../../../../lib/aiSettings";

type LogUsageBody = {
  fanId?: string;
  actionType?: string;
  contextSummary?: string;
  suggestedText?: string;
  outcome?: string;
  finalText?: string;
  creditsUsed?: number;
  turnMode?: AiTurnMode;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false });
  }

  const body = req.body as LogUsageBody;

  if (!body || typeof body !== "object") {
    return res.status(400).json({ ok: false });
  }

  const { fanId, actionType, contextSummary, suggestedText, outcome, finalText } = body;

  if (!suggestedText || typeof suggestedText !== "string" || suggestedText.trim().length === 0) {
    return res.status(400).json({ ok: false });
  }

  if (!actionType || typeof actionType !== "string") {
    return res.status(400).json({ ok: false });
  }

  if (!outcome || typeof outcome !== "string") {
    return res.status(400).json({ ok: false });
  }

  const creditsUsed = typeof body.creditsUsed === "number" && body.creditsUsed >= 0 ? body.creditsUsed : 1;
  const normalizedOutcome = (outcome as "accepted" | "edited" | "rejected" | "suggested") ?? "suggested";
  const turnMode =
    typeof body.turnMode === "string" && (AI_TURN_MODES as readonly string[]).includes(normalizeAiTurnMode(body.turnMode))
      ? normalizeAiTurnMode(body.turnMode)
      : undefined;

  try {
    await logAiUsage({
      creatorId: "creator-1",
      fanId: typeof fanId === "string" ? fanId : undefined,
      actionType,
      contextSummary: typeof contextSummary === "string" ? contextSummary : undefined,
      suggestedText: suggestedText.trim(),
      outcome: normalizedOutcome,
      finalText: typeof finalText === "string" ? finalText : undefined,
      creditsUsed,
      turnMode,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "AI_HARD_LIMIT_REACHED") {
        return res.status(429).json({
          ok: false,
          code: "AI_HARD_LIMIT_REACHED",
          message: "Se ha alcanzado el límite diario de IA.",
        });
      }
      if (err.message === "AI_NO_CREDITS_LEFT") {
        return res.status(402).json({
          ok: false,
          code: "AI_NO_CREDITS_LEFT",
          message: "No quedan créditos de IA disponibles.",
        });
      }
    }

    console.error("Error in log-usage:", err);
    return res.status(500).json({ ok: false, code: "INTERNAL_ERROR" });
  }
}
