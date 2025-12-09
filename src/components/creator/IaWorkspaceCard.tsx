import { useState } from "react";
import clsx from "clsx";
import type { CreatorBusinessSnapshot } from "../../lib/creatorManager";
import type { CreatorContentSnapshot } from "../../lib/creatorContentManager";
import { ManagerChatCard } from "./ManagerChatCard";
import { ContentManagerChatCard } from "./ContentManagerChatCard";

type Props = {
  businessSnapshot: CreatorBusinessSnapshot | null;
  contentSnapshot: CreatorContentSnapshot | null;
};

export function IaWorkspaceCard({ businessSnapshot, contentSnapshot }: Props) {
  const [activeTab, setActiveTab] = useState<"business" | "content">("business");

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-4 lg:px-6 lg:py-5 space-y-4 min-h-[520px] overflow-hidden">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Chat con tu Manager IA</h2>
        <p className="text-xs text-slate-400">Habla con tu manager de negocio o de contenido. Cambia de pestaña según lo que necesites hoy.</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={clsx(
            "rounded-full border px-3 py-1 text-xs transition",
            activeTab === "business"
              ? "border-emerald-500/60 bg-emerald-600/20 text-emerald-100"
              : "border-slate-700 bg-slate-800/70 text-slate-300 hover:border-emerald-400/70 hover:text-emerald-100"
          )}
          onClick={() => setActiveTab("business")}
        >
          Estrategia y números
        </button>
        <button
          type="button"
          className={clsx(
            "rounded-full border px-3 py-1 text-xs transition",
            activeTab === "content"
              ? "border-emerald-500/60 bg-emerald-600/20 text-emerald-100"
              : "border-slate-700 bg-slate-800/70 text-slate-300 hover:border-emerald-400/70 hover:text-emerald-100"
          )}
          onClick={() => setActiveTab("content")}
        >
          Contenido y catálogo
        </button>
      </div>

      <div className="mt-4 flex h-full flex-col flex-1">
        {activeTab === "business" ? (
          <ManagerChatCard businessSnapshot={businessSnapshot} hideTitle embedded />
        ) : (
          <ContentManagerChatCard initialSnapshot={contentSnapshot ?? undefined} hideTitle embedded />
        )}
      </div>
    </section>
  );
}
