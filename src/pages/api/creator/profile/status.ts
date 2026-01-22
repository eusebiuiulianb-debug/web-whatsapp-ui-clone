import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/prisma";
import { sendBadRequest, sendServerError } from "@/lib/apiError";

type CreatorResponseSla = "INSTANT" | "LT_24H" | "LT_72H";
type CreatorAvailability = "AVAILABLE" | "NOT_AVAILABLE" | "VIP_ONLY" | "OFFLINE";

type StatusResponse =
  | { ok: true; responseSla: CreatorResponseSla; availability: CreatorAvailability }
  | { ok: false; error: string; message?: string };

const RESPONSE_SLA_VALUES = new Set<CreatorResponseSla>(["INSTANT", "LT_24H", "LT_72H"]);
const AVAILABILITY_VALUES = new Set<CreatorAvailability>([
  "AVAILABLE",
  "NOT_AVAILABLE",
  "VIP_ONLY",
  "OFFLINE",
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse<StatusResponse>) {
  if (req.method === "GET") return handleGet(res);
  if (req.method === "PATCH" || req.method === "PUT") return handlePatch(req, res);
  res.setHeader("Allow", ["GET", "PATCH", "PUT"]);
  return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
}

async function handleGet(res: NextApiResponse<StatusResponse>) {
  try {
    const creatorId = await resolveCreatorId();
    const profile = await prisma.creatorProfile.findUnique({
      where: { creatorId },
      select: { responseSla: true, availability: true },
    });
    return res.status(200).json({
      ok: true,
      responseSla: profile?.responseSla ?? "LT_24H",
      availability: profile?.availability ?? "AVAILABLE",
    });
  } catch (err) {
    console.error("Error loading creator status", err);
    return sendServerError(res, "No se pudo cargar el estado del creador");
  }
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse<StatusResponse>) {
  try {
    const payload = req.body as Partial<{ responseSla?: unknown; availability?: unknown }> | undefined;
    if (!payload) return sendBadRequest(res, "payload required");

    const responseSlaRaw = typeof payload.responseSla === "string" ? payload.responseSla.trim().toUpperCase() : null;
    const availabilityRaw =
      typeof payload.availability === "string" ? payload.availability.trim().toUpperCase() : null;

    const responseSla = responseSlaRaw && RESPONSE_SLA_VALUES.has(responseSlaRaw as CreatorResponseSla)
      ? (responseSlaRaw as CreatorResponseSla)
      : null;
    const availability = availabilityRaw && AVAILABILITY_VALUES.has(availabilityRaw as CreatorAvailability)
      ? normalizeAvailability(availabilityRaw)
      : null;

    if (!responseSla && payload.responseSla) {
      return sendBadRequest(res, "responseSla invalid");
    }
    if (!availability && payload.availability) {
      return sendBadRequest(res, "availability invalid");
    }

    if (!responseSla && !availability) {
      return sendBadRequest(res, "status values required");
    }

    const creatorId = await resolveCreatorId();
    const profile = await prisma.creatorProfile.upsert({
      where: { creatorId },
      create: {
        creatorId,
        responseSla: responseSla ?? "LT_24H",
        availability: availability ?? "AVAILABLE",
      },
      update: {
        ...(responseSla ? { responseSla } : {}),
        ...(availability ? { availability } : {}),
      },
      select: { responseSla: true, availability: true },
    });

    return res.status(200).json({
      ok: true,
      responseSla: profile.responseSla,
      availability: profile.availability,
    });
  } catch (err) {
    console.error("Error updating creator status", err);
    return sendServerError(res, "No se pudo guardar el estado del creador");
  }
}

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;
  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (!creator?.id) throw new Error("creator_not_found");
  return creator.id;
}

function normalizeAvailability(value: string): CreatorAvailability {
  const normalized = value.trim().toUpperCase();
  if (normalized === "NOT_AVAILABLE" || normalized === "OFFLINE") return "OFFLINE";
  if (normalized === "VIP_ONLY") return "VIP_ONLY";
  return "AVAILABLE";
}
