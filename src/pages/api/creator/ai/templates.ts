import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma";
import { DEFAULT_AI_TEMPLATES } from "../../../../lib/defaultAiTemplates";
import { AI_TEMPLATE_USAGES, AI_TURN_MODES, AiTemplateUsage, type AiTurnMode } from "../../../../lib/aiTemplateTypes";
import type { ExtraTier, Prisma } from "@prisma/client";

type SaveTemplateBody = {
  id?: string;
  name?: string;
  category?: string;
  tone?: string | null;
  content?: string;
  isActive?: boolean;
  tier?: ExtraTier | null;
  mode?: AiTurnMode | null;
};

const DEFAULT_CREATOR_ID = "creator-1";

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
    let templates = await prisma.creatorAiTemplate.findMany({
      where: { creatorId: DEFAULT_CREATOR_ID },
      orderBy: { createdAt: "asc" },
    });

    for (const usage of AI_TEMPLATE_USAGES) {
      const hasUsage = templates.some((tpl) => tpl.category === usage);
      if (!hasUsage) {
        const defaultsForUsage = DEFAULT_AI_TEMPLATES.filter((tpl) => tpl.usage === usage);
        if (defaultsForUsage.length > 0) {
          await prisma.creatorAiTemplate.createMany({
            data: defaultsForUsage.map((tpl) => ({
              creatorId: DEFAULT_CREATOR_ID,
              name: tpl.name,
              category: tpl.usage,
              tone: tpl.tone,
              content: tpl.content,
              tier: tpl.tier ?? null,
              isActive: tpl.isActive,
              mode: tpl.mode ?? null,
            })),
          });
        }
      }
    }

    templates = await prisma.creatorAiTemplate.findMany({
      where: { creatorId: DEFAULT_CREATOR_ID },
      orderBy: { createdAt: "asc" },
    });

    const missingModes = templates.filter((tpl) => !tpl.mode);
    if (missingModes.length > 0) {
      const updates: Prisma.PrismaPromise<any>[] = missingModes.flatMap((tpl) => {
        const defaultTpl = DEFAULT_AI_TEMPLATES.find(
          (def) => def.usage === tpl.category && def.name === tpl.name && def.mode
        );
        if (!defaultTpl?.mode) return [];
        return [
          prisma.creatorAiTemplate.update({
            where: { id: tpl.id },
            data: { mode: defaultTpl.mode },
          }),
        ];
      });
      if (updates.length > 0) {
        await prisma.$transaction(updates);
        templates = await prisma.creatorAiTemplate.findMany({
          where: { creatorId: DEFAULT_CREATOR_ID },
          orderBy: { createdAt: "asc" },
        });
      }
    }
    return res.status(200).json({ templates });
  } catch (err) {
    console.error("Error fetching AI templates", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const body = req.body as SaveTemplateBody;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const categoryRaw = typeof body.category === "string" ? body.category.trim() : "extra_quick";
  const category = AI_TEMPLATE_USAGES.includes(categoryRaw as AiTemplateUsage) ? categoryRaw : "extra_quick";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const tone = body.tone === null ? null : typeof body.tone === "string" ? body.tone : undefined;
  const isActive = body.isActive === undefined ? true : Boolean(body.isActive);
  const tierRaw = body.tier === null ? null : typeof body.tier === "string" ? (body.tier as ExtraTier) : undefined;
  const VALID_TIERS: ExtraTier[] = ["T0", "T1", "T2", "T3", "T4"];
  const tier = tierRaw && VALID_TIERS.includes(tierRaw) ? tierRaw : tierRaw === null ? null : undefined;
  const modeRaw = body.mode === null ? null : typeof body.mode === "string" ? (body.mode as AiTurnMode) : undefined;
  const mode =
    modeRaw && (AI_TURN_MODES as readonly string[]).includes(modeRaw) ? modeRaw : modeRaw === null ? null : undefined;

  if (!name) return res.status(400).json({ error: "name is required" });
  if (!content) return res.status(400).json({ error: "content is required" });

  const data = {
    name,
    category: category || "extra_quick",
    tone: tone === undefined ? null : tone,
    content,
    isActive,
    creatorId: DEFAULT_CREATOR_ID,
    tier: tier === undefined ? undefined : tier,
    mode: mode === undefined ? undefined : mode,
  };

  try {
    let template;
    if (body.id) {
      template = await prisma.creatorAiTemplate.update({
        where: { id: body.id },
        data,
      });
    } else {
      template = await prisma.creatorAiTemplate.create({ data });
    }
    return res.status(200).json({ template });
  } catch (err) {
    console.error("Error saving AI template", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
