import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { HomeSectionCard } from "../components/home/HomeSectionCard";

const TABS = [
  { id: "creators", label: "Creadores" },
  { id: "packs", label: "Packs" },
  { id: "popclips", label: "PopClips" },
];

type TabId = (typeof TABS)[number]["id"];

export default function FavoritesPage() {
  const [activeTab, setActiveTab] = useState<TabId>("creators");

  return (
    <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
      <Head>
        <title>Favoritos · NOVSY</title>
      </Head>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
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

        <HomeSectionCard>
          <div className="space-y-3">
            <div className="text-sm font-semibold text-[color:var(--text)]">
              {activeTab === "creators"
                ? "Aun no tienes creadores guardados."
                : activeTab === "packs"
                ? "Aun no tienes packs guardados."
                : "Aun no tienes PopClips guardados."}
            </div>
            <p className="text-sm text-[color:var(--muted)]">
              Guarda tus favoritos para encontrarlos mas rapido cuando quieras volver.
            </p>
            <Link
              href="/"
              className="inline-flex w-fit items-center justify-center rounded-full bg-[color:var(--brand-strong)] px-4 py-2 text-sm font-semibold text-[color:var(--surface-0)] hover:bg-[color:var(--brand)]"
            >
              Buscar
            </Link>
          </div>
        </HomeSectionCard>
      </div>
    </div>
  );
}
