import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../../lib/apiError";

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

function resolveFanId(req: NextApiRequest): string | null {
  const raw = req.query.fanId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function mapNote(note: { id: string; fanId: string; creatorId: string; content: string; createdAt: Date }) {
  return {
    id: note.id,
    fanId: note.fanId,
    creatorId: note.creatorId,
    text: note.content,
    createdAt: note.createdAt.toISOString(),
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

    const notes = await prisma.fanNote.findMany({
      where: { fanId, creatorId },
      orderBy: { createdAt: "desc" },
    });
    return res.status(200).json({ ok: true, notes: notes.map(mapNote) });
  } catch (err) {
    console.error("Error loading fan notes", err);
    return sendServerError(res);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const fanId = resolveFanId(req);
  if (!fanId) {
    return sendBadRequest(res, "fanId is required");
  }

  const textRaw = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const contentRaw = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  const text = textRaw || contentRaw;
  if (!text) {
    return sendBadRequest(res, "text is required");
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

    const note = await prisma.fanNote.create({
      data: {
        fanId,
        creatorId,
        content: text,
      },
    });
    return res.status(201).json({ ok: true, note: mapNote(note) });
  } catch (err) {
    console.error("Error creating fan note", err);
    return sendServerError(res);
  }
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
