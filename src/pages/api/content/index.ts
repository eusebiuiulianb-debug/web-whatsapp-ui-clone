import type { NextApiRequest, NextApiResponse } from "next";
import type { ContentPack, ContentType, ContentVisibility, ExtraTier, Prisma, TimeOfDay } from "@prisma/client";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { isVisibleToFan } from "../../../lib/messageAudience";

function isValidEnum<T>(value: unknown, allowed: readonly T[]): value is T {
  return allowed.includes(value as T);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }

  if (req.method === "POST") {
    return handlePost(req, res);
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: `Method ${req.method} Not Allowed en /api/content` });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { fanId } = req.query;
  const fanIdStr = typeof fanId === "string" ? fanId : undefined;

  const where: Prisma.ContentItemWhereInput = {};
  if (typeof req.query.creatorId === "string") {
    where.creatorId = req.query.creatorId;
  }
  if (typeof req.query.pack === "string") {
    where.pack = req.query.pack as Prisma.ContentItemWhereInput["pack"];
  }

  try {
    const items = await prisma.contentItem.findMany({
      where,
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    if (!fanIdStr) {
      return res.status(200).json({ items });
    }

    const sentMessages = await prisma.message.findMany({
      where: {
        fanId: fanIdStr,
        type: "CONTENT",
        contentItemId: { not: null },
      },
      select: { contentItemId: true, from: true, audience: true },
    });

    const sentSet = new Set<string>();
    for (const msg of sentMessages) {
      if (!msg.contentItemId) continue;
      if (!isVisibleToFan(msg)) continue;
      sentSet.add(msg.contentItemId);
    }

    const itemsWithFlag = items.map((item) => ({
      ...item,
      hasBeenSentToFan: sentSet.has(item.id),
    }));

    return res.status(200).json({ items: itemsWithFlag });
  } catch (error) {
    console.error("Error fetching content items", error);
    return sendServerError(res, "Error fetching contents");
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { title, description, type, pack, visibility, mediaPath, extraTier, timeOfDay } = req.body as {
      title?: string;
      description?: string;
      type?: ContentType;
      pack?: ContentPack;
      visibility?: ContentVisibility;
      mediaPath?: string;
      extraTier?: ExtraTier;
      timeOfDay?: TimeOfDay;
    };

    if (!title || !type || !pack || !visibility || !mediaPath) {
      return sendBadRequest(res, "Faltan campos obligatorios: title, type, pack, visibility y mediaPath son requeridos.");
    }

    if (
      !isValidEnum<ContentType>(type, ["IMAGE", "VIDEO", "AUDIO", "TEXT"]) ||
      !isValidEnum<ContentPack>(pack, ["WELCOME", "MONTHLY", "SPECIAL"]) ||
      !isValidEnum<ContentVisibility>(visibility, ["INCLUDED_MONTHLY", "VIP", "EXTRA"])
    ) {
      return sendBadRequest(res, "Valores inválidos para type/pack/visibility.");
    }

    const wantsExtraFields = visibility === "EXTRA";
    const validExtraTier = wantsExtraFields ? isValidEnum<ExtraTier>(extraTier, ["T0", "T1", "T2", "T3"]) : true;
    const validTimeOfDay = wantsExtraFields ? isValidEnum<TimeOfDay>(timeOfDay, ["ANY", "DAY", "NIGHT"]) : true;

    if (!validExtraTier) {
      return sendBadRequest(res, "Invalid extraTier");
    }
    if (!validTimeOfDay) {
      return sendBadRequest(res, "Invalid timeOfDay");
    }

    const creatorId = "creator-1";

    const created = await prisma.contentItem.create({
      data: {
        title,
        description: description ?? "",
        type,
        pack,
        visibility,
        mediaPath,
        creatorId,
        isPreview: false,
        extraTier: wantsExtraFields ? extraTier ?? "T1" : undefined,
        timeOfDay: wantsExtraFields ? timeOfDay ?? "ANY" : undefined,
      },
    });

    return res.status(201).json({ item: created });
  } catch (error) {
    console.error("Error en POST /api/content", error);
    return sendServerError(res, "No se pudo crear el contenido.");
  }
}
