import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../../lib/apiError";
import { normalizeImageSrc } from "../../../../utils/normalizeImageSrc";

const CREATOR_ID = "creator-1";

type CreatorPlan = "FREE" | "PRO";

const PLAN_VALUES = new Set<CreatorPlan>(["FREE", "PRO"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") return handleGet(res);
  if (req.method === "POST") return handlePost(req, res);
  if (req.method === "PATCH") return handlePatch(req, res);
  res.setHeader("Allow", "GET, POST, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(res: NextApiResponse) {
  try {
    const profile = await prisma.creatorProfile.findUnique({
      where: { creatorId: CREATOR_ID },
      select: { coverUrl: true, plan: true, isVerified: true, offerTags: true },
    });
    return res.status(200).json({
      coverUrl: profile?.coverUrl ?? null,
      plan: profile?.plan ?? "FREE",
      isVerified: Boolean(profile?.isVerified),
      offerTags: normalizeOfferTags(profile?.offerTags),
    });
  } catch (err) {
    console.error("Error loading creator profile", err);
    return sendServerError(res, "No se pudo cargar el perfil");
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const payload = req.body as Partial<{ coverUrl?: string | null }> | undefined;
    if (!payload) return sendBadRequest(res, "payload required");
    const raw = typeof payload.coverUrl === "string" ? payload.coverUrl.trim() : "";
    const normalized = raw ? normalizeImageSrc(raw) : null;

    const profile = await prisma.creatorProfile.upsert({
      where: { creatorId: CREATOR_ID },
      create: { creatorId: CREATOR_ID, coverUrl: normalized },
      update: { coverUrl: normalized },
      select: { coverUrl: true },
    });

    return res.status(200).json({ coverUrl: profile.coverUrl ?? null });
  } catch (err) {
    console.error("Error saving creator profile", err);
    return sendServerError(res, "No se pudo guardar el perfil");
  }
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse) {
  try {
    const payload = req.body as Partial<{
      plan?: unknown;
      isVerified?: unknown;
      offerTags?: unknown;
      services?: unknown;
    }> | undefined;
    if (!payload) return sendBadRequest(res, "payload required");

    const planRaw = typeof payload.plan === "string" ? payload.plan.trim().toUpperCase() : null;
    const plan = planRaw && PLAN_VALUES.has(planRaw as CreatorPlan) ? (planRaw as CreatorPlan) : null;
    if (payload.plan !== undefined && !plan) {
      return sendBadRequest(res, "plan invalid");
    }

    const isVerified =
      typeof payload.isVerified === "boolean"
        ? payload.isVerified
        : typeof payload.isVerified === "string"
        ? payload.isVerified.trim().toLowerCase() === "true"
        : null;
    if (payload.isVerified !== undefined && isVerified === null) {
      return sendBadRequest(res, "isVerified invalid");
    }

    const tagsSource = payload.offerTags ?? payload.services;
    const offerTags = normalizeOfferTags(tagsSource);
    if (tagsSource !== undefined && !Array.isArray(tagsSource) && offerTags.length === 0) {
      return sendBadRequest(res, "services invalid");
    }

    if (plan === null && isVerified === null && tagsSource === undefined) {
      return sendBadRequest(res, "no fields to update");
    }

    const profile = await prisma.creatorProfile.upsert({
      where: { creatorId: CREATOR_ID },
      create: {
        creatorId: CREATOR_ID,
        plan: plan ?? "FREE",
        isVerified: isVerified ?? false,
        offerTags: offerTags,
      },
      update: {
        ...(plan ? { plan } : {}),
        ...(isVerified !== null ? { isVerified } : {}),
        ...(tagsSource !== undefined ? { offerTags } : {}),
      },
      select: { plan: true, isVerified: true, offerTags: true },
    });

    return res.status(200).json({
      ok: true,
      plan: profile.plan,
      isVerified: Boolean(profile.isVerified),
      offerTags: normalizeOfferTags(profile.offerTags),
    });
  } catch (err) {
    console.error("Error updating creator profile", err);
    return sendServerError(res, "No se pudo guardar el perfil");
  }
}

function normalizeOfferTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => Boolean(tag));
}
