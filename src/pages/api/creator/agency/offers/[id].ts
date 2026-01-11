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

type OfferResponse =
  | { ok: true; item: OfferPayload }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<OfferResponse>) {
  if (req.method === "PUT") {
    return handlePut(req, res);
  }
  if (req.method === "DELETE") {
    return handleDelete(req, res);
  }
  res.setHeader("Allow", "PUT, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handlePut(req: NextApiRequest, res: NextApiResponse<OfferResponse>) {
  if (!prisma) {
    return res.status(500).json({ ok: false, error: "PRISMA_NOT_INITIALIZED" });
  }
  const id = typeof req.query?.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return res.status(400).json({ ok: false, error: "id is required" });
  }
  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};

  try {
    const creatorId = await resolveCreatorId();
    const existing = await prisma.offer.findFirst({ where: { id, creatorId } });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Offer not found" });
    }

    const data: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, "code")) {
      const code = normalizeRequiredString(body.code, 32);
      if (!code) return res.status(400).json({ ok: false, error: "Invalid code" });
      data.code = code;
    }
    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      const title = normalizeRequiredString(body.title, 120);
      if (!title) return res.status(400).json({ ok: false, error: "Invalid title" });
      data.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(body, "tier")) {
      const tier = normalizeOfferTier(body.tier);
      if (!tier) return res.status(400).json({ ok: false, error: "Invalid tier" });
      data.tier = tier;
    }
    if (Object.prototype.hasOwnProperty.call(body, "priceCents")) {
      const priceCents = normalizePriceCents(body.priceCents);
      if (priceCents === null) return res.status(400).json({ ok: false, error: "Invalid priceCents" });
      data.priceCents = priceCents;
    }
    if (Object.prototype.hasOwnProperty.call(body, "currency")) {
      data.currency = normalizeCurrency(body.currency);
    }
    if (Object.prototype.hasOwnProperty.call(body, "oneLiner")) {
      const oneLiner = normalizeRequiredString(body.oneLiner, 180);
      if (!oneLiner) return res.status(400).json({ ok: false, error: "Invalid oneLiner" });
      data.oneLiner = oneLiner;
    }
    if (Object.prototype.hasOwnProperty.call(body, "hooks") || Object.prototype.hasOwnProperty.call(body, "hooksJson") || Object.prototype.hasOwnProperty.call(body, "hooksText")) {
      const hooks = normalizeStringArray(body.hooks ?? body.hooksJson ?? body.hooksText);
      if (hooks.length < 3 || hooks.length > 6) {
        return res.status(400).json({ ok: false, error: "hooks must include 3-6 items" });
      }
      data.hooksJson = hooks;
    }
    if (Object.prototype.hasOwnProperty.call(body, "ctas") || Object.prototype.hasOwnProperty.call(body, "ctasJson") || Object.prototype.hasOwnProperty.call(body, "ctasText")) {
      const ctas = normalizeStringArray(body.ctas ?? body.ctasJson ?? body.ctasText);
      if (ctas.length < 3 || ctas.length > 6) {
        return res.status(400).json({ ok: false, error: "ctas must include 3-6 items" });
      }
      data.ctasJson = ctas;
    }
    if (Object.prototype.hasOwnProperty.call(body, "intensityMin")) {
      const intensityMin = normalizeAgencyIntensity(body.intensityMin);
      if (!intensityMin) return res.status(400).json({ ok: false, error: "Invalid intensityMin" });
      data.intensityMin = intensityMin;
    }
    if (Object.prototype.hasOwnProperty.call(body, "active")) {
      data.active = Boolean(body.active);
    }

    const updated = await prisma.offer.update({
      where: { id },
      data,
    });

    return res.status(200).json({ ok: true, item: serializeOffer(updated) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ ok: false, error: "OFFER_CODE_TAKEN" });
    }
    if (isDbSchemaOutOfSyncError(error)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("Error updating offer", error);
    return res.status(500).json({ ok: false, error: "Failed to update offer" });
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse<OfferResponse>) {
  if (!prisma) {
    return res.status(500).json({ ok: false, error: "PRISMA_NOT_INITIALIZED" });
  }
  const id = typeof req.query?.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return res.status(400).json({ ok: false, error: "id is required" });
  }

  try {
    const creatorId = await resolveCreatorId();
    const existing = await prisma.offer.findFirst({ where: { id, creatorId } });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Offer not found" });
    }
    const updated = await prisma.offer.update({
      where: { id },
      data: { active: false },
    });
    return res.status(200).json({ ok: true, item: serializeOffer(updated) });
  } catch (error) {
    if (isDbSchemaOutOfSyncError(error)) {
      const payload = getDbSchemaOutOfSyncPayload();
      return res.status(500).json({ ok: false, error: payload.errorCode, ...payload });
    }
    console.error("Error deleting offer", error);
    return res.status(500).json({ ok: false, error: "Failed to delete offer" });
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
