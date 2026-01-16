const MAX_IDEMPOTENCY_KEY = 120;

export type WalletSnapshot = {
  id: string;
  fanId: string;
  currency: string;
  balanceCents: number;
};

export function hasWalletModel(prismaClient: unknown): boolean {
  const walletClient = (prismaClient as any)?.wallet;
  return Boolean(walletClient && typeof walletClient.findUnique === "function");
}

export function normalizeIdempotencyKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_IDEMPOTENCY_KEY);
}

export function normalizeAmountCents(value: unknown, maxCents: number): number | null {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number.parseInt(value, 10)
      : NaN;
  if (!Number.isFinite(amount)) return null;
  if (amount <= 0 || amount > maxCents) return null;
  return Math.round(amount);
}

export async function getOrCreateWallet(prismaClient: unknown, fanId: string): Promise<WalletSnapshot | null> {
  if (!hasWalletModel(prismaClient)) return null;
  const walletClient = (prismaClient as any).wallet;
  const mapWallet = (record: any): WalletSnapshot => ({
    id: record.id,
    fanId: record.fanId,
    currency: record.currency || "EUR",
    balanceCents: record.balanceCents ?? 0,
  });
  try {
    if (typeof walletClient.upsert === "function") {
      const upserted = await walletClient.upsert({
        where: { fanId },
        update: { updatedAt: new Date() },
        create: {
          fanId,
          currency: "EUR",
          balanceCents: 0,
        },
      });
      return mapWallet(upserted);
    }
    const existing = await walletClient.findUnique({ where: { fanId } });
    if (existing) return mapWallet(existing);
    const created = await walletClient.create({
      data: {
        fanId,
        currency: "EUR",
        balanceCents: 0,
        updatedAt: new Date(),
      },
    });
    return mapWallet(created);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") {
      const retry = await walletClient.findUnique({ where: { fanId } });
      if (retry) {
        return mapWallet(retry);
      }
    }
    throw err;
  }
}

export function buildWalletPayload(wallet: WalletSnapshot | null | undefined) {
  if (!wallet) {
    return { wallet: { enabled: false } };
  }
  return {
    wallet: {
      enabled: true,
      currency: wallet.currency || "EUR",
      balanceCents: wallet.balanceCents ?? 0,
    },
  };
}
