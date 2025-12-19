import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "./prisma.server";

type FanEntryMode = "go" | "public";

type FanEntryParams = {
  handle: string;
  req: Pick<NextApiRequest, "headers">;
  res: Pick<NextApiResponse, "getHeader" | "setHeader">;
  mode?: FanEntryMode;
};

type FanEntryResult = {
  fanId: string;
  creatorId: string;
  handle: string;
  isNew: boolean;
};

const FAN_COOKIE_PREFIX = "novsy_fan_";
const FAN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function createOrResumeFanForHandle(params: FanEntryParams): Promise<FanEntryResult> {
  const { handle, req, res, mode = "go" } = params;
  const creators = await prisma.creator.findMany();
  const match = resolveCreatorByHandle(creators, handle);
  if (!match) {
    throw new Error("creator_not_found");
  }

  const resolvedHandle = slugify(match.name || handle || "creator");
  const cookieName = `${FAN_COOKIE_PREFIX}${resolvedHandle}`;
  const cookies = parseCookieHeader(req.headers?.cookie);
  const existingFanId = cookies[cookieName];

  if (existingFanId) {
    const existingFan = await prisma.fan.findFirst({
      where: { id: existingFanId, creatorId: match.id },
      select: { id: true },
    });
    if (existingFan?.id) {
      return { fanId: existingFan.id, creatorId: match.id, handle: resolvedHandle, isNew: false };
    }
  }

  const fanId = `fan-${Date.now()}`;
  await prisma.fan.create({
    data: {
      id: fanId,
      name: "Invitado",
      creatorId: match.id,
      source: mode,
      handle: resolvedHandle,
      isNew: true,
    },
  });

  setFanCookie(res, cookieName, fanId);
  return { fanId, creatorId: match.id, handle: resolvedHandle, isNew: true };
}

function resolveCreatorByHandle(creators: Array<{ id: string; name: string | null }>, handle: string) {
  if (!creators || creators.length === 0) return null;
  const normalizedHandle = slugify(handle || "");
  return creators.find((creator) => slugify(creator.name || "") === normalizedHandle) || creators[0];
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) return acc;
    const key = decodeURIComponent(rawKey);
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function setFanCookie(res: Pick<NextApiResponse, "getHeader" | "setHeader">, name: string, value: string) {
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookieValue = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${FAN_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secureFlag}`;

  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookieValue]);
    return;
  }
  res.setHeader("Set-Cookie", [existing as string, cookieValue]);
}
