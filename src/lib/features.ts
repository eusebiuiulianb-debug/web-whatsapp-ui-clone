import type { NextApiResponse } from "next";

export const AI_ENABLED = process.env.NEXT_PUBLIC_ENABLE_AI === "true";

export function sendAiDisabled(res: NextApiResponse) {
  res.status(410).json({ ok: false, error: "AI_DISABLED" });
}
