type SuggestionLanguage = "es" | "en";

export type FanSuggestionChip = {
  key: string;
  label: string;
  insertText: string;
};

export type FanSuggestions = {
  language: SuggestionLanguage;
  intentLabel: string | null;
  nextActionKey: string | null;
  nextActionLabel: string | null;
  nextActionText: string | null;
  chips: FanSuggestionChip[];
};

export type FanSuggestionInput = {
  language?: string | null;
  temperatureBucket?: string | null;
  temperatureScore?: number | null;
  lastIntentKey?: string | null;
  nextAction?: string | null;
  membershipStatus?: string | null;
  daysLeft?: number | null;
  lastPurchaseAt?: string | Date | null;
  lastInboundAt?: string | Date | null;
  now?: Date;
};

type CopyItem = { label: string; text: string };

const INTENT_LABELS: Record<SuggestionLanguage, Record<string, string>> = {
  es: {
    GREETING: "Saludo",
    FLIRT: "Coqueteo",
    CONTENT_REQUEST: "Contenido",
    CUSTOM_REQUEST: "Custom",
    PRICE_ASK: "Precio",
    BUY_NOW: "Compra",
    SUBSCRIBE: "Suscribir",
    CANCEL: "Cancelar",
    OFF_PLATFORM: "Off-platform",
    SUPPORT: "Soporte",
    OBJECTION: "Objeción",
    RUDE_OR_HARASS: "Grosero",
    UNSAFE_MINOR: "Menor",
    OTHER: "Otro",
  },
  en: {
    GREETING: "Greeting",
    FLIRT: "Flirt",
    CONTENT_REQUEST: "Content",
    CUSTOM_REQUEST: "Custom",
    PRICE_ASK: "Price",
    BUY_NOW: "Buy",
    SUBSCRIBE: "Subscribe",
    CANCEL: "Cancel",
    OFF_PLATFORM: "Off-platform",
    SUPPORT: "Support",
    OBJECTION: "Objection",
    RUDE_OR_HARASS: "Rude",
    UNSAFE_MINOR: "Minor",
    OTHER: "Other",
  },
};

const NEXT_ACTION_COPY: Record<SuggestionLanguage, Record<string, CopyItem>> = {
  es: {
    SEND_PAYMENT_LINK: {
      label: "Enviar link",
      text: "Si quieres, te paso el link para completar el pago.",
    },
    OFFER_EXTRA: {
      label: "Ofrecer extra",
      text: "Tengo un extra que puede encajar. ¿Te lo muestro?",
    },
    BREAK_ICE: {
      label: "Romper el hilo",
      text: "Hola, ¿qué tal tu día?",
    },
    BUILD_RAPPORT: {
      label: "Construir rapport",
      text: "Quiero conocerte un poco más. ¿Qué te apetece hoy?",
    },
    PUSH_MONTHLY: {
      label: "Llevar a mensual",
      text: "Si te interesa, puedo pasarte el plan mensual con todo incluido.",
    },
    SUPPORT: {
      label: "Soporte",
      text: "Te ayudo con el acceso. ¿Qué error te aparece?",
    },
    SAFETY: {
      label: "Seguridad",
      text: "Antes de seguir, necesito confirmar que eres mayor de 18.",
    },
    RESOLVE_OBJECTION: {
      label: "Resolver objeción",
      text: "Te entiendo. ¿Qué te preocupa en concreto?",
    },
    THANK_DELIVERY: {
      label: "Agradecer + entregar",
      text: "¡Gracias! Te entrego el acceso ahora mismo.",
    },
  },
  en: {
    SEND_PAYMENT_LINK: {
      label: "Send link",
      text: "If you want, I can send the link to complete payment.",
    },
    OFFER_EXTRA: {
      label: "Offer extra",
      text: "I have an extra that fits. Want me to show it?",
    },
    BREAK_ICE: {
      label: "Break the ice",
      text: "Hey, how's your day going?",
    },
    BUILD_RAPPORT: {
      label: "Build rapport",
      text: "I'd like to know you better. What are you in the mood for today?",
    },
    PUSH_MONTHLY: {
      label: "Go monthly",
      text: "If you're into it, I can share the monthly plan with everything included.",
    },
    SUPPORT: {
      label: "Support",
      text: "I can help with access. What error do you see?",
    },
    SAFETY: {
      label: "Safety",
      text: "Before we continue, I need to confirm you're 18+.",
    },
    RESOLVE_OBJECTION: {
      label: "Resolve objection",
      text: "I get it. What concerns you most?",
    },
    THANK_DELIVERY: {
      label: "Thank + deliver",
      text: "Thank you! I'm delivering access right now.",
    },
  },
};

const CHIP_COPY: Record<SuggestionLanguage, Record<string, CopyItem>> = {
  es: {
    pass_options: { label: "Pasar opciones", text: "Te paso opciones rápidas para elegir." },
    send_link: { label: "Enviar link", text: "¿Quieres que te mande el link ahora?" },
    soft_close: { label: "Cierre suave", text: "Lo dejamos listo y seguimos cuando me digas." },
    resolve_question: { label: "Resolver duda", text: "¿Qué duda quieres resolver antes de avanzar?" },
    simple_question: { label: "Pregunta simple", text: "¿Cómo va tu día?" },
    reactivate_short: { label: "Reactivar corto", text: "¿Sigues por aquí? Tengo algo rápido para ti." },
    light_offer: { label: "Oferta ligera", text: "Si te apetece, tengo una opción ligera." },
    clarify: { label: "Aclarar", text: "Cuéntame qué te preocupa y lo aclaro." },
    validate: { label: "Validar", text: "Te entiendo, vamos a tu ritmo." },
    options: { label: "Opciones", text: "Puedo darte opciones más simples si te ayuda." },
    limits: { label: "Límites", text: "Si prefieres, lo dejamos aquí y seguimos luego." },
    ask_detail: { label: "Pedir detalle", text: "¿Qué error te aparece exactamente?" },
    support_steps: { label: "Pasos", text: "Te dejo los pasos para resolverlo." },
    confirm: { label: "Confirmar", text: "Cuando lo pruebes, me confirmas y sigo contigo." },
    safety_check: { label: "Confirmar edad", text: "Antes de seguir, necesito confirmar que eres mayor de 18." },
    safety_policy: { label: "Normas", text: "Por seguridad, solo puedo continuar con mayores de 18." },
    thanks: { label: "Gracias", text: "¡Gracias! Ya lo preparo para ti." },
    deliver_access: { label: "Entrego acceso", text: "Te entrego el acceso ahora mismo." },
    anything_else: { label: "¿Algo más?", text: "¿Quieres algo más o alguna preferencia?" },
    ask_preference: { label: "Pedir preferencia", text: "Dime qué te apetece y te propongo algo a tu gusto." },
  },
  en: {
    pass_options: { label: "Share options", text: "I can share quick options for you to choose." },
    send_link: { label: "Send link", text: "Do you want me to send the link now?" },
    soft_close: { label: "Soft close", text: "We can keep it ready and continue whenever you want." },
    resolve_question: { label: "Resolve question", text: "What question should I clear up before we move on?" },
    simple_question: { label: "Simple question", text: "How's your day going?" },
    reactivate_short: { label: "Quick reactivation", text: "Still around? I have something quick for you." },
    light_offer: { label: "Light offer", text: "If you want, I have a light option." },
    clarify: { label: "Clarify", text: "Tell me what's worrying you and I'll clarify it." },
    validate: { label: "Validate", text: "I get it—let's go at your pace." },
    options: { label: "Options", text: "I can offer simpler options if that helps." },
    limits: { label: "Boundaries", text: "If you prefer, we can pause and continue later." },
    ask_detail: { label: "Ask detail", text: "What exact error are you seeing?" },
    support_steps: { label: "Steps", text: "I'll share the steps to fix it." },
    confirm: { label: "Confirm", text: "Once you try it, let me know and I'll keep helping." },
    safety_check: { label: "Confirm age", text: "Before we continue, I need to confirm you're 18+." },
    safety_policy: { label: "Rules", text: "For safety, I can only continue with 18+." },
    thanks: { label: "Thanks", text: "Thank you! I'm getting it ready for you." },
    deliver_access: { label: "Deliver access", text: "I'll deliver access right now." },
    anything_else: { label: "Anything else?", text: "Anything else you want or a preference?" },
    ask_preference: { label: "Ask preference", text: "Tell me what you're in the mood for and I'll tailor it." },
  },
};

const ACTION_KEYS = new Set(Object.keys(NEXT_ACTION_COPY.es));
const RECENT_PURCHASE_MS = 24 * 60 * 60 * 1000;
const STALE_INBOUND_MS = 3 * 24 * 60 * 60 * 1000;

function resolveLanguage(value?: string | null): SuggestionLanguage {
  if (typeof value !== "string") return "es";
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return base === "en" ? "en" : "es";
}

function normalizeIntent(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeBucket(value?: string | null): "COLD" | "WARM" | "HOT" | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "COLD" || normalized === "WARM" || normalized === "HOT") return normalized;
  return null;
}

function parseDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeSuggestedAction(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return ACTION_KEYS.has(normalized) ? normalized : null;
}

export function getFanSuggestions(input: FanSuggestionInput): FanSuggestions {
  const language = resolveLanguage(input.language);
  const intentKey = normalizeIntent(input.lastIntentKey);
  const bucketFromScore =
    typeof input.temperatureScore === "number"
      ? input.temperatureScore >= 70
        ? "HOT"
        : input.temperatureScore >= 35
        ? "WARM"
        : "COLD"
      : null;
  const bucket = normalizeBucket(input.temperatureBucket) ?? bucketFromScore;
  const now = input.now ?? new Date();
  const lastPurchaseAt = parseDate(input.lastPurchaseAt);
  const lastInboundAt = parseDate(input.lastInboundAt);
  const hasRecentPurchase =
    !!lastPurchaseAt && now.getTime() - lastPurchaseAt.getTime() <= RECENT_PURCHASE_MS;
  const isStaleInbound =
    !!lastInboundAt && now.getTime() - lastInboundAt.getTime() >= STALE_INBOUND_MS;

  const nextActionFromInput = normalizeSuggestedAction(input.nextAction);
  const nextActionKey =
    nextActionFromInput ??
    (hasRecentPurchase
      ? "THANK_DELIVERY"
      : intentKey === "SUPPORT"
      ? "SUPPORT"
      : intentKey === "UNSAFE_MINOR"
      ? "SAFETY"
      : intentKey === "OBJECTION"
      ? "RESOLVE_OBJECTION"
      : intentKey === "BUY_NOW"
      ? "SEND_PAYMENT_LINK"
      : intentKey === "PRICE_ASK"
      ? "OFFER_EXTRA"
      : intentKey === "GREETING" && bucket === "COLD"
      ? "BREAK_ICE"
      : bucket === "HOT"
      ? "OFFER_EXTRA"
      : bucket === "WARM"
      ? "BUILD_RAPPORT"
      : bucket === "COLD"
      ? "BREAK_ICE"
      : null);

  const intentLabel = intentKey ? INTENT_LABELS[language][intentKey] ?? intentKey : null;
  const nextActionMeta = nextActionKey ? NEXT_ACTION_COPY[language][nextActionKey] : null;
  const nextActionLabel = nextActionMeta?.label ?? (nextActionKey ? nextActionKey : null);
  const nextActionText = nextActionMeta?.text ?? null;

  const chips: FanSuggestionChip[] = [];
  const seen = new Set<string>();
  const addChip = (key: string) => {
    if (seen.has(key)) return;
    const entry = CHIP_COPY[language][key];
    if (!entry) return;
    seen.add(key);
    chips.push({ key, label: entry.label, insertText: entry.text });
  };
  const addSet = (keys: string[]) => keys.forEach(addChip);

  if (hasRecentPurchase) {
    addSet(["thanks", "deliver_access", "anything_else"]);
  } else if (intentKey === "UNSAFE_MINOR") {
    addSet(["safety_check", "safety_policy", "soft_close"]);
  } else if (intentKey === "SUPPORT") {
    addSet(["ask_detail", "support_steps", "confirm"]);
  } else if (intentKey === "OBJECTION") {
    addSet(["clarify", "validate", "options", "limits"]);
  } else if (intentKey === "BUY_NOW" || intentKey === "PRICE_ASK" || bucket === "HOT") {
    addSet(["pass_options", "send_link", "soft_close", "resolve_question"]);
  } else if (intentKey === "GREETING" && bucket === "COLD") {
    addSet(["simple_question", "reactivate_short", "light_offer"]);
  } else if (bucket === "COLD") {
    addSet(isStaleInbound ? ["reactivate_short", "simple_question", "light_offer"] : ["simple_question", "light_offer", "ask_preference"]);
  } else if (bucket === "WARM") {
    addSet(["ask_preference", "simple_question", "light_offer"]);
  } else {
    addSet(["simple_question", "ask_preference", "light_offer"]);
  }

  if (chips.length < 3) {
    addSet(["simple_question", "ask_preference", "light_offer"]);
  }

  return {
    language,
    intentLabel,
    nextActionKey,
    nextActionLabel,
    nextActionText,
    chips: chips.slice(0, 5),
  };
}
