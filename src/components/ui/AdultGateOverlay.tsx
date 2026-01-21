import { useEffect } from "react";

type AdultGateOverlayProps = {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  exitLabel?: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onExit: () => void;
};

export function AdultGateOverlay({
  open,
  title = "Confirmación 18+",
  description = "Para acceder al chat necesitas confirmar tu edad.",
  confirmLabel = "Tengo 18+",
  exitLabel = "Salir",
  confirmDisabled = false,
  onConfirm,
  onExit,
}: AdultGateOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 pb-6 pt-4 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[color:var(--surface-2)]/80" />
        <div className="space-y-3 text-center">
          <div>
            <h3 className="text-base font-semibold text-[color:var(--text)]">{title}</h3>
            <p className="mt-1 text-xs text-[color:var(--muted)]">{description}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onExit}
              className="rounded-full border border-[color:var(--surface-border)] px-4 py-1.5 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
            >
              {exitLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled}
              className="rounded-full bg-[color:rgba(var(--brand-rgb),0.16)] px-4 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.24)] disabled:opacity-60"
            >
              {confirmDisabled ? "Confirmando..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
