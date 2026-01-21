import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { normalizeImageSrc } from "../../../../utils/normalizeImageSrc";

const CREATOR_ID = "creator-1";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") return handleGet(res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(res: NextApiResponse) {
  try {
    const profile = await prisma.creatorProfile.findUnique({
      where: { creatorId: CREATOR_ID },
      select: { coverUrl: true },
    });
    return res.status(200).json({ coverUrl: profile?.coverUrl ?? null });
  } catch (err) {
    console.error("Error loading creator profile", err);
    return sendServerError(res, "No se pudo cargar el perfil");
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const payload = req.body as Partial<{ coverUrl?: string | null }> | undefined;
    if (!payload) return sendBadRequest(res, "payload required");
    const raw = typeof payload.coverUrl === "string" ? payload.coverUrl.trim() : "";
    const normalized = raw ? normalizeImageSrc(raw) : null;

    const profile = await prisma.creatorProfile.upsert({
      where: { creatorId: CREATOR_ID },
      create: { creatorId: CREATOR_ID, coverUrl: normalized },
      update: { coverUrl: normalized },
      select: { coverUrl: true },
    });

    return res.status(200).json({ coverUrl: profile.coverUrl ?? null });
  } catch (err) {
    console.error("Error saving creator profile", err);
    return sendServerError(res, "No se pudo guardar el perfil");
  }
}
