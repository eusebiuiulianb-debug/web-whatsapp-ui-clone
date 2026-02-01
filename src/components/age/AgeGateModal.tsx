import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export type AgeGateModalProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AgeGateModal({ open, onConfirm, onCancel }: AgeGateModalProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-4 py-3">
            <Dialog.Title className="text-sm font-semibold">Contenido +18</Dialog.Title>
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
          <div className="space-y-4 px-4 py-4">
            <p className="text-xs text-[color:var(--muted)]">
              Contenido +18. Confirma que tienes 18+ para continuar.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onConfirm}
                className="inline-flex h-10 w-full items-center justify-center rounded-full bg-[color:var(--brand-strong)] text-sm font-semibold text-[color:var(--surface-0)] shadow-lg transition hover:bg-[color:var(--brand)]"
              >
                Tengo 18+ / Continuar
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex h-10 w-full items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-xs font-semibold text-[color:var(--text)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
