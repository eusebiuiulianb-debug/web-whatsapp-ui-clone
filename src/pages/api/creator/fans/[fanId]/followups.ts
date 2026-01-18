import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../../lib/apiError";

type ViewerRole = "creator" | "fan";

type ParsedDueAt = {
  dueAt: Date | null;
  date: string;
  time: string;
};

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

function resolveFanId(req: NextApiRequest): string | null {
  const raw = req.query.fanId;
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

  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const fanId = resolveFanId(req);
  if (!fanId) {
    return sendBadRequest(res, "fanId is required");
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const creatorId = await resolveCreatorId();
    const fan = await prisma.fan.findFirst({
      where: { id: fanId, creatorId },
      select: { id: true },
    });
    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }

    const followUps = await prisma.fanFollowUp.findMany({
      where: { fanId, creatorId, status: "OPEN" },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
    });
    const mapped = followUps.map(mapFollowUp);
    return res.status(200).json({
      ok: true,
      followUp: mapped[0] ?? null,
      followUps: mapped,
    });
  } catch (err) {
    console.error("Error loading follow-ups", err);
    return sendServerError(res);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const fanId = resolveFanId(req);
  if (!fanId) {
    return sendBadRequest(res, "fanId is required");
  }

  const textRaw = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const titleRaw = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const text = textRaw || titleRaw;
  if (!text) {
    return sendBadRequest(res, "text is required");
  }

  const noteRaw = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  const note = noteRaw.length > 0 ? noteRaw : null;
  const parsedDueAt = parseDueAtInput(req.body || {});

  res.setHeader("Cache-Control", "no-store");

  try {
    const creatorId = await resolveCreatorId();
    const fan = await prisma.fan.findFirst({
      where: { id: fanId, creatorId },
      select: { id: true },
    });
    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }

    const existing = await prisma.fanFollowUp.findFirst({
      where: { fanId, creatorId, status: "OPEN" },
      orderBy: { updatedAt: "desc" },
    });

    const data = {
      title: text,
      note,
      dueAt: parsedDueAt.dueAt,
      status: "OPEN" as const,
      doneAt: null,
    };

    const followUpOp = existing
      ? prisma.fanFollowUp.update({ where: { id: existing.id }, data })
      : prisma.fanFollowUp.create({
          data: {
            fanId,
            creatorId,
            ...data,
          },
        });

    const nextAction = formatNextAction(text, parsedDueAt.date, parsedDueAt.time);
    const fanUpdateOp = prisma.fan.update({
      where: { id: fanId },
      data: {
        nextAction,
        nextActionAt: parsedDueAt.dueAt,
        nextActionNote: note ?? text,
      },
    });

    const [followUp] = await prisma.$transaction([followUpOp, fanUpdateOp]);

    return res.status(200).json({
      ok: true,
      followUp: mapFollowUp(followUp as any),
      nextAction,
      nextActionAt: parsedDueAt.dueAt ? parsedDueAt.dueAt.toISOString() : null,
      nextActionNote: note ?? text,
    });
  } catch (err) {
    console.error("Error saving follow-up", err);
    return sendServerError(res);
  }
}

function parseDueAtInput(payload: Record<string, unknown>): ParsedDueAt {
  const date = typeof payload.date === "string" ? payload.date.trim() : "";
  const time = typeof payload.time === "string" ? payload.time.trim() : "";
  if (date) {
    const iso = time ? `${date}T${time}:00` : `${date}T00:00:00`;
    const parsed = new Date(iso);
    return {
      dueAt: Number.isNaN(parsed.getTime()) ? null : parsed,
      date,
      time,
    };
  }

  const dueAtRaw = typeof payload.dueAt === "string" ? payload.dueAt.trim() : "";
  if (!dueAtRaw) {
    return { dueAt: null, date: "", time: "" };
  }

  const parsed = new Date(dueAtRaw);
  if (Number.isNaN(parsed.getTime())) {
    return { dueAt: null, date: "", time: "" };
  }

  const iso = parsed.toISOString();
  return {
    dueAt: parsed,
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
  };
}

function formatNextAction(text: string, date: string, time: string) {
  if (!text) return null;
  if (date) {
    const suffix = time ? ` ${time}` : "";
    return `${text} (para ${date}${suffix})`;
  }
  return text;
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
