import { ENCRYPTED_BLOB_REMOVED, stripEncryptedBlobs, stripLargeBase64LikeBlobs } from "../../lib/encryptedBlobs";

type SanitizeOptions = {
  creatorId?: string;
};

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /^authorization$/i,
  /^cookie$/i,
  /api[_-]?key/i,
  /openai[_-]?api[_-]?key/i,
  /token/i,
  /secret/i,
  /password/i,
];

export function sanitizeForOpenAi<T>(value: T, opts?: SanitizeOptions): T {
  return sanitizeValue(value as unknown, { creatorId: opts?.creatorId, path: [] }) as T;
}

function sanitizeValue(value: unknown, ctx: { creatorId?: string; path: string[] }): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    const items = value
      .map((item, idx) => sanitizeValue(item, { creatorId: ctx.creatorId, path: [...ctx.path, String(idx)] }))
      .filter((item) => item !== null && item !== undefined);
    return items;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(record)) {
      const nextPath = [...ctx.path, key];

      if (isSensitiveKey(key)) {
        out[key] = "[redacted]";
        continue;
      }

      if (key.toLowerCase() === "encrypted_content") {
        if (typeof out.content !== "string") {
          out.content = ENCRYPTED_BLOB_REMOVED;
        }
        continue;
      }

      const sanitized = sanitizeValue(raw, { creatorId: ctx.creatorId, path: nextPath });
      if (sanitized === null || sanitized === undefined) continue;
      out[key] = sanitized;
    }

    return out;
  }

  return null;
}

function sanitizeString(value: string): string {
  const withoutEncrypted = stripEncryptedBlobs(value, ENCRYPTED_BLOB_REMOVED);
  return stripLargeBase64LikeBlobs(withoutEncrypted, ENCRYPTED_BLOB_REMOVED);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}
