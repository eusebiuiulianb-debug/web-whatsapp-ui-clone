import Link from "next/link";
import { useState } from "react";
import type { PublicProfileCopy, PublicProfileStats } from "../../types/publicProfile";

type Props = {
  copy: PublicProfileCopy;
  creatorName: string;
  creatorInitial: string;
  subtitle: string;
  avatarUrl?: string | null;
  stats?: PublicProfileStats;
};

export default function PublicProfileView({ copy, creatorName, creatorInitial, subtitle, avatarUrl, stats }: Props) {
  const recommended = copy.packs.find((p) => p.id === copy.recommendedPackId) || copy.packs[0];
  const highlights = (recommended?.bullets ?? []).slice(0, 3);
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);
  const visiblePacks = copy.packs.filter((pack) => pack.visible !== false);
  const visibleChips = (copy.hero.chips || []).filter((chip) => chip.visible !== false);
  const visibleFreebies = (copy.freebies || []).filter((item) => item.visible !== false);
  const showStats = copy.hero.showStats !== false;
  const statsLine = showStats && stats ? buildStatsLine(stats) : "";

  const hasWhatInside = copy.hero.showWhatInside !== false && (copy.hero.whatInsideBullets?.length ?? 0) > 0;
  const heroBackgroundStyle =
    copy.hero.coverImageUrl && copy.hero.coverImageUrl.trim().length > 0
      ? {
          backgroundImage: `linear-gradient(135deg, rgba(11,20,26,0.8), rgba(11,20,26,0.65)), url('${copy.hero.coverImageUrl}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : undefined;

  return (
    <div className="min-h-screen bg-[#0b141a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        <header
          className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 p-6 md:p-8"
          style={heroBackgroundStyle}
        >
          <div
            className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/20 pointer-events-none"
          />
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, #34d39922, transparent 40%), radial-gradient(circle at 80% 10%, #38bdf833, transparent 35%), linear-gradient(135deg, #0b141a 0%, #0f172a 60%)",
            }}
          />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-start">
            <div className={`flex flex-col gap-4 ${hasWhatInside ? "md:w-7/12" : "md:w-full"}`}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {avatarUrl ? (
                    <div className="flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full border border-white/20 bg-slate-900 overflow-hidden shadow-lg shadow-black/50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={avatarUrl} alt={creatorName} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full border border-white/20 bg-gradient-to-br from-emerald-500/90 to-sky-500/90 text-white text-3xl font-semibold shadow-lg shadow-black/50">
                      {creatorInitial}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <h1 className="text-3xl md:text-4xl font-semibold leading-tight">{creatorName}</h1>
                  <p className="text-sm text-slate-200">{copy.hero.tagline || subtitle}</p>
                  {statsLine && <div className="text-xs text-slate-200">{statsLine}</div>}
                </div>
              </div>
              <p className="text-slate-200 text-base leading-relaxed whitespace-pre-line">{copy.hero.description}</p>
              <div className="flex flex-wrap gap-2">
                {visibleChips.map((chip, idx) => (
                  <span
                    key={`${chip.label}-${idx}`}
                    className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs text-slate-100"
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/"
                  className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400"
                >
                  {copy.hero.primaryCtaLabel || "Entrar al chat privado"}
                </Link>
                <Link
                  href="/"
                  className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl border border-amber-400/70 bg-amber-500/10 px-5 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20"
                >
                  {copy.hero.secondaryCtaLabel || "Seguir gratis"}
                </Link>
              </div>
            </div>

            {hasWhatInside && (
              <div className="md:w-5/12 w-full">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 shadow-xl shadow-black/30 backdrop-blur-sm">
                  <p className="text-sm font-semibold text-slate-100 mb-3">{copy.hero.whatInsideTitle || "Qué hay dentro"}</p>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {(copy.hero.whatInsideBullets || []).slice(0, 4).map((item, idx) => (
                      <li key={`${item}-${idx}`} className="flex items-start gap-2">
                        <span className="mt-0.5 h-2 w-2 rounded-full bg-emerald-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Elige cómo entrar</h2>
          <div
            className={`grid gap-4 ${
              visiblePacks.length === 1
                ? "grid-cols-1"
                : visiblePacks.length === 2
                ? "grid-cols-1 md:grid-cols-2"
                : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            }`}
          >
            {visiblePacks.map((pack) => (
              <div
                key={pack.id}
                className={`rounded-2xl bg-slate-900/70 border px-5 py-4 flex flex-col gap-3 shadow-lg shadow-black/20 ${
                  visiblePacks.length === 1 ? "max-w-xl mx-auto w-full" : ""
                }`}
                style={pack.id === recommended?.id ? { borderColor: "rgba(52,211,153,0.6)", boxShadow: "0 10px 30px rgba(16,185,129,0.15)" } : {}}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-semibold">{pack.title}</h3>
                  {pack.badge && (
                    <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-300 text-[11px] px-2 py-0.5">
                      {pack.badge}
                    </span>
                  )}
                  {pack.id === recommended?.id && (
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-200 text-[11px] px-2 py-0.5">
                      Recomendado
                    </span>
                  )}
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">{pack.bullets.slice(0, 1).join(" ")}</p>
                {pack.bullets.slice(1).length > 0 && (
                  <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                    {pack.bullets.slice(1).map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-2xl font-semibold text-amber-300">{pack.price}</span>
                  <button className="inline-flex items-center justify-center rounded-lg border border-amber-400/70 text-amber-200 bg-transparent hover:bg-amber-400/10 px-3 py-2 text-sm font-semibold transition">
                    {pack.ctaLabel}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {copy.freebiesSectionVisible !== false && visibleFreebies.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Para los que aún estáis curioseando 👀</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleFreebies.map((resource) => (
                <div
                  key={resource.id}
                  className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 flex flex-col gap-3 shadow-lg shadow-black/10"
                >
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold text-slate-50">{resource.title}</p>
                    <p className="text-slate-300 text-sm leading-relaxed">{resource.description}</p>
                  </div>
                  <button className="inline-flex w-full items-center justify-center rounded-lg border border-amber-400 text-amber-200 bg-transparent hover:bg-amber-400/10 px-3 py-2 text-sm font-semibold transition-colors">
                    {resource.ctaLabel}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {copy.faqSectionVisible !== false && copy.faq.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Dudas rápidas antes de entrar</h2>
            <div className="flex flex-col gap-3">
              {copy.faq.map((item) => {
                const isOpen = openFaqId === item.id;
                return (
                  <div key={item.id} className="rounded-2xl bg-slate-900/60 border border-slate-800">
                    <button
                      type="button"
                      className="w-full px-4 py-3 flex items-center justify-between text-left"
                      onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                    >
                      <span className="font-semibold text-slate-100">{item.question}</span>
                      <span className="text-slate-400">{isOpen ? "−" : "+"}</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 text-sm text-slate-300 leading-relaxed">{item.answer}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function buildStatsLine(stats: PublicProfileStats) {
  const parts: string[] = [];
  if (stats.activeMembers > 0) parts.push(`${stats.activeMembers}+ personas dentro`);
  if (stats.images > 0) parts.push(`${stats.images} fotos`);
  if (stats.videos > 0) parts.push(`${stats.videos} vídeos`);
  if (stats.audios > 0) parts.push(`${stats.audios} audios`);
  return parts.join(" · ");
}
