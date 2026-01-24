import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import { decode, encode } from "ngeohash";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import type { CreatorLocation, LocationVisibility } from "../../../types/creatorLocation";

const ALLOWED_RADIUS = new Set([3, 5, 10]);
const GEOHASH_MAX_LENGTH = 5;
const DEFAULT_PRECISION_KM = 3;
const MIN_PRECISION_KM = 1;
const MAX_PRECISION_KM = 25;
type CreatorProfileLocationData = Omit<
  Prisma.CreatorProfileUncheckedCreateInput,
  "id" | "creatorId" | "creator"
>;
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
  const enabledInput = req.body?.enabled;
  const latInput = req.body?.lat;
  const lngInput = req.body?.lng;
  const precisionInput = req.body?.precisionKm;
  const placeIdInput = req.body?.placeId;
  const hasApproxPayload =
    enabledInput !== undefined ||
    latInput !== undefined ||
    lngInput !== undefined ||
    precisionInput !== undefined ||
    placeIdInput !== undefined;

  if (hasApproxPayload) {
    return handleApproxUpdate(req, res);
  }

  const visibility = normalizeVisibility(req.body?.visibility);
  if (!visibility) {
    return sendBadRequest(res, "visibility inválida");
  }

  const labelInput = req.body?.label;
  if (labelInput !== undefined && labelInput !== null && typeof labelInput !== "string") {
    return sendBadRequest(res, "locationLabel inválido");
  }
  const label = typeof labelInput === "string" ? labelInput.trim() : "";
  if (placeIdInput !== undefined && placeIdInput !== null && typeof placeIdInput !== "string") {
    return sendBadRequest(res, "placeId inválido");
  }
  const placeId = typeof placeIdInput === "string" ? placeIdInput.trim() : "";

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
    const updateData = buildUpdatePayload({
      visibility,
      label,
      placeId,
      geohash: normalizedGeohash,
      radiusKm: parsedRadius,
      allowDiscoveryUseLocation,
    });
    const createData = buildCreatePayload({
      visibility,
      label,
      placeId,
      geohash: normalizedGeohash,
      radiusKm: parsedRadius,
      allowDiscoveryUseLocation,
    });
    if (Object.keys(updateData).length === 0) {
      return sendBadRequest(res, "Ubicación no soportada");
    }

    const profile = await prisma.creatorProfile.upsert({
      where: { creatorId },
      create: {
        creatorId,
        ...createData,
      },
      update: updateData,
    });

    return res.status(200).json(mapProfile(profile));
  } catch (err) {
    console.error("Error saving creator location", err);
    return sendServerError(res);
  }
}

async function handleApproxUpdate(req: NextApiRequest, res: NextApiResponse) {
  const enabledInput = req.body?.enabled;
  if (enabledInput !== undefined && typeof enabledInput !== "boolean") {
    return sendBadRequest(res, "enabled inválido");
  }
  const labelInput = req.body?.label;
  if (labelInput !== undefined && labelInput !== null && typeof labelInput !== "string") {
    return sendBadRequest(res, "locationLabel inválido");
  }
  const label = typeof labelInput === "string" ? labelInput.trim() : "";
  const placeIdInput = req.body?.placeId;
  if (placeIdInput !== undefined && placeIdInput !== null && typeof placeIdInput !== "string") {
    return sendBadRequest(res, "placeId inválido");
  }
  const placeId = typeof placeIdInput === "string" ? placeIdInput.trim() : "";

  const lat = parseNumber(req.body?.lat);
  const lng = parseNumber(req.body?.lng);
  const hasCoords = lat !== null && lng !== null;

  const precisionKm = normalizePrecisionKm(req.body?.precisionKm);
  if (precisionKm === null) {
    return sendBadRequest(res, "precisionKm inválido");
  }

  const enabled = typeof enabledInput === "boolean" ? enabledInput : hasCoords;

  if (!hasCoords) {
    if (label) {
      return sendBadRequest(res, "lat/lng requeridos");
    }
    try {
      const creatorId = await resolveCreatorId();
      const payload = filterLocationFields({
        locationVisibility: "OFF",
        locationLabel: null,
        locationPlaceId: null,
        locationGeohash: null,
        locationRadiusKm: null,
        locationEnabled: false,
        locationLat: null,
        locationLng: null,
        locationPrecisionKm: precisionKm,
        allowDiscoveryUseLocation: false,
      });
      const profile = await prisma.creatorProfile.upsert({
        where: { creatorId },
        create: {
          creatorId,
          ...(payload as CreatorProfileLocationData),
        },
        update: payload,
      });
      return res.status(200).json(mapProfile(profile));
    } catch (err) {
      console.error("Error saving creator location", err);
      return sendServerError(res);
    }
  }

  const resolvedLabel = label || "Ubicación aproximada";
  const quantized = quantizeCoords(lat, lng, precisionKm);
  const geohash = encode(quantized.lat, quantized.lng, GEOHASH_MAX_LENGTH);
  const payload = filterLocationFields({
    locationVisibility: "AREA",
    locationLabel: resolvedLabel,
    locationPlaceId: placeId || null,
    locationGeohash: geohash,
    locationRadiusKm: precisionKm,
    locationEnabled: enabled,
    locationLat: quantized.lat,
    locationLng: quantized.lng,
    locationPrecisionKm: precisionKm,
    allowDiscoveryUseLocation: enabled,
  });

  try {
    const creatorId = await resolveCreatorId();
    const profile = await prisma.creatorProfile.upsert({
      where: { creatorId },
      create: {
        creatorId,
        ...(payload as CreatorProfileLocationData),
      },
      update: payload,
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

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePrecisionKm(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return DEFAULT_PRECISION_KM;
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  const rounded = Math.round(parsed);
  if (rounded < MIN_PRECISION_KM) return MIN_PRECISION_KM;
  if (rounded > MAX_PRECISION_KM) return MAX_PRECISION_KM;
  return rounded;
}

function quantizeCoords(lat: number, lng: number, precisionKm: number) {
  const latStep = precisionKm / 111;
  const latRounded = Math.round(lat / latStep) * latStep;
  const latRad = (latRounded * Math.PI) / 180;
  const safeCos = Math.max(0.2, Math.cos(latRad));
  const lngStep = precisionKm / (111 * safeCos);
  const lngRounded = Math.round(lng / lngStep) * lngStep;
  return {
    lat: roundCoord(latRounded),
    lng: roundCoord(lngRounded),
  };
}

function roundCoord(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

function normalizeGeohash(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const cleaned = trimmed.replace(/[^0-9a-z]/g, "");
  return cleaned.slice(0, GEOHASH_MAX_LENGTH);
}

function decodeGeohash(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const decoded = decode(trimmed);
    if (!decoded || !Number.isFinite(decoded.latitude) || !Number.isFinite(decoded.longitude)) return null;
    return { lat: decoded.latitude, lng: decoded.longitude };
  } catch (_err) {
    return null;
  }
}

function buildLocationPayload({
  visibility,
  label,
  placeId,
  geohash,
  radiusKm,
  allowDiscoveryUseLocation,
}: {
  visibility: LocationVisibility;
  label: string;
  placeId?: string;
  geohash: string;
  radiusKm: number | null;
  allowDiscoveryUseLocation: boolean;
}) {
  const resolvedPrecision =
    typeof radiusKm === "number" && Number.isFinite(radiusKm) ? radiusKm : DEFAULT_PRECISION_KM;
  const resolvedDiscovery = visibility === "OFF" ? false : allowDiscoveryUseLocation;

  if (visibility === "OFF") {
    return {
      locationVisibility: visibility,
      locationLabel: null,
      locationPlaceId: null,
      locationGeohash: null,
      locationRadiusKm: null,
      locationEnabled: false,
      locationPrecisionKm: resolvedPrecision,
      allowDiscoveryUseLocation: resolvedDiscovery,
    };
  }

  if (visibility === "COUNTRY") {
    return {
      locationVisibility: visibility,
      locationLabel: label || null,
      locationPlaceId: placeId || null,
      locationGeohash: geohash || null,
      locationRadiusKm: null,
      locationEnabled: resolvedDiscovery,
      locationPrecisionKm: resolvedPrecision,
      allowDiscoveryUseLocation: resolvedDiscovery,
    };
  }

  if (visibility === "CITY") {
    return {
      locationVisibility: visibility,
      locationLabel: label || null,
      locationPlaceId: placeId || null,
      locationGeohash: geohash || null,
      locationRadiusKm: null,
      locationEnabled: resolvedDiscovery,
      locationPrecisionKm: resolvedPrecision,
      allowDiscoveryUseLocation: resolvedDiscovery,
    };
  }

  return {
    locationVisibility: visibility,
    locationLabel: label || null,
    locationPlaceId: placeId || null,
    locationGeohash: geohash || null,
    locationRadiusKm: radiusKm,
    locationEnabled: resolvedDiscovery,
    locationPrecisionKm: resolvedPrecision,
    allowDiscoveryUseLocation: resolvedDiscovery,
  };
}

function buildUpdatePayload(args: Parameters<typeof buildLocationPayload>[0]): Prisma.CreatorProfileUpdateInput {
  return filterLocationFields(buildLocationPayload(args)) as Prisma.CreatorProfileUpdateInput;
}

function buildCreatePayload(args: Parameters<typeof buildLocationPayload>[0]): CreatorProfileLocationData {
  return filterLocationFields(buildLocationPayload(args)) as CreatorProfileLocationData;
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
  const defaults = buildCreatePayload({
    visibility: "OFF",
    label: "",
    geohash: "",
    radiusKm: null,
    allowDiscoveryUseLocation: false,
  });
  return prisma.creatorProfile.create({
    data: {
      creatorId,
      ...defaults,
    },
  });
}

function mapProfile(profile: any): CreatorLocation {
  const rawLat = typeof profile.locationLat === "number" && Number.isFinite(profile.locationLat) ? profile.locationLat : null;
  const rawLng = typeof profile.locationLng === "number" && Number.isFinite(profile.locationLng) ? profile.locationLng : null;
  let resolvedLat = rawLat;
  let resolvedLng = rawLng;
  if ((resolvedLat === null || resolvedLng === null) && profile.locationGeohash) {
    const decoded = decodeGeohash(profile.locationGeohash);
    if (decoded) {
      resolvedLat = decoded.lat;
      resolvedLng = decoded.lng;
    }
  }
  const enabled =
    typeof profile.locationEnabled === "boolean"
      ? profile.locationEnabled
      : Boolean(profile.allowDiscoveryUseLocation);
  const precisionKm = profile.locationPrecisionKm ?? profile.locationRadiusKm ?? null;
  return {
    visibility: profile.locationVisibility || "OFF",
    label: profile.locationLabel ?? null,
    geohash: profile.locationGeohash ?? null,
    radiusKm: profile.locationRadiusKm ?? null,
    allowDiscoveryUseLocation: Boolean(profile.allowDiscoveryUseLocation),
    placeId: profile.locationPlaceId ?? null,
    enabled,
    lat: resolvedLat,
    lng: resolvedLng,
    precisionKm,
  };
}

function filterLocationFields(data: Record<string, unknown>) {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (CREATOR_PROFILE_FIELDS.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}
