import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";

const CREATOR_ID = process.env.CREATOR_ID ?? "creator-1";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") return handleGet(res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(res: NextApiResponse) {
  try {
    const links = await prisma.campaignLink.findMany({
      where: { creatorId: CREATOR_ID },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return res.status(200).json({
      links: links.map((l) => ({ ...l, utmTerm: l.utmTerm ?? null, createdAt: l.createdAt.toISOString() })),
    });
  } catch (err) {
    console.error("Error fetching campaign links", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { platform, utmSource, utmMedium, utmCampaign, utmContent, utmTerm } = req.body || {};
    if (!platform || !utmSource || !utmMedium || !utmCampaign || !utmContent) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const link = await prisma.campaignLink.create({
      data: {
        creatorId: CREATOR_ID,
        platform: String(platform),
        utmSource: String(utmSource).toLowerCase(),
        utmMedium: String(utmMedium).toLowerCase(),
        utmCampaign: String(utmCampaign).trim(),
        utmContent: String(utmContent).trim(),
        utmTerm: utmTerm ? String(utmTerm).trim() : null,
      },
    });

    return res.status(200).json({ link: { ...link, createdAt: link.createdAt.toISOString() } });
  } catch (err) {
    console.error("Error creating campaign link", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
