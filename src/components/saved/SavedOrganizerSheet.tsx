import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

type CollectionSummary = {
  id: string;
  name: string;
  count: number;
};

type SavedOrganizerSheetProps = {
  open: boolean;
  onClose: () => void;
  savedItemId: string | null;
  currentCollectionId: string | null;
  onMoved?: (collectionId: string | null) => void;
  onCreated?: (collection: CollectionSummary) => void;
};

export function SavedOrganizerSheet({
  open,
  onClose,
  savedItemId,
  currentCollectionId,
  onMoved,
  onCreated,
}: SavedOrganizerSheetProps) {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setShowCreate(false);
    setName("");
    fetch("/api/saved/collections", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("request failed");
        const payload = (await res.json().catch(() => null)) as { items?: CollectionSummary[] } | null;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setCollections(items);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("No se pudieron cargar las colecciones.");
        setCollections([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!showCreate) return;
    nameInputRef.current?.focus();
  }, [showCreate]);

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

  const handleMove = async (collectionId: string | null) => {
    if (!savedItemId || moving) return;
    setMoving(true);
    setError("");
    try {
      const res = await fetch(`/api/saved/items/${encodeURIComponent(savedItemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId }),
      });
      if (!res.ok) throw new Error("request failed");
      const payload = (await res.json().catch(() => null)) as { collectionId?: string | null } | null;
      onMoved?.(payload?.collectionId ?? collectionId ?? null);
      onClose();
    } catch (_err) {
      setError("No se pudo mover el guardado.");
    } finally {
      setMoving(false);
    }
  };

  const handleCreate = async () => {
    if (creating) return;
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      setError("El nombre no puede estar vacio.");
      return;
    }
    if (trimmed.length > 40) {
      setError("El nombre debe tener como maximo 40 caracteres.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/saved/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.status === 409) {
        setError("Ya existe una colección con ese nombre.");
        return;
      }
      if (!res.ok) throw new Error("request failed");
      const payload = (await res.json().catch(() => null)) as CollectionSummary | null;
      if (!payload?.id) throw new Error("invalid response");
      setCollections((prev) => [{ id: payload.id, name: payload.name, count: payload.count ?? 0 }, ...prev]);
      onCreated?.({ id: payload.id, name: payload.name, count: payload.count ?? 0 });
      setName("");
      if (savedItemId) {
        await handleMove(payload.id);
      }
    } catch (_err) {
      setError("No se pudo crear la colección.");
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Cerrar organizar guardados"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div className="absolute inset-x-0 bottom-0">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Guardar en coleccion"
          className="mx-auto w-full max-w-lg rounded-t-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">Guardar en</p>
              <p className="text-sm font-semibold text-[color:var(--text)]">Colecciones</p>
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

          <div className="px-4 py-4 space-y-3">
            {savedItemId ? null : (
              <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--muted)]">
                Selecciona un guardado para organizarlo.
              </div>
            )}

            {showCreate ? (
              <div className="flex gap-2">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nombre de la colección"
                  className="h-9 w-full rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 text-xs text-[color:var(--text)] placeholder:text-[color:var(--muted)] focus:outline-none focus:ring-1 focus:ring-[color:var(--surface-ring)]"
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-3)] disabled:opacity-60"
                >
                  {creating ? "Creando..." : "Crear"}
                </button>
              </div>
            ) : null}

            {error ? <div className="text-xs text-[color:var(--danger)]">{error}</div> : null}

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleMove(null)}
                disabled={!savedItemId || moving}
                className={clsx(
                  "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-semibold transition",
                  currentCollectionId === null
                    ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:bg-[color:var(--surface-1)]",
                  (!savedItemId || moving) && "opacity-60 cursor-not-allowed"
                )}
              >
                <span>Sin colección</span>
              </button>

              {loading ? (
                <div className="text-xs text-[color:var(--muted)]">Cargando colecciones...</div>
              ) : collections.length === 0 ? (
                <div className="text-xs text-[color:var(--muted)]">Aún no hay colecciones.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {collections.map((collection) => (
                    <button
                      key={collection.id}
                      type="button"
                      onClick={() => handleMove(collection.id)}
                      disabled={!savedItemId || moving}
                      className={clsx(
                        "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-semibold transition",
                        currentCollectionId === collection.id
                          ? "border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                          : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)] hover:bg-[color:var(--surface-1)]",
                        (!savedItemId || moving) && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      <span>{collection.name}</span>
                      <span className="text-[10px] text-[color:var(--muted)]">{collection.count}</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex w-full items-center justify-between rounded-xl border border-dashed border-[color:var(--surface-border)] px-3 py-2 text-left text-xs font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)]"
              >
                <span>+ Nueva colección</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
