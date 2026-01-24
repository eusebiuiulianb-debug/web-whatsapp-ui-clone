import { useEffect, useRef, useState } from "react";

type SavedCollection = {
  id: string;
  name: string;
  count: number;
};

type SavedCollectionCreateSheetProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (collection: SavedCollection) => void;
};

export function SavedCollectionCreateSheet({ open, onClose, onCreated }: SavedCollectionCreateSheetProps) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setError("");
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
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

  const handleCreate = async () => {
    if (creating) return;
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 32) {
      setError("El nombre debe tener entre 2 y 32 caracteres.");
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
      const payload = (await res.json().catch(() => null)) as SavedCollection | null;
      if (!payload?.id) throw new Error("invalid response");
      onCreated(payload);
      onClose();
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
        aria-label="Cerrar nueva colección"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div className="absolute inset-x-0 bottom-0">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Crear colección"
          className="mx-auto w-full max-w-lg rounded-t-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">Nueva colección</p>
              <p className="text-sm font-semibold text-[color:var(--text)]">Crear carpeta</p>
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
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre de la colección"
              className="h-10 w-full rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)] focus:outline-none focus:ring-1 focus:ring-[color:var(--surface-ring)]"
            />
            {error ? <div className="text-xs text-[color:var(--danger)]">{error}</div> : null}
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex w-full items-center justify-center rounded-full bg-[color:var(--brand-strong)] px-4 py-2 text-xs font-semibold text-white hover:bg-[color:var(--brand)] disabled:opacity-60"
            >
              {creating ? "Creando..." : "Crear"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
