import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/prisma";
import { buildAgencyDraft } from "@/server/agencyTemplates";
import {
  normalizeAgencyIntensity,
  normalizeAgencyObjective,
  normalizeAgencyStage,
  type AgencyIntensity,
  type AgencyObjective,
  type AgencyStage,
} from "@/lib/agency/types";

type DraftResponse =
  | {
      ok: true;
      draft: string;
      qa: { score: number; warnings: string[] };
      templateId: string | null;
      variant: number;
    }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<DraftResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!prisma) {
    return res.status(500).json({ ok: false, error: "PRISMA_NOT_INITIALIZED" });
  }

  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const creatorId =
    typeof body.creatorId === "string" && body.creatorId.trim() ? body.creatorId.trim() : await resolveCreatorId();

  const stage = (normalizeAgencyStage(body.stage) ?? "NEW") as AgencyStage;
  const objective = (normalizeAgencyObjective(body.objective) ?? "CONNECT") as AgencyObjective;
  const intensity = (normalizeAgencyIntensity(body.intensity) ?? "MEDIUM") as AgencyIntensity;

  const fanName = typeof body.fanName === "string" ? body.fanName.trim() : "";
  const lastFanMsg = typeof body.lastFanMsg === "string" ? body.lastFanMsg.trim() : "";
  const language = typeof body.language === "string" ? body.language.trim() : "es";
  const mode = body.mode === "short" ? "short" : "full";
  const variant = typeof body.variant === "number" && Number.isFinite(body.variant) ? Math.max(0, Math.floor(body.variant)) : 0;
  const avoidText = typeof body.avoidText === "string" ? body.avoidText : null;

  let offer = null as null | { title?: string | null; tier?: string | null; priceCents?: number | null; currency?: string | null };
  const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
  if (offerId) {
    const record = await prisma.offer.findFirst({
      where: { id: offerId, creatorId },
      select: { title: true, tier: true, priceCents: true, currency: true },
    });
    if (record) {
      offer = {
        title: record.title,
        tier: record.tier,
        priceCents: record.priceCents,
        currency: record.currency,
      };
    }
  }

  try {
    const result = await buildAgencyDraft({
      creatorId,
      fanName,
      lastFanMsg,
      stage,
      objective,
      intensity,
      language,
      offer,
      variant,
      mode,
      avoidText,
    });

    return res.status(200).json({
      ok: true,
      draft: result.text,
      qa: result.qa,
      templateId: result.templateId ?? null,
      variant: result.variant,
    });
  } catch (error) {
    console.error("Error building agency template draft", error);
    return res.status(500).json({ ok: false, error: "Failed to build template draft" });
  }
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
