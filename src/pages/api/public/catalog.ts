import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";

type PublicCatalogItem = {
  type: "EXTRA" | "BUNDLE" | "PACK";
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  includes: string[];
  isActive: boolean;
  isPublic: boolean;
};

type CatalogItemRow = {
  id: string;
  type: "EXTRA" | "BUNDLE" | "PACK";
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  includes: unknown;
  isActive: boolean;
  isPublic: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const handleParam =
    typeof req.query.creatorHandle === "string"
      ? req.query.creatorHandle
      : typeof req.query.handle === "string"
      ? req.query.handle
      : "";
  const handle = handleParam.trim();
  if (!handle) {
    return sendBadRequest(res, "creatorHandle is required");
  }

  try {
    const creators = await prisma.creator.findMany({
      include: { profile: { select: { visibilityMode: true } } },
    });
    const creator = creators.find((item) => slugify(item.name) === handle);
    if (!creator) {
      return res.status(404).json({ error: "Not found" });
    }
    const visibilityMode = resolveVisibilityMode(creator.profile?.visibilityMode);
    const previewHandle = readPreviewHandle(req.headers?.cookie);
    const previewAllowed = Boolean(previewHandle && previewHandle === slugify(creator.name));
    if (visibilityMode === "INVISIBLE" && !previewAllowed) {
      return res.status(404).json({ error: "Not found" });
    }

    const items = (await (prisma.catalogItem as any).findMany({
      where: { creatorId: creator.id, isActive: true, isPublic: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        priceCents: true,
        currency: true,
        includes: true,
        isActive: true,
        isPublic: true,
      },
    })) as CatalogItemRow[];

    const extrasById = new Map(
      items
        .filter((item) => item.type === "EXTRA")
        .map((item) => [item.id, item.title] as const)
    );

    const publicItems: PublicCatalogItem[] = items.map((item) => {
      const includesRaw = Array.isArray(item.includes) ? item.includes : [];
      const includes =
        item.type === "BUNDLE"
          ? includesRaw
              .map((id) => extrasById.get(String(id)))
              .filter((title): title is string => Boolean(title))
          : [];
      return {
        type: item.type,
        title: item.title,
        description: item.description,
        priceCents: item.priceCents,
        currency: item.currency,
        includes,
        isActive: item.isActive,
        isPublic: item.isPublic,
      };
    });

    return res.status(200).json({ items: publicItems });
  } catch (err) {
    console.error("Error loading public catalog", err);
    return sendServerError(res);
  }
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function resolveVisibilityMode(value: unknown): "INVISIBLE" | "SOLO_LINK" | "DISCOVERABLE" | "PUBLIC" {
  if (value === "INVISIBLE") return "INVISIBLE";
  if (value === "DISCOVERABLE") return "DISCOVERABLE";
  if (value === "PUBLIC") return "PUBLIC";
  return "SOLO_LINK";
}

function readPreviewHandle(cookieHeader: string | undefined) {
  if (!cookieHeader) return "";
  const entries = cookieHeader.split(";").map((part) => part.trim().split("="));
  for (const [rawKey, ...rest] of entries) {
    if (!rawKey) continue;
    const key = decodeURIComponent(rawKey);
    if (key !== "novsy_creator_preview") continue;
    return slugify(decodeURIComponent(rest.join("=")));
  }
  return "";
}
