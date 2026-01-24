import type { NextApiRequest, NextApiResponse } from "next";
import type { SavedItemType } from "@prisma/client";
import prisma from "../../../lib/prisma.server";
import { readFanId } from "../../../lib/fan/session";

type ToggleResponse =
  | { saved: true; savedItemId: string; collectionId: string | null }
  | { saved: false };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ToggleResponse | { error: string }>) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fanId = readFanId(req);
  if (!fanId) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  const type = normalizeSavedType(req.body?.type);
  const entityId = normalizeEntityId(req.body?.entityId);
  if (!type || !entityId) {
    return res.status(400).json({ error: "INVALID_PAYLOAD" });
  }

  try {
    if (type === "POPCLIP") {
      const clip = await prisma.popClip.findUnique({
        where: { id: entityId },
        select: { id: true, savesCount: true },
      });
      if (!clip) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }

      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.savedItem.findUnique({
          where: { userId_type_entityId: { userId: fanId, type, entityId } },
          select: { id: true, collectionId: true },
        });
        if (existing) {
          await tx.savedItem.delete({ where: { id: existing.id } });
          const existingSave = await tx.popClipSave.findUnique({
            where: { popClipId_fanId: { popClipId: entityId, fanId } },
            select: { id: true },
          });
          if (existingSave) {
            await tx.popClipSave.delete({ where: { id: existingSave.id } });
            const updated = await tx.popClip.update({
              where: { id: entityId },
              data: { savesCount: { decrement: 1 } },
              select: { savesCount: true },
            });
            const safeCount = Math.max(0, updated.savesCount ?? 0);
            if (safeCount !== updated.savesCount) {
              await tx.popClip.update({
                where: { id: entityId },
                data: { savesCount: safeCount },
              });
            }
          }
          return { saved: false } as const;
        }

        const created = await tx.savedItem.create({
          data: { userId: fanId, type, entityId },
          select: { id: true, collectionId: true },
        });
        const existingSave = await tx.popClipSave.findUnique({
          where: { popClipId_fanId: { popClipId: entityId, fanId } },
          select: { id: true },
        });
        if (!existingSave) {
          await tx.popClipSave.create({ data: { popClipId: entityId, fanId } });
          await tx.popClip.update({
            where: { id: entityId },
            data: { savesCount: { increment: 1 } },
            select: { savesCount: true },
          });
        }
        return { saved: true, savedItemId: created.id, collectionId: created.collectionId ?? null } as const;
      });

      return res.status(200).json(result);
    }

    if (type === "PACK") {
      const pack = await prisma.catalogItem.findFirst({
        where: { id: entityId, isActive: true, isPublic: true },
        select: { id: true },
      });
      if (!pack) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }
    }

    if (type === "CREATOR") {
      const creator = await prisma.creator.findUnique({
        where: { id: entityId },
        select: { id: true },
      });
      if (!creator) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }
    }

    const existing = await prisma.savedItem.findUnique({
      where: { userId_type_entityId: { userId: fanId, type, entityId } },
      select: { id: true, collectionId: true },
    });
    if (existing) {
      await prisma.savedItem.delete({ where: { id: existing.id } });
      return res.status(200).json({ saved: false });
    }

    const created = await prisma.savedItem.create({
      data: { userId: fanId, type, entityId },
      select: { id: true, collectionId: true },
    });
    return res.status(200).json({ saved: true, savedItemId: created.id, collectionId: created.collectionId ?? null });
  } catch (err) {
    console.error("Error toggling saved item", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

function normalizeEntityId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeSavedType(value: unknown): SavedItemType | null {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase();
  if (normalized === "POPCLIP" || normalized === "PACK" || normalized === "CREATOR") {
    return normalized as SavedItemType;
  }
  return null;
}
