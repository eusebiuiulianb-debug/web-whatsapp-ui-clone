import type { NextBestActionId } from "./managerIaConfig";

export type ManagerPriorityReasonId = NextBestActionId;
export type ManagerActionId = NextBestActionId;

export interface ManagerReasonCopy {
  title: string;
  description: string;
}

export interface ManagerActionCopy {
  label: string;
  managerText: string;
  suggestions: string[];
}

export type ManagerNextActionId =
  | "RENOVAR_PACK"
  | "CUIDAR_VIP"
  | "BIENVENIDA"
  | "REACTIVAR_DORMIDO"
  | "OFRECER_EXTRA"
  | "NEUTRO";

export type SummaryProfileId = "NEW_TRIAL" | "NEW_ENGAGED" | "VIP_CORE" | "LOYAL" | "RISK" | "DEFAULT";
export type SummaryRecentId = "EXPIRY_SOON" | "NO_PURCHASE_LONG" | "ACTIVE_CHAT" | "RISK_ZONE" | "DEFAULT";

export const PRIORITY_REASON_COPY: Record<ManagerPriorityReasonId, ManagerReasonCopy> = {
  RENEW_HARD: {
    title: "Renovación urgente",
    description: "Tu suscripción está a punto de caducar (≤ 3 días). Si no actúas, pierdes un fan de pago.",
  },
  RENEW_SOFT: {
    title: "Preparar renovación",
    description: "Suscripción renovable en ≤ 7 días. Buen momento para recordar el valor que ha recibido.",
  },
  RECOVER_TOP_FAN: {
    title: "Recuperar top fan",
    description: "Buen cliente sin pack activo ahora mismo. Merece una oferta cuidada para volver a engancharlo.",
  },
  FIRST_WELCOME: {
    title: "Bienvenida guiada",
    description: "Fan nuevo. Aún está definiendo si este espacio es para él/ella.",
  },
  FIRST_EXTRA: {
    title: "Ofrecer primer extra",
    description: "Tiene suscripción pero nunca ha probado un contenido extra. Oportunidad limpia de upsell.",
  },
  WAKE_DORMANT: {
    title: "Reactivar fan dormido",
    description: "Hace tiempo que no habláis. Antes de vender, necesitas saber si sigue interesado.",
  },
  NEUTRAL: {
    title: "Sin prioridad clara",
    description: "No hay una acción claramente prioritaria ahora mismo. Sigue la conversación de forma natural.",
  },
};

export const ACTION_COPY: Record<ManagerActionId, ManagerActionCopy> = {
  RENEW_HARD: {
    label: "Renovación urgente",
    managerText: "Tu suscripción está a punto de caducar (≤ 3 días). Si no actúas, pierdes un fan de pago.",
    suggestions: [
      "Haz un check rápido: pregúntale qué le ha sido más útil este mes antes de enviar el enlace de renovación.",
      "Ofrece ajustar ritmo o tipo de contenido a cambio de renovar (mantén el precio, personaliza el mensaje).",
    ],
  },
  RENEW_SOFT: {
    label: "Preparar renovación",
    managerText: "Suscripción renovable en ≤ 7 días. Buen momento para recordar el valor que ha recibido.",
    suggestions: [
      "Pide feedback de lo que más le ha gustado y adelanta que en unos días llega el enlace de renovación.",
      "Refuerza 1–2 beneficios concretos que sabes que valora antes de proponer la renovación.",
    ],
  },
  RECOVER_TOP_FAN: {
    label: "Recuperar top fan",
    managerText: "Buen cliente sin pack activo ahora mismo. Merece una oferta cuidada para volver a engancharlo.",
    suggestions: [
      "Reconoce que ha confiado mucho en ti y ofrécele un pack especial limitado solo para antiguos VIP.",
      "Evita descuentos agresivos: prioriza personalización y trato cercano.",
    ],
  },
  FIRST_WELCOME: {
    label: "Bienvenida guiada",
    managerText: "Fan nuevo. Aún está definiendo si este espacio es para él/ella.",
    suggestions: [
      "Explícales en una frase qué puede esperar del chat y pregúntales qué buscan exactamente.",
      "Invítales a contarte su situación en una frase para guiarles hacia el pack adecuado.",
    ],
  },
  FIRST_EXTRA: {
    label: "Ofrecer primer extra",
    managerText: "Tiene suscripción pero nunca ha probado un contenido extra. Oportunidad limpia de upsell.",
    suggestions: [
      "Proponle un extra pequeño y concreto (1 foto/1 vídeo) para probar cómo trabajas el contenido especial.",
      "Conecta el extra con algo que ya te haya dicho que le interesa (usa notas si las hay).",
    ],
  },
  WAKE_DORMANT: {
    label: "Reactivar fan dormido",
    managerText: "Hace tiempo que no habláis. Antes de vender, necesitas saber si sigue interesado.",
    suggestions: [
      "Escribe un mensaje corto y humano, sin venta directa, preguntando cómo está y si quiere retomar.",
      "Si responde, entonces podrás proponer pack o extra según en qué punto se quedó.",
    ],
  },
  NEUTRAL: {
    label: "Sin prioridad clara",
    managerText: "No hay una acción claramente prioritaria ahora mismo. Sigue la conversación de forma natural.",
    suggestions: ["Escucha lo que te cuenta y decide manualmente si toca profundizar, vender o simplemente acompañar."],
  },
};

export const ACTION_OBJECTIVES: Record<ManagerNextActionId, string> = {
  RENOVAR_PACK: "Confirmar si quiere seguir este mes y cerrar la renovación con un tono cercano, no agresivo.",
  CUIDAR_VIP: "Hacerle sentir trato preferente y escuchar qué le apetece a continuación.",
  BIENVENIDA: "Romper el hielo, entender qué busca y guiarle al pack que más sentido tenga.",
  REACTIVAR_DORMIDO: "Tocar la puerta con un mensaje ligero para ver si sigue ahí, sin presionar.",
  OFRECER_EXTRA: "Ofrecerle una pieza extra concreta alineada con lo que ya te ha comprado.",
  NEUTRO: "Seguir la conversación normal, escuchar y responder.",
};

export const SUMMARY_PROFILE_COPY: Record<SummaryProfileId, string> = {
  NEW_TRIAL: "Fan nuevo en fase de prueba; todavía está conociendo tu contenido.",
  NEW_ENGAGED: "Fan nuevo pero ya implicado; ha invertido en extras desde que llegó.",
  VIP_CORE: "Fan clave por gasto y constancia; cuidarle impacta directamente en tus ingresos.",
  LOYAL: "Fan habitual que suele responder bien cuando le propones cosas concretas.",
  RISK: "Fan con señales de riesgo; necesita sentir novedad y cuidado para quedarse.",
  DEFAULT: "Fan activo en tu comunidad; sigue atento a sus respuestas para personalizar.",
};

export const SUMMARY_RECENT_COPY: Record<SummaryRecentId, string> = {
  EXPIRY_SOON: "Su acceso caduca en pocos días; es buen momento para recordarle el valor que ha recibido.",
  NO_PURCHASE_LONG: "No compra nada desde hace tiempo; la relación está fría y necesita algo diferente.",
  ACTIVE_CHAT: "Ha estado activo recientemente en chat o compras; viene con la conversación caliente.",
  RISK_ZONE: "Está en zona de riesgo de irse si no siente algo nuevo en breve.",
  DEFAULT: "Actividad estable; sigue atento a cualquier señal para ajustar el ritmo.",
};

export const SUMMARY_OPPORTUNITY_COPY: Record<ManagerPriorityReasonId, string> = {
  RENEW_HARD: "Momento crítico para renovar: sé directo, aclara qué perdería y ofrécele una salida clara.",
  RENEW_SOFT: "Oportunidad de renovación suave: refuerza el valor recibido y ofrece continuidad.",
  FIRST_EXTRA: "Buen momento para proponer un extra pequeño y concreto para que pruebe algo nuevo.",
  RECOVER_TOP_FAN: "Recupera a un fan que antes era fuerte; apela a la historia compartida más que al descuento.",
  FIRST_WELCOME: "Dale la bienvenida y guíale rápido al primer paso que tenga sentido para él/ella.",
  WAKE_DORMANT: "Reactivar con un gesto cercano y sin presión antes de proponer nada de pago.",
  NEUTRAL: "Sin prioridad clara: escucha y decide si toca profundizar, vender o simplemente acompañar.",
};
