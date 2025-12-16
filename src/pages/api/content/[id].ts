import type { NextApiRequest, NextApiResponse } from "next";
import { ContentPack, ContentType, ContentVisibility, ExtraTier, TimeOfDay } from "@prisma/client";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";

function isValidEnum<T>(value: unknown, allowed: readonly T[]): value is T {
  return allowed.includes(value as T);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (typeof id !== "string") {
    return sendBadRequest(res, "Parámetro id inválido.");
  }

  if (req.method === "PUT") {
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
        return sendBadRequest(res, "Faltan campos obligatorios: title, type, pack, visibility y mediaPath.");
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

      const updated = await prisma.contentItem.update({
        where: { id },
        data: {
          title,
          description: description ?? "",
          type,
          pack,
          visibility,
          mediaPath,
          extraTier: wantsExtraFields ? extraTier ?? "T1" : undefined,
          timeOfDay: wantsExtraFields ? timeOfDay ?? "ANY" : undefined,
        },
      });

      return res.status(200).json({ item: updated });
    } catch (error) {
      console.error("Error en PUT /api/content/[id]", error);
      return sendServerError(res, "No se pudo actualizar el contenido.");
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
      return sendServerError(res, "No se pudo eliminar el contenido.");
    }
  }

  res.setHeader("Allow", ["PUT", "DELETE"]);
  return res.status(405).json({ error: `Method ${req.method} Not Allowed en /api/content/[id]` });
}
