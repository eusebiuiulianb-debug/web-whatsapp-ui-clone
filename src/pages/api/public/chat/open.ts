import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma.server";
import { ensureFan, slugifyHandle } from "../../../../lib/fan/session";
import { enforceRateLimit } from "../../../../lib/rateLimit";

type ChatOpenResponse =
  | { ok: true; redirectUrl: string; fanId: string }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ChatOpenResponse>) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const creatorHandle = typeof req.body?.creatorHandle === "string" ? req.body.creatorHandle.trim() : "";
  const creatorId = typeof req.body?.creatorId === "string" ? req.body.creatorId.trim() : "";
  if (!creatorHandle && !creatorId) {
    return res.status(400).json({ ok: false, error: "creatorHandle or creatorId is required" });
  }
  const queryReturnTo = typeof req.query?.returnTo === "string" ? req.query.returnTo.trim() : "";
  const bodyReturnTo = typeof req.body?.returnTo === "string" ? req.body.returnTo.trim() : "";
  const rawReturnTo = queryReturnTo || bodyReturnTo;
  const safeReturnTo = rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : "";

  try {
    const creator = creatorId
      ? await prisma.creator.findUnique({ where: { id: creatorId }, select: { id: true, name: true } })
      : await resolveCreatorByHandle(creatorHandle);

    if (!creator) {
      return res.status(404).json({ ok: false, error: "creator_not_found" });
    }

    const { fanId } = await ensureFan(req, res, {
      creatorId: creator.id,
      creatorHandle: creator.name || creatorHandle,
      mode: "public",
    });

    const allowed = await enforceRateLimit({
      req,
      res,
      fanId,
      endpoint: "POST /api/public/chat/open",
      burst: { limit: 8, windowSeconds: 10 },
      cooldownMs: 3000,
    });
    if (!allowed) return;

    const draft = typeof req.body?.draft === "string" ? req.body.draft.trim() : "";
    let redirectUrl = draft ? `/fan/${fanId}?draft=${encodeURIComponent(draft)}` : `/fan/${fanId}`;
    if (safeReturnTo) {
      redirectUrl = `${redirectUrl}${redirectUrl.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(
        safeReturnTo
      )}`;
    }
    return res.status(200).json({ ok: true, redirectUrl, fanId });
  } catch (err) {
    console.error("Error opening public chat", err);
    return res.status(500).json({ ok: false, error: "open_chat_failed" });
  }
}

async function resolveCreatorByHandle(handle: string) {
  const normalized = slugifyHandle(handle);
  const creators = await prisma.creator.findMany({ select: { id: true, name: true } });
  return creators.find((creator) => slugifyHandle(creator.name) === normalized) || null;
}
