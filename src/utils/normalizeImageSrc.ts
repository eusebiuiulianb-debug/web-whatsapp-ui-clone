export function normalizeImageSrc(src?: string | null): string {
  const trimmed = (src || "").trim();
  if (!trimmed) return "/avatar.jpg";
  if (trimmed.startsWith("/") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `/${trimmed.replace(/^\/+/, "")}`;
}
