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

function resolveFanId(req: NextApiRequest): string | null {
  const raw = req.query.fanId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (resolveViewerRole(req) !== "creator") {
    return res.status(403).json({ error: "Forbidden" });
  }

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
  const fanId = resolveFanId(req);
  if (!fanId) {
    return sendBadRequest(res, "fanId is required");
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const creatorId = await resolveCreatorId();
    const notes = await prisma.fanNote.findMany({
      where: { fanId, creatorId },
      orderBy: { createdAt: "desc" },
    });
    return res.status(200).json({ ok: true, notes });
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

  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) {
    return sendBadRequest(res, "content is required");
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const creatorId = await resolveCreatorId();
    const note = await prisma.fanNote.create({
      data: {
        fanId,
        creatorId,
        content,
      },
    });
    return res.status(201).json({ ok: true, note });
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
    throw new Error("No creator found to attach note");
  }

  return creator.id;
}
