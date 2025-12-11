import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";
import { AI_TURN_MODES, type AiTurnMode } from "../../../lib/aiTemplateTypes";
import { normalizeAiBaseTone, normalizeAiTurnMode } from "../../../lib/aiSettings";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }

  if (req.method === "POST") {
    return handlePost(req, res);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const creatorId = await resolveCreatorId();

    let settings = await prisma.creatorAiSettings.findUnique({
      where: { creatorId },
    });

    if (!settings) {
      settings = await prisma.creatorAiSettings.create({
        data: { creatorId },
      });
    }

    return res.status(200).json({ settings });
  } catch (err) {
    console.error("Error loading creator AI settings", err);
    if (err instanceof Error && err.message === "Creator not found") {
      return res.status(404).json({ error: "Creator not found" });
    }
    return sendServerError(res, "Error loading AI settings");
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendBadRequest(res, "Payload must be an object");
  }

  const {
    tone,
    spicinessLevel,
    formalityLevel,
    emojiUsage,
    priorityOrderJson,
    forbiddenTopics,
    forbiddenPromises,
    rulesManifest,
    allowSuggestReplies,
    allowSuggestExtras,
    allowSuggestRenewals,
    allowAutoLowPriority,
    creditsAvailable,
    hardLimitPerDay,
    turnMode,
  } = body as Record<string, unknown>;

  const updateData: Prisma.CreatorAiSettingsUncheckedUpdateInput = {};
  const createData: Partial<Prisma.CreatorAiSettingsUncheckedCreateInput> = {};

  if (tone !== undefined) {
    if (typeof tone !== "string") return sendBadRequest(res, "tone must be a string");
    const normalizedTone = normalizeAiBaseTone(tone);
    updateData.tone = normalizedTone as any;
    createData.tone = normalizedTone as any;
  }
  if (spicinessLevel !== undefined) {
    if (!Number.isInteger(spicinessLevel)) return sendBadRequest(res, "spicinessLevel must be a number");
    updateData.spicinessLevel = spicinessLevel as number;
    createData.spicinessLevel = spicinessLevel as number;
  }
  if (formalityLevel !== undefined) {
    if (!Number.isInteger(formalityLevel)) return sendBadRequest(res, "formalityLevel must be a number");
    updateData.formalityLevel = formalityLevel as number;
    createData.formalityLevel = formalityLevel as number;
  }
  if (emojiUsage !== undefined) {
    if (!Number.isInteger(emojiUsage)) return sendBadRequest(res, "emojiUsage must be a number");
    updateData.emojiUsage = emojiUsage as number;
    createData.emojiUsage = emojiUsage as number;
  }
  if (priorityOrderJson !== undefined) {
    if (priorityOrderJson !== null && typeof priorityOrderJson !== "object") {
      return sendBadRequest(res, "priorityOrderJson must be JSON");
    }
    const normalizedPriority =
      priorityOrderJson === null ? Prisma.JsonNull : (priorityOrderJson as Prisma.InputJsonValue);
    updateData.priorityOrderJson = normalizedPriority;
    createData.priorityOrderJson = normalizedPriority;
  }
  if (forbiddenTopics !== undefined) {
    if (typeof forbiddenTopics !== "string") return sendBadRequest(res, "forbiddenTopics must be a string");
    updateData.forbiddenTopics = forbiddenTopics;
    createData.forbiddenTopics = forbiddenTopics;
  }
  if (forbiddenPromises !== undefined) {
    if (typeof forbiddenPromises !== "string") return sendBadRequest(res, "forbiddenPromises must be a string");
    updateData.forbiddenPromises = forbiddenPromises;
    createData.forbiddenPromises = forbiddenPromises;
  }
  if (rulesManifest !== undefined) {
    if (typeof rulesManifest !== "string") return sendBadRequest(res, "rulesManifest must be a string");
    updateData.rulesManifest = rulesManifest;
    createData.rulesManifest = rulesManifest;
  }
  if (allowSuggestReplies !== undefined) {
    if (typeof allowSuggestReplies !== "boolean") return sendBadRequest(res, "allowSuggestReplies must be a boolean");
    updateData.allowSuggestReplies = allowSuggestReplies;
    createData.allowSuggestReplies = allowSuggestReplies;
  }
  if (allowSuggestExtras !== undefined) {
    if (typeof allowSuggestExtras !== "boolean") return sendBadRequest(res, "allowSuggestExtras must be a boolean");
    updateData.allowSuggestExtras = allowSuggestExtras;
    createData.allowSuggestExtras = allowSuggestExtras;
  }
  if (allowSuggestRenewals !== undefined) {
    if (typeof allowSuggestRenewals !== "boolean") return sendBadRequest(res, "allowSuggestRenewals must be a boolean");
    updateData.allowSuggestRenewals = allowSuggestRenewals;
    createData.allowSuggestRenewals = allowSuggestRenewals;
  }
  if (allowAutoLowPriority !== undefined) {
    if (typeof allowAutoLowPriority !== "boolean") return sendBadRequest(res, "allowAutoLowPriority must be a boolean");
    updateData.allowAutoLowPriority = allowAutoLowPriority;
    createData.allowAutoLowPriority = allowAutoLowPriority;
  }
  if (creditsAvailable !== undefined) {
    if (!Number.isInteger(creditsAvailable)) return sendBadRequest(res, "creditsAvailable must be a number");
    updateData.creditsAvailable = creditsAvailable as number;
    createData.creditsAvailable = creditsAvailable as number;
  }
  if (hardLimitPerDay !== undefined) {
    if (hardLimitPerDay !== null && !Number.isInteger(hardLimitPerDay)) {
      return sendBadRequest(res, "hardLimitPerDay must be a number or null");
    }
    updateData.hardLimitPerDay = hardLimitPerDay as number | null;
    createData.hardLimitPerDay = hardLimitPerDay as number | null;
  }
  if (turnMode !== undefined) {
    const validModes = AI_TURN_MODES as readonly string[];
    const normalizedMode = normalizeAiTurnMode(typeof turnMode === "string" ? turnMode : null);
    if (turnMode !== null && !validModes.includes(normalizedMode)) {
      return sendBadRequest(res, "turnMode must be a valid AI turn mode");
    }
    updateData.turnMode = (normalizedMode as any) ?? "auto";
    createData.turnMode = (normalizedMode as any) ?? "auto";
  }

  try {
    const creatorId = await resolveCreatorId();

    const settings = await prisma.creatorAiSettings.upsert({
      where: { creatorId },
      update: updateData,
      create: { creatorId, ...createData },
    });

    return res.status(200).json({ settings });
  } catch (err) {
    console.error("Error saving creator AI settings", err);
    if (err instanceof Error && err.message === "Creator not found") {
      return res.status(404).json({ error: "Creator not found" });
    }
    return sendServerError(res, "Error saving AI settings");
  }
}

async function resolveCreatorId(): Promise<string> {
  if (process.env.CREATOR_ID) {
    return process.env.CREATOR_ID;
  }

  const defaultCreator = await prisma.creator.findUnique({
    where: { id: "creator-1" },
    select: { id: true },
  });
  if (defaultCreator) {
    return defaultCreator.id;
  }

  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (!creator) {
    throw new Error("Creator not found");
  }

  return creator.id;
}
