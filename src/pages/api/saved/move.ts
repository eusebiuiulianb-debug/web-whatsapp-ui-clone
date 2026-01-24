import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { readFanId } from "../../../lib/fan/session";

type MoveResponse = { ok: true; collectionId: string | null };

export default async function handler(req: NextApiRequest, res: NextApiResponse<MoveResponse | { error: string }>) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fanId = readFanId(req);
  if (!fanId) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  const savedItemId = normalizeId(req.body?.savedItemId);
  if (!savedItemId) {
    return res.status(400).json({ error: "INVALID_PAYLOAD" });
  }
  const collectionId = normalizeOptionalId(req.body?.collectionId);

  try {
    const savedItem = await prisma.savedItem.findFirst({
      where: { id: savedItemId, userId: fanId },
      select: { id: true },
    });
    if (!savedItem) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    if (collectionId) {
      const collection = await prisma.savedCollection.findFirst({
        where: { id: collectionId, userId: fanId },
        select: { id: true },
      });
      if (!collection) {
        return res.status(404).json({ error: "COLLECTION_NOT_FOUND" });
      }
    }

    const updated = await prisma.savedItem.update({
      where: { id: savedItemId },
      data: { collectionId },
      select: { collectionId: true },
    });

    return res.status(200).json({ ok: true, collectionId: updated.collectionId ?? null });
  } catch (err) {
    console.error("Error moving saved item", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalId(value: unknown): string | null {
  if (value === null) return null;
  return normalizeId(value);
}
