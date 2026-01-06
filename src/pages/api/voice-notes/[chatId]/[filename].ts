import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import fs from "fs";
import prisma from "../../../../lib/prisma.server";

const MAX_SEGMENT_LENGTH = 200;

function isSafeSegment(value: string) {
  if (!value || value.length > MAX_SEGMENT_LENGTH) return false;
  return !value.includes("/") && !value.includes("\\") && value.trim().length > 0;
}

function isSafeFilename(value: string) {
  if (!isSafeSegment(value)) return false;
  return /^[a-zA-Z0-9._-]+$/.test(value);
}

function resolveMimeFromName(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".mp4") return "audio/mp4";
  return "audio/webm";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end("Method Not Allowed");
  }

  const chatId = typeof req.query.chatId === "string" ? req.query.chatId.trim() : "";
  const filename = typeof req.query.filename === "string" ? req.query.filename.trim() : "";
  if (!isSafeSegment(chatId) || !isSafeFilename(filename)) {
    return res.status(400).end("Invalid request");
  }

  const filePath = path.join(process.cwd(), "public", "uploads", "voice-notes", chatId, filename);
  let stat;
  try {
    stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      return res.status(404).end("Not found");
    }
  } catch (_err) {
    return res.status(404).end("Not found");
  }

  const publicAudioUrl = `/uploads/voice-notes/${chatId}/${filename}`;
  const apiAudioUrl = `/api/voice-notes/${chatId}/${filename}`;
  let mimeType = "";
  try {
    const message = await prisma.message.findFirst({
      where: {
        audioUrl: apiAudioUrl,
      },
      select: { audioMime: true },
    });
    if (message?.audioMime) {
      mimeType = message.audioMime;
    } else {
      const legacy = await prisma.message.findFirst({
        where: { audioUrl: publicAudioUrl },
        select: { audioMime: true },
      });
      if (legacy?.audioMime) {
        mimeType = legacy.audioMime;
      }
    }
  } catch (_err) {
    mimeType = "";
  }
  if (!mimeType) {
    mimeType = resolveMimeFromName(filename);
  }

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Accept-Ranges", "bytes");

  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.setHeader("Content-Range", `bytes */${stat.size}`);
      return res.status(416).end();
    }
    const start = match[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
      res.setHeader("Content-Range", `bytes */${stat.size}`);
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    res.setHeader("Content-Length", String(end - start + 1));
    if (req.method === "HEAD") {
      return res.end();
    }
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.status(200);
  res.setHeader("Content-Length", String(stat.size));
  if (req.method === "HEAD") {
    return res.end();
  }
  fs.createReadStream(filePath).pipe(res);
}
