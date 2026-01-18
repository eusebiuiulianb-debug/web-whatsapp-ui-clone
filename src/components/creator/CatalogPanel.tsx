import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { EmptyState } from "../ui/EmptyState";
import { SectionCard } from "../ui/SectionCard";
import { Skeleton } from "../ui/Skeleton";
import {
  formatCatalogIncludesSummary,
  formatCatalogPriceCents,
  type CatalogItem,
} from "../../lib/catalog";

export function CatalogPanel() {
  const [creatorId, setCreatorId] = useState<string>("creator-1");
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadCreator = async () => {
      try {
        const res = await fetch("/api/creator");
        const payload = await res.json().catch(() => ({}));
        const resolvedId = payload?.creator?.id || "creator-1";
        setCreatorId(resolvedId);
      } catch (_err) {
        setCreatorId("creator-1");
      }
    };
    void loadCreator();
  }, []);

  const loadCatalog = useCallback(async () => {
    if (!creatorId) return;
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`/api/catalog?creatorId=${encodeURIComponent(creatorId)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Error cargando catálogo");
      const payload = await res.json();
      setCatalogItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar el catálogo.");
      setCatalogItems([]);
    } finally {
      setLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const packItems = useMemo(
    () => catalogItems.filter((item) => item.type === "PACK" || item.type === "BUNDLE"),
    [catalogItems]
  );
  const extraItems = useMemo(
    () => catalogItems.filter((item) => item.type === "EXTRA"),
    [catalogItems]
  );

  const parsePriceCents = (input: string) => {
    const normalized = input.replace(",", ".").trim();
    const value = Number.parseFloat(normalized);
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 100);
  };

  const handleCreateItem = async (type: CatalogItem["type"]) => {
    if (!creatorId) return;
    const label = type === "PACK" ? "pack" : "extra";
    const title = window.prompt(`Nombre del ${label}`, "");
    if (title === null) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(`El ${label} necesita un nombre.`);
      return;
    }
    const priceInput = window.prompt("Precio en EUR", "5");
    if (priceInput === null) return;
    const priceCents = parsePriceCents(priceInput);
    if (priceCents === null) {
      setError("Precio inválido.");
      return;
    }
    try {
      setIsSaving(true);
      setError("");
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId,
          type,
          title: trimmedTitle,
          priceCents,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error || "No se pudo crear el item.");
        return;
      }
      await loadCatalog();
    } catch (err) {
      console.error(err);
      setError("No se pudo crear el item.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditItem = async (item: CatalogItem) => {
    if (!creatorId) return;
    const titleInput = window.prompt("Editar nombre", item.title);
    if (titleInput === null) return;
    const trimmedTitle = titleInput.trim();
    if (!trimmedTitle) {
      setError("El nombre es obligatorio.");
      return;
    }
    const priceInput = window.prompt("Editar precio (EUR)", String(item.priceCents / 100));
    if (priceInput === null) return;
    const priceCents = parsePriceCents(priceInput);
    if (priceCents === null) {
      setError("Precio inválido.");
      return;
    }
    if (trimmedTitle === item.title && priceCents === item.priceCents) return;
    try {
      setIsSaving(true);
      setError("");
      const res = await fetch(`/api/catalog/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId,
          title: trimmedTitle,
          priceCents,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error || "No se pudo editar el item.");
        return;
      }
      await loadCatalog();
    } catch (err) {
      console.error(err);
      setError("No se pudo editar el item.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicateItem = async (item: CatalogItem) => {
    if (!creatorId) return;
    try {
      setIsSaving(true);
      setError("");
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId,
          type: item.type,
          title: `${item.title} (copia)`,
          description: item.description,
          priceCents: item.priceCents,
          currency: item.currency,
          includes: item.includes ?? undefined,
          isPublic: item.isPublic,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error || "No se pudo duplicar el item.");
        return;
      }
      await loadCatalog();
    } catch (err) {
      console.error(err);
      setError("No se pudo duplicar el item.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveItem = async (item: CatalogItem) => {
    if (!creatorId || !item.isActive) return;
    const confirmArchive = window.confirm(`¿Archivar "${item.title}"?`);
    if (!confirmArchive) return;
    try {
      setIsSaving(true);
      setError("");
      const res = await fetch(`/api/catalog/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId, isActive: false }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error || "No se pudo archivar el item.");
        return;
      }
      await loadCatalog();
    } catch (err) {
      console.error(err);
      setError("No se pudo archivar el item.");
    } finally {
      setIsSaving(false);
    }
  };

  const ctaButtonClass = clsx(
    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
    isSaving
      ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
      : "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.25)]"
  );
  const buildRowActionClass = (variant: "primary" | "neutral" | "danger", disabled: boolean) =>
    clsx(
      "rounded-full border px-2.5 py-1 text-[10px] font-semibold transition",
      disabled
        ? "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--muted)] cursor-not-allowed"
        : variant === "primary"
        ? "border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.25)]"
        : variant === "danger"
        ? "border-[color:rgba(244,63,94,0.5)] bg-[color:rgba(244,63,94,0.12)] text-[color:var(--text)] hover:bg-[color:rgba(244,63,94,0.2)]"
        : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:border-[color:var(--surface-border-hover)] hover:bg-[color:var(--surface-2)]"
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Catálogo</h2>
          <p className="text-sm text-[color:var(--muted)]">Resumen de packs y extras disponibles.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleCreateItem("PACK")}
            disabled={isSaving}
            className={ctaButtonClass}
          >
            Crear pack
          </button>
          <button
            type="button"
            onClick={() => handleCreateItem("EXTRA")}
            disabled={isSaving}
            className={ctaButtonClass}
          >
            Crear extra (PPV)
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-[color:var(--danger)]">{error}</div>}
      {loading && (
        <div className="space-y-2">
          <div className="text-sm text-[color:var(--muted)]">Cargando...</div>
          <Skeleton className="h-4 w-40" />
        </div>
      )}

      <SectionCard
        title="Packs (tiers)"
        subtitle="Packs y bundles activos del catálogo."
        bodyClassName="space-y-3"
      >
        {packItems.length === 0 && !loading ? (
          <EmptyState
            title="No hay packs todavía"
            description="Crea packs para mostrarlos aquí."
            action={
              <button
                type="button"
                onClick={() => handleCreateItem("PACK")}
                disabled={isSaving}
                className={ctaButtonClass}
              >
                Crear pack
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            {packItems.map((item) => {
              const includesSummary = formatCatalogIncludesSummary(item.includes);
              const typeLabel = item.type === "BUNDLE" ? "Bundle" : "Pack";
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[color:var(--text)] truncate">{item.title}</div>
                      <div className="text-xs text-[color:var(--muted)]">
                        {formatCatalogPriceCents(item.priceCents, item.currency)}
                      </div>
                      {includesSummary && (
                        <div className="mt-1 text-[11px] text-[color:var(--muted)]">Incluye: {includesSummary}</div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)]">
                        {typeLabel}
                      </span>
                      <span
                        className={clsx(
                          "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                          item.isActive
                            ? "border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)]"
                            : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)]"
                        )}
                      >
                        {item.isActive ? "Activo" : "Archivado"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleEditItem(item)}
                        disabled={isSaving}
                        className={buildRowActionClass("primary", isSaving)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicateItem(item)}
                        disabled={isSaving}
                        className={buildRowActionClass("neutral", isSaving)}
                      >
                        Duplicar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchiveItem(item)}
                        disabled={isSaving || !item.isActive}
                        className={buildRowActionClass("danger", isSaving || !item.isActive)}
                      >
                        Archivar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Extras (PPV)"
        subtitle="Listado de extras disponibles para PPV."
        bodyClassName="space-y-3"
      >
        {extraItems.length === 0 && !loading ? (
          <EmptyState
            title="No hay extras todavía"
            description="Crea extras para verlos aquí."
            action={
              <button
                type="button"
                onClick={() => handleCreateItem("EXTRA")}
                disabled={isSaving}
                className={ctaButtonClass}
              >
                Crear extra (PPV)
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            {extraItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[color:var(--text)] truncate">{item.title}</div>
                    <div className="text-xs text-[color:var(--muted)]">
                      {formatCatalogPriceCents(item.priceCents, item.currency)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text)]">
                      Extra
                    </span>
                    <span
                      className={clsx(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        item.isActive
                          ? "border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.12)] text-[color:var(--text)]"
                          : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--muted)]"
                      )}
                    >
                      {item.isActive ? "Activo" : "Archivado"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleEditItem(item)}
                      disabled={isSaving}
                      className={buildRowActionClass("primary", isSaving)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateItem(item)}
                      disabled={isSaving}
                      className={buildRowActionClass("neutral", isSaving)}
                    >
                      Duplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchiveItem(item)}
                      disabled={isSaving || !item.isActive}
                      className={buildRowActionClass("danger", isSaving || !item.isActive)}
                    >
                      Archivar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
