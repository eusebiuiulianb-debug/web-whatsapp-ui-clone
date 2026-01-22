import fs from "fs";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { slugifyHandle } from "../../../../lib/fan/session";

type CreatorResult = {
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  availability: string;
  responseTime: string;
  locationLabel?: string | null;
};

type CreatorCandidate = {
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  availabilityValue: CreatorAvailability;
  responseValue: CreatorResponseTime;
  locationLabel?: string | null;
};

type CreatorAvailability = "AVAILABLE" | "OFFLINE" | "VIP_ONLY";
type CreatorResponseTime = "INSTANT" | "LT_24H" | "LT_72H";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const queryText = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const availabilityParam = typeof req.query.availability === "string" ? req.query.availability.trim() : "";
  const responseParam = typeof req.query.responseTime === "string" ? req.query.responseTime.trim() : "";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : Number.NaN;
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw)))
    : DEFAULT_LIMIT;

  const availabilityFilter = normalizeAvailability(availabilityParam);
  const responseFilter = normalizeResponseTime(responseParam);
  const normalizedQuery = queryText.toLowerCase();

  try {
    const creators = await prisma.creator.findMany({
      where: {
        OR: [
          { profile: { visibilityMode: { in: ["PUBLIC", "DISCOVERABLE"] } } },
          { discoveryProfile: { isDiscoverable: true } },
        ],
      },
      select: {
        name: true,
        bioLinkAvatarUrl: true,
        profile: {
          select: {
            availability: true,
            responseSla: true,
            locationVisibility: true,
            locationLabel: true,
          },
        },
        discoveryProfile: {
          select: {
            isDiscoverable: true,
          },
        },
      },
    });

    const candidates: CreatorCandidate[] = creators.map((creator) => {
      const handle = slugifyHandle(creator.name || "creator");
      const displayName = creator.name || "Creador";
      const availabilityValue =
        normalizeAvailability(creator.profile?.availability) ?? "AVAILABLE";
      const responseValue =
        normalizeResponseTime(creator.profile?.responseSla) ?? "LT_24H";
      const locationVisibility = (creator.profile?.locationVisibility || "").toUpperCase();
      const locationLabel =
        locationVisibility !== "OFF" ? creator.profile?.locationLabel ?? null : null;
      const avatarUrl = normalizeAvatarUrl(creator.bioLinkAvatarUrl);

      return {
        handle,
        displayName,
        avatarUrl,
        availabilityValue,
        responseValue,
        locationLabel,
      };
    });

    const filtered = candidates.filter((creator) => {
      if (availabilityFilter && creator.availabilityValue !== availabilityFilter) return false;
      if (responseFilter && creator.responseValue !== responseFilter) return false;
      if (!normalizedQuery) return true;
      const haystack = `${creator.displayName} ${creator.handle}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    const payload: CreatorResult[] = filtered.slice(0, limit).map((creator) => ({
      handle: creator.handle,
      displayName: creator.displayName,
      avatarUrl: creator.avatarUrl ?? null,
      availability: formatAvailabilityLabel(creator.availabilityValue),
      responseTime: formatResponseTimeLabel(creator.responseValue),
      locationLabel: creator.locationLabel ?? null,
    }));

    return res.status(200).json({ creators: payload });
  } catch (err) {
    console.error("Error loading recommended creators", err);
    return res.status(500).json({ error: "No se pudieron cargar los creadores" });
  }
}

function normalizeAvailability(value?: string | null): CreatorAvailability | null {
  const normalized = (value || "").toUpperCase();
  if (normalized === "AVAILABLE" || normalized === "ONLINE") return "AVAILABLE";
  if (normalized === "VIP_ONLY") return "VIP_ONLY";
  if (normalized === "NOT_AVAILABLE" || normalized === "OFFLINE") return "OFFLINE";
  return null;
}

function normalizeResponseTime(value?: string | null): CreatorResponseTime | null {
  const normalized = (value || "").toUpperCase();
  if (normalized === "INSTANT") return "INSTANT";
  if (normalized === "LT_72H" || normalized === "LT_48H") return "LT_72H";
  if (normalized === "LT_24H") return "LT_24H";
  return null;
}

function formatAvailabilityLabel(value: CreatorAvailability): string {
  if (value === "VIP_ONLY") return "Solo VIP";
  if (value === "OFFLINE") return "No disponible";
  return "Disponible";
}

function formatResponseTimeLabel(value: CreatorResponseTime): string {
  if (value === "INSTANT") return "Responde al momento";
  if (value === "LT_72H") return "Responde <72h";
  return "Responde <24h";
}

function normalizeAvatarUrl(value?: string | null): string | null {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const publicPath = path.join(process.cwd(), "public", normalized.replace(/^\/+/, ""));
  if (!fs.existsSync(publicPath)) return null;
  return normalized;
}
