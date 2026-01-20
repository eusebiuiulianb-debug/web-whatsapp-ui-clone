import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { ensureFan, slugifyHandle } from "../../../../../lib/fan/session";

type FollowResponse =
  | { ok: true; following: true; followerCount: number }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<FollowResponse>) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const handle = typeof req.query.handle === "string" ? req.query.handle.trim() : "";
  if (!handle) {
    return res.status(400).json({ ok: false, error: "handle is required" });
  }

  try {
    const creator = await resolveCreatorByHandle(handle);
    if (!creator) {
      return res.status(404).json({ ok: false, error: "creator_not_found" });
    }

    const { fanId } = await ensureFan(req, res, {
      creatorId: creator.id,
      creatorHandle: creator.name || handle,
      mode: "public",
    });

    await prisma.fan.update({
      where: { id: fanId },
      data: { isArchived: false },
    });

    const followerCount = await prisma.fan.count({
      where: { creatorId: creator.id, isArchived: false },
    });

    return res.status(200).json({ ok: true, following: true, followerCount });
  } catch (err) {
    console.error("Error following creator", err);
    return res.status(500).json({ ok: false, error: "follow_failed" });
  }
}

async function resolveCreatorByHandle(handle: string) {
  const normalized = slugifyHandle(handle);
  const creators = await prisma.creator.findMany({ select: { id: true, name: true } });
  return creators.find((creator) => slugifyHandle(creator.name) === normalized) || null;
}
