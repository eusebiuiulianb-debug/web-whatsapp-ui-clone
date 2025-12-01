import type { NextApiRequest, NextApiResponse } from "next";
import { ContentPack, ContentType, ContentVisibility } from "@prisma/client";
import prisma from "../../../lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (typeof id !== "string") {
    return res.status(400).json({ error: "Parámetro id inválido." });
  }

  if (req.method === "PUT") {
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
          error: "Faltan campos obligatorios: title, type, pack, visibility y mediaPath.",
        });
      }

      const updated = await prisma.contentItem.update({
        where: { id },
        data: {
          title,
          description: description ?? "",
          type,
          pack,
          visibility,
          mediaPath,
        },
      });

      return res.status(200).json(updated);
    } catch (error) {
      console.error("Error en PUT /api/content/[id]", error);
      return res.status(500).json({ error: "No se pudo actualizar el contenido." });
    }
  }

  if (req.method === "DELETE") {
    try {
      await prisma.contentItem.delete({
        where: { id },
      });

      return res.status(204).end();
    } catch (error) {
      console.error("Error en DELETE /api/content/[id]", error);
      return res.status(500).json({ error: "No se pudo eliminar el contenido." });
    }
  }

  res.setHeader("Allow", ["PUT", "DELETE"]);
  return res.status(405).json({ error: `Method ${req.method} Not Allowed en /api/content/[id]` });
}
