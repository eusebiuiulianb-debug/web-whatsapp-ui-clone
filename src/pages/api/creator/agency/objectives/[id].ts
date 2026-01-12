import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/prisma";
import { isBuiltInObjectiveCode, normalizeObjectiveCode } from "@/lib/agency/objectives";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "@/lib/dbSchemaGuard";

type ObjectiveDeleteResponse = { ok: true } | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ObjectiveDeleteResponse>) {
  if (req.method === "DELETE") {
    return handleDelete(req, res);
  }
  res.setHeader("Allow", "DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse<ObjectiveDeleteResponse>) {
  if (!prisma) {
    return res.status(500).json({ ok: false, error: "PRISMA_NOT_INITIALIZED" });
  }
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) {
    return res.status(400).json({ ok: false, error: "Missing objective id" });
  }

  try {
    const creatorId = await resolveCreatorId();
    const objective = await prisma.agencyObjective.findFirst({
      where: { id, creatorId },
      select: { id: true, code: true },
    });
    if (!objective) {
      return res.status(404).json({ ok: false, error: "Objective not found" });
    }
    const normalizedCode = normalizeObjectiveCode(objective.code) ?? objective.code;
    if (isBuiltInObjectiveCode(normalizedCode)) {
      return res.status(400).json({ ok: false, error: "objective is built-in" });
    }
    await prisma.agencyObjective.delete({ where: { id: objective.id } });
    return res.status(200).json({ ok: true });
  } catch (error) {
    if (isDbSchemaOutOfSyncError(error)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("Error deleting agency objective", error);
    return res.status(500).json({ ok: false, error: "Failed to delete objective" });
  }
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
