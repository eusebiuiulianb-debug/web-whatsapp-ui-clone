import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma";
import { buildFanManagerSummary } from "../../../../server/manager/managerService";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const fanId = typeof req.query.fanId === "string" ? req.query.fanId : null;
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!fanId) return res.status(400).json({ error: "Missing fanId" });

  try {
    const summary = await buildFanManagerSummary("creator-1", fanId, prisma);
    return res.status(200).json(summary);
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return res.status(404).json({ error: "Fan not found" });
    }
    console.error("Error loading fan manager context", err);
    return res.status(500).json({ error: "Failed to load fan manager context" });
  }
}
