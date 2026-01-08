import crypto from "crypto";

const FALLBACK_DEV_KEY = "novsy-dev-secret-key-32bytes!";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

let cachedKey: Buffer | null = null;
let warnedFallback = false;
let verifiedKey = false;

function getSecretKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = typeof process.env.APP_SECRET_KEY === "string" ? process.env.APP_SECRET_KEY.trim() : "";
  const isProd = process.env.NODE_ENV === "production";

  if (!raw) {
    if (isProd) {
      throw new Error("APP_SECRET_KEY is required in production.");
    }
    if (!warnedFallback) {
      console.warn("APP_SECRET_KEY missing; using dev fallback key.");
      warnedFallback = true;
    }
    cachedKey = Buffer.from(FALLBACK_DEV_KEY, "utf8");
    if (cachedKey.length !== 32) {
      cachedKey = crypto.createHash("sha256").update(FALLBACK_DEV_KEY).digest();
    }
    verifyKey(cachedKey);
    return cachedKey;
  }

  let key: Buffer;
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    const rawBytes = Buffer.from(raw, "utf8");
    if (rawBytes.length === 32) {
      key = rawBytes;
    } else if (isProd) {
      throw new Error("APP_SECRET_KEY must be 32 bytes or 64 hex chars in production.");
    } else {
      if (!warnedFallback) {
        console.warn("APP_SECRET_KEY length is not 32 bytes; deriving a dev key via SHA-256.");
        warnedFallback = true;
      }
      key = crypto.createHash("sha256").update(rawBytes).digest();
    }
  }

  if (key.length !== 32) {
    throw new Error("APP_SECRET_KEY resolved to invalid length.");
  }

  cachedKey = key;
  verifyKey(cachedKey);
  return cachedKey;
}

function verifyKey(key: Buffer) {
  if (verifiedKey) return;
  const sample = "novsy-secret-check";
  const encrypted = encryptWithKey(sample, key);
  const decrypted = decryptWithKey(encrypted, key);
  if (decrypted !== sample) {
    throw new Error("APP_SECRET_KEY verification failed.");
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
  const key = getSecretKey();
  return encryptWithKey(plaintext, key);
}

export function decryptSecret(payload: string): string {
  if (!payload) {
    throw new Error("Missing secret payload.");
  }
  const key = getSecretKey();
  return decryptWithKey(payload, key);
}
