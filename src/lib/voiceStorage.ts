import crypto from "crypto";
import path from "path";
import fs from "fs/promises";

const MIME_EXTENSION_MAP: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
};

function normalizeMimeType(value: string) {
  return value.split(";")[0].trim().toLowerCase();
}

function sanitizeFanId(fanId: string) {
  return fanId.replace(/[^a-zA-Z0-9_-]/g, "");
}

function createFileToken() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

export async function saveVoice({
  fanId,
  bytes,
  mimeType,
}: {
  fanId: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<{ url: string; relPath: string }> {
  const safeFanId = sanitizeFanId(fanId);
  if (!safeFanId) {
    throw new Error("invalid_fan_id");
  }
  const normalizedMime = normalizeMimeType(mimeType);
  const ext = MIME_EXTENSION_MAP[normalizedMime];
  if (!ext) {
    throw new Error("unsupported_mime");
  }
  const token = createFileToken();
  const fileName = `${token}.${ext}`;
  const relPath = path.posix.join("uploads", "voice", safeFanId, fileName);
  const targetDir = path.join(process.cwd(), "public", "uploads", "voice", safeFanId);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(path.join(targetDir, fileName), bytes);
  return { url: `/${relPath}`, relPath };
}
