import type { NextApiRequest, NextApiResponse } from "next";
import { mockCreator, mockPacks } from "../../server/mockData";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    return res.status(200).json({ creator: mockCreator, packs: mockPacks });
  } catch (_err) {
    return res.status(500).json({ error: "Error loading creator data" });
  }
}
