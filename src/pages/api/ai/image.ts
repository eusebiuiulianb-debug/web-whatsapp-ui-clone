import type { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { parseOpenAiError } from "../../../server/ai/openAiError";

type ImagePurpose = "AVATAR" | "COVER";
type ImageSize = "1024x1024" | "1024x1792" | "1792x1024";

const CREATOR_ID = "creator-1";
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimits = new Map<string, number[]>();

function normalizeSize(purpose: ImagePurpose, size?: string | null): ImageSize {
  const allowed: ImageSize[] = ["1024x1024", "1024x1792", "1792x1024"];
  if (size && allowed.includes(size as ImageSize)) {
    return size as ImageSize;
  }
  return purpose === "COVER" ? "1792x1024" : "1024x1024";
}

function isRateLimited(creatorId: string): boolean {
  const now = Date.now();
  const existing = rateLimits.get(creatorId) || [];
  const filtered = existing.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (filtered.length >= RATE_LIMIT_MAX) {
    rateLimits.set(creatorId, filtered);
    return true;
  }
  filtered.push(now);
  rateLimits.set(creatorId, filtered);
  return false;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, purpose, size } = (req.body || {}) as {
    prompt?: string;
    purpose?: ImagePurpose;
    size?: ImageSize;
  };

  const trimmedPrompt = typeof prompt === "string" ? prompt.trim() : "";
  if (trimmedPrompt.length < 10) {
    return sendBadRequest(res, "prompt must be at least 10 characters");
  }
  if (purpose !== "AVATAR" && purpose !== "COVER") {
    return sendBadRequest(res, "purpose must be AVATAR or COVER");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return sendBadRequest(res, "Missing OPENAI_API_KEY");
  }

  const creator = await prisma.creator.findUnique({ where: { id: CREATOR_ID } });
  if (!creator) {
    return res.status(401).json({ error: "Creator not authorized" });
  }

  if (isRateLimited(CREATOR_ID)) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  const imageSize = normalizeSize(purpose, size);
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const payload = {
    model,
    prompt: trimmedPrompt,
    size: imageSize,
    n: 1,
    response_format: "b64_json",
  };

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorInfo = await parseOpenAiError(response, { creatorId: CREATOR_ID });
      console.warn("openai_image_error", {
        status: errorInfo.status,
        code: errorInfo.code ?? "openai_error",
        message: "[redacted]",
      });
      return res.status(502).json({ error: errorInfo.code ?? "openai_error" });
    }

    const data = (await response.json()) as any;
    const b64 = data?.data?.[0]?.b64_json;
    if (typeof b64 !== "string" || b64.length === 0) {
      return sendServerError(res, "Invalid image response");
    }

    const buffer = Buffer.from(b64, "base64");
    const assetId = crypto.randomUUID();
    const fileName = `${assetId}.png`;
    const outputDir = path.join(process.cwd(), "public", "generated");
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, fileName), buffer);
    // Dev note: assets are stored locally under /public/generated; production should use object storage.
    const url = `/generated/${fileName}`;

    await prisma.generatedAsset.create({
      data: {
        id: assetId,
        creatorId: CREATOR_ID,
        purpose,
        prompt: trimmedPrompt,
        url,
      },
    });

    return res.status(200).json({ url });
  } catch (err) {
    console.error("Error generating image", err);
    return sendServerError(res, "Failed to generate image");
  }
}
