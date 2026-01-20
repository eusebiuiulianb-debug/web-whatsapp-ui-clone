import type { ServerResponse } from "http";
import type { NextApiRequest } from "next";
import prisma from "./prisma.server";
import { buildFanCookieName, parseCookieHeader, setFanCookie, slugifyHandle } from "./fan/session";

type FanEntryMode = "go" | "public";

type FanEntryParams = {
  handle: string;
  req: Pick<NextApiRequest, "headers">;
  res: Pick<ServerResponse, "getHeader" | "setHeader">;
  mode?: FanEntryMode;
};

type FanEntryResult = {
  fanId: string;
  creatorId: string;
  handle: string;
  isNew: boolean;
};

export async function createOrResumeFanForHandle(params: FanEntryParams): Promise<FanEntryResult> {
  const { handle, req, res, mode = "go" } = params;
  const creators = await prisma.creator.findMany();
  const match = resolveCreatorByHandle(creators, handle);
  if (!match) {
    throw new Error("creator_not_found");
  }

  const resolvedHandle = slugifyHandle(match.name || handle || "creator");
  const cookies = parseCookieHeader(req.headers?.cookie);
  const existingFanId = cookies[buildFanCookieName(resolvedHandle)];

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

  setFanCookie(res, resolvedHandle, fanId);
  return { fanId, creatorId: match.id, handle: resolvedHandle, isNew: true };
}

export function setFanCookieForHandle(
  res: Pick<ServerResponse, "getHeader" | "setHeader">,
  handle: string,
  fanId: string
) {
  const resolvedHandle = slugifyHandle(handle || "creator");
  setFanCookie(res, resolvedHandle, fanId);
}

function resolveCreatorByHandle(creators: Array<{ id: string; name: string | null }>, handle: string) {
  if (!creators || creators.length === 0) return null;
  const normalizedHandle = slugifyHandle(handle || "");
  return creators.find((creator) => slugifyHandle(creator.name || "") === normalizedHandle) || creators[0];
}
