import * as Dialog from "@radix-ui/react-dialog";
import clsx from "clsx";
import { useMemo } from "react";

type ServicesSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags?: string[] | null;
  title?: string;
};

const normalizeTags = (tags?: string[] | null) => {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => Boolean(tag));
};

export function ServicesSheet({ open, onOpenChange, tags, title = "Servicios" }: ServicesSheetProps) {
  const normalizedTags = useMemo(() => normalizeTags(tags), [tags]);

  if (normalizedTags.length === 0) return null;

  const chipClassName =
    "inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40" />
        <Dialog.Content
          aria-label={title}
          className="fixed inset-x-0 bottom-0 z-[70] max-h-[70vh] w-full overflow-y-auto overscroll-contain rounded-t-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl sm:inset-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[60vh] sm:w-[min(92vw,420px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <div className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-[color:var(--text)]">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Cerrar"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-sm font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
              >
                ✕
              </button>
            </Dialog.Close>
          </div>
          <div className="px-4 py-4">
            <div className={clsx("flex flex-wrap gap-2", normalizedTags.length > 12 && "pb-1")}>
              {normalizedTags.map((tag, index) => (
                <span key={`${tag}-${index}`} className={chipClassName}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Verification checklist:
// - [ ] "+N" opens Services sheet in PopClip viewer
// - [ ] "+N" opens Services sheet in PopClip tiles when services are shown
// - [ ] Sheet scrolls when tags overflow the max height
