import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/prisma";
import { parseCookieHeader, readFanId, slugifyHandle } from "@/lib/fan/session";

type AccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "SPAM";

type AccessRequestPayload = {
  id: string;
  status: AccessRequestStatus;
  message: string;
  productId?: string | null;
  createdAt: string;
};

type AccessRequestResponse =
  | { ok: true; request: AccessRequestPayload | null; reused?: boolean }
  | { ok: false; error: { code: string; message: string }; retryAfterMs?: number };

const MAX_MESSAGE_LENGTH = 240;
const IDEMPOTENT_WINDOW_MS = 2 * 60 * 1000;

export default async function handler(req: NextApiRequest, res: NextApiResponse<AccessRequestResponse>) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    return handleGet(req, res);
  }

  if (req.method === "POST") {
    return handlePost(req, res);
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse<AccessRequestResponse>) {
  const creatorHandle = pickString((req.query as any)?.creatorHandle ?? (req.query as any)?.handle);
  const creatorId = pickString((req.query as any)?.creatorId);

  if (!creatorHandle && !creatorId) {
    return res.status(400).json({
      ok: false,
      error: { code: "CREATOR_REQUIRED", message: "Falta el creatorHandle." },
    });
  }

  try {
    const creator = await resolveCreator(creatorHandle, creatorId);
    if (!creator) {
      return res.status(404).json({
        ok: false,
        error: { code: "CREATOR_NOT_FOUND", message: "No se encontró el creador." },
      });
    }

    const fanId = readFanId(req, creatorHandle);
    if (!fanId) {
      return res.status(200).json({ ok: true, request: null });
    }

    const request = await prisma.accessRequest.findFirst({
      where: { fanId, creatorId: creator.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, message: true, productId: true, createdAt: true },
    });

    return res.status(200).json({ ok: true, request: request ? formatRequest(request) : null });
  } catch (err) {
    console.error("Error loading access request", err);
    return res.status(500).json({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "No se pudo cargar la solicitud." },
    });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse<AccessRequestResponse>) {
  const creatorHandle = pickString((req.body as any)?.creatorHandle ?? (req.body as any)?.handle);
  const creatorId = pickString((req.body as any)?.creatorId);
  if (!creatorHandle && !creatorId) {
    return res.status(400).json({
      ok: false,
      error: { code: "CREATOR_REQUIRED", message: "Falta el creatorHandle." },
    });
  }

  const message = typeof (req.body as any)?.message === "string" ? (req.body as any).message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      ok: false,
      error: { code: "MESSAGE_INVALID", message: "El mensaje debe tener entre 1 y 240 caracteres." },
    });
  }

  const productIdRaw = (req.body as any)?.productId;
  const refRaw = (req.body as any)?.ref;
  const productId =
    typeof refRaw?.productId === "string"
      ? refRaw.productId.trim()
      : typeof productIdRaw === "string"
      ? productIdRaw.trim()
      : null;

  try {
    const creator = await resolveCreator(creatorHandle, creatorId);
    if (!creator) {
      return res.status(404).json({
        ok: false,
        error: { code: "CREATOR_NOT_FOUND", message: "No se encontró el creador." },
      });
    }

    const previewHandle = readPreviewHandle(req.headers.cookie);
    if (previewHandle && previewHandle === slugifyHandle(creator.name || creatorHandle || "")) {
      return res.status(400).json({
        ok: false,
        error: { code: "SELF_REQUEST", message: "No puedes enviarte una solicitud a ti mismo." },
      });
    }

    const fanId = readFanId(req, creatorHandle);
    if (!fanId) {
      return res.status(401).json({
        ok: false,
        error: { code: "AUTH_REQUIRED", message: "Inicia sesión para enviar la solicitud." },
      });
    }

    const fan = await prisma.fan.findFirst({
      where: { id: fanId, creatorId: creator.id },
      select: { id: true, isBlocked: true },
    });
    if (!fan?.id) {
      return res.status(401).json({
        ok: false,
        error: { code: "AUTH_REQUIRED", message: "Inicia sesión para enviar la solicitud." },
      });
    }

    const block = await prisma.creatorFanBlock.findUnique({
      where: { creatorId_fanId: { creatorId: creator.id, fanId } },
      select: { id: true },
    });
    if (fan.isBlocked || block?.id) {
      return res.status(403).json({
        ok: false,
        error: { code: "BLOCKED", message: "No puedes enviar solicitudes a este creador." },
      });
    }

    const pending = await prisma.accessRequest.findFirst({
      where: { fanId, creatorId: creator.id, status: "PENDING" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, message: true, productId: true, createdAt: true, updatedAt: true },
    });

    if (pending) {
      const sameMessage = pending.message.trim() === message;
      const withinWindow = Date.now() - pending.updatedAt.getTime() < IDEMPOTENT_WINDOW_MS;
      if (sameMessage && withinWindow) {
        return res.status(200).json({ ok: true, reused: true, request: formatRequest(pending) });
      }

      const now = new Date();
      const preview = message.slice(0, 120);
      const time = now.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      const updated = await prisma.$transaction(async (tx) => {
        const nextRequest = await tx.accessRequest.update({
          where: { id: pending.id },
          data: {
            message,
            productId: productId || null,
          },
          select: { id: true, status: true, message: true, productId: true, createdAt: true },
        });
        await tx.fan.update({
          where: { id: fanId },
          data: {
            preview,
            time,
            lastMessageAt: now,
            lastActivityAt: now,
            lastInboundAt: now,
            isArchived: false,
          },
        });
        return nextRequest;
      });

      return res.status(200).json({ ok: true, request: formatRequest(updated) });
    }

    const now = new Date();
    const messageId = `${fanId}-${now.getTime()}`;
    const time = now.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const preview = message.slice(0, 120);

    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.accessRequest.create({
        data: {
          creatorId: creator.id,
          fanId,
          conversationId: fanId,
          productId: productId || null,
          message,
        },
        select: { id: true, status: true, message: true, productId: true, createdAt: true },
      });

      await tx.fan.update({
        where: { id: fanId },
        data: {
          preview,
          time,
          lastMessageAt: now,
          lastActivityAt: now,
          lastInboundAt: now,
          isArchived: false,
        },
      });

      await tx.message.create({
        data: {
          id: messageId,
          fanId,
          from: "fan",
          audience: "FAN",
          text: message,
          time,
          isLastFromCreator: false,
          type: "TEXT",
        },
      });

      return created;
    });

    return res.status(200).json({ ok: true, request: formatRequest(request) });
  } catch (err) {
    console.error("Error creating access request", err);
    return res.status(500).json({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "No se pudo enviar la solicitud." },
    });
  }
}

function formatRequest(request: {
  id: string;
  status: AccessRequestStatus;
  message: string;
  productId: string | null;
  createdAt: Date;
}): AccessRequestPayload {
  return {
    id: request.id,
    status: request.status,
    message: request.message,
    productId: request.productId,
    createdAt: request.createdAt.toISOString(),
  };
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function resolveCreator(handle?: string | null, creatorId?: string | null) {
  if (creatorId) {
    return prisma.creator.findUnique({
      where: { id: creatorId },
      select: { id: true, name: true },
    });
  }
  if (!handle) return null;
  const creators = await prisma.creator.findMany({ select: { id: true, name: true } });
  const normalized = slugifyHandle(handle);
  return creators.find((creator) => slugifyHandle(creator.name) === normalized) || null;
}

function readPreviewHandle(cookieHeader: string | undefined) {
  if (!cookieHeader) return "";
  const cookies = parseCookieHeader(cookieHeader);
  const value = cookies["novsy_creator_preview"] || "";
  return value ? slugifyHandle(value) : "";
}
