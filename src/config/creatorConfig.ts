import { packs as defaultPacks, Pack } from "../data/packs";

export interface CreatorConfig {
  creatorName: string;
  creatorHandle?: string;
  creatorSubtitle: string;
  uiLocale: string;
  creatorDescription: string;
  avatarUrl?: string;
  isVerified?: boolean;
  offerTags?: string[];
  quickReplies: {
    saludoRapido: string;
    packBienvenida: string;
    enlaceSuscripcion: string;
  };
  packs: Pack[];
}

export const STORAGE_KEY = "novsy_creator_config";

export const DEFAULT_CREATOR_CONFIG: CreatorConfig = {
  creatorName: "Eusebiu",
  creatorHandle: slugifyHandle("Eusebiu"),
  creatorSubtitle: "Responde en menos de 24h",
  uiLocale: "es",
  creatorDescription:
    "Bienvenido a mi espacio en NOVSY. Aquí comparto avances, envío audios personalizados y respondo tus ideas para crear contenido hecho a tu medida. Únete para acceder a sesiones 1:1, material exclusivo y priorizar tus pedidos.",
  isVerified: false,
  offerTags: [],
  quickReplies: {
    saludoRapido: "¡Gracias por escribirme! ¿Qué te gustaría trabajar o ver primero?",
    packBienvenida:
      "Te dejo aquí el pack de bienvenida con los primeros contenidos recomendados para ti: [añade aquí el enlace o instrucciones].",
    enlaceSuscripcion:
      "Si quieres acceder a todo el contenido y al chat prioritario, aquí tienes el enlace de suscripción mensual: [pega aquí tu enlace de suscripción].",
  },
  packs: defaultPacks,
  avatarUrl: "",
};

const isBrowser = () => typeof window !== "undefined";

export function loadCreatorConfig(baseConfig: CreatorConfig = DEFAULT_CREATOR_CONFIG): CreatorConfig {
  if (!isBrowser()) return baseConfig;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return baseConfig;
    const parsed = JSON.parse(stored);
    const storedHandle = typeof parsed.creatorHandle === "string" ? parsed.creatorHandle.trim() : "";
    const parsedOfferTags = Array.isArray(parsed.offerTags)
      ? parsed.offerTags.map((tag: unknown) => (typeof tag === "string" ? tag.trim() : "")).filter(Boolean)
      : undefined;
    const parsedVerified = typeof parsed.isVerified === "boolean" ? parsed.isVerified : undefined;
    return {
      ...baseConfig,
      ...parsed,
      creatorHandle: storedHandle || baseConfig.creatorHandle,
      isVerified: parsedVerified ?? baseConfig.isVerified,
      offerTags: parsedOfferTags ?? baseConfig.offerTags,
      quickReplies: {
        ...baseConfig.quickReplies,
        ...(parsed.quickReplies || {}),
      },
      packs: parsed.packs || baseConfig.packs,
      avatarUrl: parsed.avatarUrl || baseConfig.avatarUrl,
    };
  } catch (_err) {
    return baseConfig;
  }
}

export function saveCreatorConfig(config: CreatorConfig) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (_err) {
    // ignore write errors
  }
}

function slugifyHandle(value?: string) {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
