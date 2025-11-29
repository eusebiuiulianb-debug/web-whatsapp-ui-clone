import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma";

const DURATION_BY_TYPE = {
  trial: 7,
  monthly: 30,
  special: 30,
} as const;

type GrantType = keyof typeof DURATION_BY_TYPE;

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
    return res.status(400).json({ error: "fanId is required" });
  }

  if (!type || typeof type !== "string" || !(type in DURATION_BY_TYPE)) {
    return res.status(400).json({ error: "Invalid type" });
  }

  const durationDays = DURATION_BY_TYPE[type as GrantType];
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  try {
    await prisma.accessGrant.deleteMany({ where: { fanId } });

    const grant = await prisma.accessGrant.create({
      data: { fanId, type, expiresAt },
    });

    return res.status(200).json({ ok: true, grant });
  } catch (err) {
    console.error("Error creating access grant", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { fanId } = req.query;

  if (!fanId || typeof fanId !== "string") {
    return res.status(400).json({ error: "fanId is required" });
  }

  try {
    const grants = await prisma.accessGrant.findMany({
      where: { fanId },
      orderBy: { createdAt: "desc" },
    });

    const mapped = grants.map((grant) => ({
      id: grant.id,
      fanId: grant.fanId,
      type: grant.type,
      createdAt: grant.createdAt,
      expiresAt: grant.expiresAt,
    }));

    return res.status(200).json({ grants: mapped });
  } catch (err) {
    console.error("Error fetching access grants", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
