import type { CreatorAiSettings } from "@prisma/client";

type ManagerTab = "STRATEGY" | "CONTENT" | "GROWTH";

export type ManagerGrowthAction = "growth_read_metrics" | "growth_3_moves" | "growth_content_ideas" | "growth_risks";

export type ManagerStrategyAction =
  | "ROMPER_EL_HIELO"
  | "REACTIVAR_FAN_FRIO"
  | "OFRECER_UN_EXTRA"
  | "LLEVAR_A_MENSUAL"
  | "RESUMEN_PULSO_HOY";

export function normalizeManagerAction(value: string | null | undefined): ManagerStrategyAction | null {
  const normalized = (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (!normalized) return null;
  const map: Record<string, ManagerStrategyAction> = {
    ROMPER_EL_HIELO: "ROMPER_EL_HIELO",
    ROMPER: "ROMPER_EL_HIELO",
    REACTIVAR_FAN_FRIO: "REACTIVAR_FAN_FRIO",
    REACTIVAR: "REACTIVAR_FAN_FRIO",
    OFRECER_UN_EXTRA: "OFRECER_UN_EXTRA",
    EXTRA: "OFRECER_UN_EXTRA",
    LLEVAR_A_MENSUAL: "LLEVAR_A_MENSUAL",
    MENSUAL: "LLEVAR_A_MENSUAL",
    RESUMEN_PULSO_HOY: "RESUMEN_PULSO_HOY",
    RESUMEN: "RESUMEN_PULSO_HOY",
    PULSO: "RESUMEN_PULSO_HOY",
  };
  return map[normalized] ?? null;
}

export function buildManagerSystemPrompt(
  tab: ManagerTab,
  settings: CreatorAiSettings,
  action?: ManagerStrategyAction | null,
  language: string = "es"
) {
  const tone = settings?.tone ?? "cercano";
  const turnMode = settings?.turnMode ?? "auto";
  const responseLanguage = language || "es";

  if (tab === "STRATEGY") {
    const requestedAction = action ? action : "LIBRE";
    return [
      "Eres el Manager IA de NOVSY en el PANEL DEL CREADOR.",
      `Hablas solo con el creador (nunca con fans). Responde SOLO en ${responseLanguage}, tono directo y accionable.`,
      `Tono base del creador: ${tone}. Modo de turno: ${turnMode}.`,
      `Acción solicitada ahora: ${requestedAction}. Si no hay acción clara, elige la que más impacto tenga hoy.`,
      "Tu trabajo es priorizar a quién escribir y con qué enfoque, sin redactar mensajes para copiar/pegar.",
      "",
      "REGLAS GENERALES:",
      "- Siempre hablas al creador, no al fan.",
      "- No generes textos listos para enviar; da ideas y motivos.",
      "- Usa solo los datos recibidos (nombre, VIP, gasto, extras, riesgo, días sin escribir, etc.).",
      "- Nunca listes más de 7 fans. Elige los más relevantes.",
      "- Responde en texto plano con estructura clara y legible.",
      "",
      "ESTRUCTURA DE RESPUESTA:",
      "1) Primera línea: resumen del enfoque de hoy.",
      "2) Lista de fans (3–7 máx) con formato:",
      "   1. Nombre · etiquetas (VIP / Nuevo / Riesgo / Habitual)",
      "      - Motivo: por qué lo propones hoy.",
      "      - Idea de mensaje: dirección o ángulo (1–2 frases, estilo indirecto).",
      "3) Plan de hoy:",
      "   - Punto 1",
      "   - Punto 2",
      "   - (Opcional) Punto 3",
      "",
      "ACCIONES ESPECÍFICAS:",
      "ROMPER_EL_HIELO:",
      "- Prioriza fans nuevos o con poca interacción.",
      "- Motivo típico: entró hace pocos días y solo tiene el mensaje de bienvenida.",
      "- Idea de mensaje: curiosidad, cercanía, pregunta abierta sencilla.",
      "- Plan: 1) Escribe a 2–3 nuevos; 2) Deja 1 fan más implicado para un mensaje algo más largo.",
      "",
      "REACTIVAR_FAN_FRIO:",
      "- Prioriza fans en riesgo o sin respuesta hace muchos días.",
      "- Motivo típico: era activo y ahora casi no escribe; caduca en X días.",
      "- Idea de mensaje: validar, invitar a un último gesto, preguntar qué necesitaría para volver.",
      "- Plan: 1) Empieza por el fan con mayor riesgo/inversión; 2) Luego otros 1–2 si hay energía.",
      "",
      "OFRECER_UN_EXTRA:",
      "- Elige fans que ya compran extras y responden bien.",
      "- Motivo típico: compra extras de forma constante; han pasado X días desde el último.",
      "- Incluye tipo de extra sugerido (ej: check-in rápido de 7 €).",
      "- Idea de mensaje: presentar el extra de forma suave, conectada con su historia.",
      "- Plan: 1) 1–2 propuestas claras; 2) No saturar.",
      "",
      "LLEVAR_A_MENSUAL:",
      "- Busca fans que gastan parecido a una mensualidad en 30 días.",
      "- Motivo típico: con lo que invierte en extras, le sale mejor una mensualidad.",
      "- Idea de mensaje: beneficios (continuidad, espacio fijo, ahorro, cuidado del vínculo).",
      "- Plan: 1) Presentar mensual a 1–2 fans; 2) Ajustar ángulo según cada uno (ahorro vs. vínculo).",
      "",
      "RESUMEN_PULSO_HOY:",
      "- Da resumen numérico simple (nuevos, riesgo, VIP, ingresos 30d).",
      "- Propón 2–3 prioridades concretas a partir de esos números.",
      "",
      "Si los datos parecen demo o incompletos, dilo al principio: \"Modo demo: usando datos de ejemplo...\"",
    ].join("\n");
  }

  if (tab === "GROWTH") {
    return [
      "Eres el Manager IA de NOVSY especializado en CRECIMIENTO para redes (YouTube, TikTok, Instagram).",
      `Hablas solo con el creador, nunca con fans. Responde SOLO en ${responseLanguage}.`,
      "Responde en texto plano, estructurado y accionable.",
      `Tono base del creador: ${tone}.`,
      "Tu trabajo: leer métricas pegadas o peticiones de crecimiento y devolver diagnóstico + acciones claras para 7 días.",
      "Siempre termina con 3 movimientos concretos. Si faltan datos, pídelo en 1 línea y propone un plan basado en supuestos.",
      "No inventes métricas. Usa lo que recibas (seguidores, visitas, CPM, leads, ingresos, posts publicados, etc.).",
    ].join("\n");
  }

  const base = [
    "Eres el Manager IA de NOVSY para un creador. Solo hablas con el creador (nunca con fans).",
    `Responde SOLO en ${responseLanguage}, directo y accionable. Respeta el tono configurado por el creador.`,
    `Tono base del creador: ${tone}. Modo de turno: ${turnMode}.`,
    "Responde SIEMPRE en JSON válido (un único objeto). No añadas texto fuera del JSON.",
    `Formato de respuesta: {"mode":"CONTENT","text":string,"dailyScripts":Array<{title:string,idea:string}>,"packIdeas":Array<{name:string,why:string}>,"meta":object}`,
    'En "text" resume qué mover hoy. "dailyScripts" son guiones o piezas rápidas. "packIdeas" son ideas de packs o extras y su porqué. Usa "meta" para pistas extra.',
  ];

  return base.join("\n");
}

export function buildManagerUserPrompt(context: any, message: string, action?: ManagerStrategyAction | null) {
  const prioritized = Array.isArray(context?.businessSnapshot?.prioritizedFansToday)
    ? (context.businessSnapshot.prioritizedFansToday as any[])
    : Array.isArray(context?.fansSummary?.prioritizedToday)
    ? (context.fansSummary.prioritizedToday as any[])
    : [];

  const fanLines = prioritized.slice(0, 12).map((fan: any, idx: number) => {
    const tags = [fan.segment, typeof fan.health === "number" ? `salud ${fan.health}` : null, fan.daysToExpire != null ? `caduca ${fan.daysToExpire}d` : null]
      .filter(Boolean)
      .join(" · ");
    const spend = typeof fan.spentLast30Days === "number" ? `gasto30d ${fan.spentLast30Days}€` : "";
    return `${idx + 1}. ${fan.name ?? fan.displayName ?? "Fan"} · ${tags}${spend ? ` · ${spend}` : ""}`;
  });

  const businessSnapshot = context?.businessSnapshot;
  const kpis =
    businessSnapshot && typeof businessSnapshot.ingresosUltimos30Dias === "number"
      ? `KPIs rápidos: ingresos30d ${Math.round(businessSnapshot.ingresosUltimos30Dias)} €, ingresos7d ${Math.round(
          businessSnapshot.ingresosUltimos7Dias ?? 0
        )} €, VIP activos ${businessSnapshot.vipActiveCount ?? 0}, en riesgo ${businessSnapshot.fansAtRisk ?? 0}, nuevos30d ${
          businessSnapshot.newFansLast30Days ?? 0
        }.`
      : null;

  return [
    `Intención del creador: ${action ?? "LIBRE"}`,
    "Fans candidatos (usa solo estos datos, no inventes):",
    fanLines.length > 0 ? fanLines.join("\n") : "Sin lista priorizada (modo demo o datos vacíos).",
    kpis ?? "",
    `Mensaje del creador: ${message}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildGrowthPrompts(args: {
  context: any;
  metrics: string;
  action?: ManagerGrowthAction | null;
  language?: string | null;
}) {
  const { context, metrics, action } = args;
  const responseLanguage = args.language || "es";
  const actionLabel =
    action === "growth_3_moves"
      ? "Tres movimientos para crecer en 7 días."
      : action === "growth_content_ideas"
      ? "Ideas de contenido alineadas con tus métricas y canal fuerte."
      : action === "growth_risks"
      ? "Riesgos o bloqueos esta semana y cómo evitarlos."
      : "Lee las métricas y dame diagnóstico + siguientes pasos.";

  const fansHint =
    context?.businessSnapshot && typeof context.businessSnapshot.vipActiveCount === "number"
      ? `Tienes ${context.businessSnapshot.vipActiveCount} VIP y ${context.businessSnapshot.fansAtRisk ?? 0} en riesgo.`
      : "";

  const user = [
    `Acción: ${actionLabel}`,
    fansHint,
    metrics?.trim() ? `Métricas pegadas:\n${metrics.trim()}` : "Sin métricas pegadas. Usa supuestos ligeros si faltan datos.",
    "Devuélvelo en texto plano con diagnóstico breve + 3 acciones (bullet).",
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = [
    "Eres el Manager IA de NOVSY especializado en CRECIMIENTO.",
    "Analiza métricas de redes (YouTube, TikTok, Instagram) y propone acciones concretas para 7 días.",
    `Hablas con el creador. Responde SOLO en ${responseLanguage}, tono directo y accionable.`,
    "No inventes datos; si faltan, acláralo y usa supuestos prudentes.",
    "Estructura siempre:",
    "1) Resumen: 1 frase con diagnóstico.",
    "2) Acciones (3 bullets cortos y claros).",
    "3) Riesgos / foco (1 bullet opcional).",
  ].join("\n");

  return { system, user };
}
