import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { readFanId } from "../../../lib/fan/session";

type ToggleResponse = { isFollowing: boolean } | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ToggleResponse>) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fanId = readFanId(req);
  if (!fanId) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  const creatorId = normalizeId(req.body?.creatorId);
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

    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
      return res.status(200).json({ isFollowing: false });
    }

    await prisma.follow.create({ data: { fanId, creatorId } });
    return res.status(200).json({ isFollowing: true });
  } catch (err) {
    console.error("Error toggling follow", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
