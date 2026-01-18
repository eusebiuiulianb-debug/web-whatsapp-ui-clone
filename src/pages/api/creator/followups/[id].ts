import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";

type ViewerRole = "creator" | "fan";

function resolveViewerRole(req: NextApiRequest): ViewerRole {
  const headerRaw = req.headers["x-novsy-viewer"];
  const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (typeof header === "string") {
    const normalized = header.trim().toLowerCase();
    if (normalized === "fan") return "fan";
    if (normalized === "creator") return "creator";
  }

  const viewerParamRaw = req.query.viewer;
  const viewerParam = Array.isArray(viewerParamRaw) ? viewerParamRaw[0] : viewerParamRaw;
  if (typeof viewerParam === "string") {
    const normalized = viewerParam.trim().toLowerCase();
    if (normalized === "fan") return "fan";
    if (normalized === "creator") return "creator";
  }

  return "creator";
}

function resolveFollowUpId(req: NextApiRequest): string | null {
  const raw = req.query.id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function mapFollowUp(followUp: {
  id: string;
  fanId: string;
  creatorId: string;
  title: string;
  note: string | null;
  dueAt: Date | null;
  status: "OPEN" | "DONE" | "DELETED";
  createdAt: Date;
  updatedAt: Date;
  doneAt: Date | null;
}) {
  const status = followUp.status === "OPEN" ? "PENDING" : "DONE";
  return {
    id: followUp.id,
    fanId: followUp.fanId,
    creatorId: followUp.creatorId,
    text: followUp.title,
    note: followUp.note ?? null,
    dueAt: followUp.dueAt ? followUp.dueAt.toISOString() : null,
    status,
    createdAt: followUp.createdAt.toISOString(),
    updatedAt: followUp.updatedAt.toISOString(),
    doneAt: followUp.doneAt ? followUp.doneAt.toISOString() : null,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (resolveViewerRole(req) !== "creator") {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const followUpId = resolveFollowUpId(req);
  if (!followUpId) {
    return sendBadRequest(res, "id is required");
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const creatorId = await resolveCreatorId();
    const followUp = await prisma.fanFollowUp.findFirst({
      where: { id: followUpId, creatorId },
      select: {
        id: true,
        fanId: true,
        creatorId: true,
        title: true,
        note: true,
        dueAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        doneAt: true,
      },
    });
    if (!followUp) {
      return res.status(404).json({ ok: false, error: "Follow-up not found" });
    }

    const actionRaw = typeof req.body?.action === "string" ? req.body.action.trim().toLowerCase() : "";
    if (!actionRaw) {
      return sendBadRequest(res, "action is required");
    }

    if (actionRaw === "done") {
      const [updated] = await prisma.$transaction([
        prisma.fanFollowUp.update({
          where: { id: followUp.id },
          data: { status: "DONE", doneAt: new Date() },
        }),
        prisma.fan.update({
          where: { id: followUp.fanId },
          data: { nextAction: null, nextActionAt: null, nextActionNote: null },
        }),
      ]);
      return res.status(200).json({ ok: true, followUp: mapFollowUp(updated as any) });
    }

    if (actionRaw === "delete") {
      const [updated] = await prisma.$transaction([
        prisma.fanFollowUp.update({
          where: { id: followUp.id },
          data: { status: "DELETED", doneAt: null },
        }),
        prisma.fan.update({
          where: { id: followUp.fanId },
          data: { nextAction: null, nextActionAt: null, nextActionNote: null },
        }),
      ]);
      return res.status(200).json({ ok: true, followUp: mapFollowUp(updated as any) });
    }

    if (actionRaw === "snooze") {
      const daysRaw = req.body?.days;
      const days = typeof daysRaw === "number" ? daysRaw : Number.parseInt(String(daysRaw), 10);
      if (!Number.isFinite(days) || days <= 0) {
        return sendBadRequest(res, "days must be a positive number");
      }
      const base = followUp.dueAt ?? new Date();
      const next = new Date(base);
      next.setDate(next.getDate() + days);
      const nextAction = formatNextAction(followUp.title, next);
      const [updated] = await prisma.$transaction([
        prisma.fanFollowUp.update({
          where: { id: followUp.id },
          data: { dueAt: next, status: "OPEN", doneAt: null },
        }),
        prisma.fan.update({
          where: { id: followUp.fanId },
          data: {
            nextAction,
            nextActionAt: next,
            nextActionNote: followUp.note ?? followUp.title,
          },
        }),
      ]);
      return res.status(200).json({ ok: true, followUp: mapFollowUp(updated as any) });
    }

    return sendBadRequest(res, "invalid action");
  } catch (err) {
    console.error("Error updating follow-up", err);
    return sendServerError(res);
  }
}

function formatNextAction(text: string, dueAt: Date | null) {
  if (!text) return null;
  if (!dueAt) return text;
  const iso = dueAt.toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  const suffix = time ? ` ${time}` : "";
  return `${text} (para ${date}${suffix})`;
}

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;

  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (!creator) {
    throw new Error("No creator found");
  }

  return creator.id;
}
