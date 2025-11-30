import Link from "next/link";
import type { PublicProfileCopy } from "../../types/publicProfile";

type Props = {
  copy: PublicProfileCopy;
  creatorName: string;
  creatorInitial: string;
  subtitle: string;
};

export default function PublicProfileView({ copy, creatorName, creatorInitial, subtitle }: Props) {
  const recommended = copy.packs.find((p) => p.id === copy.recommendedPackId) || copy.packs[0];

  return (
    <div className="min-h-screen bg-[#0b141a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col gap-8 md:gap-10">
        <header className="rounded-xl bg-slate-900/70 border border-slate-800 p-6 flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4 md:gap-5 w-full">
            <div className="flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-full bg-[#2a3942] text-white text-3xl font-semibold">
              {creatorInitial}
            </div>
            <div className="flex flex-col gap-3 flex-1">
              <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-semibold leading-tight">
                  {creatorName} · Creador
                </h1>
                <p className="text-sm text-slate-300">{copy.hero.tagline || subtitle}</p>
              </div>
              <p className="text-[#cfd6db] text-base leading-relaxed whitespace-pre-line">
                {copy.hero.description}
              </p>
              <div className="flex flex-wrap gap-2">
                {copy.hero.chips.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs text-slate-200"
                  >
                    {chip}
                  </span>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <Link
                  href="/"
                  className="inline-flex w-full sm:w-auto items-center justify-center px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-semibold transition-colors"
                >
                  Entrar al chat privado
                </Link>
                <Link
                  href="/"
                  className="inline-flex w-full sm:w-auto items-center justify-center px-4 py-2 rounded-lg border border-amber-400 text-amber-300 bg-transparent hover:bg-amber-400/10 font-semibold transition-colors"
                >
                  Seguir gratis
                </Link>
              </div>
            </div>
          </div>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold">Elige cómo entrar</h2>
          <div className="flex flex-col gap-3">
            {copy.packs.map((pack) => (
              <div
                key={pack.id}
                className="rounded-xl bg-slate-800/70 border border-slate-700 px-5 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{pack.title}</h3>
                    {pack.badge && (
                      <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-300 text-xs px-2 py-0.5">
                        {pack.badge}
                      </span>
                    )}
                    {pack.id === recommended?.id && (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-200 text-xs px-2 py-0.5">
                        Recomendado
                      </span>
                    )}
                  </div>
                  <p className="text-[#aebac1] text-sm leading-relaxed">{pack.bullets.slice(0, 1).join(" ")}</p>
                  <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                    {pack.bullets.slice(1).map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center gap-3 md:ml-4">
                  <span className="text-lg font-semibold text-amber-300">{pack.price}</span>
                  <button className="inline-flex items-center justify-center rounded-lg border border-amber-400 text-amber-200 bg-transparent hover:bg-amber-400/10 px-3 py-1 text-sm font-semibold transition">
                    {pack.ctaLabel}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold">Para los que aún estáis curioseando 👀</h2>
          <div className="flex flex-col gap-3">
            {copy.freebies.map((resource) => (
              <div
                key={resource.id}
                className="rounded-xl bg-slate-800/60 border border-slate-700 p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between text-sm"
              >
                <div className="flex flex-col gap-1">
                  <p className="font-semibold">{resource.title}</p>
                  <p className="text-slate-300 leading-relaxed">{resource.description}</p>
                </div>
                <button className="inline-flex w-full md:w-auto items-center justify-center px-3 py-2 rounded-lg border border-amber-400 text-amber-300 bg-transparent hover:bg-amber-400/10 font-semibold transition-colors">
                  {resource.ctaLabel}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold">Dudas rápidas antes de entrar</h2>
          <div className="flex flex-col gap-3">
            {copy.faq.map((item) => (
              <div
                key={item.id}
                className="rounded-xl bg-slate-800/60 border border-slate-700 p-4 flex flex-col gap-1"
              >
                <p className="font-semibold text-slate-100">{item.question}</p>
                <p className="text-slate-300 text-sm leading-relaxed">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
