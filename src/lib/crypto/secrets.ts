import crypto from "crypto";

const DEV_FALLBACK_SEED = "DEV_APP_SECRET_KEY_STATIC";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

type Keyring = {
  entries: ParsedKey[];
  activeKey: Buffer;
  source: "env" | "dev";
};

type KeyFormat = "hex" | "base64" | "utf8" | "dev";

type ParsedKey = {
  key: Buffer;
  format: KeyFormat;
  label: string;
};

type CryptoConfigError = Error & { code: "CRYPTO_CONFIG_ERROR" };

let cachedKeyring: Keyring | null = null;
let warnedFallback = false;
let warnedDecryptFailure = false;
let warnedLegacyKey = false;
let verifiedKey = false;

function createConfigError(message: string): CryptoConfigError {
  const err = new Error(message) as CryptoConfigError;
  err.code = "CRYPTO_CONFIG_ERROR";
  return err;
}

export function isCryptoConfigError(err: unknown): err is CryptoConfigError {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "CRYPTO_CONFIG_ERROR");
}

function normalizeBase64(input: string, label: string): string {
  let normalized = input.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized) {
    throw createConfigError(`${label} is empty.`);
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) {
    throw createConfigError(`${label} must be base64 (A-Z, a-z, 0-9, +, /).`);
  }
  const padding = normalized.length % 4;
  if (padding === 1) {
    throw createConfigError(`${label} has invalid base64 padding.`);
  }
  if (padding === 2) normalized += "==";
  if (padding === 3) normalized += "=";
  return normalized;
}

const HEX_KEY_REGEX = /^[0-9a-fA-F]{64}$/;

function stripHexDecorators(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function decodeHexKey(raw: string, label: string, prefixed: boolean): Buffer {
  const trimmed = raw.trim();
  if (!HEX_KEY_REGEX.test(trimmed)) {
    throw createConfigError(
      prefixed
        ? `${label} must be "hex:<64hex>" or "hex:64hex" with 64 hex chars.`
        : `${label} must be 64 hex chars.`
    );
  }
  const key = Buffer.from(trimmed, "hex");
  if (key.length !== KEY_BYTES) {
    throw createConfigError(`${label} must decode to ${KEY_BYTES} bytes.`);
  }
  return key;
}

function decodeBase64Key(raw: string, label: string): Buffer | null {
  try {
    const normalized = normalizeBase64(raw, label);
    const key = Buffer.from(normalized, "base64");
    if (key.length !== KEY_BYTES) {
      return null;
    }
    return key;
  } catch (err) {
    return null;
  }
}

function decodeKey(raw: string, label: string): ParsedKey {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw createConfigError(`${label} is empty.`);
  }

  if (trimmed.toLowerCase().startsWith("hex:")) {
    const hexCandidate = stripHexDecorators(trimmed.slice(4));
    return { key: decodeHexKey(hexCandidate, label, true), format: "hex", label };
  }

  const rawHexCandidate = stripHexDecorators(trimmed);
  if (HEX_KEY_REGEX.test(rawHexCandidate)) {
    return { key: decodeHexKey(rawHexCandidate, label, false), format: "hex", label };
  }

  const base64Key = decodeBase64Key(trimmed, label);
  if (base64Key) {
    return { key: base64Key, format: "base64", label };
  }

  const utf8Key = Buffer.from(trimmed, "utf8");
  if (utf8Key.length === KEY_BYTES) {
    return { key: utf8Key, format: "utf8", label };
  }

  throw createConfigError(
    `${label} must be 32 bytes encoded as base64 (preferred), hex:<64hex> or 64hex, or 32-byte utf8.`
  );
}

function resolveEnvKeyring(): ParsedKey[] | null {
  const keysRaw = typeof process.env.APP_SECRET_KEYS === "string" ? process.env.APP_SECRET_KEYS.trim() : "";
  if (keysRaw) {
    const parts = keysRaw.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) {
      throw createConfigError("APP_SECRET_KEYS is empty.");
    }
    return parts.map((part, index) => decodeKey(part, `APP_SECRET_KEYS[${index + 1}]`));
  }
  const singleRaw = typeof process.env.APP_SECRET_KEY === "string" ? process.env.APP_SECRET_KEY.trim() : "";
  if (singleRaw) {
    if (!warnedLegacyKey) {
      console.warn('APP_SECRET_KEY is deprecated. Use APP_SECRET_KEYS="<newBase64>,hex:<oldHex>".');
      warnedLegacyKey = true;
    }
    return [decodeKey(singleRaw, "APP_SECRET_KEY")];
  }
  return null;
}

function buildKeyring(): Keyring {
  const envKeys = resolveEnvKeyring();
  const isProd = process.env.NODE_ENV === "production";

  if (!envKeys || envKeys.length === 0) {
    if (isProd) {
      throw createConfigError(
        'APP_SECRET_KEYS is required in production. Set APP_SECRET_KEYS="<newBase64>,hex:<oldHex>" (32 bytes).'
      );
    }
    if (!warnedFallback) {
      console.warn("APP_SECRET_KEYS missing; using deterministic dev fallback key.");
      warnedFallback = true;
    }
    const fallbackKey = crypto.createHash("sha256").update(DEV_FALLBACK_SEED).digest();
    return {
      entries: [{ key: fallbackKey, format: "dev", label: "DEV_FALLBACK" }],
      activeKey: fallbackKey,
      source: "dev",
    };
  }

  return { entries: envKeys, activeKey: envKeys[0].key, source: "env" };
}

function getKeyring(): Keyring {
  if (cachedKeyring) return cachedKeyring;
  const keyring = buildKeyring();
  verifyKey(keyring.activeKey);
  cachedKeyring = keyring;
  return keyring;
}

function verifyKey(key: Buffer) {
  if (verifiedKey) return;
  const sample = "novsy-secret-check";
  const encrypted = encryptWithKey(sample, key);
  const decrypted = decryptWithKey(encrypted, key);
  if (decrypted !== sample) {
    throw createConfigError("APP_SECRET_KEYS verification failed.");
  }
  verifiedKey = true;
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decryptWithKey(payload: string, key: Buffer): string {
  const buffer = Buffer.from(payload, "base64");
  if (buffer.length <= IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error("Invalid encrypted payload.");
  }
  const iv = buffer.subarray(0, IV_BYTES);
  const authTag = buffer.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = buffer.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) {
    throw new Error("Missing secret to encrypt.");
  }
  const key = getKeyring().activeKey;
  return encryptWithKey(plaintext, key);
}

export function decryptSecret(payload: string): string {
  if (!payload) {
    throw new Error("Missing secret payload.");
  }
  const result = decryptWithKeyring(payload);
  return result.value;
}

export function decryptSecretSafe(
  payload: string | null | undefined
): { ok: true; value: string; usedKeyIndex?: number; rotatedValue?: string } | { ok: false; errorCode: "DECRYPT_FAILED" | "CONFIG_ERROR"; errorMessage?: string } {
  if (!payload) {
    return { ok: false, errorCode: "DECRYPT_FAILED" };
  }
  try {
    const result = decryptWithKeyring(payload);
    const rotatedValue =
      result.keyIndex > 0 ? encryptWithKey(result.value, getKeyring().activeKey) : undefined;
    return {
      ok: true,
      value: result.value,
      usedKeyIndex: result.keyIndex,
      rotatedValue,
    };
  } catch (err) {
    if (isCryptoConfigError(err)) {
      return { ok: false, errorCode: "CONFIG_ERROR", errorMessage: err.message };
    }
    if (!warnedDecryptFailure) {
      const keyFormats = cachedKeyring?.entries.map((entry) => entry.format) ?? [];
      console.warn("decrypt_secret_failed", {
        reason: err instanceof Error ? err.message : "unknown_error",
        keyFormats,
        keySource: cachedKeyring?.source ?? "unknown",
        keyCount: cachedKeyring?.entries.length ?? 0,
      });
      warnedDecryptFailure = true;
    }
    return { ok: false, errorCode: "DECRYPT_FAILED" };
  }
}

function decryptWithKeyring(payload: string): { value: string; keyIndex: number } {
  const { entries } = getKeyring();
  let lastError: Error | null = null;
  for (let index = 0; index < entries.length; index += 1) {
    try {
      return { value: decryptWithKey(payload, entries[index].key), keyIndex: index };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("decrypt_failed");
    }
  }
  throw lastError ?? new Error("decrypt_failed");
}
