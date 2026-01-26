import * as Dialog from "@radix-ui/react-dialog";
import clsx from "clsx";
import { useMemo, useState } from "react";

type Props = {
  tags?: string[];
  maxVisible?: number;
  label?: string;
  className?: string;
};

const DEFAULT_MAX_VISIBLE = 6;

const normalizeTags = (tags?: string[]) => {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => Boolean(tag));
};

export function OfferTagsRow({ tags, maxVisible = DEFAULT_MAX_VISIBLE, label = "Servicios", className }: Props) {
  const normalizedTags = useMemo(() => normalizeTags(tags), [tags]);
  const [open, setOpen] = useState(false);

  if (normalizedTags.length === 0) return null;

  const visibleTags = normalizedTags.slice(0, maxVisible);
  const hiddenCount = Math.max(0, normalizedTags.length - visibleTags.length);
  const chipClassName =
    "inline-flex items-center whitespace-nowrap rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-semibold text-[color:var(--text)]";

  return (
    <div className={clsx("space-y-2", className)}>
      <p className="text-[11px] font-semibold text-[color:var(--muted)]">{label}</p>
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap no-scrollbar">
        {visibleTags.map((tag, index) => (
          <span key={`${tag}-${index}`} className={chipClassName}>
            {tag}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                aria-label={`Ver ${hiddenCount} servicios mas`}
                className={chipClassName}
              >
                +{hiddenCount}
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
              <Dialog.Content
                role="dialog"
                aria-label="Servicios"
                className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] w-full overflow-hidden rounded-t-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl sm:inset-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[60vh] sm:w-[min(92vw,420px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
              >
                <div className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-4 py-3">
                  <p className="text-sm font-semibold text-[color:var(--text)]">Servicios</p>
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
                  <div className="flex flex-wrap gap-2">
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
        ) : null}
      </div>
    </div>
  );
}
