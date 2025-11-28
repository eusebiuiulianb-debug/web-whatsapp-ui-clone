import type { NextApiRequest, NextApiResponse } from "next";
import { mockFans } from "../../server/mockData";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    return res.status(200).json({ fans: mockFans });
  } catch (_err) {
    return res.status(500).json({ error: "Error loading fans data" });
  }
}
