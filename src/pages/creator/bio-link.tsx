import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { BioLinkEditor } from "../../components/creator/BioLinkEditor";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import CreatorHeader from "../../components/CreatorHeader";
import CreatorSettingsPanel from "../../components/CreatorSettingsPanel";

export default function CreatorBioLinkPage() {
  const { config } = useCreatorConfig();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const handle = useMemo(
    () => (config.creatorName || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    [config.creatorName]
  );
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";

  useEffect(() => {
    if (typeof document === "undefined") return;
    const encodedHandle = encodeURIComponent(handle);
    const maxAge = 60 * 60 * 24 * 30;
    document.cookie = `novsy_creator_preview=${encodedHandle}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  }, [handle]);

  return (
    <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
      <Head>
        <title>Bio-link del creador · NOVSY</title>
      </Head>
      <CreatorSettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <CreatorHeader
        name={config.creatorName}
        role="Bio-link"
        subtitle={config.creatorSubtitle}
        initial={creatorInitial}
        avatarUrl={config.avatarUrl}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Bio-link seguro</h1>
            <p className="text-sm text-[color:var(--muted)]">Comparte este enlace en redes para llevar tráfico a tu espacio en NOVSY.</p>
          </div>
        </div>
        <BioLinkEditor handle={handle} onOpenSettings={() => setIsSettingsOpen(true)} />
      </main>
    </div>
  );
}
