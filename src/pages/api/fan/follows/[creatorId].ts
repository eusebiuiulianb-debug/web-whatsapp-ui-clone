import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { readFanId } from "../../../../lib/fan/session";

type FollowMutationResponse = { ok: true; following: boolean } | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<FollowMutationResponse>) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" && req.method !== "DELETE") {
    res.setHeader("Allow", ["POST", "DELETE"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fanId = readFanId(req);
  if (!fanId) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  const creatorId = normalizeId(req.query.creatorId);
  if (!creatorId) {
    return res.status(400).json({ error: "INVALID_CREATOR" });
  }

  try {
    const creator = await prisma.creator.findUnique({
      where: { id: creatorId },
      select: { id: true },
    });
    if (!creator) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const existing = await prisma.follow.findUnique({
      where: { fanId_creatorId: { fanId, creatorId } },
      select: { id: true },
    });

    if (req.method === "POST") {
      if (!existing) {
        await prisma.follow.create({ data: { fanId, creatorId } });
      }
      return res.status(200).json({ ok: true, following: true });
    }

    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
    }
    return res.status(200).json({ ok: true, following: false });
  } catch (err) {
    console.error("Error updating follow state", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
