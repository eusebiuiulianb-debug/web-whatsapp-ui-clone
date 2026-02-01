import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCallback } from "react";

export type AuthModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo?: string;
  onContinue?: () => void;
};

export function AuthModal({ open, onOpenChange, returnTo, onContinue }: AuthModalProps) {
  const handleContinue = useCallback(() => {
    if (onContinue) {
      onContinue();
      return;
    }
    if (typeof window === "undefined") return;
    window.location.assign(buildLoginHref(returnTo));
  }, [onContinue, returnTo]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-4 py-3">
            <Dialog.Title className="text-sm font-semibold">Inicia sesión para guardar</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Cerrar"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--muted)] transition hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          <div className="space-y-3 px-4 py-4">
            <p className="text-xs text-[color:var(--muted)]">
              Guarda PopClips para encontrarlos rapido cuando quieras volver.
            </p>
            <button
              type="button"
              onClick={handleContinue}
              className="inline-flex h-10 w-full items-center justify-center rounded-full bg-[color:var(--brand-strong)] text-sm font-semibold text-[color:var(--surface-0)] shadow-lg transition hover:bg-[color:var(--brand)]"
            >
              Continuar con email
            </button>
            <div className="grid gap-2">
              <button
                type="button"
                disabled
                className="inline-flex h-10 w-full items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-xs font-semibold text-[color:var(--muted)]"
              >
                Continuar con Google (proximamente)
              </button>
              <button
                type="button"
                disabled
                className="inline-flex h-10 w-full items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-xs font-semibold text-[color:var(--muted)]"
              >
                Continuar con Facebook (proximamente)
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function buildLoginHref(returnTo?: string) {
  const safeReturnTo = typeof returnTo === "string" ? returnTo.trim() : "";
  if (!safeReturnTo || !safeReturnTo.startsWith("/") || safeReturnTo.startsWith("//")) {
    return "/login";
  }
  return `/login?returnTo=${encodeURIComponent(safeReturnTo)}`;
}
