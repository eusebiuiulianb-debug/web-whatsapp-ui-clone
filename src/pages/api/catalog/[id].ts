import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { isCatalogItemType, serializeCatalogItem, type CatalogItemType } from "../../../lib/catalog";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", ["PATCH"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return sendBadRequest(res, "id is required");
  }

  const body = req.body ?? {};
  const creatorId =
    typeof body.creatorId === "string"
      ? body.creatorId.trim()
      : typeof req.query.creatorId === "string"
      ? req.query.creatorId.trim()
      : "";

  if (!creatorId) {
    return sendBadRequest(res, "creatorId is required");
  }

  try {
    const existing = await prisma.catalogItem.findUnique({
      where: { id },
      select: { id: true, creatorId: true, type: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }
    if (existing.creatorId !== creatorId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const data: {
      title?: string;
      description?: string | null;
      priceCents?: number;
      currency?: string;
      isActive?: boolean;
      isPublic?: boolean;
      sortOrder?: number;
      type?: CatalogItemType;
      includes?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    } = {};

    if ("title" in body) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) {
        return sendBadRequest(res, "title is required");
      }
      data.title = title;
    }

    if ("description" in body) {
      if (body.description === null) {
        data.description = null;
      } else if (typeof body.description === "string") {
        data.description = body.description.trim();
      } else if (body.description !== undefined) {
        return sendBadRequest(res, "description must be a string");
      }
    }

    if ("priceCents" in body) {
      const priceCents = Number(body.priceCents);
      if (!Number.isFinite(priceCents) || priceCents < 0) {
        return sendBadRequest(res, "priceCents must be >= 0");
      }
      data.priceCents = Math.round(priceCents);
    }

    if ("currency" in body) {
      if (typeof body.currency !== "string" || !body.currency.trim()) {
        return sendBadRequest(res, "currency must be a string");
      }
      data.currency = body.currency.trim().toUpperCase();
    }

    if ("isActive" in body) {
      if (typeof body.isActive !== "boolean") {
        return sendBadRequest(res, "isActive must be boolean");
      }
      data.isActive = body.isActive;
    }

    if ("isPublic" in body) {
      if (typeof body.isPublic !== "boolean") {
        return sendBadRequest(res, "isPublic must be boolean");
      }
      data.isPublic = body.isPublic;
    }

    if ("sortOrder" in body) {
      const sortOrder = Number(body.sortOrder);
      if (!Number.isFinite(sortOrder)) {
        return sendBadRequest(res, "sortOrder must be a number");
      }
      data.sortOrder = Math.round(sortOrder);
    }

    if ("type" in body) {
      if (!isCatalogItemType(body.type)) {
        return sendBadRequest(res, "type is invalid");
      }
      data.type = body.type;
    }

    const includesProvided = Object.prototype.hasOwnProperty.call(body, "includes");
    let parsedIncludes: string[] = [];
    if (includesProvided) {
      const parsed = parseIncludesInput(body.includes);
      if (!parsed.ok) {
        return sendBadRequest(res, parsed.error);
      }
      parsedIncludes = parsed.value;
    }

    const nextType = data.type ?? existing.type;
    if (nextType !== "BUNDLE") {
      data.includes = Prisma.DbNull;
    } else if (includesProvided) {
      const valid = await validateBundleIncludes(parsedIncludes, creatorId);
      if (!valid) {
        return sendBadRequest(res, "includes must reference extra items");
      }
      data.includes = parsedIncludes;
    }

    const updated = await (prisma.catalogItem as any).update({
      where: { id },
      data,
    });

    return res.status(200).json({ item: serializeCatalogItem(updated) });
  } catch (err) {
    console.error("Error updating catalog item", err);
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
