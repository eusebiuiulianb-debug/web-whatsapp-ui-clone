import type { ServerResponse } from "http";
import type { NextApiRequest } from "next";
import { parseCookieHeader } from "./fan/session";

const ADULT_CONFIRM_STORAGE_KEY = "novsy_adult_confirmed_at";
const ADULT_CONFIRM_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const ADULT_COOKIE_NAME = "adult_ok";
const ADULT_COOKIE_MAX_AGE = 60 * 60 * 24 * 120;

export function readAdultConfirmedAtFromStorage(now = Date.now()): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ADULT_CONFIRM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      window.localStorage.removeItem(ADULT_CONFIRM_STORAGE_KEY);
      return null;
    }
    if (now - parsed > ADULT_CONFIRM_TTL_MS) {
      window.localStorage.removeItem(ADULT_CONFIRM_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (_err) {
    return null;
  }
}

export function writeAdultConfirmedAtToStorage(timestamp = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ADULT_CONFIRM_STORAGE_KEY, String(timestamp));
  } catch (_err) {
    // ignore storage failures
  }
}

export function clearAdultConfirmedAtStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ADULT_CONFIRM_STORAGE_KEY);
  } catch (_err) {
    // ignore storage failures
  }
}

export function hasAdultAccess(req?: Pick<NextApiRequest, "headers">): boolean {
  if (req?.headers?.cookie) {
    const cookies = parseCookieHeader(req.headers.cookie);
    return cookies[ADULT_COOKIE_NAME] === "true";
  }
  if (typeof document === "undefined") return false;
  return getCookieValue(ADULT_COOKIE_NAME) === "true";
}

export function setAdultAccessCookie(
  res: Pick<ServerResponse, "getHeader" | "setHeader">,
  maxAgeSeconds = ADULT_COOKIE_MAX_AGE
) {
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookieValue = `${ADULT_COOKIE_NAME}=true; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secureFlag}`;
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookieValue]);
    return;
  }
  res.setHeader("Set-Cookie", [existing as string, cookieValue]);
}

export async function confirmAdultAccess(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch("/api/auth/adult-confirm", { method: "POST", credentials: "include" });
    if (!res.ok) return false;
    return true;
  } catch (_err) {
    return false;
  }
}

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const entries = document.cookie.split(";").map((part) => part.trim());
  for (const entry of entries) {
    if (!entry) continue;
    const [rawKey, ...rest] = entry.split("=");
    if (decodeURIComponent(rawKey) !== name) continue;
    return decodeURIComponent(rest.join("="));
  }
  return null;
}
