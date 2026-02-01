const AGE_GATE_STORAGE_KEY = "novsy_age_verified";

export function getAgeVerified(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AGE_GATE_STORAGE_KEY) === "1";
  } catch (_err) {
    return false;
  }
}

export function setAgeVerified(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AGE_GATE_STORAGE_KEY, "1");
  } catch (_err) {
    // ignore storage failures
  }
}
