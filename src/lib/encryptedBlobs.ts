export const ENCRYPTED_BLOB_REMOVED = "[REDACTED_BLOB]";

const MIN_TOKEN_CHARS = 20;
const TOKEN_BODY_RE = `[0-9A-Za-z_-]{${MIN_TOKEN_CHARS},}`;
const BASE64_LIKE_BLOB_RE = /[0-9A-Za-z+/=_-]{200,}/g;

const LEGACY_TOKEN_RE = new RegExp(`gAAAA${TOKEN_BODY_RE}`, "g");
const PREFIXED_TOKEN_RE = new RegExp(`enc:v1:gAAAA${TOKEN_BODY_RE}`, "g");
const ANY_TOKEN_RE = new RegExp(`(?:enc:v1:)?gAAAA${TOKEN_BODY_RE}`, "g");

export function stripEncryptedBlobs(value: string, replacement = ENCRYPTED_BLOB_REMOVED): string {
  if (!value) return value;
  if (!value.includes("gAAAA")) return value;
  return value.replace(ANY_TOKEN_RE, replacement);
}

export function stripLargeBase64LikeBlobs(value: string, replacement = ENCRYPTED_BLOB_REMOVED): string {
  if (!value) return value;
  return value.replace(BASE64_LIKE_BLOB_RE, replacement);
}

export function redactEncryptedBlobs(value: string): string {
  if (!value) return value;

  return stripLargeBase64LikeBlobs(
    value.includes("gAAAA")
      ? value
          .replace(PREFIXED_TOKEN_RE, "enc:v1:gAAAA…REDACTED…")
          .replace(LEGACY_TOKEN_RE, "gAAAA…REDACTED…")
      : value
  );
}
