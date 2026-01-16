import { PACKS } from "../config/packs";
import type { GrantType } from "./accessGrants";

export type PackStatus = "LOCKED" | "UNLOCKED" | "ACTIVE";

export type PackLike = {
  id: string;
  name: string;
  price?: string | number | null;
};

type GrantLike = {
  type: string;
  expiresAt: Date;
};

const PACK_TOKEN_SETS: Record<GrantType, string[]> = {
  trial: ["trial", "welcome", "bienvenida", "prueba"],
  monthly: ["monthly", "mensual"],
  special: ["special", "especial", "pareja"],
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

export function parseAmountValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/[^\d.,]/g, "").replace(",", ".");
    const amount = Number.parseFloat(normalized);
    return Number.isFinite(amount) ? amount : null;
  }
  return null;
}

export function resolveGrantTypeFromPack(pack: PackLike, amountOverride?: number | null): GrantType | null {
  const haystack = normalizeText(`${pack.id} ${pack.name}`);
  for (const [grantType, tokens] of Object.entries(PACK_TOKEN_SETS) as Array<[GrantType, string[]]>) {
    if (tokens.some((token) => haystack.includes(token))) {
      return grantType;
    }
  }

  const amount = typeof amountOverride === "number" ? amountOverride : parseAmountValue(pack.price ?? null);
  if (typeof amount === "number") {
    if (amount === PACKS.monthly.price) return "monthly";
    if (amount === PACKS.special.price) return "special";
    if (amount === PACKS.trial.price) return "trial";
  }
  return null;
}

export function buildPackStatusById(packs: PackLike[], grants: GrantLike[], now: Date = new Date()) {
  const grantState: Record<string, { hasAny: boolean; hasActive: boolean }> = {};
  for (const grant of grants) {
    const type = typeof grant.type === "string" ? grant.type.toLowerCase() : "";
    if (!type) continue;
    const state = grantState[type] ?? { hasAny: false, hasActive: false };
    state.hasAny = true;
    if (grant.expiresAt > now) {
      state.hasActive = true;
    }
    grantState[type] = state;
  }

  const packStatusById: Record<string, PackStatus> = {};
  const unlockedPacks: string[] = [];

  for (const pack of packs) {
    const packId = pack.id;
    if (!packId) continue;
    const grantType = resolveGrantTypeFromPack(pack);
    let status: PackStatus = "LOCKED";
    if (grantType) {
      const state = grantState[grantType] ?? { hasAny: false, hasActive: false };
      if (state.hasActive) {
        status = "ACTIVE";
      } else if (state.hasAny) {
        status = "UNLOCKED";
      }
    }
    packStatusById[packId] = status;
    if (status !== "LOCKED") {
      unlockedPacks.push(packId);
    }
  }

  return { packStatusById, unlockedPacks };
}
