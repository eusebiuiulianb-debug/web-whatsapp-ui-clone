import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { buildManagerQueueForCreator, type FanManagerRow } from "../../../server/manager/managerService";

const DEFAULT_CREATOR_ID = "creator-1";

export default async function handler(req: NextApiRequest, res: NextApiResponse<FanManagerRow[] | { error: string }>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const queue = await buildManagerQueueForCreator(DEFAULT_CREATOR_ID, prisma);
    return res.status(200).json(queue);
  } catch (err) {
    console.error("Error loading manager queue", err);
    return res.status(500).json({ error: "Failed to load manager queue" });
  }
}
