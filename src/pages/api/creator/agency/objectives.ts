import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/prisma";
import {
  isBuiltInObjectiveCode,
  normalizeObjectiveCode,
  type ObjectiveLabels,
} from "../../../../lib/agency/objectives";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "../../../../lib/dbSchemaGuard";
import { normalizeLocaleTag } from "../../../../lib/language";

type AgencyObjectiveItem = {
  id: string;
  code: string;
  labels: ObjectiveLabels;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type ObjectiveListResponse = { ok: true; items: AgencyObjectiveItem[] } | { ok: false; error: string };
type ObjectiveCreateResponse = { ok: true; item: AgencyObjectiveItem } | { ok: false; error: string };

type ObjectivesResponse = ObjectiveListResponse | ObjectiveCreateResponse;

export default async function handler(req: NextApiRequest, res: NextApiResponse<ObjectivesResponse>) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse<ObjectiveListResponse>) {
  res.setHeader("Cache-Control", "no-store");
  if (!prisma) {
    return res.status(500).json({ ok: false, error: "PRISMA_NOT_INITIALIZED" });
  }
  const includeInactive = req.query.includeInactive === "1";

  try {
    const creatorId = await resolveCreatorId();
    const objectives = await prisma.agencyObjective.findMany({
      where: includeInactive ? { creatorId } : { creatorId, active: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        labels: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(200).json({
      ok: true,
      items: objectives.map((objective) => serializeObjective(objective)),
    });
  } catch (error) {
    if (isDbSchemaOutOfSyncError(error)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("Error loading agency objectives", error);
    return res.status(500).json({ ok: false, error: "Failed to load objectives" });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse<ObjectiveCreateResponse>) {
  if (!prisma) {
    return res.status(500).json({ ok: false, error: "PRISMA_NOT_INITIALIZED" });
  }
  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const rawCode = typeof body.code === "string" ? body.code : "";
  const { labels, tooLong } = normalizeLabels(body.labels);
  if (tooLong) {
    return res.status(400).json({ ok: false, error: "labels too long" });
  }
  const fallbackLabel = labels ? firstLabel(labels) : "";
  const code = normalizeObjectiveCode(rawCode || fallbackLabel);
  if (!code) {
    return res.status(400).json({ ok: false, error: "code is required" });
  }
  if (code.length > 48) {
    return res.status(400).json({ ok: false, error: "code too long" });
  }
  if (isBuiltInObjectiveCode(code)) {
    return res.status(400).json({ ok: false, error: "objective is built-in" });
  }
  if (!labels || Object.keys(labels).length === 0) {
    return res.status(400).json({ ok: false, error: "labels are required" });
  }

  try {
    const creatorId = await resolveCreatorId();
    const existing = await prisma.agencyObjective.findFirst({
      where: { creatorId, code },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({ ok: false, error: "Objective already exists" });
    }

    const created = await prisma.agencyObjective.create({
      data: {
        creatorId,
        code,
        labels,
        active: true,
      },
    });

    return res.status(201).json({ ok: true, item: serializeObjective(created) });
  } catch (error) {
    if (isDbSchemaOutOfSyncError(error)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("Error creating agency objective", error);
    return res.status(500).json({ ok: false, error: "Failed to create objective" });
  }
}

function normalizeLabels(input: unknown): { labels: ObjectiveLabels | null; tooLong: boolean } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { labels: null, tooLong: false };
  }
  const labels: ObjectiveLabels = {};
  let tooLong = false;
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.length > 80) {
      tooLong = true;
      continue;
    }
    const normalizedKey = normalizeLocaleTag(key);
    if (!normalizedKey) continue;
    labels[normalizedKey] = trimmed;
  }
  return { labels: Object.keys(labels).length > 0 ? labels : null, tooLong };
}

function firstLabel(labels: ObjectiveLabels): string {
  const value = Object.values(labels).find((entry) => typeof entry === "string" && entry.trim());
  return value ? value.trim() : "";
}

function serializeObjective(objective: {
  id: string;
  code: string;
  labels: unknown;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AgencyObjectiveItem {
  const labels =
    objective.labels && typeof objective.labels === "object" && !Array.isArray(objective.labels)
      ? (objective.labels as ObjectiveLabels)
      : ({} as ObjectiveLabels);
  return {
    id: objective.id,
    code: objective.code,
    labels,
    active: objective.active,
    createdAt: objective.createdAt.toISOString(),
    updatedAt: objective.updatedAt.toISOString(),
  };
}

async function resolveCreatorId(): Promise<string> {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;

  const defaultCreator = await prisma.creator.findUnique({
    where: { id: "creator-1" },
    select: { id: true },
  });
  if (defaultCreator?.id) return defaultCreator.id;

  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (!creator) {
    throw new Error("Creator not found");
  }
  return creator.id;
}
