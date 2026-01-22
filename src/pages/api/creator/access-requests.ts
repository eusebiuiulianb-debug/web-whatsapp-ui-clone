import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/prisma";
import { sendBadRequest, sendServerError } from "@/lib/apiError";

type AccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "SPAM";

type AccessRequestItem = {
  id: string;
  fanId: string;
  fanName: string;
  status: AccessRequestStatus;
  message: string;
  productId?: string | null;
  conversationId?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
};

type AccessRequestListResponse =
  | { ok: true; requests: AccessRequestItem[]; count: number }
  | { ok: false; error: string };

const ALLOWED_STATUS = new Set<AccessRequestStatus>(["PENDING", "APPROVED", "REJECTED", "SPAM"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse<AccessRequestListResponse>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");
  const statusParam = typeof req.query.status === "string" ? req.query.status.trim().toUpperCase() : "PENDING";
  const status = (ALLOWED_STATUS.has(statusParam as AccessRequestStatus)
    ? statusParam
    : "PENDING") as AccessRequestStatus;
  const fanId = typeof req.query.fanId === "string" ? req.query.fanId.trim() : "";

  try {
    const creatorId = await resolveCreatorId();
    const where = {
      creatorId,
      status,
      ...(fanId ? { fanId } : {}),
    };
    const [requests, count] = await Promise.all([
      prisma.accessRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fanId: true,
          status: true,
          message: true,
          productId: true,
          conversationId: true,
          createdAt: true,
          resolvedAt: true,
          fan: { select: { displayName: true, name: true } },
        },
      }),
      prisma.accessRequest.count({
        where: { creatorId, status },
      }),
    ]);

    return res.status(200).json({
      ok: true,
      count,
      requests: requests.map((request) => ({
        id: request.id,
        fanId: request.fanId,
        fanName: (request.fan?.displayName || request.fan?.name || "Fan").trim() || "Fan",
        status: request.status,
        message: request.message,
        productId: request.productId,
        conversationId: request.conversationId ?? null,
        createdAt: request.createdAt.toISOString(),
        resolvedAt: request.resolvedAt ? request.resolvedAt.toISOString() : null,
      })),
    });
  } catch (err) {
    console.error("Error loading access requests", err);
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
