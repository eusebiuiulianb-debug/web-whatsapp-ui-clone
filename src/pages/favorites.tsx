import Head from "next/head";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/router";
import { HomeSectionCard } from "../components/home/HomeSectionCard";
import { PopClipTile, type PopClipTileItem } from "../components/popclips/PopClipTile";
import { Skeleton } from "../components/ui/Skeleton";
import {
  SAVED_POPCLIPS_KEY,
  buildSavedPopclipMap,
  fetchSavedPopclips,
  removeSavedPopclip,
  upsertSavedPopclip,
} from "../lib/savedPopclips";

const TABS = [
  { id: "creators", label: "Creadores" },
  { id: "packs", label: "Packs" },
  { id: "popclips", label: "PopClips" },
];

const FEED_SKELETON_COUNT = 6;

type TabId = (typeof TABS)[number]["id"];
type PopclipsResponse = { items: PopClipTileItem[] };

const fetchPopclipsByIds = async ([url, ids]: [string, string[]]): Promise<PopclipsResponse> => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const payload = (await res.json().catch(() => null)) as { items?: PopClipTileItem[] } | null;
  if (!res.ok || !payload || !Array.isArray(payload.items)) {
    return { items: [] };
  }
  return { items: payload.items };
};

export default function FavoritesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("popclips");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: savedPopclipsData, error: savedError, mutate: mutateSavedPopclips } = useSWR(
    SAVED_POPCLIPS_KEY,
    fetchSavedPopclips,
    { revalidateOnFocus: false }
  );
  const savedPopclips = savedPopclipsData?.items;
  const savedPopclipMap = useMemo(
    () => buildSavedPopclipMap(savedPopclips ?? []),
    [savedPopclips]
  );
  const savedIds = useMemo(
    () => (savedPopclips ?? []).map((entry) => entry.entityId).filter(Boolean),
    [savedPopclips]
  );
  const shouldLoadPopclips = activeTab === "popclips" && savedIds.length > 0;
  const { data: popclipsData, error: popclipsError } = useSWR(
    shouldLoadPopclips ? ["/api/public/popclips/by-ids", savedIds] : null,
    fetchPopclipsByIds,
    { revalidateOnFocus: false }
  );
  const popclipItems = popclipsData?.items ?? [];
  const savedLoading = !savedPopclipsData && !savedError;
  const popclipsLoading = shouldLoadPopclips && !popclipsData && !popclipsError;

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const handleToggleSave = useCallback(
    async (item: PopClipTileItem) => {
      const current = savedPopclipMap[item.id];
      const wasSaved = Boolean(current);
      const nextSaved = !wasSaved;
      const tempId = `temp-popclip-${item.id}`;
      mutateSavedPopclips(
        (prev) => {
          const items = prev?.items ?? [];
          if (nextSaved) {
            return {
              items: upsertSavedPopclip(items, {
                id: tempId,
                entityId: item.id,
                collectionId: null,
              }),
            };
          }
          return { items: removeSavedPopclip(items, item.id) };
        },
        false
      );

      try {
        const res = await fetch("/api/saved/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "POPCLIP", entityId: item.id }),
        });
        const payload = (await res.json().catch(() => null)) as
          | { saved?: boolean; savedItemId?: string; collectionId?: string | null }
          | null;
        if (!res.ok || !payload || typeof payload.saved !== "boolean") {
          if (res.status === 401) throw new Error("AUTH_REQUIRED");
          throw new Error("SAVE_FAILED");
        }
        if (payload.saved !== nextSaved) {
          await mutateSavedPopclips();
        } else if (payload.saved && payload.savedItemId) {
          mutateSavedPopclips(
            (prev) => {
              const items = prev?.items ?? [];
              return {
                items: upsertSavedPopclip(items, {
                  id: payload.savedItemId as string,
                  entityId: item.id,
                  collectionId: payload.collectionId ?? null,
                }),
              };
            },
            false
          );
        } else if (!payload.saved) {
          showToast("Quitado de guardados");
        }
      } catch (err) {
        mutateSavedPopclips(
          (prev) => {
            const items = prev?.items ?? [];
            if (nextSaved) {
              return { items: removeSavedPopclip(items, item.id) };
            }
            return {
              items: upsertSavedPopclip(items, {
                id: current?.savedItemId ?? tempId,
                entityId: item.id,
                collectionId: current?.collectionId ?? null,
              }),
            };
          },
          false
        );
        if (err instanceof Error && err.message === "AUTH_REQUIRED") {
          showToast("Inicia sesion para guardar.");
        } else {
          showToast("No se pudo actualizar guardados.");
        }
      }
    },
    [mutateSavedPopclips, savedPopclipMap, showToast]
  );

  const openPopclip = useCallback(
    (item: PopClipTileItem) => {
      void router.push(
        `/c/${encodeURIComponent(item.creator.handle)}?popclip=${encodeURIComponent(item.id)}`
      );
    },
    [router]
  );

  const returnToPath = "/favorites";

  const renderEmpty = (message: string) => (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-[color:var(--text)]">{message}</div>
      <p className="text-sm text-[color:var(--muted)]">
        Guarda tus favoritos para encontrarlos mas rapido cuando quieras volver.
      </p>
      <Link
        href="/explore"
        className="inline-flex w-fit items-center justify-center rounded-full bg-[color:var(--brand-strong)] px-4 py-2 text-sm font-semibold text-[color:var(--surface-0)] hover:bg-[color:var(--brand)]"
      >
        Explorar
      </Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
      <Head>
        <title>Favoritos · NOVSY</title>
      </Head>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
            FAVORITOS
          </p>
          <h1 className="text-2xl font-semibold text-[color:var(--text)]">Tus guardados</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Aqui veras los creadores, packs y PopClips que marcaste como favoritos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={
                activeTab === tab.id
                  ? "inline-flex items-center rounded-full border border-[color:rgba(var(--brand-rgb),0.6)] bg-[color:rgba(var(--brand-rgb),0.16)] px-4 py-2 text-sm font-semibold text-[color:var(--text)]"
                  : "inline-flex items-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        <HomeSectionCard title={activeTab === "popclips" ? "PopClips guardados" : undefined}>
          {activeTab !== "popclips" ? (
            renderEmpty(
              activeTab === "creators"
                ? "Aún no tienes creadores guardados."
                : "Aún no tienes packs guardados."
            )
          ) : savedLoading || popclipsLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:gap-6">
              {Array.from({ length: FEED_SKELETON_COUNT }).map((_, idx) => (
                <div
                  key={`favorite-skeleton-${idx}`}
                  className="flex flex-col gap-2 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3"
                >
                  <Skeleton className="aspect-[10/13] w-full rounded-xl sm:aspect-[3/4] md:aspect-[4/5]" />
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-9 flex-1 rounded-full" />
                    <Skeleton className="h-9 flex-1 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : savedIds.length === 0 ? (
            renderEmpty("Aún no has guardado nada.")
          ) : popclipsError ? (
            <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-4 text-sm text-[color:var(--muted)]">
              No se pudieron cargar los PopClips guardados.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:gap-6">
              {popclipItems.map((item) => (
                <PopClipTile
                  key={item.id}
                  item={item}
                  onOpen={openPopclip}
                  profileHref={`/c/${encodeURIComponent(item.creator.handle)}`}
                  chatHref={appendReturnTo(`/go/${encodeURIComponent(item.creator.handle)}`, returnToPath)}
                  isSaved={Boolean(savedPopclipMap[item.id])}
                  onToggleSave={handleToggleSave}
                />
              ))}
            </div>
          )}
        </HomeSectionCard>
      </div>

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2">
          <div className="flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:rgba(17,24,39,0.85)] px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md">
            <span>{toast}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function appendReturnTo(url: string, returnTo: string) {
  if (!url) return url;
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return url;
  if (url.includes("returnTo=")) return url;
  const encoded = encodeURIComponent(returnTo);
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}returnTo=${encoded}`;
}
