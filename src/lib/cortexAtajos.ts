export type CortexAtajoTab = "hoy" | "ventas" | "catalogo" | "crecimiento";
export type CortexAtajoKind = "insert" | "action";

export type CortexAtajoPromptContext = {
  metricsLine: string;
  expiringFansLine?: string;
  growthContextLine?: string;
  growthPlatformsLine?: string;
};

export type CortexAtajo = {
  id: string;
  label: string;
  tab: CortexAtajoTab;
  promptTemplate: (context: CortexAtajoPromptContext) => string;
  kind?: CortexAtajoKind;
  defaultPinned?: boolean;
  description?: string;
};

export type CortexAtajosState = {
  version: 1;
  pinnedByTab: Record<CortexAtajoTab, string[]>;
};

export const CORTEX_ATAJOS_STATE_VERSION = 1 as const;
export const CORTEX_ATAJOS_STATE_KEY = "cortex_atajos_state:v1";
export const RESCUE_ACTION_ID = "rescatar_caducan_pronto";

const withMetrics = (body: string, context: CortexAtajoPromptContext) =>
  `${body}\n${context.metricsLine}`.trim();

const withMetricsAndExpiring = (body: string, context: CortexAtajoPromptContext) => {
  const lines = [body];
  if (context.expiringFansLine) lines.push(context.expiringFansLine);
  lines.push(context.metricsLine);
  return lines.join("\n").trim();
};

const withGrowthContext = (body: string, context: CortexAtajoPromptContext) => {
  const lines = [body];
  if (context.growthContextLine) lines.push(context.growthContextLine);
  if (context.growthPlatformsLine) lines.push(context.growthPlatformsLine);
  lines.push(context.metricsLine);
  return lines.join("\n").trim();
};

export const CORTEX_ATAJOS: CortexAtajo[] = [
  {
    id: "diagnostico_3_bullets",
    label: "Diagnóstico 3 bullets",
    tab: "hoy",
    defaultPinned: true,
    promptTemplate: (context) =>
      withMetrics(
        "Haz un diagnóstico en 3 bullets: qué va bien, qué bloquea ingresos, y el cambio mínimo que haría hoy.",
        context
      ),
    description: "Detecta bloqueos y el cambio mínimo.",
  },
  {
    id: "plan_7_dias",
    label: "Plan 7 días",
    tab: "hoy",
    defaultPinned: true,
    promptTemplate: (context) =>
      withMetrics(
        "Plan de 7 días: objetivo diario + acción + mensaje sugerido + KPI a mirar.",
        context
      ),
    description: "Secuencia diaria con objetivo y KPI.",
  },
  {
    id: RESCUE_ACTION_ID,
    label: "Rescatar caducan pronto",
    tab: "hoy",
    defaultPinned: true,
    promptTemplate: (context) =>
      withMetricsAndExpiring(
        "Redacta mensajes cortos para fans que caducan pronto: 1 suave, 1 directo, 1 juguetón. Sin presión.",
        context
      ),
    description: "Mensajes para caducidades cercanas.",
  },
  {
    id: "3_acciones_rapidas",
    label: "3 acciones rápidas",
    tab: "hoy",
    defaultPinned: true,
    promptTemplate: (context) =>
      withMetrics(
        "Dame 3 acciones rápidas (15 min c/u) para generar ingresos hoy, sin ser agresivo con los fans.",
        context
      ),
    description: "Acciones cortas con impacto inmediato.",
  },
  {
    id: "atender_cola",
    label: "Atender cola",
    tab: "hoy",
    promptTemplate: (context) =>
      withMetrics(
        "Dime cómo atender la cola hoy: orden de prioridad y 1 primer mensaje por segmento.",
        context
      ),
    kind: "action",
    description: "Prioriza y responde la cola.",
  },
  {
    id: "upsell_vip_mensual",
    label: "Upsell a VIP mensual",
    tab: "ventas",
    defaultPinned: true,
    promptTemplate: (context) =>
      withMetrics(
        "Propón un upsell a VIP hacia mensual: a quién escribir, argumento corto y CTA claro.",
        context
      ),
    description: "CTA directo para subir a mensual.",
  },
  {
    id: "cta_cierre_hoy",
    label: "Cerrar renovaciones hoy",
    tab: "ventas",
    defaultPinned: true,
    promptTemplate: (context) =>
      withMetrics(
        "Dame un plan para cerrar renovaciones hoy: segmentos, orden de contacto y mensaje sugerido.",
        context
      ),
    description: "Plan de cierre para renovaciones.",
  },
  {
    id: "rescate_riesgo_7d",
    label: "Oferta extra a en riesgo",
    tab: "ventas",
    defaultPinned: true,
    promptTemplate: (context) =>
      withMetrics(
        "Redacta una oferta de extra para fans en riesgo: 2 versiones (suave y directa) con CTA claro.",
        context
      ),
    description: "Reactivar con oferta simple.",
  },
  {
    id: "ideas_extra_rapido",
    label: "Nuevo extra rápido",
    tab: "catalogo",
    defaultPinned: true,
    promptTemplate: (context) =>
      withMetrics(
        "Propón 2 ideas de extra rápidas de producir con copy corto (1-2 líneas) y CTA claro.",
        context
      ),
    description: "Extra sencillo de producir.",
  },
  {
    id: "gap_catalogo",
    label: "Huecos del catálogo",
    tab: "catalogo",
    defaultPinned: true,
    promptTemplate: (context) =>
      withMetrics(
        "Detecta huecos del catálogo y sugiere 3 contenidos concretos para cubrirlos.",
        context
      ),
    description: "Detecta faltantes clave.",
  },
  {
    id: "bundle_sugerido",
    label: "Bundle sugerido",
    tab: "catalogo",
    defaultPinned: true,
    promptTemplate: (context) =>
      withMetrics(
        "Diseña 1 pack/bundle con nombre, qué incluye, precio y mensaje de venta.",
        context
      ),
    description: "Bundle con buen valor percibido.",
  },
  {
    id: "mejorar_oferta_beneficio",
    label: "Mejorar oferta/beneficio",
    tab: "catalogo",
    promptTemplate: (context) =>
      withMetrics(
        "Propón mejoras concretas a la oferta actual: beneficio principal, diferenciador y 1 ajuste de valor percibido.",
        context
      ),
    description: "Refuerza valor sin bajar precio.",
  },
  {
    id: "ideas_contenido_viral",
    label: "Ideas de contenido viral",
    tab: "crecimiento",
    defaultPinned: true,
    promptTemplate: (context) =>
      withGrowthContext(
        "Dame 3 ideas de contenido viral: hook, guion breve y CTA al bio-link.",
        context
      ),
    description: "Ideas con hook y CTA.",
  },
  {
    id: "retencion_3_toques",
    label: "Retención 3 toques",
    tab: "crecimiento",
    defaultPinned: true,
    promptTemplate: (context) =>
      withGrowthContext(
        "Diseña una secuencia de retención en 3 toques: objetivo, mensaje corto y CTA.",
        context
      ),
    description: "Secuencia breve de retención.",
  },
  {
    id: "prueba_oferta",
    label: "Prueba de oferta",
    tab: "crecimiento",
    defaultPinned: true,
    promptTemplate: (context) =>
      withGrowthContext(
        "Propón una prueba de oferta para hoy: hipótesis, CTA y métrica a mirar.",
        context
      ),
    description: "Test rápido de oferta.",
  },
  {
    id: "calendario_7",
    label: "Calendario 7 días",
    tab: "crecimiento",
    promptTemplate: (context) =>
      withGrowthContext(
        "Arma un calendario de 7 días (1 línea por día) con objetivo, formato y CTA claro.",
        context
      ),
  },
  {
    id: "cta_bio_link",
    label: "Mejor CTA para bio-link",
    tab: "crecimiento",
    promptTemplate: (context) =>
      withGrowthContext(
        "Escribe el mejor CTA para el bio-link: 3 versiones cortas con enfoques distintos.",
        context
      ),
  },
];

export const CORTEX_ATAJOS_BY_ID = CORTEX_ATAJOS.reduce<Record<string, CortexAtajo>>((acc, atajo) => {
  acc[atajo.id] = atajo;
  return acc;
}, {});

export const CORTEX_ATAJOS_BY_TAB = CORTEX_ATAJOS.reduce<Record<CortexAtajoTab, CortexAtajo[]>>(
  (acc, atajo) => {
    acc[atajo.tab].push(atajo);
    return acc;
  },
  {
    hoy: [],
    ventas: [],
    catalogo: [],
    crecimiento: [],
  }
);

export const DEFAULT_PINNED_BY_TAB: Record<CortexAtajoTab, string[]> = {
  hoy: CORTEX_ATAJOS_BY_TAB.hoy.filter((atajo) => atajo.defaultPinned).map((atajo) => atajo.id),
  ventas: CORTEX_ATAJOS_BY_TAB.ventas.filter((atajo) => atajo.defaultPinned).map((atajo) => atajo.id),
  catalogo: CORTEX_ATAJOS_BY_TAB.catalogo.filter((atajo) => atajo.defaultPinned).map((atajo) => atajo.id),
  crecimiento: CORTEX_ATAJOS_BY_TAB.crecimiento.filter((atajo) => atajo.defaultPinned).map((atajo) => atajo.id),
};

export const CORTEX_ATAJO_TABS: CortexAtajoTab[] = ["hoy", "ventas", "catalogo", "crecimiento"];

const LEGACY_ATAJO_ID_MAP: Record<string, string> = {
  priorizo_hoy: "diagnostico_3_bullets",
  diagnostico_3: "diagnostico_3_bullets",
  plan_7: "plan_7_dias",
  rescatar_caducan: RESCUE_ACTION_ID,
  rescatar: RESCUE_ACTION_ID,
  acciones_rapidas: "3_acciones_rapidas",
  empuje_mensual: "upsell_vip_mensual",
  oferta_dia: "cta_cierre_hoy",
  ctas_listos: "cta_cierre_hoy",
  optimizar_precios: "cta_cierre_hoy",
  vender_vip: "upsell_vip_mensual",
  oferta_extra_riesgo: "rescate_riesgo_7d",
  cerrar_renovaciones: "cta_cierre_hoy",
  reactivar_caducados: "rescate_riesgo_7d",
  falta_grabar: "gap_catalogo",
  extras_nuevos: "ideas_extra_rapido",
  mejorar_packs: "bundle_sugerido",
  bundles: "bundle_sugerido",
  copy_catalogo: "gap_catalogo",
  extra_semana: "ideas_extra_rapido",
  nuevo_extra_rapido: "ideas_extra_rapido",
  huecos_catalogo: "gap_catalogo",
  idea_short_hoy: "ideas_contenido_viral",
  plan_14d: "ideas_contenido_viral",
  accion_retencion: "retencion_3_toques",
};

export function mapLegacyAtajoId(id: string) {
  return LEGACY_ATAJO_ID_MAP[id] ?? id;
}

export function getDefaultPinnedByTab() {
  return {
    hoy: [ ...DEFAULT_PINNED_BY_TAB.hoy ],
    ventas: [ ...DEFAULT_PINNED_BY_TAB.ventas ],
    catalogo: [ ...DEFAULT_PINNED_BY_TAB.catalogo ],
    crecimiento: [ ...DEFAULT_PINNED_BY_TAB.crecimiento ],
  };
}

export function normalizePinnedByTab(pinnedByTab: Partial<Record<CortexAtajoTab, string[]>>) {
  const defaults = getDefaultPinnedByTab();
  const next: Record<CortexAtajoTab, string[]> = {
    hoy: [],
    ventas: [],
    catalogo: [],
    crecimiento: [],
  };
  CORTEX_ATAJO_TABS.forEach((tab) => {
    const raw = pinnedByTab[tab] ?? defaults[tab];
    const mapped = (raw ?? [])
      .map((id) => (typeof id === "string" ? mapLegacyAtajoId(id) : ""))
      .filter((id): id is string => Boolean(id && CORTEX_ATAJOS_BY_ID[id]));
    const deduped = Array.from(new Set(mapped));
    next[tab] = deduped.length ? deduped : defaults[tab];
  });
  return next;
}
