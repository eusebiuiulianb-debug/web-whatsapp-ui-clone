import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { slugifyHandle } from "../../../lib/fan/session";

const TARGET_COUNT = 16;
const DEMO_CREATOR_HANDLE = "eusebiu";
const DEMO_CREATOR_ID = "creator-1";
const DEMO_TITLE_PREFIX = "PopClip demo";
const LEGACY_CAPTION_SNIPPET = "PopClip demo para explorar el feed de IntimiPop";
const DEMO_VIDEO_URL = "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

type SeedPayload = {
  ok: boolean;
  count?: number;
  createdIds?: string[];
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<SeedPayload>) {
  const isProd = process.env.NODE_ENV === "production";
  const isDev = process.env.NODE_ENV === "development";
  const allowDevSeed = process.env.ALLOW_DEV_SEED === "true";
  if (isProd || (!isDev && !allowDevSeed)) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const creator = await prisma.creator.findFirst({
      where: {
        OR: [{ handle: DEMO_CREATOR_HANDLE }, { id: DEMO_CREATOR_ID }],
      },
    });
    if (!creator) {
      return res.status(400).json({ ok: false, error: "Demo creator not found" });
    }

    await prisma.creatorProfile.upsert({
      where: { creatorId: creator.id },
      update: { visibilityMode: "PUBLIC", availability: "AVAILABLE", responseSla: "LT_24H", vipOnly: false },
      create: { creatorId: creator.id, visibilityMode: "PUBLIC", availability: "AVAILABLE", responseSla: "LT_24H" },
    });

    const existingDemo = await prisma.popClip.findMany({
      where: {
        OR: [
          { title: { startsWith: DEMO_TITLE_PREFIX } },
          { caption: { contains: LEGACY_CAPTION_SNIPPET } },
        ],
      },
      select: { id: true, catalogItemId: true },
    });

    const existingIds = existingDemo.map((clip) => clip.id);
    const catalogItemIds = existingDemo
      .map((clip) => clip.catalogItemId)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);

    if (existingIds.length > 0) {
      await prisma.popClip.deleteMany({ where: { id: { in: existingIds } } });
    }
    if (catalogItemIds.length > 0) {
      await prisma.catalogItem.deleteMany({ where: { id: { in: catalogItemIds } } });
    }

    const createdIds: string[] = [];
    const handle = (creator.handle || slugifyHandle(creator.name || "creator")).trim();

    for (let i = 0; i < TARGET_COUNT; i += 1) {
      const label = `${DEMO_TITLE_PREFIX} ${i + 1}`;
      const caption =
        "PopClip demo para explorar el feed de IntimiPop. Clips breves, directos y listos para abrir chat.";
      const posterUrl = `https://picsum.photos/seed/intimipop-${handle}-${i + 1}/600/800`;

      const catalogItem = await prisma.catalogItem.create({
        data: {
          creatorId: creator.id,
          type: "PACK",
          title: `${label} · ${creator.name || "Creador"}`,
          description: "Demo para explorar el feed.",
          priceCents: 499,
          currency: "EUR",
          isActive: true,
          isPublic: true,
          sortOrder: i,
        },
      });

      const createdClip = await prisma.popClip.create({
        data: {
          creatorId: creator.id,
          catalogItemId: catalogItem.id,
          title: label,
          caption,
          videoUrl: DEMO_VIDEO_URL,
          posterUrl,
          durationSec: 18 + (i % 6) * 4,
          isActive: true,
          isArchived: false,
          isStory: false,
          sortOrder: i,
        },
        select: { id: true },
      });
      createdIds.push(createdClip.id);
    }

    return res.status(200).json({ ok: true, count: createdIds.length, createdIds });
  } catch (err) {
    console.error("Error seeding popclips", err);
    return res.status(500).json({ ok: false, error: "Seed failed" });
  }
}
