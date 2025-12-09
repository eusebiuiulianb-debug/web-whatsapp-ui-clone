import { packs as defaultPacks, Pack } from "../data/packs";

export interface CreatorConfig {
  creatorName: string;
  creatorSubtitle: string;
  creatorDescription: string;
  avatarUrl?: string;
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
  creatorSubtitle: "Responde en menos de 24h",
  creatorDescription:
    "Bienvenido a mi espacio en NOVSY. Aquí comparto avances, envío audios personalizados y respondo tus ideas para crear contenido hecho a tu medida. Únete para acceder a sesiones 1:1, material exclusivo y priorizar tus pedidos.",
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
    return {
      ...baseConfig,
      ...parsed,
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
