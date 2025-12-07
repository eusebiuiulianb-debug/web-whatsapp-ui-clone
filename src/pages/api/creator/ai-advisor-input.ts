import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma";
import { buildCreatorAiContext } from "../../../server/manager/managerService";
import { CREATOR_ADVISOR_PROMPT } from "../../../server/manager/creatorPrompts";
import { CreatorAiAdvisorInputSchema } from "../../../server/manager/managerSchemas";

function getCreatorId(): string {
  // Reutilizamos el mismo approach que otros endpoints del creador (demo fija por ahora).
  return process.env.CREATOR_ID ?? "creator-1";
}

function buildPreview(input: Awaited<ReturnType<typeof buildCreatorAiContext>>) {
  const { activeFans, trialOrFirstMonthFans, churn30d, monthlyExtraRevenue, monthlySubsRevenue, topPackType, lastContentRefreshDays } =
    input;

  let riskLevel: "BAJO" | "MEDIO" | "ALTO" = "BAJO";
  const extrasHeavy = monthlyExtraRevenue > monthlySubsRevenue * 1.5;
  if (extrasHeavy && (lastContentRefreshDays ?? 0) > 30) {
    riskLevel = "ALTO";
  } else if (extrasHeavy || (lastContentRefreshDays ?? 0) > 30) {
    riskLevel = "MEDIO";
  }

  const headlineParts: string[] = [];
  if (activeFans <= 5) {
    headlineParts.push("Pocos fans activos pero con margen para crecer");
  } else {
    headlineParts.push(`Base de ${activeFans} fans activos`);
  }
  if (monthlyExtraRevenue > monthlySubsRevenue) {
    headlineParts.push("dependes más de extras que de subs");
  } else {
    headlineParts.push("ingresos equilibrados entre subs y extras");
  }
  const headline = headlineParts.join(" · ");

  const summaryLines: string[] = [];
  summaryLines.push(`Fans activos: ${activeFans}, nuevos 30d: ${trialOrFirstMonthFans}, churn 30d: ${churn30d}`);
  summaryLines.push(
    `Ingresos 30d: ${Math.round(monthlyExtraRevenue)} € en extras, ${Math.round(monthlySubsRevenue)} € en suscripciones`
  );
  if (topPackType) {
    summaryLines.push(`Pack más fuerte: ${topPackType}`);
  }
  if (typeof lastContentRefreshDays === "number") {
    summaryLines.push(`Hace ${lastContentRefreshDays} días del último contenido especial`);
  }

  return { headline, riskLevel, summaryLines };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const creatorId = getCreatorId();

  try {
    const context = await buildCreatorAiContext(creatorId, prisma);
    const preview = buildPreview(context);
    const payload = CreatorAiAdvisorInputSchema.parse({
      context,
      prompt: CREATOR_ADVISOR_PROMPT,
      preview,
    });
    return res.status(200).json(payload);
  } catch (err) {
    console.error("Error building creator AI advisor input", err);
    return res.status(500).json({ error: "creator_ai_context_unavailable" });
  }
}
