import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { fanId } = req.query;
  if (!fanId || typeof fanId !== "string") {
    return res.status(400).json({ error: "fanId is required" });
  }

  try {
    const fan = await prisma.fan.update({
      where: { id: fanId },
      data: { isBlocked: true },
    });
    return res.status(200).json({ ok: true, fan });
  } catch (err) {
    console.error("Error blocking chat", err);
    return res.status(500).json({ error: "BLOCK_FAILED" });
  }
}
