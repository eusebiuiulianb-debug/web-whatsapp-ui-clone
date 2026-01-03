import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";

function parseDateInput(value?: unknown): Date | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatNextAction(note?: string | null, dueAt?: Date | null): string | null {
  const normalizedNote = typeof note === "string" ? note.trim() : "";
  if (!normalizedNote && !dueAt) return null;
  const safeNote = normalizedNote || "Seguimiento";
  if (!dueAt) return safeNote;
  const iso = dueAt.toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  const suffix = time ? ` ${time}` : "";
  return `${safeNote} (para ${date}${suffix})`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendBadRequest(res, "Method not allowed");
  }

  const { fanId, nextAction, nextActionAt, nextActionNote, note } = req.body || {};

  if (!fanId || typeof fanId !== "string") {
    return sendBadRequest(res, "fanId is required");
  }

  const normalizedNote =
    typeof nextActionNote === "string"
      ? nextActionNote.trim()
      : typeof note === "string"
      ? note.trim()
      : "";
  const normalizedNextActionNote = normalizedNote.length > 0 ? normalizedNote : null;
  const normalizedNextActionAt = parseDateInput(nextActionAt);
  const rawNextAction =
    typeof nextAction === "string" && nextAction.trim().length > 0 ? nextAction.trim() : null;
  const normalizedNextAction =
    normalizedNextActionNote || normalizedNextActionAt
      ? formatNextAction(normalizedNextActionNote, normalizedNextActionAt)
      : rawNextAction;

  try {
    const fan = await prisma.fan.update({
      where: { id: fanId },
      data: {
        nextAction: normalizedNextAction,
        nextActionAt: normalizedNextActionAt,
        nextActionNote: normalizedNextActionNote,
      },
      select: { id: true, nextAction: true, nextActionAt: true, nextActionNote: true },
    });

    return res.status(200).json({
      ok: true,
      fan: {
        ...fan,
        nextActionAt: fan.nextActionAt ? fan.nextActionAt.toISOString() : null,
      },
    });
  } catch (err) {
    console.error("Error updating next action", err);
    return sendServerError(res);
  }
}
