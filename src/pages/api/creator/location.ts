import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import type { CreatorLocation, LocationVisibility } from "../../../types/creatorLocation";

const ALLOWED_RADIUS = new Set([3, 5, 10]);
const GEOHASH_MAX_LENGTH = 5;
// Guard against older Prisma clients missing newer location fields.
const CREATOR_PROFILE_FIELDS = new Set(
  Prisma.dmmf.datamodel.models
    .find((model) => model.name === "CreatorProfile")
    ?.fields.map((field) => field.name) ?? [],
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") return handleGet(res);
  if (req.method === "PUT") return handlePut(req, res);

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(res: NextApiResponse) {
  try {
    const creatorId = await resolveCreatorId();
    const profile = await getOrCreateProfile(creatorId);
    return res.status(200).json(mapProfile(profile));
  } catch (err) {
    console.error("Error loading creator location", err);
    return sendServerError(res);
  }
}

async function handlePut(req: NextApiRequest, res: NextApiResponse) {
  const visibility = normalizeVisibility(req.body?.visibility);
  if (!visibility) {
    return sendBadRequest(res, "visibility inválida");
  }

  const labelInput = req.body?.label;
  if (labelInput !== undefined && labelInput !== null && typeof labelInput !== "string") {
    return sendBadRequest(res, "locationLabel inválido");
  }
  const label = typeof labelInput === "string" ? labelInput.trim() : "";

  const geohashInput = req.body?.geohash;
  if (geohashInput !== undefined && geohashInput !== null && typeof geohashInput !== "string") {
    return sendBadRequest(res, "locationGeohash inválido");
  }
  const normalizedGeohash = normalizeGeohash(geohashInput);

  const allowDiscoveryUseLocationInput = req.body?.allowDiscoveryUseLocation;
  if (
    allowDiscoveryUseLocationInput !== undefined &&
    allowDiscoveryUseLocationInput !== null &&
    typeof allowDiscoveryUseLocationInput !== "boolean"
  ) {
    return sendBadRequest(res, "allowDiscoveryUseLocation inválido");
  }
  const allowDiscoveryUseLocation = Boolean(allowDiscoveryUseLocationInput);

  const radiusInput = req.body?.radiusKm;
  if (
    radiusInput !== undefined &&
    radiusInput !== null &&
    typeof radiusInput !== "number" &&
    typeof radiusInput !== "string"
  ) {
    return sendBadRequest(res, "radiusKm inválido");
  }
  const parsedRadius =
    radiusInput === null || radiusInput === "" || radiusInput === undefined ? null : Number(radiusInput);

  if (parsedRadius !== null && Number.isNaN(parsedRadius)) {
    return sendBadRequest(res, "radiusKm inválido");
  }

  if (visibility === "COUNTRY") {
    if (!label) return sendBadRequest(res, "locationLabel requerido");
  }

  if (visibility === "CITY") {
    if (!label) return sendBadRequest(res, "locationLabel requerido");
    if (!normalizedGeohash || normalizedGeohash.length < 4) {
      return sendBadRequest(res, "locationGeohash requerido");
    }
  }

  if (visibility === "AREA") {
    if (!label) return sendBadRequest(res, "locationLabel requerido");
    if (!normalizedGeohash || normalizedGeohash.length < 4) {
      return sendBadRequest(res, "locationGeohash requerido");
    }
    if (parsedRadius === null || !ALLOWED_RADIUS.has(parsedRadius)) {
      return sendBadRequest(res, "radiusKm debe ser 3, 5 o 10");
    }
  }

  try {
    const creatorId = await resolveCreatorId();
    const data = buildUpdatePayload({
      visibility,
      label,
      geohash: normalizedGeohash,
      radiusKm: parsedRadius,
      allowDiscoveryUseLocation,
    });
    if (Object.keys(data).length === 0) {
      return sendBadRequest(res, "Ubicación no soportada");
    }

    const profile = await prisma.creatorProfile.upsert({
      where: { creatorId },
      create: {
        creatorId,
        ...data,
      },
      update: data,
    });

    return res.status(200).json(mapProfile(profile));
  } catch (err) {
    console.error("Error saving creator location", err);
    return sendServerError(res);
  }
}

function normalizeVisibility(value: unknown): LocationVisibility | null {
  if (value === "OFF" || value === "COUNTRY" || value === "CITY" || value === "AREA") return value;
  return null;
}

function normalizeGeohash(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const cleaned = trimmed.replace(/[^0-9a-z]/g, "");
  return cleaned.slice(0, GEOHASH_MAX_LENGTH);
}

function buildUpdatePayload({
  visibility,
  label,
  geohash,
  radiusKm,
  allowDiscoveryUseLocation,
}: {
  visibility: LocationVisibility;
  label: string;
  geohash: string;
  radiusKm: number | null;
  allowDiscoveryUseLocation: boolean;
}): Prisma.CreatorProfileUpdateInput {
  if (visibility === "OFF") {
    return filterLocationFields({
      locationVisibility: visibility,
      locationLabel: null,
      locationGeohash: null,
      locationRadiusKm: null,
      allowDiscoveryUseLocation,
    });
  }

  if (visibility === "COUNTRY") {
    return filterLocationFields({
      locationVisibility: visibility,
      locationLabel: label || null,
      locationGeohash: geohash || null,
      locationRadiusKm: null,
      allowDiscoveryUseLocation,
    });
  }

  if (visibility === "CITY") {
    return filterLocationFields({
      locationVisibility: visibility,
      locationLabel: label || null,
      locationGeohash: geohash || null,
      locationRadiusKm: null,
      allowDiscoveryUseLocation,
    });
  }

  return filterLocationFields({
    locationVisibility: visibility,
    locationLabel: label || null,
    locationGeohash: geohash || null,
    locationRadiusKm: radiusKm,
    allowDiscoveryUseLocation,
  });
}

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;

  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (!creator) {
    throw new Error("No creator found");
  }

  return creator.id;
}

async function getOrCreateProfile(creatorId: string) {
  const existing = await prisma.creatorProfile.findUnique({ where: { creatorId } });
  if (existing) return existing;
  const defaults = filterLocationFields({
    locationVisibility: "OFF",
    locationLabel: null,
    locationGeohash: null,
    locationRadiusKm: null,
    allowDiscoveryUseLocation: false,
  });
  return prisma.creatorProfile.create({
    data: {
      creatorId,
      ...(defaults as Prisma.CreatorProfileCreateInput),
    },
  });
}

function mapProfile(profile: any): CreatorLocation {
  return {
    visibility: profile.locationVisibility || "OFF",
    label: profile.locationLabel ?? null,
    geohash: profile.locationGeohash ?? null,
    radiusKm: profile.locationRadiusKm ?? null,
    allowDiscoveryUseLocation: Boolean(profile.allowDiscoveryUseLocation),
  };
}

function filterLocationFields(data: Record<string, unknown>): Prisma.CreatorProfileUpdateInput {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (CREATOR_PROFILE_FIELDS.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered as Prisma.CreatorProfileUpdateInput;
}
