export type ExtraPresetKind = "PHOTO" | "VIDEO" | "COMBO";
export type TimeOfDay = "DAY" | "NIGHT";
export type ExtraTier = "T0" | "T1" | "T2" | "T3";

export type ExtraPresetKey =
  | "PHOTO_DAY"
  | "PHOTO_NIGHT"
  | "VIDEO_DAY"
  | "VIDEO_NIGHT"
  | "COMBO_DAY"
  | "COMBO_NIGHT";

export type ExtraPresetsConfig = Record<ExtraPresetKey, string>;

export const DEFAULT_EXTRA_PRESETS: ExtraPresetsConfig = {
  PHOTO_DAY:
    'Te propongo una foto extra hecha ahora mismo solo para ti por {precio} €. Si te encaja, dime "FOTO" y te explico cómo hacer el pago.',
  PHOTO_NIGHT:
    'Tengo una foto extra un poco más íntima solo para ti por {precio} €. Si te apetece, dime "FOTO" y te explico cómo hacer el pago.',
  VIDEO_DAY:
    'Puedo grabarte ahora un vídeo corto solo para ti por {precio} €. Si quieres, dime "VIDEO" y te explico cómo hacerlo.',
  VIDEO_NIGHT:
    'Te grabo ahora un vídeo corto más íntimo solo para ti por {precio} €. Si te apetece, dime "VIDEO" y te explico el pago.',
  COMBO_DAY:
    'Tengo un combo con 3 fotos + 1 vídeo más intenso por {precio} €. Si te interesa, dime "COMBO" y te explico cómo hacerlo.',
  COMBO_NIGHT:
    'Te propongo un combo de 3 fotos + 1 vídeo más intenso por {precio} €. Si te apetece probar, dime "COMBO" y te explico el pago.',
};

const STORAGE_KEY = "novsy_extra_presets_v1";

export function loadExtraPresets(): ExtraPresetsConfig {
  if (typeof window === "undefined") return DEFAULT_EXTRA_PRESETS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_EXTRA_PRESETS;
    const parsed = JSON.parse(raw) as Partial<ExtraPresetsConfig>;
    return { ...DEFAULT_EXTRA_PRESETS, ...parsed };
  } catch (_err) {
    return DEFAULT_EXTRA_PRESETS;
  }
}

export function saveExtraPresets(config: ExtraPresetsConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function buildExtraText(key: ExtraPresetKey, presets: ExtraPresetsConfig, price: number): string {
  const template = presets[key] ?? DEFAULT_EXTRA_PRESETS[key];
  return template.replace("{precio}", String(price));
}

export function getPresetKeyFor(kind: ExtraPresetKind, mode: TimeOfDay): ExtraPresetKey {
  if (kind === "PHOTO") return mode === "DAY" ? "PHOTO_DAY" : "PHOTO_NIGHT";
  if (kind === "VIDEO") return mode === "DAY" ? "VIDEO_DAY" : "VIDEO_NIGHT";
  return mode === "DAY" ? "COMBO_DAY" : "COMBO_NIGHT";
}
