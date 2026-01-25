import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "../../../../lib/prisma.server";
import { readFanId } from "../../../../lib/fan/session";

type RenameResponse = { id: string; name: string };
type OkResponse = { ok: true };
type ErrorResponse = { error: string };

type HandlerResponse = RenameResponse | OkResponse | ErrorResponse;

export default async function handler(req: NextApiRequest, res: NextApiResponse<HandlerResponse>) {
  res.setHeader("Cache-Control", "no-store");

  const fanId = readFanId(req);
  if (!fanId) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  const collectionId = pickQueryString(req.query.id);
  if (!collectionId) {
    return res.status(400).json({ error: "INVALID_COLLECTION" });
  }

  if (req.method === "PATCH") {
    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: "INVALID_NAME" });
    }

    try {
      const existing = await prisma.savedCollection.findFirst({
        where: { id: collectionId, userId: fanId },
        select: { id: true },
      });
      if (!existing) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }

      const updated = await prisma.savedCollection.update({
        where: { id: existing.id },
        data: { name },
        select: { id: true, name: true },
      });

      return res.status(200).json({ id: updated.id, name: updated.name });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return res.status(409).json({ error: "COLLECTION_EXISTS" });
      }
      console.error("Error renaming saved collection", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  if (req.method === "DELETE") {
    try {
      const existing = await prisma.savedCollection.findFirst({
        where: { id: collectionId, userId: fanId },
        select: { id: true },
      });
      if (!existing) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }

      await prisma.$transaction([
        prisma.savedItem.updateMany({
          where: { userId: fanId, collectionId: existing.id },
          data: { collectionId: null },
        }),
        prisma.savedCollection.delete({ where: { id: existing.id } }),
      ]);

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Error deleting saved collection", err);
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

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 32) return null;
  return trimmed;
}
