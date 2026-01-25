import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../lib/prisma.server";
import { readFanId, slugifyHandle } from "../../lib/fan/session";

type FollowingItem = {
  id: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  availability?: string | null;
  responseSla?: string | null;
  checkInAt?: string | null;
};

type FollowingResponse = { items: FollowingItem[]; total: number } | { error: string };

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
        createdAt: true,
        creator: {
          select: {
            id: true,
            name: true,
            handle: true,
            bioLinkAvatarUrl: true,
            profile: {
              select: {
                availability: true,
                responseSla: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    const items = follows
      .map((follow) => {
        const creator = follow.creator;
        if (!creator?.id) return null;
        const name = creator.name || "Creador";
        const availability = creator.profile?.availability ?? null;
        const responseSla = creator.profile?.responseSla ?? null;
        const checkInAt = (creator.profile?.updatedAt ?? follow.createdAt)?.toISOString?.() ?? null;
        return {
          id: creator.id,
          name,
          handle: creator.handle || slugifyHandle(name),
          avatarUrl: creator.bioLinkAvatarUrl ?? null,
          availability,
          responseSla,
          checkInAt,
        } as FollowingItem;
      })
      .filter((item): item is FollowingItem => Boolean(item?.id));

    items.sort((a, b) => {
      const aAvailable = isAvailable(a.availability);
      const bAvailable = isAvailable(b.availability);
      if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
      const aFast = isFastResponder(a.responseSla);
      const bFast = isFastResponder(b.responseSla);
      if (aFast !== bFast) return aFast ? -1 : 1;
      const aCheckRaw = a.checkInAt ? Date.parse(a.checkInAt) : 0;
      const bCheckRaw = b.checkInAt ? Date.parse(b.checkInAt) : 0;
      const aCheck = Number.isNaN(aCheckRaw) ? 0 : aCheckRaw;
      const bCheck = Number.isNaN(bCheckRaw) ? 0 : bCheckRaw;
      if (aCheck !== bCheck) return bCheck - aCheck;
      return a.name.localeCompare(b.name);
    });

    return res.status(200).json({ items, total: items.length });
  } catch (err) {
    console.error("Error loading following list", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

function isAvailable(value?: string | null): boolean {
  if (!value) return true;
  const normalized = value.trim().toUpperCase();
  return normalized === "AVAILABLE" || normalized === "VIP_ONLY";
}

function isFastResponder(value?: string | null): boolean {
  if (!value) return true;
  const normalized = value.trim().toUpperCase();
  return normalized === "INSTANT" || normalized === "LT_24H";
}
