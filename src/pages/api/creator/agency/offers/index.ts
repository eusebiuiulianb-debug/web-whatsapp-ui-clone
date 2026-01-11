import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/prisma";
import { normalizeAgencyIntensity, type AgencyIntensity } from "@/lib/agency/types";
import { getDbSchemaOutOfSyncPayload, isDbSchemaOutOfSyncError } from "@/lib/dbSchemaGuard";

type OfferTier = "MICRO" | "STANDARD" | "PREMIUM" | "MONTHLY";

type OfferPayload = {
  id: string;
  creatorId: string;
  code: string;
  title: string;
  tier: OfferTier;
  priceCents: number;
  currency: string;
  oneLiner: string;
  hooks: string[];
  ctas: string[];
  intensityMin: AgencyIntensity;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type OffersResponse =
  | { ok: true; items: OfferPayload[] }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<OffersResponse>) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse<OffersResponse>) {
  res.setHeader("Cache-Control", "no-store");
  if (!prisma) {
    return res.status(500).json({ ok: false, error: "PRISMA_NOT_INITIALIZED" });
  }
  const includeInactive = req.query.includeInactive === "1" || req.query.includeInactive === "true";

  try {
    const creatorId = await resolveCreatorId();
    const offers = await prisma.offer.findMany({
      where: { creatorId, ...(includeInactive ? {} : { active: true }) },
      orderBy: { createdAt: "desc" },
    });
    return res.status(200).json({
      ok: true,
      items: offers.map((offer) => serializeOffer(offer)),
    });
  } catch (error) {
    if (isDbSchemaOutOfSyncError(error)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("Error loading offers", error);
    return res.status(500).json({ ok: false, error: "Failed to load offers" });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse<OffersResponse>) {
  if (!prisma) {
    return res.status(500).json({ ok: false, error: "PRISMA_NOT_INITIALIZED" });
  }
  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};

  const code = normalizeRequiredString(body.code, 32);
  const title = normalizeRequiredString(body.title, 120);
  const tier = normalizeOfferTier(body.tier);
  const priceCents = normalizePriceCents(body.priceCents);
  const currency = normalizeCurrency(body.currency);
  const oneLiner = normalizeRequiredString(body.oneLiner, 180);
  const hooks = normalizeStringArray(body.hooks ?? body.hooksJson ?? body.hooksText);
  const ctas = normalizeStringArray(body.ctas ?? body.ctasJson ?? body.ctasText);
  const intensityMin = normalizeAgencyIntensity(body.intensityMin) ?? "SOFT";
  const active = typeof body.active === "boolean" ? body.active : true;

  if (!code || !title || !tier || priceCents === null || !oneLiner) {
    return res.status(400).json({ ok: false, error: "Missing required fields" });
  }
  if (hooks.length < 3 || hooks.length > 6) {
    return res.status(400).json({ ok: false, error: "hooks must include 3-6 items" });
  }
  if (ctas.length < 3 || ctas.length > 6) {
    return res.status(400).json({ ok: false, error: "ctas must include 3-6 items" });
  }

  try {
    const creatorId = await resolveCreatorId();
    const offer = await prisma.offer.create({
      data: {
        creatorId,
        code,
        title,
        tier,
        priceCents,
        currency,
        oneLiner,
        hooksJson: hooks,
        ctasJson: ctas,
        intensityMin,
        active,
      },
    });
    return res.status(200).json({ ok: true, items: [serializeOffer(offer)] });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ ok: false, error: "OFFER_CODE_TAKEN" });
    }
    if (isDbSchemaOutOfSyncError(error)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("Error creating offer", error);
    return res.status(500).json({ ok: false, error: "Failed to create offer" });
  }
}

function normalizeRequiredString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function normalizeCurrency(value: unknown): string {
  if (typeof value !== "string") return "EUR";
  const trimmed = value.trim().toUpperCase();
  return trimmed || "EUR";
}

function normalizeOfferTier(value: unknown): OfferTier | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "MICRO" || normalized === "STANDARD" || normalized === "PREMIUM" || normalized === "MONTHLY") {
    return normalized as OfferTier;
  }
  return null;
}

function normalizePriceCents(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : NaN;
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 0) return null;
  return rounded;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/g)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function serializeOffer(offer: any): OfferPayload {
  return {
    id: offer.id,
    creatorId: offer.creatorId,
    code: offer.code,
    title: offer.title,
    tier: offer.tier as OfferTier,
    priceCents: offer.priceCents,
    currency: offer.currency ?? "EUR",
    oneLiner: offer.oneLiner,
    hooks: normalizeStringArray(offer.hooksJson),
    ctas: normalizeStringArray(offer.ctasJson),
    intensityMin: offer.intensityMin as AgencyIntensity,
    active: Boolean(offer.active),
    createdAt: offer.createdAt instanceof Date ? offer.createdAt.toISOString() : String(offer.createdAt),
    updatedAt: offer.updatedAt instanceof Date ? offer.updatedAt.toISOString() : String(offer.updatedAt),
  };
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
