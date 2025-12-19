import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../lib/prisma.server";

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
  if (req.method === "GET") return handleGet(res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(res: NextApiResponse) {
  try {
    const campaigns = await prisma.campaignMeta.findMany({
      where: { creatorId: CREATOR_ID },
      orderBy: { updatedAt: "desc" },
    });
    return res.status(200).json({
      campaigns: campaigns.map((campaign) => serializeCampaign(campaign)),
    });
  } catch (error) {
    console.error("Error fetching campaigns", error);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const title = normalizeInput(req.body?.title, 120);
  const objective = normalizeInput(req.body?.objective, 160);
  const utmCampaign = normalizeCampaign(req.body?.utmCampaign);
  const platform = normalizePlatform(req.body?.platform);
  const status = normalizeStatus(req.body?.status);
  const notes = normalizeOptional(req.body?.notes, 1200);

  if (!title || !objective || !utmCampaign || !platform || !status) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const campaign = await prisma.campaignMeta.create({
      data: {
        creatorId: CREATOR_ID,
        title,
        objective,
        utmCampaign,
        platform,
        status,
        notes,
      },
    });
    return res.status(200).json({ campaign: serializeCampaign(campaign) });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      return res.status(409).json({ error: "utm_campaign_exists" });
    }
    console.error("Error creating campaign", error);
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
