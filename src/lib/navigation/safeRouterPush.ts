import Router, { type NextRouter } from "next/router";
import type { UrlObject } from "url";

type RouterTarget = string | UrlObject;

type NavDebugState = {
  lastTarget?: string;
  lastAt?: number;
  seq?: number;
};

function buildFallbackUrl(target: RouterTarget): string | null {
  if (typeof target === "string") return target;
  if (!target || typeof target !== "object") return null;
  const pathname = typeof target.pathname === "string" ? target.pathname : "";
  const params = new URLSearchParams();
  if (target.query && typeof target.query === "object") {
    Object.entries(target.query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry === undefined || entry === null) return;
          params.append(key, String(entry));
        });
        return;
      }
      params.set(key, String(value));
    });
  }
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

export async function safeRouterPush(
  router: NextRouter,
  target: RouterTarget,
  as?: RouterTarget,
  options?: Parameters<NextRouter["push"]>[2]
) {
  const fallbackUrl = buildFallbackUrl(as ?? target);
  if (typeof window === "undefined" || !fallbackUrl) {
    return router.push(target, as as string | undefined, options);
  }

  if (router.asPath === fallbackUrl) return true;

  const debugEnabled = Boolean((window as unknown as { __NAV_DEBUG_ENABLED__?: boolean }).__NAV_DEBUG_ENABLED__);
  const startAt = Number(performance.now().toFixed(1));
  if (debugEnabled) {
    console.log("[safeRouterPush] begin", { from: router.asPath, to: fallbackUrl, t: startAt });
  }

  const debugState = (window as unknown as { __nav_debug?: NavDebugState }).__nav_debug ?? {};
  const now = Number(performance.now().toFixed(1));
  const prevAt = debugState.lastAt ?? null;
  const prevTarget = debugState.lastTarget ?? null;
  const nextSeq = (debugState.seq ?? 0) + 1;
  (window as unknown as { __nav_debug?: NavDebugState }).__nav_debug = {
    lastTarget: fallbackUrl,
    lastAt: now,
    seq: nextSeq,
  };
  if (process.env.NODE_ENV === "development") {
    const delta = prevAt ? now - prevAt : null;
    console.log("[safeRouterPush] start", { target: fallbackUrl, seq: nextSeq, prevTarget, dt: delta });
  }

  let cancelled = false;
  const handleError = (err: unknown, url: string) => {
    if (url !== fallbackUrl) return;
    const error = err as { cancelled?: boolean; message?: string } | null;
    const message = typeof error?.message === "string" ? error.message : "";
    if (error?.cancelled || /cancel rendering route/i.test(message)) {
      cancelled = true;
    }
    if (process.env.NODE_ENV === "development") {
      console.warn("[safeRouterPush] routeChangeError", { url, cancelled, message, err: error });
    }
  };

  Router.events.on("routeChangeError", handleError);
  try {
    const resolved = await router.push(target, as as string | undefined, options);
    if (process.env.NODE_ENV === "development") {
      console.log("[safeRouterPush] resolved", { target: fallbackUrl, resolved, cancelled });
    }
    if (debugEnabled) {
      const endAt = Number(performance.now().toFixed(1));
      console.log("[safeRouterPush] end", { from: router.asPath, to: fallbackUrl, resolved, cancelled, dt: endAt - startAt });
    }
    if (!resolved || cancelled) {
      window.location.assign(fallbackUrl);
      return false;
    }
    return resolved;
  } catch (_err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[safeRouterPush] push threw", { target: fallbackUrl, cancelled });
    }
    if (debugEnabled) {
      const endAt = Number(performance.now().toFixed(1));
      console.warn("[safeRouterPush] error", { from: router.asPath, to: fallbackUrl, cancelled, dt: endAt - startAt });
    }
    window.location.assign(fallbackUrl);
    return false;
  } finally {
    Router.events.off("routeChangeError", handleError);
  }
}