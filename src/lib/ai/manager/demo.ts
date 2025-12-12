export type ManagerStrategyReply = {
  mode: "STRATEGY";
  text: string;
  suggestedFans: Array<{ id?: string; name?: string; reason?: string }>;
  meta?: any;
};

export type ManagerContentReply = {
  mode: "CONTENT";
  text: string;
  dailyScripts: Array<{ title: string; idea: string }>;
  packIdeas: Array<{ name: string; why: string }>;
  meta?: any;
};

export type ManagerGrowthReply = {
  mode: "GROWTH";
  text: string;
  meta?: any;
};

export type ManagerDemoReply = ManagerStrategyReply | ManagerContentReply | ManagerGrowthReply;

export function buildDemoManagerReply(tab: "STRATEGY" | "CONTENT" | "GROWTH", context: any): ManagerDemoReply {
  if (tab === "STRATEGY") {
    const snapshot = context?.businessSnapshot ?? {};
    const prioritized = (snapshot.prioritizedFansToday ?? context?.fansSummary?.prioritizedToday ?? []) as any[];
    const suggestedFans = prioritized.slice(0, 3).map((fan: any) => ({
      id: fan.id,
      name: fan.name ?? fan.displayName,
      reason: buildReasonForFan(fan),
    }));

    const summary = `Modo demo: ${snapshot.newFansLast30Days ?? 0} fans nuevos, ${
      snapshot.fansAtRisk ?? 0
    } en riesgo, ${snapshot.vipActiveCount ?? 0} VIP activos, ${Math.round(snapshot.ingresosUltimos30Dias ?? 0)} € en 30d.`;
    const action1 =
      suggestedFans.length > 0
        ? `1) Escribe hoy a ${suggestedFans.map((f) => f.name).join(", ")} y propón renovación/extra.`
        : "1) Identifica a 2-3 fans en riesgo o con caducidad cercana y priorízalos hoy.";
    const action2 = `2) Cuida a tus VIP (${snapshot.vipActiveCount ?? 0}) con un audio breve y CTA a su siguiente paso.`;
    const action3 = `3) Envía bienvenida a los nuevos (${snapshot.newFansLast30Days ?? 0}) con la oferta base.`;

    return {
      mode: "STRATEGY",
      text: [summary, action1, action2, action3].join("\n"),
      suggestedFans,
      meta: { demo: true },
    };
  }

  if (tab === "GROWTH") {
    const growthSnapshot = context?.growthSnapshot ?? {};
    const followers = growthSnapshot.followers ?? 12000;
    const visits = growthSnapshot.visits ?? 15000;
    const cpm = growthSnapshot.cpm ?? 8;
    const headline = `Modo demo crecimiento: ${followers} seguidores, ${visits} visitas/semana, CPM ${cpm}€.`;
    const actions = [
      "1) Publica 2 shorts/TikToks con CTA al pack mensual y mide retención 1h.",
      "2) Escribe a tus VIP con el extra que mejor rindió esta semana (cupón 24h).",
      "3) Haz un story anclado con tu pack fuerte y añade prueba social.",
    ];
    return {
      mode: "GROWTH",
      text: [headline, ...actions].join("\n"),
      meta: { demo: true },
    };
  }

  const snapshot = context?.contentSnapshot ?? {};
  const packs = (snapshot.packs ?? context?.packs ?? []) as any[];
  const bestPack = snapshot.bestPack30d ?? packs[0] ?? null;
  const reviewPacks = snapshot.packsToReview ?? [];
  const ingresos = snapshot.ingresosTotales30d ?? 0;

  const text = `Modo demo contenido: ${packs.length} packs activos. Pack fuerte: ${
    bestPack?.name ?? "ninguno"
  }. Packs a revisar: ${reviewPacks.length}. Ingresos 30d: ${Math.round(ingresos)} €.`;

  const dailyScripts = [
    {
      title: "Story rápido para mover pack fuerte",
      idea: bestPack
        ? `Story de 3 pasos empujando ${bestPack.name} con CTA claro y escasez suave.`
        : "Story presentando tu pack mensual y qué incluye esta semana.",
    },
    {
      title: "Mensaje a VIP con extra",
      idea: "Escribe a 2 VIP con un extra T1/T2 exclusivo y límite temporal (24h).",
    },
  ];

  const packIdeas = reviewPacks.length
    ? reviewPacks.slice(0, 2).map((pack: any) => ({
        name: pack.name ?? "Pack a revisar",
        why: "Sin ventas recientes. Ajusta precio/copy o refresca contenido.",
      }))
    : [
        {
          name: "Extra rápido T1",
          why: "Testea ticket medio con fans habituales esta semana.",
        },
      ];

  return {
    mode: "CONTENT",
    text,
    dailyScripts,
    packIdeas,
    meta: { demo: true },
  };
}

function buildReasonForFan(fan: any): string {
  if (!fan) return "Prioridad general";
  if (typeof fan.daysToExpire === "number" && fan.daysToExpire <= 3) {
    return "Caduca pronto";
  }
  if (fan.segment === "VIP") {
    return "VIP activo, mantener vínculo";
  }
  if (fan.segment === "RIESGO" || fan.segment === "EN_RIESGO") {
    return "Salud baja o inactivo";
  }
  return "Oportunidad de mover siguiente paso";
}
