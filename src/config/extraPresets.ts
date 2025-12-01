export type ExtraPresetKey = "PHOTO" | "VIDEO" | "COMBO";

export type ExtraPreset = {
  key: ExtraPresetKey;
  title: string;
  subtitle: string;
  message: string;
};

export const defaultExtraPresets: Record<ExtraPresetKey, ExtraPreset> = {
  PHOTO: {
    key: "PHOTO",
    title: "Foto extra",
    subtitle: "1 foto nueva solo para ti",
    message:
      'Te propongo un pack rápido: 1 foto extra hecha ahora solo para ti por 9 €. Si te encaja, dime "FOTO" y te explico cómo hacer el pago y te la envío.',
  },
  VIDEO: {
    key: "VIDEO",
    title: "Vídeo extra",
    subtitle: "Vídeo corto grabado ahora",
    message:
      'Si prefieres vídeo, tengo un pack con 1 vídeo corto (30-60 segundos) grabado ahora para ti por 19 €. Si te apetece, dime "VÍDEO" y te explico cómo hacerlo.',
  },
  COMBO: {
    key: "COMBO",
    title: "Combo foto + vídeo",
    subtitle: "3 fotos + 1 vídeo más intenso",
    message:
      'Y si quieres algo más completo, te propongo un combo: 3 fotos + 1 vídeo más íntimo por 29 €. Si te cuadra, dime "COMBO" y organizamos el pago y el envío del contenido.',
  },
};
