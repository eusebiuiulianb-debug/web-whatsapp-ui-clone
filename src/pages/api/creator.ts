import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../lib/prisma.server";
import { sendServerError } from "../../lib/apiError";
import { normalizeUiLocale } from "../../lib/language";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  if (_req.method === "GET") return handleGet(res);
  if (_req.method === "POST") return handlePost(_req, res);

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(res: NextApiResponse) {
  try {
    const creator =
      (await prisma.creator.findUnique({
        where: { id: "creator-1" },
        include: { packs: true },
      })) || (await prisma.creator.findFirst({ include: { packs: true } }));

    if (!creator) {
      return res.status(404).json({ error: "Creator not found" });
    }

    const mappedCreator = {
      id: creator.id,
      name: creator.name,
      subtitle: creator.subtitle,
      description: creator.description,
      avatarUrl: creator.bioLinkAvatarUrl || "",
      uiLocale: creator.uiLocale || "es",
      handle: creator.handle || slugifyHandle(creator.name),
      isVerified: Boolean(creator.isVerified),
      offerTags: normalizeOfferTags(creator.offerTags),
    };

    const mappedPacks = creator.packs.map((pack) => ({
      id: pack.id,
      name: pack.name,
      price: pack.price,
      description: pack.description,
    }));

    return res.status(200).json({ creator: mappedCreator, packs: mappedPacks });
  } catch (_err) {
    return sendServerError(res, "Error loading creator data");
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const body = req.body as Partial<{
      name: string;
      subtitle: string;
      description: string;
      avatarUrl?: string | null;
      uiLocale?: string | null;
    }>;
    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Payload inválido" });
    }

    const updates: Record<string, any> = {};
    if (typeof body.name === "string") updates.name = body.name;
    if (typeof body.subtitle === "string") updates.subtitle = body.subtitle;
    if (typeof body.description === "string") updates.description = body.description;
    if (body.avatarUrl !== undefined) updates.bioLinkAvatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl : null;
    if (body.uiLocale !== undefined) {
      updates.uiLocale = normalizeUiLocale(body.uiLocale) ?? "es";
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    const creator = await prisma.creator.update({
      where: { id: "creator-1" },
      data: updates,
      include: { packs: true },
    });

    const mappedCreator = {
      id: creator.id,
      name: creator.name,
      subtitle: creator.subtitle,
      description: creator.description,
      avatarUrl: creator.bioLinkAvatarUrl || "",
      uiLocale: creator.uiLocale || "es",
      handle: creator.handle || slugifyHandle(creator.name),
      isVerified: Boolean(creator.isVerified),
      offerTags: normalizeOfferTags(creator.offerTags),
    };

    const mappedPacks = creator.packs.map((pack) => ({
      id: pack.id,
      name: pack.name,
      price: pack.price,
      description: pack.description,
    }));

    return res.status(200).json({ creator: mappedCreator, packs: mappedPacks });
  } catch (_err) {
    return sendServerError(res, "Error actualizando datos del creador");
  }
}

function slugifyHandle(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeOfferTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => Boolean(tag));
}
