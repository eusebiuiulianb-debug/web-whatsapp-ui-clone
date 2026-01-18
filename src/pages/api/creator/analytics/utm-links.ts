import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";

const CREATOR_ID = process.env.CREATOR_ID ?? "creator-1";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const PLATFORM_VALUES = ["TIKTOK", "INSTAGRAM", "YOUTUBE", "X"] as const;

type UtmLinkPlatform = (typeof PLATFORM_VALUES)[number];

type UtmLinkEntry = {
  id: string;
  platform: UtmLinkPlatform;
  campaign: string;
  content: string | null;
  term: string | null;
  source: string | null;
  medium: string;
  fullUrl: string;
  createdAt: string;
};

type UtmLinkResponse = UtmLinkEntry[] | { fullUrl: string } | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<UtmLinkResponse>) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse<UtmLinkResponse>) {
  const limit = normalizeLimit(req.query.limit);
  try {
    const links = await prisma.uTMLink.findMany({
      where: { creatorId: CREATOR_ID },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const payload: UtmLinkEntry[] = links.map((link) => ({
      id: link.id,
      platform: link.platform as UtmLinkPlatform,
      campaign: link.campaign,
      content: link.content ?? null,
      term: link.term ?? null,
      source: link.source ?? null,
      medium: link.medium,
      fullUrl: link.fullUrl,
      createdAt: link.createdAt.toISOString(),
    }));
    return res.status(200).json(payload);
  } catch (err) {
    console.error("Error fetching utm links", err);
    return sendServerError(res, "No se pudieron cargar los links UTM");
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse<UtmLinkResponse>) {
  const payload = req.body || {};
  const platform = normalizePlatform(payload.platform);
  const campaign = normalizeRequired(payload.campaign);
  const content = normalizeOptional(payload.content);
  const term = normalizeOptional(payload.term);
  const sourceOverride = normalizeOptional(payload.source);
  const mediumOverride = normalizeOptional(payload.medium);

  if (!platform || !campaign) {
    return sendBadRequest(res, "platform y campaign son obligatorios");
  }

  try {
    const creator = await prisma.creator.findUnique({ where: { id: CREATOR_ID }, select: { name: true } });
    if (!creator) return sendBadRequest(res, "Creator not found");

    const handle = slugify(creator.name || "creator");
    const source = (sourceOverride || platform.toLowerCase()).toLowerCase();
    const medium = (mediumOverride || "social").toLowerCase();

    const fullUrl = buildFullUrl({
      baseUrl: resolveBaseUrl(),
      handle,
      source,
      medium,
      campaign,
      content,
      term,
    });

    await prisma.uTMLink.create({
      data: {
        creatorId: CREATOR_ID,
        platform,
        campaign,
        content,
        term,
        source,
        medium,
        fullUrl,
      },
    });

    return res.status(200).json({ fullUrl });
  } catch (err) {
    console.error("Error creating utm link", err);
    return sendServerError(res, "No se pudo crear el link UTM");
  }
}

function normalizePlatform(value: unknown): UtmLinkPlatform | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (PLATFORM_VALUES.includes(normalized as UtmLinkPlatform)) {
    return normalized as UtmLinkPlatform;
  }
  return null;
}

function normalizeRequired(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeOptional(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== "string") return DEFAULT_LIMIT;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

function resolveBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || "";
  if (!base) return "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function buildFullUrl({
  baseUrl,
  handle,
  source,
  medium,
  campaign,
  content,
  term,
}: {
  baseUrl: string;
  handle: string;
  source: string;
  medium: string;
  campaign: string;
  content: string | null;
  term: string | null;
}): string {
  const params = new URLSearchParams({
    utm_source: source,
    utm_medium: medium,
    utm_campaign: campaign,
  });
  if (content) params.set("utm_content", content);
  if (term) params.set("utm_term", term);

  const basePath = `${baseUrl}/link/${handle}`;
  return `${basePath}?${params.toString()}`;
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
