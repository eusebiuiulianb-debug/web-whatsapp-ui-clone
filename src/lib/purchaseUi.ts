type PurchaseViewer = "creator" | "fan";

type PurchaseUiPayload = {
  kind?: string;
  amountCents?: number;
  fanName?: string;
  viewer?: PurchaseViewer;
};

type PurchaseUiLabels = {
  icon: string;
  amountLabel: string;
  shortLabel: string;
  toastLabel: string;
  badgeLabel: string;
  chatLabel: string;
};

function normalizeKind(raw?: string) {
  const value = (raw || "").toUpperCase();
  if (value.includes("TIP") || value.includes("SUPPORT")) return "TIP";
  if (value.includes("GIFT")) return "GIFT";
  if (value.includes("EXTRA")) return "EXTRA";
  if (value.includes("SUB") || value.includes("PACK")) return "SUB";
  return "TIP";
}

function resolveIcon(kind: string) {
  switch (kind) {
    case "GIFT":
      return "🎁";
    case "EXTRA":
      return "✨";
    case "SUB":
      return "⭐";
    case "TIP":
    default:
      return "💚";
  }
}

function formatAmount(amountCents?: number) {
  const amountValue = typeof amountCents === "number" ? amountCents / 100 : 0;
  const rounded = Math.round(amountValue * 100) / 100;
  const numberLabel = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2);
  return `${numberLabel} €`;
}

export function formatPurchaseUI(payload: PurchaseUiPayload): PurchaseUiLabels {
  const kind = normalizeKind(payload.kind);
  const icon = resolveIcon(kind);
  const amountLabel = formatAmount(payload.amountCents);
  const shortLabel = `+${amountLabel}`;
  const fanName = (payload.fanName || "").trim();
  const toastLabel = fanName ? `${shortLabel} de ${fanName}` : `${shortLabel} recibido`;
  const viewer: PurchaseViewer = payload.viewer ?? "creator";
  const chatLabel = viewer === "fan" ? `Has apoyado con ${amountLabel}` : `${shortLabel} recibido`;
  return {
    icon,
    amountLabel,
    shortLabel,
    toastLabel,
    badgeLabel: shortLabel,
    chatLabel,
  };
}
