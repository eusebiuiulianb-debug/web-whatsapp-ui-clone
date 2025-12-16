import { createDecipheriv, createHmac, timingSafeEqual } from "crypto";

type MaybeDecryptContext = {
  creatorId?: string;
  label?: string;
};

const ENCRYPTED_PREFIX = "gAAAA";

const FERNET_ENV_KEYS = [
  "FERNET_KEY",
  "FERNET_SECRET",
  "NOVSY_FERNET_KEY",
  "NOVSY_ENCRYPTION_KEY",
  "ENCRYPTION_KEY",
  "CRYPTO_KEY",
] as const;

export function looksLikeEncryptedToken(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

export function maybeDecrypt(token: string | null | undefined, ctx?: MaybeDecryptContext): string | null {
  if (token === null || token === undefined) return null;
  if (typeof token !== "string") return null;

  const candidate = token.trim();
  if (!candidate) return token;
  if (!looksLikeEncryptedToken(candidate)) return token;

  const keyInfo = resolveFernetKeyFromEnv();
  if (!keyInfo) {
    console.warn("decrypt_failed", { creatorId: ctx?.creatorId ?? null, label: ctx?.label ?? null, reason: "missing_env_key" });
    return null;
  }

  try {
    return decryptFernetToken(candidate, keyInfo.key);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown_error";
    console.warn("decrypt_failed", {
      creatorId: ctx?.creatorId ?? null,
      label: ctx?.label ?? null,
      reason,
      keySource: keyInfo.source,
    });
    return null;
  }
}

function resolveFernetKeyFromEnv(): { key: string; source: string } | null {
  for (const envKey of FERNET_ENV_KEYS) {
    const value = process.env[envKey];
    if (typeof value === "string" && value.trim()) {
      return { key: value.trim(), source: envKey };
    }
  }
  return null;
}

function decryptFernetToken(token: string, rawKey: string): string {
  const keyBytes = base64UrlDecode(rawKey);
  if (!keyBytes || keyBytes.length !== 32) {
    throw new Error("invalid_fernet_key");
  }

  const tokenBytes = base64UrlDecode(token);
  if (!tokenBytes || tokenBytes.length < 1 + 8 + 16 + 32 + 1) {
    throw new Error("invalid_fernet_token");
  }

  const version = tokenBytes[0];
  if (version !== 0x80) {
    throw new Error("unsupported_fernet_version");
  }

  const signingKey = keyBytes.subarray(0, 16);
  const encryptionKey = keyBytes.subarray(16);

  const signed = tokenBytes.subarray(0, tokenBytes.length - 32);
  const signature = tokenBytes.subarray(tokenBytes.length - 32);
  const expectedSignature = createHmac("sha256", signingKey).update(signed).digest();

  if (expectedSignature.length !== signature.length || !timingSafeEqual(expectedSignature, signature)) {
    throw new Error("invalid_fernet_signature");
  }

  const ivStart = 1 + 8;
  const ivEnd = ivStart + 16;
  const iv = signed.subarray(ivStart, ivEnd);
  const ciphertext = signed.subarray(ivEnd);

  try {
    const decipher = createDecipheriv("aes-128-cbc", encryptionKey, iv);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch (_err) {
    throw new Error("invalid_fernet_ciphertext");
  }
}

function base64UrlDecode(value: string): Buffer | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const base64 = toBase64(trimmed);
  try {
    return Buffer.from(base64, "base64");
  } catch (_err) {
    return null;
  }
}

function toBase64(base64Url: string): string {
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4;
  if (padding === 2) base64 += "==";
  else if (padding === 3) base64 += "=";
  else if (padding === 1) {
    // Invalid base64url length; keep as-is so decoder can fail deterministically.
  }
  return base64;
}

