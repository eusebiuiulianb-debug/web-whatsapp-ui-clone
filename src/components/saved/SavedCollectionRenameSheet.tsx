import { useEffect, useRef, useState } from "react";

type SavedCollectionRenameSheetProps = {
  open: boolean;
  collectionId: string | null;
  initialName: string;
  onClose: () => void;
  onRenamed: (payload: { id: string; name: string }) => void;
};

export function SavedCollectionRenameSheet({
  open,
  collectionId,
  initialName,
  onClose,
  onRenamed,
}: SavedCollectionRenameSheetProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setError("");
    inputRef.current?.focus();
  }, [initialName, open]);

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

  const handleRename = async () => {
    if (saving) return;
    if (!collectionId) {
      setError("No se pudo encontrar la coleccion.");
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      setError("El nombre no puede estar vacio.");
      return;
    }
    if (trimmed.length > 40) {
      setError("El nombre debe tener como maximo 40 caracteres.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/saved/collections/${encodeURIComponent(collectionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.status === 409) {
        setError("Ya existe una coleccion con ese nombre.");
        return;
      }
      if (res.status === 401) {
        setError("Inicia sesion para renombrar.");
        return;
      }
      if (!res.ok) throw new Error("request failed");
      const payload = (await res.json().catch(() => null)) as { id?: string; name?: string } | null;
      const updatedName = payload?.name || trimmed;
      onRenamed({ id: collectionId, name: updatedName });
      onClose();
    } catch (_err) {
      setError("No se pudo renombrar la coleccion.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Cerrar renombrar coleccion"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div className="absolute inset-x-0 bottom-0">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Renombrar coleccion"
          className="mx-auto w-full max-w-lg rounded-t-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">Renombrar coleccion</p>
              <p className="text-sm font-semibold text-[color:var(--text)]">Actualizar nombre</p>
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
              placeholder="Nombre de la coleccion"
              className="h-10 w-full rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)] focus:outline-none focus:ring-1 focus:ring-[color:var(--surface-ring)]"
            />
            {error ? <div className="text-xs text-[color:var(--danger)]">{error}</div> : null}
            <button
              type="button"
              onClick={handleRename}
              disabled={saving}
              className="inline-flex w-full items-center justify-center rounded-full bg-[color:var(--brand-strong)] px-4 py-2 text-xs font-semibold text-white hover:bg-[color:var(--brand)] disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
