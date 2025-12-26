import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const fanId = typeof req.query.fanId === "string" ? req.query.fanId.trim() : "";
  if (!fanId) {
    return sendBadRequest(res, "fanId is required");
  }

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: { id: true, profileText: true },
    });

    return res.status(200).json({ ok: true, profileText: fan?.profileText ?? null });
  } catch (err) {
    console.error("Error loading fan profile", err);
    return sendServerError(res);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const fanId = typeof req.body?.fanId === "string" ? req.body.fanId.trim() : "";
  if (!fanId) {
    return sendBadRequest(res, "fanId is required");
  }

  const rawProfile = typeof req.body?.profileText === "string" ? req.body.profileText.trim() : "";
  const profileText = rawProfile.length > 0 ? rawProfile : null;

  try {
    const fan = await prisma.fan.update({
      where: { id: fanId },
      data: { profileText },
      select: { id: true, profileText: true },
    });

    return res.status(200).json({ ok: true, profileText: fan.profileText ?? null });
  } catch (err) {
    console.error("Error saving fan profile", err);
    return sendServerError(res);
  }
}
