import { defaultExtraPresets, ExtraPreset, ExtraPresetKey } from "../config/extraPresets";

const STORAGE_KEY = "novsy.extraPresets.v1";

export function loadExtraPresets(): Record<ExtraPresetKey, ExtraPreset> {
  if (typeof window === "undefined") return defaultExtraPresets;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultExtraPresets;

    const parsed = JSON.parse(raw) as Partial<Record<ExtraPresetKey, Partial<ExtraPreset>>>;

    return {
      PHOTO: { ...defaultExtraPresets.PHOTO, ...(parsed.PHOTO || {}) },
      VIDEO: { ...defaultExtraPresets.VIDEO, ...(parsed.VIDEO || {}) },
      COMBO: { ...defaultExtraPresets.COMBO, ...(parsed.COMBO || {}) },
    };
  } catch {
    return defaultExtraPresets;
  }
}

export function saveExtraPresets(presets: Record<ExtraPresetKey, ExtraPreset>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}
