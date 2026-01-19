import Image from "next/image";
import clsx from "clsx";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";

export type PublicCatalogCardItem = {
  id: string;
  kind: "pack" | "sub" | "extra" | "popclip";
  title: string;
  priceCents?: number;
  currency?: string;
  priceLabel?: string;
  thumbUrl?: string | null;
  href?: string;
  showSave?: boolean;
  likeCount?: number;
  commentCount?: number;
  liked?: boolean;
  canInteract?: boolean;
};

const KIND_LABELS: Record<PublicCatalogCardItem["kind"], string> = {
  pack: "Pack",
  sub: "Sub",
  extra: "Extra",
  popclip: "Clip",
};

const KIND_CLASSNAMES: Record<PublicCatalogCardItem["kind"], string> = {
  pack: "border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)]",
  sub: "border-[color:rgba(34,197,94,0.55)] bg-[color:rgba(34,197,94,0.16)] text-[color:var(--text)]",
  extra: "border-[color:rgba(245,158,11,0.6)] bg-[color:rgba(245,158,11,0.14)] text-[color:var(--text)]",
  popclip: "border-[color:rgba(59,130,246,0.55)] bg-[color:rgba(59,130,246,0.14)] text-[color:var(--text)]",
};

export function PublicCatalogCard({
  item,
  variant = "default",
}: {
  item: PublicCatalogCardItem;
  variant?: "default" | "featured";
}) {
  const priceLabel = item.priceLabel ?? formatPrice(item.priceCents, item.currency);
  const cardClass = clsx(
    "group rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg",
    variant === "featured" && "border-[color:rgba(var(--brand-rgb),0.35)] bg-[color:var(--surface-2)]"
  );
  return (
    <div className={cardClass}>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)]">
        {item.thumbUrl ? (
          <Image
            src={normalizeImageSrc(item.thumbUrl)}
            alt={item.title}
            width={320}
            height={320}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[color:var(--surface-1)] to-[color:var(--surface-2)] text-[10px] text-[color:var(--muted)]">
            Sin imagen
          </div>
        )}
        {item.showSave && (
          <button
            type="button"
            aria-label="Guardar"
            className="absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:rgba(17,24,39,0.65)] text-xs text-[color:var(--text)] backdrop-blur hover:border-[color:var(--brand)]"
          >
            ☆
          </button>
        )}
        {priceLabel ? (
          <span className="absolute right-2 top-2 rounded-full border border-[color:rgba(15,23,42,0.4)] bg-[color:rgba(15,23,42,0.7)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--text)]">
            {priceLabel}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={clsx(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
            KIND_CLASSNAMES[item.kind]
          )}
        >
          {KIND_LABELS[item.kind]}
        </span>
      </div>
      <div className="mt-1 text-sm font-semibold text-[color:var(--text)] line-clamp-2 min-h-[2.5rem]">
        {item.title}
      </div>
    </div>
  );
}

function formatPrice(cents?: number, currency?: string) {
  if (!Number.isFinite(cents)) return "";
  const amount = (cents as number) / 100;
  const resolvedCurrency = currency || "EUR";
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: resolvedCurrency }).format(amount);
  } catch (_err) {
    return `${amount.toFixed(2)} ${resolvedCurrency}`;
  }
}
