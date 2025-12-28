import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import {
  isCatalogItemType,
  serializeCatalogItem,
  type CatalogItemInput,
} from "../../../lib/catalog";

const DEFAULT_CURRENCY = "EUR";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const creatorId = typeof req.query.creatorId === "string" ? req.query.creatorId.trim() : "";
  if (!creatorId) {
    return sendBadRequest(res, "creatorId is required");
  }

  try {
    const items = await prisma.catalogItem.findMany({
      where: { creatorId },
      orderBy: [
        { isActive: "desc" },
        { sortOrder: "asc" },
        { createdAt: "desc" },
      ],
    });

    return res.status(200).json({ items: items.map((item) => serializeCatalogItem(item)) });
  } catch (err) {
    console.error("Error loading catalog items", err);
    return sendServerError(res);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const body = (req.body ?? {}) as Partial<CatalogItemInput>;
  const creatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    body.description === null
      ? null
      : typeof body.description === "string"
      ? body.description.trim()
      : undefined;
  const priceCents = Number(body.priceCents);
  const currency =
    typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : DEFAULT_CURRENCY;
  const isPublic = typeof body.isPublic === "boolean" ? body.isPublic : undefined;

  if (!creatorId) {
    return sendBadRequest(res, "creatorId is required");
  }
  if (!isCatalogItemType(body.type)) {
    return sendBadRequest(res, "type is required");
  }
  if (!title) {
    return sendBadRequest(res, "title is required");
  }
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    return sendBadRequest(res, "priceCents must be >= 0");
  }

  try {
    let includes: string[] = [];
    if (body.type === "BUNDLE") {
      const parsed = parseIncludesInput(body.includes);
      if (!parsed.ok) {
        return sendBadRequest(res, parsed.error);
      }
      includes = parsed.value;
      const valid = await validateBundleIncludes(includes, creatorId);
      if (!valid) {
        return sendBadRequest(res, "includes must reference extra items");
      }
    }

    const item = await (prisma.catalogItem as any).create({
      data: {
        creatorId,
        type: body.type,
        title,
        description: description ?? null,
        priceCents: Math.round(priceCents),
        currency,
        includes: body.type === "BUNDLE" ? includes : undefined,
        ...(typeof isPublic === "boolean" ? { isPublic } : {}),
      },
    });

    return res.status(201).json({ item: serializeCatalogItem(item) });
  } catch (err) {
    console.error("Error creating catalog item", err);
    return sendServerError(res);
  }
}

type IncludesParseResult =
  | { ok: true; value: string[] }
  | { ok: false; error: string };

function parseIncludesInput(value: unknown): IncludesParseResult {
  if (value === undefined || value === null) {
    return { ok: true, value: [] as string[] };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: "includes must be an array of ids" };
  }
  const includes: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return { ok: false, error: "includes must be an array of ids" };
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      return { ok: false, error: "includes must be an array of ids" };
    }
    if (!includes.includes(trimmed)) {
      includes.push(trimmed);
    }
  }
  return { ok: true, value: includes };
}

async function validateBundleIncludes(includes: string[], creatorId: string) {
  if (includes.length === 0) return true;
  const found = await prisma.catalogItem.findMany({
    where: {
      id: { in: includes },
      creatorId,
      type: "EXTRA",
    },
    select: { id: true },
  });
  return found.length === includes.length;
}
