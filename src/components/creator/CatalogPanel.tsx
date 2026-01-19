import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import clsx from "clsx";
import { EmptyState } from "../ui/EmptyState";
import { SectionCard } from "../ui/SectionCard";
import { Skeleton } from "../ui/Skeleton";
import {
  buildCatalogPitch,
  formatCatalogIncludesSummary,
  formatCatalogPriceCents,
  type CatalogItem,
} from "../../lib/catalog";
import { ConversationContext } from "../../context/ConversationContext";
import { getFanIdFromQuery, openFanChatAndPrefill } from "../../lib/navigation/openCreatorChat";

type FanPickerEntry = {
  id: string;
  displayName?: string | null;
  creatorLabel?: string | null;
  name?: string;
  avatar?: string;
  segment?: string;
};

export function CatalogPanel() {
  const router = useRouter();
  const { conversation } = useContext(ConversationContext);
  const [creatorId, setCreatorId] = useState<string>("creator-1");
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [fanPickerOpen, setFanPickerOpen] = useState(false);
  const [fanPickerLoading, setFanPickerLoading] = useState(false);
  const [fanPickerError, setFanPickerError] = useState("");
  const [fanPickerQuery, setFanPickerQuery] = useState("");
  const [fanPickerItems, setFanPickerItems] = useState<FanPickerEntry[]>([]);
  const [pendingInsertItem, setPendingInsertItem] = useState<CatalogItem | null>(null);
  const queryFanId = getFanIdFromQuery(router.query);
  const activeFanId = queryFanId || (!conversation?.isManager ? conversation?.id ?? null : null);
  const activeFanName = useMemo(() => {
    if (!conversation || conversation.isManager) return "";
    const base = conversation.contactName || conversation.displayName || conversation.creatorLabel || "";
    return getFirstName(base) || base;
  }, [conversation]);

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

  const loadFanPicker = useCallback(async (query: string) => {
    try {
      setFanPickerLoading(true);
      setFanPickerError("");
      const params = new URLSearchParams({ limit: "30" });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/fans?${params.toString()}`, { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.fans) ? payload.fans : [];
      setFanPickerItems(items);
    } catch (err) {
      console.error(err);
      setFanPickerError("No se pudieron cargar los fans.");
      setFanPickerItems([]);
    } finally {
      setFanPickerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fanPickerOpen) return;
    const timer = window.setTimeout(() => {
      void loadFanPicker(fanPickerQuery);
    }, 250);
    return () => {
      window.clearTimeout(timer);
    };
  }, [fanPickerOpen, fanPickerQuery, loadFanPicker]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#catalog-extras") return;
    const target = document.getElementById("catalog-extras");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

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

  const buildDraftForItem = (item: CatalogItem, fanName: string) => {
    const includesSummary = formatCatalogIncludesSummary(item.includes) || undefined;
    const name = getFirstName(fanName) || fanName || "alli";
    return buildCatalogPitch({ fanName: name, item, includesSummary });
  };

  const closeFanPicker = () => {
    setFanPickerOpen(false);
    setPendingInsertItem(null);
    setFanPickerQuery("");
    setFanPickerError("");
    setFanPickerItems([]);
  };

  const handleSelectFan = (fan: FanPickerEntry) => {
    if (!pendingInsertItem) return;
    const nameBase = fan.displayName || fan.creatorLabel || fan.name || "";
    const draft = buildDraftForItem(pendingInsertItem, nameBase);
    if (!draft.trim()) return;
    openFanChatAndPrefill(router, {
      fanId: fan.id,
      text: draft,
      actionKey: `catalog:${pendingInsertItem.id}`,
    });
    closeFanPicker();
  };

  const handleInsertItem = (item: CatalogItem) => {
    const draft = buildDraftForItem(item, activeFanName);
    if (!draft.trim()) return;
    if (activeFanId) {
      openFanChatAndPrefill(router, { fanId: activeFanId, text: draft, actionKey: `catalog:${item.id}` });
      return;
    }
    setPendingInsertItem(item);
    setFanPickerOpen(true);
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
                        onClick={() => handleInsertItem(item)}
                        disabled={isSaving}
                        className={buildRowActionClass("primary", isSaving)}
                      >
                        Insertar en chat
                      </button>
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

      <div id="catalog-extras">
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
                        onClick={() => handleInsertItem(item)}
                        disabled={isSaving}
                        className={buildRowActionClass("primary", isSaving)}
                      >
                        Insertar en chat
                      </button>
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
      {fanPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--surface-overlay)] px-4 py-6">
          <div className="w-full max-w-md rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 shadow-xl space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--text)]">Insertar en chat</h3>
                {pendingInsertItem && (
                  <p className="text-[11px] text-[color:var(--muted)]">{pendingInsertItem.title}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeFanPicker}
                className="text-xs text-[color:var(--muted)] hover:text-[color:var(--text)]"
              >
                Cerrar
              </button>
            </div>
            <input
              value={fanPickerQuery}
              onChange={(event) => setFanPickerQuery(event.target.value)}
              placeholder="Buscar fan..."
              className="w-full rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
            />
            {fanPickerError && <div className="text-xs text-[color:var(--danger)]">{fanPickerError}</div>}
            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {fanPickerLoading ? (
                <div className="text-xs text-[color:var(--muted)]">Cargando fans...</div>
              ) : fanPickerItems.length === 0 ? (
                <div className="text-xs text-[color:var(--muted)]">No hay fans disponibles.</div>
              ) : (
                fanPickerItems.map((fan) => {
                  const label = fan.displayName || fan.creatorLabel || fan.name || "Fan";
                  return (
                    <button
                      key={fan.id}
                      type="button"
                      onClick={() => handleSelectFan(fan)}
                      className="w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-left text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{label}</span>
                        {fan.segment && <span className="text-[10px] text-[color:var(--muted)]">{fan.segment}</span>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getFirstName(value?: string | null) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  const [first] = trimmed.split(/\\s+/);
  return first || "";
}
