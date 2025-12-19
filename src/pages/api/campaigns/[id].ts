import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";

const CREATOR_ID = process.env.CREATOR_ID ?? "creator-1";
const STATUS_VALUES = new Set(["draft", "active", "paused", "ended"]);
const PLATFORM_ALIASES: Record<string, string> = {
  ig: "instagram",
  insta: "instagram",
  instagram: "instagram",
  tiktok: "tiktok",
  youtube: "youtube",
  yt: "youtube",
  x: "x",
  other: "other",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "PATCH") return handlePatch(req, res);
  if (req.method === "DELETE") return handleDelete(req, res);
  res.setHeader("Allow", "PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return res.status(400).json({ error: "id required" });
  }

  const updates: {
    title?: string;
    objective?: string;
    utmCampaign?: string;
    platform?: string;
    status?: string;
    notes?: string | null;
  } = {};

  if (req.body?.title !== undefined) {
    const title = normalizeInput(req.body.title, 120);
    if (!title) return res.status(400).json({ error: "invalid_title" });
    updates.title = title;
  }

  if (req.body?.objective !== undefined) {
    const objective = normalizeInput(req.body.objective, 160);
    if (!objective) return res.status(400).json({ error: "invalid_objective" });
    updates.objective = objective;
  }

  if (req.body?.utmCampaign !== undefined) {
    const utmCampaign = normalizeCampaign(req.body.utmCampaign);
    if (!utmCampaign) return res.status(400).json({ error: "invalid_utm_campaign" });
    updates.utmCampaign = utmCampaign;
  }

  if (req.body?.platform !== undefined) {
    const platform = normalizePlatform(req.body.platform);
    if (!platform) return res.status(400).json({ error: "invalid_platform" });
    updates.platform = platform;
  }

  if (req.body?.status !== undefined) {
    const status = normalizeStatus(req.body.status);
    if (!status) return res.status(400).json({ error: "invalid_status" });
    updates.status = status;
  }

  if (req.body?.notes !== undefined) {
    updates.notes = normalizeOptional(req.body.notes, 1200);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "no_updates" });
  }

  try {
    const existing = await prisma.campaignMeta.findFirst({
      where: { id, creatorId: CREATOR_ID },
    });
    if (!existing) {
      return res.status(404).json({ error: "not_found" });
    }
    const campaign = await prisma.campaignMeta.update({
      where: { id: existing.id },
      data: updates,
    });
    return res.status(200).json({ campaign: serializeCampaign(campaign) });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      return res.status(409).json({ error: "utm_campaign_exists" });
    }
    console.error("Error updating campaign", error);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return res.status(400).json({ error: "id required" });
  }

  try {
    const result = await prisma.campaignMeta.deleteMany({
      where: { id, creatorId: CREATOR_ID },
    });
    if (result.count === 0) {
      return res.status(404).json({ error: "not_found" });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error deleting campaign", error);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

function normalizeInput(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, maxLen);
}

function normalizeOptional(value: unknown, maxLen: number): string | null {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function normalizeCampaign(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

function normalizePlatform(value: unknown): string {
  if (typeof value !== "string") return "";
  const key = value.trim().toLowerCase();
  return PLATFORM_ALIASES[key] || "";
}

function normalizeStatus(value: unknown): string {
  if (typeof value !== "string") return "";
  const key = value.trim().toLowerCase();
  return STATUS_VALUES.has(key) ? key : "";
}

function serializeCampaign(campaign: {
  id: string;
  creatorId: string;
  utmCampaign: string;
  title: string;
  objective: string;
  platform: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: campaign.id,
    creatorId: campaign.creatorId,
    utmCampaign: campaign.utmCampaign,
    title: campaign.title,
    objective: campaign.objective,
    platform: campaign.platform,
    status: campaign.status,
    notes: campaign.notes ?? null,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}
