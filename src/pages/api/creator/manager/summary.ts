import type { NextApiRequest, NextApiResponse } from "next";
import { getCreatorManagerSummary, type CreatorManagerSummary } from "../../../../lib/creatorManager";

const DEFAULT_CREATOR_ID = "creator-1";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreatorManagerSummary | { error: string }>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const summary = await getCreatorManagerSummary(DEFAULT_CREATOR_ID);
    return res.status(200).json(summary);
  } catch (err) {
    console.error("Error loading creator manager summary", err);
    return res.status(500).json({ error: "Failed to load creator manager summary" });
  }
}
