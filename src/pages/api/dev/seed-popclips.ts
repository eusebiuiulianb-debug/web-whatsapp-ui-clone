import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { slugifyHandle } from "../../../lib/fan/session";

const TARGET_COUNT = 16;
const MAX_CREATORS = 4;
const DEMO_VIDEO_URL = "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV !== "development") {
    return res.status(404).json({ error: "Not found" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const creators = await prisma.creator.findMany({ take: MAX_CREATORS });
    if (!creators.length) {
      return res.status(400).json({ error: "No creators available" });
    }

    await Promise.all(
      creators.map((creator) =>
        prisma.creatorProfile.upsert({
          where: { creatorId: creator.id },
          update: { visibilityMode: "PUBLIC", availability: "AVAILABLE", responseSla: "LT_24H", vipOnly: false },
          create: { creatorId: creator.id, visibilityMode: "PUBLIC", availability: "AVAILABLE", responseSla: "LT_24H" },
        })
      )
    );

    const existingCount = await prisma.popClip.count({
      where: { isActive: true, isArchived: false, isStory: false },
    });
    if (existingCount >= TARGET_COUNT) {
      return res.status(200).json({ ok: true, created: 0 });
    }

    const toCreate = Math.max(0, TARGET_COUNT - existingCount);
    let created = 0;

    for (let i = 0; i < toCreate; i += 1) {
      const creator = creators[i % creators.length];
      const handle = slugifyHandle(creator.name || "creator");
      const label = `PopClip demo ${created + 1}`;
      const caption =
        "PopClip demo para explorar el feed de IntimiPop. Clips breves, directos y listos para abrir chat.";
      const posterUrl = `https://picsum.photos/seed/intimipop-${handle}-${created + 1}/600/800`;

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
          sortOrder: 0,
        },
      });

      await prisma.popClip.create({
        data: {
          creatorId: creator.id,
          catalogItemId: catalogItem.id,
          title: label,
          caption,
          videoUrl: DEMO_VIDEO_URL,
          posterUrl,
          durationSec: 18 + (created % 6) * 4,
          isActive: true,
          isArchived: false,
          isStory: false,
          sortOrder: 0,
        },
      });

      created += 1;
    }

    return res.status(200).json({ ok: true, created });
  } catch (err) {
    console.error("Error seeding popclips", err);
    return res.status(500).json({ error: "Seed failed" });
  }
}
