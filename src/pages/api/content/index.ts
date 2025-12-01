import type { NextApiRequest, NextApiResponse } from "next";
import type { ContentPack, ContentType, ContentVisibility, Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
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
      const contentItemDelegate = prisma.contentItem;
      if (!contentItemDelegate || typeof contentItemDelegate.findMany !== "function") {
        throw new Error("ContentItem delegate missing on Prisma client instance");
      }

      const items = await contentItemDelegate.findMany({
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
        select: { contentItemId: true },
      });

      const sentSet = new Set<string>();
      for (const msg of sentMessages) {
        if (msg.contentItemId) sentSet.add(msg.contentItemId);
      }

      const itemsWithFlag = items.map((item) => ({
        ...item,
        hasBeenSentToFan: sentSet.has(item.id),
      }));

      return res.status(200).json({ items: itemsWithFlag });
    } catch (error) {
      console.error("Error fetching content items", error);
      return res.status(500).json({ error: "Error fetching contents" });
    }
  }

  if (req.method === "POST") {
    try {
      const { title, description, type, pack, visibility, mediaPath } = req.body as {
        title?: string;
        description?: string;
        type?: ContentType;
        pack?: ContentPack;
        visibility?: ContentVisibility;
        mediaPath?: string;
      };

      if (!title || !type || !pack || !visibility || !mediaPath) {
        return res.status(400).json({
          error: "Faltan campos obligatorios: title, type, pack, visibility y mediaPath son requeridos.",
        });
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
        },
      });

      return res.status(201).json(created);
    } catch (error) {
      console.error("Error en POST /api/content", error);
      return res.status(500).json({
        error: "No se pudo crear el contenido. Revisa la consola del servidor.",
      });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: `Method ${req.method} Not Allowed en /api/content` });
}
