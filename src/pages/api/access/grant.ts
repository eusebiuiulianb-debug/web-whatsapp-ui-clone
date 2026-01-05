import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { isGrantType, upsertAccessGrant } from "../../../lib/accessGrants";
import { PACKS } from "../../../config/packs";

async function getActiveGrantsForFan(fanId: string) {
  const now = new Date();
  return prisma.accessGrant.findMany({
    where: { fanId, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
}

function formatGrantPreview(type: string) {
  const normalized = type.trim().toLowerCase();
  if (normalized === "monthly") return `💶 ${PACKS.monthly.name} · ${PACKS.monthly.price}€`;
  if (normalized === "special") return `💶 ${PACKS.special.name} · ${PACKS.special.price}€`;
  if (normalized === "trial") return `💶 ${PACKS.trial.name} · ${PACKS.trial.price}€`;
  return "💶 Suscripción";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { fanId, type } = req.body || {};

  if (!fanId || typeof fanId !== "string") {
    return sendBadRequest(res, "fanId is required");
  }

  if (!isGrantType(type)) {
    return sendBadRequest(res, "Invalid type");
  }

  try {
    // Policy: keep a single active grant per fan and type.
    const grant = await upsertAccessGrant({
      fanId,
      type,
      prismaClient: prisma,
      extendIfActive: false,
    });

    const activeGrants = await getActiveGrantsForFan(fanId);
    const now = new Date();
    const time = now.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    await prisma.fan.update({
      where: { id: fanId },
      data: {
        lastActivityAt: now,
        lastPurchaseAt: now,
        preview: formatGrantPreview(type),
        time,
      },
    });

    return res.status(200).json({ ok: true, grant, activeGrants });
  } catch (err) {
    console.error("Error creating access grant", err);
    return sendServerError(res);
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { fanId } = req.query;

  if (!fanId || typeof fanId !== "string") {
    return sendBadRequest(res, "fanId is required");
  }

  try {
    const activeGrants = await getActiveGrantsForFan(fanId);

    return res.status(200).json({ ok: true, activeGrants });
  } catch (err) {
    console.error("Error fetching access grants", err);
    return sendServerError(res);
  }
}
