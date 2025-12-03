import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";

const DURATION_BY_TYPE = {
  trial: 7,
  monthly: 30,
  special: 30,
} as const;

type GrantType = keyof typeof DURATION_BY_TYPE;

function isValidGrantType(type: unknown): type is GrantType {
  return typeof type === "string" && type in DURATION_BY_TYPE;
}

function getExpiresAtForGrantType(type: GrantType) {
  const durationDays = DURATION_BY_TYPE[type];
  return new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
}

async function getActiveGrantsForFan(fanId: string) {
  const now = new Date();
  return prisma.accessGrant.findMany({
    where: { fanId, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
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

  if (!isValidGrantType(type)) {
    return sendBadRequest(res, "Invalid type");
  }

  try {
    // Policy: keep a single active grant per fan and type.
    await prisma.accessGrant.deleteMany({ where: { fanId, type } });

    const expiresAt = getExpiresAtForGrantType(type);
    const grant = await prisma.accessGrant.create({
      data: { fanId, type, expiresAt },
    });

    const activeGrants = await getActiveGrantsForFan(fanId);

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
