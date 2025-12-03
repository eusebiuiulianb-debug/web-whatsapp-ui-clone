import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../lib/prisma";
import { sendServerError } from "../../lib/apiError";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const creator = await prisma.creator.findUnique({
      where: { id: "creator-1" },
      include: { packs: true },
    }) || (await prisma.creator.findFirst({ include: { packs: true } }));

    if (!creator) {
      return res.status(404).json({ error: "Creator not found" });
    }

    const mappedCreator = {
      id: creator.id,
      name: creator.name,
      subtitle: creator.subtitle,
      description: creator.description,
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
