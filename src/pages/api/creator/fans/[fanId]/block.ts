import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/prisma";
import { sendBadRequest, sendServerError } from "@/lib/apiError";

type BlockResponse = { ok: true; blocked: boolean } | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<BlockResponse>) {
  const raw = req.query.fanId;
  const fanId = Array.isArray(raw) ? raw[0] : raw;
  if (!fanId || !fanId.trim()) return sendBadRequest(res, "fanId is required");

  if (req.method === "POST") {
    return handleBlock(fanId.trim(), req, res);
  }

  if (req.method === "DELETE") {
    return handleUnblock(fanId.trim(), res);
  }

  res.setHeader("Allow", ["POST", "DELETE"]);
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handleBlock(fanId: string, req: NextApiRequest, res: NextApiResponse<BlockResponse>) {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 240) : null;

  try {
    const creatorId = await resolveCreatorId();
    const fan = await prisma.fan.findFirst({
      where: { id: fanId, creatorId },
      select: { id: true },
    });
    if (!fan) return res.status(404).json({ ok: false, error: "Fan not found" });

    await prisma.creatorFanBlock.upsert({
      where: { creatorId_fanId: { creatorId, fanId } },
      update: { reason: reason || null },
      create: { creatorId, fanId, reason: reason || null },
    });
    await prisma.fan.update({
      where: { id: fanId },
      data: { isBlocked: true },
    });

    return res.status(200).json({ ok: true, blocked: true });
  } catch (err) {
    console.error("Error blocking fan", err);
    return sendServerError(res);
  }
}

async function handleUnblock(fanId: string, res: NextApiResponse<BlockResponse>) {
  try {
    const creatorId = await resolveCreatorId();
    const fan = await prisma.fan.findFirst({
      where: { id: fanId, creatorId },
      select: { id: true },
    });
    if (!fan) return res.status(404).json({ ok: false, error: "Fan not found" });

    await prisma.creatorFanBlock.deleteMany({
      where: { creatorId, fanId },
    });
    await prisma.fan.update({
      where: { id: fanId },
      data: { isBlocked: false },
    });

    return res.status(200).json({ ok: true, blocked: false });
  } catch (err) {
    console.error("Error unblocking fan", err);
    return sendServerError(res);
  }
}

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;
  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (!creator?.id) throw new Error("creator_not_found");
  return creator.id;
}
