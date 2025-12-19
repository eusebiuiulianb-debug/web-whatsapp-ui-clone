import type { NextApiRequest, NextApiResponse } from "next";
import { randomBytes } from "crypto";
import prisma from "../../../../lib/prisma.server";

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
    const token = await generateUniqueToken(fanId);
    const inviteUrl = `${baseUrl}/i/${token}`;
    return res.status(200).json({ ok: true, inviteUrl });
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

function generateToken(): string {
  const raw = randomBytes(32).toString("base64");
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function generateUniqueToken(fanId: string): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = generateToken();
    try {
      await prisma.fan.update({
        where: { id: fanId },
        data: {
          inviteToken: token,
          inviteCreatedAt: new Date(),
          inviteUsedAt: null,
        },
        select: { id: true },
      });
      return token;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2002") {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error("invite_token_collision");
}
