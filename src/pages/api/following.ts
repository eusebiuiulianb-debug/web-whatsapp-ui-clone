import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../lib/prisma.server";
import { readFanId, slugifyHandle } from "../../lib/fan/session";

type FollowingItem = {
  id: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
};

type FollowingResponse = { items: FollowingItem[] } | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<FollowingResponse>) {
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
      orderBy: { createdAt: "desc" },
      select: {
        creator: {
          select: {
            id: true,
            name: true,
            handle: true,
            bioLinkAvatarUrl: true,
          },
        },
      },
    });

    const items = follows
      .map((follow) => follow.creator)
      .filter(Boolean)
      .map((creator) => {
        const name = creator?.name || "Creador";
        return {
          id: creator?.id || "",
          name,
          handle: creator?.handle || slugifyHandle(name),
          avatarUrl: creator?.bioLinkAvatarUrl ?? null,
        } as FollowingItem;
      })
      .filter((item) => item.id);

    return res.status(200).json({ items });
  } catch (err) {
    console.error("Error loading following list", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
