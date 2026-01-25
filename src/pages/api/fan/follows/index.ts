import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { readFanId } from "../../../../lib/fan/session";

type FollowListResponse = { count: number; creatorIds: string[] } | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<FollowListResponse>) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fanId = readFanId(req);
  if (!fanId) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  try {
    const follows = await prisma.follow.findMany({
      where: { fanId },
      select: { creatorId: true },
      orderBy: { createdAt: "desc" },
    });
    const creatorIds = follows.map((follow) => follow.creatorId);
    return res.status(200).json({ count: creatorIds.length, creatorIds });
  } catch (err) {
    console.error("Error loading fan follows", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
