import { useEffect, useMemo } from "react";
import { useRouter } from "next/router";

type QuickActionsSheetProps = {
  open: boolean;
  onClose: () => void;
  mode: "creator" | "fan";
};

type QuickAction = {
  id: string;
  label: string;
  description?: string;
  href: string;
};

export function QuickActionsSheet({ open, onClose, mode }: QuickActionsSheetProps) {
  const router = useRouter();

  const actions = useMemo<QuickAction[]>(() => {
    if (mode === "creator") {
      return [
        {
          id: "new-popclip",
          label: "Nuevo PopClip",
          description: "Crea un clip y publicalo en discovery.",
          href: "/creator/panel?tab=popclips&action=new",
        },
        {
          id: "new-pack",
          label: "Nuevo pack",
          description: "Anade un pack al catalogo.",
          href: "/creator/panel?tab=catalog&action=newPack",
        },
        {
          id: "edit-profile",
          label: "Editar perfil",
          description: "Actualiza tu bio y detalles publicos.",
          href: "/creator/edit",
        },
      ];
    }

    return [
      {
        id: "search-creators",
        label: "Buscar creadores",
        description: "Encuentra perfiles y audios nuevos.",
        href: "/explore?focusSearch=1",
      },
      {
        id: "view-popclips",
        label: "Ver PopClips",
        description: "Salta directo a los clips.",
        href: "/explore?mode=popclips",
      },
      {
        id: "open-filters",
        label: "Filtros",
        description: "Ajusta distancia, ubicacion y preferencias.",
        href: "/explore?openFilters=1",
      },
    ];
  }, [mode]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleSelect = async (href: string) => {
    onClose();
    if (!href) return;
    if (router.asPath === href) return;
    await router.push(href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label="Cerrar acciones rapidas"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div className="absolute inset-x-0 bottom-0">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Acciones rapidas"
          className="mx-auto w-full max-w-lg rounded-t-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">Acciones rapidas</p>
              <p className="text-sm font-semibold text-[color:var(--text)]">
                {mode === "creator" ? "Creador" : "Explorar"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-sm font-semibold text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)]"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-col gap-2 px-4 py-4">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => handleSelect(action.href)}
                className="w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 py-3 text-left transition hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-1)]"
              >
                <div className="text-sm font-semibold text-[color:var(--text)]">{action.label}</div>
                {action.description ? (
                  <div className="mt-1 text-xs text-[color:var(--muted)]">{action.description}</div>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
