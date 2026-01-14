import type { NextApiRequest, NextApiResponse } from "next";
import { ChatPpvTier, ContentPack, ContentType, ContentVisibility, ExtraSlot, ExtraTier, TimeOfDay } from "@prisma/client";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";

function isValidEnum<T>(value: unknown, allowed: readonly T[]): value is T {
  return allowed.includes(value as T);
}

const EXTRA_SLOT_TO_TIME: Record<ExtraSlot, TimeOfDay> = {
  DAY_1: "DAY",
  DAY_2: "DAY",
  NIGHT_1: "NIGHT",
  NIGHT_2: "NIGHT",
  ANY: "ANY",
};

const TIME_TO_EXTRA_SLOT = (timeOfDay?: TimeOfDay | null): ExtraSlot | undefined => {
  if (!timeOfDay) return undefined;
  if (timeOfDay === "DAY") return "DAY_1";
  if (timeOfDay === "NIGHT") return "NIGHT_1";
  return "ANY";
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (typeof id !== "string") {
    return sendBadRequest(res, "Parámetro id inválido.");
  }

  if (req.method === "PUT") {
    try {
      const { title, description, type, pack, visibility, mediaPath, extraTier, timeOfDay, extraSlot, chatTier, defaultCopy } = req.body as {
        title?: string;
        description?: string;
        type?: ContentType;
        pack?: ContentPack;
        visibility?: ContentVisibility;
        mediaPath?: string;
        extraTier?: ExtraTier;
        timeOfDay?: TimeOfDay;
        extraSlot?: ExtraSlot;
        chatTier?: ChatPpvTier;
        defaultCopy?: string;
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
      const validExtraSlot = wantsExtraFields
        ? extraSlot == null || isValidEnum<ExtraSlot>(extraSlot, ["DAY_1", "DAY_2", "NIGHT_1", "NIGHT_2", "ANY"])
        : true;
      const validChatTier = wantsExtraFields
        ? chatTier == null || isValidEnum<ChatPpvTier>(chatTier, ["CHAT_T0", "CHAT_T1", "CHAT_T2", "CHAT_T3"])
        : true;

      if (!validExtraTier) {
        return sendBadRequest(res, "Invalid extraTier");
      }
      if (!validTimeOfDay) {
        return sendBadRequest(res, "Invalid timeOfDay");
      }
      if (!validExtraSlot) {
        return sendBadRequest(res, "Invalid extraSlot");
      }
      if (!validChatTier) {
        return sendBadRequest(res, "Invalid chatTier");
      }

      const hasDefaultCopy = typeof defaultCopy === "string";
      const normalizedDefaultCopy = hasDefaultCopy ? defaultCopy.trim() : "";
      const resolvedExtraSlot = wantsExtraFields ? extraSlot ?? TIME_TO_EXTRA_SLOT(timeOfDay) : undefined;
      const resolvedTimeOfDay = wantsExtraFields
        ? (resolvedExtraSlot ? EXTRA_SLOT_TO_TIME[resolvedExtraSlot] : timeOfDay)
        : undefined;

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
          extraSlot: wantsExtraFields
            ? resolvedExtraSlot ?? (extraSlot === null ? null : undefined)
            : null,
          chatTier: wantsExtraFields ? chatTier ?? undefined : undefined,
          defaultCopy: wantsExtraFields
            ? hasDefaultCopy
              ? normalizedDefaultCopy || null
              : undefined
            : null,
          timeOfDay: wantsExtraFields ? resolvedTimeOfDay ?? "ANY" : undefined,
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
