import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { readFanId } from "../../../../lib/fan/session";

type PatchResponse = { ok: true; collectionId: string | null };
type OkResponse = { ok: true };
type ErrorResponse = { error: string };

type HandlerResponse = PatchResponse | OkResponse | ErrorResponse;

export default async function handler(req: NextApiRequest, res: NextApiResponse<HandlerResponse>) {
  res.setHeader("Cache-Control", "no-store");

  const fanId = readFanId(req);
  if (!fanId) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  const savedItemId = pickQueryString(req.query.id);
  if (!savedItemId) {
    return res.status(400).json({ error: "INVALID_ITEM" });
  }

  if (req.method === "PATCH") {
    const collectionId = normalizeOptionalId(req.body?.collectionId);
    if (collectionId === undefined) {
      return res.status(400).json({ error: "INVALID_PAYLOAD" });
    }

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
      console.error("Error updating saved item", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  if (req.method === "DELETE") {
    try {
      const result = await prisma.savedItem.deleteMany({
        where: { id: savedItemId, userId: fanId },
      });
      if (result.count === 0) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Error deleting saved item", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  res.setHeader("Allow", ["PATCH", "DELETE"]);
  return res.status(405).json({ error: "Method not allowed" });
}

function pickQueryString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value[0]?.trim?.() ?? "";
  return "";
}

function normalizeOptionalId(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "undefined") return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
