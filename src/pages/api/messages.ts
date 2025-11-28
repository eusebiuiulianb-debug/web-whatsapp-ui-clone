import type { NextApiRequest, NextApiResponse } from "next";
import { mockMessagesByFanId } from "../../server/mockData";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { fanId } = req.query;

  if (!fanId || typeof fanId !== "string") {
    return res.status(400).json({ error: "fanId is required" });
  }

  const messages = mockMessagesByFanId[fanId];

  if (!messages) {
    return res.status(404).json({ error: "Fan not found" });
  }

  return res.status(200).json({ messages });
}
