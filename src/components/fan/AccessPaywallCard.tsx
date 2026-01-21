import clsx from "clsx";

export type AccessPaywallPack = {
  id: string;
  name: string;
  price: string;
  description?: string;
};

type AccessPaywallCardProps = {
  packs: AccessPaywallPack[];
  isLoading: boolean;
  error?: string | null;
  walletStatusLabel: string;
  walletDisabled?: boolean;
  topupDisabled?: boolean;
  onTopup: () => void;
  onPurchase: (pack: AccessPaywallPack) => void;
  isPurchasing: (packId: string) => boolean;
};

export function AccessPaywallCard({
  packs,
  isLoading,
  error,
  walletStatusLabel,
  walletDisabled = false,
  topupDisabled = false,
  onTopup,
  onPurchase,
  isPurchasing,
}: AccessPaywallCardProps) {
  return (
    <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[color:var(--text)]">Acceso requerido</h3>
          <p className="text-xs text-[color:var(--muted)]">
            Compra un pack para desbloquear el chat y los comentarios.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Saldo</div>
          <div className="text-sm font-semibold text-[color:var(--text)]">{walletStatusLabel}</div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2">
        <span className="text-xs text-[color:var(--muted)]">
          {walletDisabled ? "Wallet no disponible." : "Recarga para comprar un pack."}
        </span>
        <button
          type="button"
          onClick={onTopup}
          disabled={topupDisabled || walletDisabled}
          className={clsx(
            "rounded-full border px-3 py-1 text-[11px] font-semibold transition",
            topupDisabled || walletDisabled
              ? "border-[color:var(--surface-border)] text-[color:var(--muted)] cursor-not-allowed"
              : "border-[color:rgba(var(--brand-rgb),0.6)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)]"
          )}
        >
          Recargar
        </button>
      </div>
      {error && <div className="text-xs text-[color:var(--danger)]">{error}</div>}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={`paywall-skeleton-${idx}`}
              className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-3 animate-pulse"
            >
              <div className="h-3 w-1/2 rounded bg-[color:var(--surface-1)]" />
              <div className="mt-2 h-2 w-2/3 rounded bg-[color:var(--surface-1)]" />
            </div>
          ))}
        </div>
      ) : packs.length === 0 ? (
        <div className="text-xs text-[color:var(--muted)]">No hay packs disponibles.</div>
      ) : (
        <div className="space-y-2">
          {packs.map((pack) => {
            const purchasing = isPurchasing(pack.id);
            return (
              <div
                key={pack.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[color:var(--text)]">{pack.name}</div>
                  {pack.description && (
                    <div className="text-xs text-[color:var(--muted)] line-clamp-1">{pack.description}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-sm font-semibold text-[color:var(--warning)]">{pack.price}</span>
                  <button
                    type="button"
                    onClick={() => onPurchase(pack)}
                    disabled={purchasing}
                    className={clsx(
                      "rounded-full px-3 py-1 text-[11px] font-semibold transition",
                      purchasing
                        ? "border border-[color:var(--surface-border)] text-[color:var(--muted)] cursor-not-allowed"
                        : "border border-[color:rgba(var(--brand-rgb),0.6)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)]"
                    )}
                  >
                    {purchasing ? "Procesando..." : "Comprar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
