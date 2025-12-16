import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import type { BioLinkConfig, BioLinkSecondaryLink } from "../../../types/bioLink";

const CREATOR_ID = "creator-1";
const MAX_LINKS = 4;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const creator = await prisma.creator.findUnique({ where: { id: CREATOR_ID } });
    if (!creator) return sendBadRequest(res, "Creator not found");

    const config = mapCreatorToConfig(creator);
    return res.status(200).json({ config });
  } catch (err) {
    console.error("Error loading bio link config", err);
    return sendServerError(res, "No se pudo cargar la configuración del bio-link");
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const payload = req.body as Partial<BioLinkConfig> | undefined;
    if (!payload) return sendBadRequest(res, "payload required");

    const links = Array.isArray(payload.secondaryLinks) ? payload.secondaryLinks.slice(0, MAX_LINKS) : [];
    const sanitizedLinks = links
      .map((l) => ({
        label: typeof l.label === "string" ? l.label.trim() : "",
        url: typeof l.url === "string" ? l.url.trim() : "",
        iconKey: l.iconKey && ["tiktok", "instagram", "twitter", "custom"].includes(l.iconKey) ? l.iconKey : "custom",
      }))
      .filter((l) => l.label && l.url);

    const primaryCtaUrl = typeof payload.primaryCtaUrl === "string" && payload.primaryCtaUrl.trim().length > 0
      ? payload.primaryCtaUrl.trim()
      : `/creator`;

    const updated = await prisma.creator.update({
      where: { id: CREATOR_ID },
      data: {
        bioLinkEnabled: payload.enabled ?? false,
        bioLinkPrimaryCtaLabel: payload.primaryCtaLabel || "Entrar a mi chat privado",
        bioLinkPrimaryCtaUrl: primaryCtaUrl,
        bioLinkSecondaryLinks: sanitizedLinks as unknown as object,
      },
    });

    return res.status(200).json({ config: mapCreatorToConfig(updated) });
  } catch (err) {
    console.error("Error saving bio link config", err);
    return sendServerError(res, "No se pudo guardar la configuración del bio-link");
  }
}

function mapCreatorToConfig(creator: any): BioLinkConfig {
  let secondaryLinks: BioLinkSecondaryLink[] = [];
  if (Array.isArray(creator.bioLinkSecondaryLinks)) {
    secondaryLinks = creator.bioLinkSecondaryLinks as BioLinkSecondaryLink[];
  } else if (creator.bioLinkSecondaryLinks && typeof creator.bioLinkSecondaryLinks === "string") {
    try {
      const parsed = JSON.parse(creator.bioLinkSecondaryLinks);
      if (Array.isArray(parsed)) secondaryLinks = parsed;
    } catch (_err) {
      secondaryLinks = [];
    }
  }
  const handle = (creator.name || "creator").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return {
    enabled: Boolean(creator.bioLinkEnabled),
    title: creator.name || creator.bioLinkTitle || "Creador",
    tagline: creator.subtitle || creator.bioLinkTagline || "",
    avatarUrl: creator.bioLinkAvatarUrl || "",
    primaryCtaLabel: creator.bioLinkPrimaryCtaLabel || "Entrar a mi chat privado",
    primaryCtaUrl: creator.bioLinkPrimaryCtaUrl || `/creator`,
    secondaryLinks,
    handle,
    creatorId: creator.id,
  };
}
