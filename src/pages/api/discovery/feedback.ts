import { randomUUID } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";

type FeedbackPayload = {
  sessionId?: string;
  creatorId?: string;
  vote?: "up" | "down";
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<{ ok: boolean; sessionId?: string } | { error: string }>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sessionId: rawSessionId, creatorId, vote } = (req.body || {}) as FeedbackPayload;
  const normalizedVote = vote === "up" || vote === "down" ? vote : null;

  if (!creatorId || !normalizedVote) {
    return res.status(400).json({ error: "Payload inválido" });
  }

  const sessionId = typeof rawSessionId === "string" && rawSessionId.trim().length > 0 ? rawSessionId.trim() : randomUUID();

  try {
    await prisma.discoveryFeedback.create({
      data: {
        creatorId,
        sessionId,
        vote: normalizedVote,
      },
    });
    return res.status(200).json({ ok: true, sessionId });
  } catch (err) {
    console.error("Error recording discovery feedback", err);
    return res.status(500).json({ error: "No se pudo registrar el feedback" });
  }
}
