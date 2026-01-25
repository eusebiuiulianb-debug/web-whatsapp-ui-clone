import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma.server";
import { readFanId } from "../../../lib/fan/session";

type CollectionSummary = {
  id: string;
  name: string;
  count: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");

  const fanId = readFanId(req);
  if (!fanId) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  if (req.method === "GET") {
    try {
      const collections = await prisma.savedCollection.findMany({
        where: { userId: fanId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true },
      });
      if (collections.length === 0) {
        return res.status(200).json({ items: [] as CollectionSummary[] });
      }

      const ids = collections.map((collection) => collection.id);
      const counts = await prisma.savedItem.groupBy({
        by: ["collectionId"],
        where: { userId: fanId, collectionId: { in: ids } },
        _count: { _all: true },
      });
      const countMap = new Map(
        counts
          .filter((entry) => typeof entry.collectionId === "string")
          .map((entry) => [entry.collectionId as string, entry._count._all])
      );

      const items: CollectionSummary[] = collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        count: countMap.get(collection.id) ?? 0,
      }));
      return res.status(200).json({ items });
    } catch (err) {
      console.error("Error loading saved collections", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  if (req.method === "POST") {
    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: "INVALID_NAME" });
    }

    try {
      const created = await prisma.savedCollection.create({
        data: { userId: fanId, name },
        select: { id: true, name: true },
      });
      return res.status(201).json({ id: created.id, name: created.name, count: 0 });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return res.status(409).json({ error: "COLLECTION_EXISTS" });
      }
      console.error("Error creating saved collection", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: "Method not allowed" });
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 40) return null;
  return trimmed;
}
