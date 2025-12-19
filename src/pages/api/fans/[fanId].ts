import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const fanId = typeof req.query.fanId === "string" ? req.query.fanId.trim() : "";
  if (!fanId) {
    return res.status(400).json({ ok: false, error: "fanId is required" });
  }

  const creatorLabel = normalizeName(req.body?.creatorLabel);
  const displayName = normalizeName(req.body?.displayName);

  const updates: { creatorLabel?: string | null; displayName?: string | null } = {};
  if (req.body?.creatorLabel !== undefined) updates.creatorLabel = creatorLabel;
  if (req.body?.displayName !== undefined) updates.displayName = displayName;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ ok: false, error: "No fields to update" });
  }

  try {
    const fan = await prisma.fan.update({
      where: { id: fanId },
      data: updates,
      select: { id: true, name: true, displayName: true, creatorLabel: true },
    });
    return res.status(200).json({ ok: true, fan });
  } catch (error) {
    console.error("Error updating fan", error);
    return res.status(500).json({ ok: false, error: "Error updating fan" });
  }
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 80);
}
