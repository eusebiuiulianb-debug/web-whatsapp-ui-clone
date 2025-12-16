import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";

const GRANT_AMOUNT: Record<string, number> = {
  trial: 0,
  monthly: 25,
  special: 49,
};

function mapStatus(expiresAt: Date) {
  return expiresAt > new Date() ? "active" : "expired";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendBadRequest(res, "Method not allowed");
  }

  const { fanId } = req.query;
  if (!fanId || typeof fanId !== "string") {
    return sendBadRequest(res, "fanId is required");
  }

  try {
    const grants = await prisma.accessGrant.findMany({
      where: { fanId },
      orderBy: { createdAt: "desc" },
    });

    const history = grants.map((grant) => ({
      id: grant.id,
      type: grant.type,
      createdAt: grant.createdAt,
      expiresAt: grant.expiresAt,
      status: mapStatus(grant.expiresAt),
      amount: GRANT_AMOUNT[grant.type] ?? 0,
    }));

    return res.status(200).json({ ok: true, history });
  } catch (error) {
    console.error("Error fetching access history", error);
    return sendServerError(res);
  }
}
