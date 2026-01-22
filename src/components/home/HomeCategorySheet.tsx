import clsx from "clsx";
import { ReactNode } from "react";

export type HomeCategory = {
  id: string;
  label: string;
  description?: string;
  keywords: string[];
};

type Props = {
  open: boolean;
  categories: HomeCategory[];
  selectedId: string | null;
  onSelect: (category: HomeCategory) => void;
  onClear: () => void;
  onClose: () => void;
};

export function HomeCategorySheet({
  open,
  categories,
  selectedId,
  onSelect,
  onClear,
  onClose,
}: Props) {
  if (!open) return null;
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[color:var(--text)]">Categorías</h2>
          <p className="text-xs text-[color:var(--muted)]">Elige una para filtrar</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar categorías"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
        >
          X
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {categories.map((category) => {
          const isActive = selectedId === category.id;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                onSelect(category);
                onClose();
              }}
              className={clsx(
                "w-full rounded-xl border px-4 py-3 text-left transition",
                isActive
                  ? "border-[color:rgba(var(--brand-rgb),0.55)] bg-[color:rgba(var(--brand-rgb),0.16)]"
                  : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] hover:bg-[color:var(--surface-2)]"
              )}
            >
              <div className="text-sm font-semibold text-[color:var(--text)]">{category.label}</div>
              {category.description ? (
                <div className="text-xs text-[color:var(--muted)]">{category.description}</div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => {
            onClear();
            onClose();
          }}
          className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
        >
          Limpiar
        </button>
      </div>
    </BottomSheet>
  );
}

function BottomSheet({
  open,
  onClose,
  dismissible = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  dismissible?: boolean;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-[color:var(--surface-overlay)]"
        onClick={dismissible ? onClose : undefined}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 pb-6 pt-4">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[color:var(--surface-2)]/80" />
        {children}
      </div>
    </div>
  );
}
