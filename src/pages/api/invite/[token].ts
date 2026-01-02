import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!token) {
    return res.status(400).json({ ok: false, error: "token is required" });
  }

  try {
    const fan = await prisma.fan.findFirst({
      where: { inviteToken: token },
      select: {
        id: true,
        handle: true,
        inviteUsedAt: true,
        creator: { select: { name: true } },
      },
    });

    if (!fan) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[invite] token not found", token);
      }
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    if (!fan.inviteUsedAt) {
      await prisma.fan.updateMany({
        where: { id: fan.id, inviteUsedAt: null },
        data: { inviteUsedAt: new Date() },
      });
    }

    const creatorHandle = fan.handle && fan.handle.trim().length > 0 ? fan.handle : slugify(fan.creator?.name || "");

    return res.status(200).json({ ok: true, fanId: fan.id, creatorHandle });
  } catch (error) {
    console.error("Error resolving invite token", error);
    return res.status(500).json({ ok: false, error: "Error resolving invite token" });
  }
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
