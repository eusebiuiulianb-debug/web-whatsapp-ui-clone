import type { NextApiRequest, NextApiResponse } from "next";
import { createInviteTokenForFan } from "../../../../utils/createInviteToken";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const fanId = typeof req.query.fanId === "string" ? req.query.fanId.trim() : "";
  if (!fanId) {
    return res.status(400).json({ ok: false, error: "fanId is required" });
  }

  const baseUrl = getBaseUrl(req);
  if (!baseUrl) {
    return res.status(400).json({ ok: false, error: "missing_host" });
  }

  try {
    const inviteToken = await createInviteTokenForFan(fanId);
    const inviteUrl = `${baseUrl}/i/${inviteToken}`;
    return res.status(200).json({ ok: true, inviteUrl, inviteToken });
  } catch (error) {
    console.error("Error generating invite link", error);
    return res.status(500).json({ ok: false, error: "Error generating invite link" });
  }
}

function getBaseUrl(req: NextApiRequest): string | null {
  const host = req.headers.host;
  if (!host) return null;
  const protoHeader = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  const scheme = proto || "http";
  return `${scheme}://${host}`;
}
