import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { readFanId } from "../../../lib/fan/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fanId = readFanId(req);
  if (!fanId) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  try {
    const totalCount = await prisma.savedItem.count({ where: { userId: fanId } });
    return res.status(200).json({ totalCount });
  } catch (err) {
    console.error("Error loading saved summary", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
