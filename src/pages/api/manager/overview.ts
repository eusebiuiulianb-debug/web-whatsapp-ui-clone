import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { buildManagerQueueForCreator } from "../../../server/manager/managerService";
import { addDaysFrom } from "../../../server/manager/dateUtils";
import { FanQueueItemSchema, type FanQueueItem } from "../../../server/manager/managerSchemas";

const DEFAULT_CREATOR_ID = "creator-1";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const creatorId = DEFAULT_CREATOR_ID;
    const queueRaw = await buildManagerQueueForCreator(creatorId, prisma);
    const queue: FanQueueItem[] = FanQueueItemSchema.array().parse(queueRaw);
    const vipCount = queue.filter((f) => f.segment === "VIP").length;
    const atRiskCount = queue.filter((f) => f.segment === "EN_RIESGO").length;
    const newCount = queue.filter((f) => f.segment === "NUEVO").length;
    const dormantCount = queue.filter((f) => f.segment === "DORMIDO").length;
    const habitualCount = queue.filter((f) => f.segment === "LEAL_ESTABLE").length;

    // KPIs básicos reutilizando extraPurchase + accessGrant (sencillo, sin duplicar lógica)
    const now = new Date();
    const start7 = addDaysFrom(now, -7) ?? now;
    const start30 = addDaysFrom(now, -30) ?? now;
    const expiryWindow = addDaysFrom(now, 7) ?? now;

    const [extras7, extras30, grants7, grants30, newFans7, expiringGrants] = await Promise.all([
      prisma.extraPurchase.aggregate({
        where: { fan: { creatorId }, createdAt: { gte: start7 } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.extraPurchase.aggregate({
        where: { fan: { creatorId }, createdAt: { gte: start30 } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.accessGrant.aggregate({
        where: { fan: { creatorId }, createdAt: { gte: start7 } },
        _count: { _all: true },
      }),
      prisma.accessGrant.aggregate({
        where: { fan: { creatorId }, createdAt: { gte: start30 } },
        _count: { _all: true },
      }),
      // El modelo Fan no expone createdAt; contamos todos como aproximación.
      prisma.fan.count({ where: { creatorId } }),
      prisma.accessGrant.findMany({
        where: {
          fan: { creatorId },
          type: { in: ["monthly", "special"] },
          expiresAt: { gt: now, lte: expiryWindow },
        },
        select: { fanId: true, type: true },
      }),
    ]);

    const actionsToday: {
      id: string;
      label: string;
      description: string;
      filter: { segment: string; minLifetimeValue?: number };
    }[] = [];

    const atRiskHighValue = queue.filter((f) => f.segment === "EN_RIESGO" && (f.lifetimeValue ?? 0) >= 50).length;
    if (atRiskCount > 0 && atRiskHighValue > 0) {
      actionsToday.push({
        id: "rescue_high_value_at_risk",
        label: "Rescatar fans en riesgo (alto valor)",
        description:
          "Fans que han gastado bastante contigo y están en riesgo (salud baja o pack a punto de caducar). Prioridad máxima: un buen mensaje aquí suele recuperar ingresos.",
        filter: { segment: "EN_RIESGO", minLifetimeValue: 50 },
      });
    }
    if (vipCount > 0) {
      actionsToday.push({
        id: "care_vips",
        label: "Cuidar VIP activos",
        description:
          "Tus fans que más han gastado contigo y siguen activos. No es para venderles cada día, sino para mantener vínculo y que sientan trato preferente.",
        filter: { segment: "VIP" },
      });
    }
    if (newCount > 0) {
      actionsToday.push({
        id: "welcome_new",
        label: "Dar bienvenida a nuevos fans",
        description:
          "Personas que han llegado en los últimos días. Objetivo: que sientan que hay alguien al otro lado y sepan qué pueden esperar de tu comunidad.",
        filter: { segment: "NUEVO" },
      });
    }

    // Ingresos en riesgo: sumamos precio del pack en los próximos 7 días
    const PRICE_MAP: Record<string, number> = { monthly: 25, special: 49, single: 49 };
    const revenueAtRisk7d = expiringGrants.reduce((acc, grant) => acc + (PRICE_MAP[grant.type] ?? 0), 0);
    const atRiskFansCount = new Set(expiringGrants.map((g) => g.fanId)).size;

    // Adaptamos al shape esperado por CreatorManagerSummary
    return res.status(200).json({
      kpis: {
        last7: {
          revenue: (extras7._sum?.amount ?? 0) + (grants7._count?._all ?? 0),
          extras: extras7._count?._all ?? 0,
          newFans: newFans7,
        },
        last30: {
          revenue: (extras30._sum?.amount ?? 0) + (grants30._count?._all ?? 0),
          extras: extras30._count?._all ?? 0,
          newFans: newFans7, // sin createdAt, usamos aproximación
        },
      },
      packs: {
        welcome: { activeFans: 0, revenue30: 0 },
        monthly: { activeFans: 0, renewalsIn7Days: 0, churn30: 0, revenue30: 0 },
        special: { activeFans: 0, revenue30: 0 },
      },
      segments: {
        newFans: newCount,
        habitual: habitualCount,
        vip: vipCount,
        atRisk: atRiskCount + dormantCount,
      },
      suggestions: actionsToday,
      revenueAtRisk7d,
      atRiskFansCount,
      queue,
    });
  } catch (err) {
    console.error("Error loading manager overview", err);
    return res.status(500).json({ error: "Failed to load manager overview" });
  }
}
