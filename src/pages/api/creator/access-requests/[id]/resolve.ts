import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/prisma";
import { sendBadRequest, sendServerError } from "@/lib/apiError";

type AccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "SPAM";
type AccessRequestAction = "APPROVE" | "REJECT" | "SPAM";

type ResolveResponse =
  | { ok: true; request: { id: string; status: AccessRequestStatus; resolvedAt: string | null } }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ResolveResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id || !id.trim()) return sendBadRequest(res, "id is required");

  const action = normalizeAction(req.body?.action ?? req.body?.status);
  if (!action) {
    return sendBadRequest(res, "action invalid");
  }
  const grantHoursRaw = Number(req.body?.grantHours);
  const grantHours = Number.isFinite(grantHoursRaw) && grantHoursRaw > 0 ? grantHoursRaw : 72;

  try {
    const creatorId = await resolveCreatorId();
    const request = await prisma.accessRequest.findUnique({
      where: { id },
      select: { id: true, fanId: true, creatorId: true },
    });
    if (!request || request.creatorId !== creatorId) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    const resolvedAt = new Date();
    const nextStatus = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "SPAM";
    const updated = await prisma.$transaction(async (tx) => {
      const nextRequest = await tx.accessRequest.update({
        where: { id },
        data: {
          status: nextStatus,
          resolvedAt,
          resolvedByCreatorId: creatorId,
        },
        select: { id: true, status: true, resolvedAt: true },
      });

      if (action === "APPROVE") {
        const activeGrant = await tx.accessGrant.findFirst({
          where: { fanId: request.fanId, expiresAt: { gt: resolvedAt } },
          select: { id: true },
        });
        if (!activeGrant) {
          const expiresAt = new Date(resolvedAt.getTime() + grantHours * 60 * 60 * 1000);
          await tx.accessGrant.create({
            data: { fanId: request.fanId, type: "trial", expiresAt },
          });
        }
      }

      if (action === "SPAM") {
        await tx.creatorFanBlock.upsert({
          where: { creatorId_fanId: { creatorId, fanId: request.fanId } },
          update: { reason: "access_request_spam" },
          create: { creatorId, fanId: request.fanId, reason: "access_request_spam" },
        });
        await tx.fan.update({
          where: { id: request.fanId },
          data: { isBlocked: true },
        });
      }

      return nextRequest;
    });

    return res.status(200).json({
      ok: true,
      request: {
        id: updated.id,
        status: updated.status,
        resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
      },
    });
  } catch (err) {
    console.error("Error resolving access request", err);
    return sendServerError(res);
  }
}

function normalizeAction(value: unknown): AccessRequestAction | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "APPROVE" || normalized === "APPROVED") return "APPROVE";
  if (normalized === "REJECT" || normalized === "REJECTED") return "REJECT";
  if (normalized === "SPAM" || normalized === "BLOCK" || normalized === "BLOCKED") return "SPAM";
  return null;
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
