import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import clsx from "clsx";
import CreatorHeader from "../../components/CreatorHeader";
import { AnalyticsPanel } from "../../components/creator/AnalyticsPanel";
import { CatalogPanel } from "../../components/creator/CatalogPanel";
import { PopClipsPanel } from "../../components/creator/PopClipsPanel";
import { useCreatorConfig } from "../../context/CreatorConfigContext";

const PANEL_TABS = [
  { id: "analytics", label: "Analítica" },
  { id: "catalog", label: "Catálogo" },
  { id: "popclips", label: "PopClips" },
] as const;

type PanelTab = (typeof PANEL_TABS)[number]["id"];
type PanelAction = "new" | "newPack" | null;

function normalizeTab(value: string | string[] | undefined): PanelTab | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "analytics" || raw === "catalog" || raw === "popclips") return raw;
  return null;
}

function normalizeAction(value: string | string[] | undefined): PanelAction {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "new" || raw === "newPack") return raw;
  return null;
}

export default function CreatorPanelPage() {
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "C";
  const router = useRouter();
  const tabParam = normalizeTab(router.query.tab);
  const activeTab: PanelTab = tabParam ?? "analytics";
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    if (!tabParam) {
      void router.replace({ pathname: "/creator/panel", query: { tab: "analytics" } }, undefined, {
        shallow: true,
      });
    }
  }, [router, router.isReady, tabParam]);

  useEffect(() => {
    if (!router.isReady) return;
    const action = normalizeAction(router.query.action);
    if (!action) {
      setActionNotice(null);
      return;
    }
    setActionNotice(action === "new" ? "Pronto: crear PopClip." : "Pronto: crear pack.");
  }, [router.isReady, router.query.action]);

  const handleTabChange = (nextTab: PanelTab) => {
    if (nextTab === activeTab) return;
    void router.replace({ pathname: "/creator/panel", query: { tab: nextTab } }, undefined, {
      shallow: true,
    });
  };

  const clearActionNotice = () => {
    const nextQuery = { ...router.query };
    delete nextQuery.action;
    void router.replace({ pathname: "/creator/panel", query: nextQuery }, undefined, { shallow: true });
    setActionNotice(null);
  };

  return (
    <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
      <Head>
        <title>Panel – NOVSY</title>
      </Head>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <CreatorHeader
          name={config.creatorName}
          role="Panel"
          subtitle={config.creatorSubtitle}
          initial={creatorInitial}
          avatarUrl={config.avatarUrl}
          onOpenSettings={() => {}}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Panel</h1>
            <p className="text-sm text-[color:var(--muted)]">Catálogo y analítica en un solo lugar.</p>
          </div>
          <div className="inline-flex rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-1">
            {PANEL_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  aria-pressed={isActive}
                  className={clsx(
                    "px-3 py-1.5 text-sm font-semibold rounded-full",
                    isActive
                      ? "bg-[color:var(--brand-strong)] text-[color:var(--text)]"
                      : "text-[color:var(--text)] hover:text-[color:var(--text)]"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {actionNotice ? (
          <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-3 text-sm text-[color:var(--text)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{actionNotice}</span>
              <button
                type="button"
                onClick={clearActionNotice}
                className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === "catalog" ? (
          <CatalogPanel />
        ) : activeTab === "popclips" ? (
          <PopClipsPanel />
        ) : (
          <AnalyticsPanel />
        )}
      </div>
    </div>
  );
}
