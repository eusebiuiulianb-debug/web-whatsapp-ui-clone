import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { setAdultAccessCookie } from "../../../lib/adultGate";
import { readFanId } from "../../../lib/fan/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    setAdultAccessCookie(res);
    const fanId = readFanId(req);
    if (fanId) {
      await prisma.fan.update({
        where: { id: fanId },
        data: { adultConfirmedAt: new Date(), adultConfirmVersion: "cookie" },
      });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error confirming adult access", err);
    return res.status(500).json({ ok: false, error: "adult_confirm_failed" });
  }
}
