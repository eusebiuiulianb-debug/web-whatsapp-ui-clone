import { randomBytes } from "crypto";
import prisma from "../lib/prisma.server";

function generateToken(): string {
  const raw = randomBytes(32).toString("base64");
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createInviteTokenForFan(fanId: string): Promise<string> {
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
