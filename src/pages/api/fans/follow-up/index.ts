import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";

type ParsedDueAt = {
  dueAt: Date | null;
  date: string;
  time: string;
};

type FollowUpPayload = {
  id: string;
  title: string;
  note: string | null;
  dueAt: string | null;
  status: "OPEN" | "DONE" | "DELETED";
  createdAt: string | null;
  updatedAt: string | null;
  doneAt: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const fanId = typeof req.query.fanId === "string" ? req.query.fanId.trim() : "";
  if (!fanId) {
    return sendBadRequest(res, "fanId is required");
  }

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: { id: true, creatorId: true },
    });
    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }

    const followUp = await prisma.fanFollowUp.findFirst({
      where: { fanId, creatorId: fan.creatorId, status: "OPEN" },
      orderBy: { updatedAt: "desc" },
    });

    return res.status(200).json({ ok: true, followUp: mapFollowUp(followUp) });
  } catch (err) {
    console.error("Error loading fan follow-up", err);
    return sendServerError(res);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const fanId = typeof req.body?.fanId === "string" ? req.body.fanId.trim() : "";
  if (!fanId) {
    return sendBadRequest(res, "fanId is required");
  }

  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) {
    return sendBadRequest(res, "title is required");
  }

  const noteRaw = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  const note = noteRaw.length > 0 ? noteRaw : null;
  const parsedDueAt = parseDueAtInput(req.body || {});

  try {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      select: { id: true, creatorId: true },
    });
    if (!fan) {
      return res.status(404).json({ ok: false, error: "Fan not found" });
    }

    const existing = await prisma.fanFollowUp.findFirst({
      where: { fanId, creatorId: fan.creatorId, status: "OPEN" },
      orderBy: { updatedAt: "desc" },
    });

    const data = {
      title,
      note,
      dueAt: parsedDueAt.dueAt,
      status: "OPEN" as const,
      doneAt: null,
    };

    const followUp = existing
      ? await prisma.fanFollowUp.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.fanFollowUp.create({
          data: {
            fanId,
            creatorId: fan.creatorId,
            ...data,
          },
        });

    const nextAction = formatNextAction(title, parsedDueAt.date, parsedDueAt.time);
    await prisma.fan.update({
      where: { id: fanId },
      data: { nextAction },
    });

    return res.status(200).json({ ok: true, followUp: mapFollowUp(followUp), nextAction });
  } catch (err) {
    console.error("Error saving fan follow-up", err);
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

function formatNextAction(title: string, date: string, time: string) {
  if (!title) return null;
  if (date) {
    const suffix = time ? ` ${time}` : "";
    return `${title} (para ${date}${suffix})`;
  }
  return title;
}

function mapFollowUp(
  followUp: {
    id: string;
    title: string;
    note: string | null;
    dueAt: Date | null;
    status: "OPEN" | "DONE" | "DELETED";
    createdAt: Date;
    updatedAt: Date;
    doneAt: Date | null;
  } | null
): FollowUpPayload | null {
  if (!followUp) return null;
  return {
    id: followUp.id,
    title: followUp.title,
    note: followUp.note ?? null,
    dueAt: followUp.dueAt ? followUp.dueAt.toISOString() : null,
    status: followUp.status,
    createdAt: followUp.createdAt ? followUp.createdAt.toISOString() : null,
    updatedAt: followUp.updatedAt ? followUp.updatedAt.toISOString() : null,
    doneAt: followUp.doneAt ? followUp.doneAt.toISOString() : null,
  };
}
