import type { NextApiRequest, NextApiResponse } from "next";
import { CreatorVisibilityMode } from "@prisma/client";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";

const CREATOR_ID = "creator-1";
const VISIBILITY_MODES = new Set<CreatorVisibilityMode>([
  "INVISIBLE",
  "SOLO_LINK",
  "DISCOVERABLE",
  "PUBLIC",
]);

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
      select: { visibilityMode: true },
    });
    return res.status(200).json({ visibilityMode: profile?.visibilityMode ?? "SOLO_LINK" });
  } catch (err) {
    console.error("Error loading creator visibility", err);
    return sendServerError(res, "No se pudo cargar la visibilidad");
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const payload = req.body as Partial<{ visibilityMode?: string }> | undefined;
    const rawMode = typeof payload?.visibilityMode === "string" ? payload.visibilityMode.trim() : "";
    if (!VISIBILITY_MODES.has(rawMode as CreatorVisibilityMode)) {
      return sendBadRequest(res, "visibilityMode inválido");
    }
    const visibilityMode = rawMode as CreatorVisibilityMode;

    const profile = await prisma.creatorProfile.upsert({
      where: { creatorId: CREATOR_ID },
      create: { creatorId: CREATOR_ID, visibilityMode },
      update: { visibilityMode },
      select: { visibilityMode: true },
    });

    return res.status(200).json({ visibilityMode: profile.visibilityMode });
  } catch (err) {
    console.error("Error saving creator visibility", err);
    return sendServerError(res, "No se pudo guardar la visibilidad");
  }
}
