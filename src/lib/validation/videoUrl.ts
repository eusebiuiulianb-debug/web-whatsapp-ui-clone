export type VideoUrlValidationReason = "required" | "youtube" | "extension";

export type VideoUrlValidationResult =
  | { ok: true }
  | { ok: false; reason: VideoUrlValidationReason };

type VideoUrlValidationOptions = {
  required?: boolean;
};

const ALLOWED_EXTENSIONS = [".mp4", ".webm"];

export function validateVideoUrl(url: string, options: VideoUrlValidationOptions = {}): VideoUrlValidationResult {
  const required = options.required !== false;
  const trimmed = url.trim();
  if (!trimmed) {
    return required ? { ok: false, reason: "required" } : { ok: true };
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
    return { ok: false, reason: "youtube" };
  }

  const clean = lower.split("?")[0]?.split("#")[0] ?? lower;
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => clean.endsWith(ext));
  if (!hasAllowedExtension) {
    return { ok: false, reason: "extension" };
  }

  return { ok: true };
}
