import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import PublicProfileView from "../../components/public-profile/PublicProfileView";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { PublicProfileCopy, PublicProfileMode } from "../../types/publicProfile";
import {
  clearPublicProfileOverrides,
  getPublicProfileOverrides,
  savePublicProfileOverrides,
} from "../../lib/publicProfileStorage";
import { PROFILE_COPY, mapToPublicProfileCopy } from "../../lib/publicProfileCopy";

const CREATOR_ID = "creator-1";

type EditableCopy = PublicProfileCopy;

export default function CreatorEditPage() {
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";
  const [mode, setMode] = useState<PublicProfileMode>("fanclub");

  const baseCopy = useMemo(
    () => mapToPublicProfileCopy(PROFILE_COPY[mode], mode, config),
    [mode, config]
  );

  const [draft, setDraft] = useState<EditableCopy>(baseCopy);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const overrides = getPublicProfileOverrides(CREATOR_ID);
    if (overrides) {
      setDraft(overrides);
      setMode(overrides.mode);
    } else {
      setDraft(baseCopy);
    }
  }, [baseCopy]);

  function updateDraft(updater: (prev: EditableCopy) => EditableCopy) {
    setDraft((prev) => updater(prev));
  }

  function handleSave() {
    savePublicProfileOverrides(CREATOR_ID, draft);
    setToast("Perfil actualizado");
    setTimeout(() => setToast(""), 2000);
  }

  function handleReset() {
    clearPublicProfileOverrides(CREATOR_ID);
    setDraft(baseCopy);
    setMode(baseCopy.mode);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Head>
        <title>Editar perfil público - NOVSY</title>
      </Head>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Editar perfil público</h1>
            <p className="text-sm text-slate-300">Ajusta los textos visibles en /creator. Se guardan en este navegador.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm font-semibold text-slate-100 hover:border-amber-400/70 hover:text-amber-100"
            >
              Restaurar texto por defecto
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg border border-emerald-400 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
            >
              Guardar cambios
            </button>
          </div>
        </div>
        {toast && <div className="text-sm text-emerald-200">{toast}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border border-slate-800 rounded-2xl overflow-hidden">
            <PublicProfileView
              copy={draft}
              creatorName={config.creatorName}
              creatorInitial={creatorInitial}
              subtitle={config.creatorSubtitle}
            />
          </div>
          <div className="border border-slate-800 rounded-2xl bg-slate-900/60 p-4 flex flex-col gap-4">
            <Block title="Identidad y modo">
              <div className="flex gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={draft.mode === "coach"}
                    onChange={() => {
                      setMode("coach");
                      setDraft(mapToPublicProfileCopy(PROFILE_COPY["coach"], "coach", config));
                    }}
                  />
                  Coach / parejas
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={draft.mode === "fanclub"}
                    onChange={() => {
                      setMode("fanclub");
                      setDraft(mapToPublicProfileCopy(PROFILE_COPY["fanclub"], "fanclub", config));
                    }}
                  />
                  Fanclub / contenido exclusivo
                </label>
              </div>
              <LabeledInput
                label="Tagline"
                value={draft.hero.tagline}
                onChange={(val) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, tagline: val } }))}
              />
              <LabeledTextarea
                label="Descripción"
                value={draft.hero.description}
                onChange={(val) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, description: val } }))}
              />
              <div className="flex flex-col gap-2">
                <span className="text-sm text-slate-300">Chips (3)</span>
                {draft.hero.chips.map((chip, idx) => (
                  <input
                    key={idx}
                    className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-amber-400"
                    value={chip}
                    onChange={(e) =>
                      updateDraft((prev) => {
                        const chips = [...prev.hero.chips];
                        chips[idx] = e.target.value;
                        return { ...prev, hero: { ...prev.hero, chips } };
                      })
                    }
                  />
                ))}
              </div>
            </Block>

            <Block title="Packs y CTA principal">
              <div className="flex gap-3 text-sm">
                {["welcome", "monthly", "special"].map((id) => (
                  <label key={id} className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={draft.recommendedPackId === id}
                      onChange={() => updateDraft((prev) => ({ ...prev, recommendedPackId: id as any }))}
                    />
                    {id === "welcome" ? "Bienvenida" : id === "monthly" ? "Mensual" : "Especial"}
                  </label>
                ))}
              </div>
              {draft.packs.map((pack, idx) => (
                <div key={pack.id} className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 flex flex-col gap-2">
                  <div className="flex gap-3 text-sm">
                    <div className="flex-1">
                      <LabeledInput
                        label={`Título (${pack.id})`}
                        value={pack.title}
                        onChange={(val) => updatePack(idx, { title: val })}
                      />
                    </div>
                    <div className="flex-1">
                      <LabeledInput
                        label="Badge"
                        value={pack.badge}
                        onChange={(val) => updatePack(idx, { badge: val })}
                      />
                    </div>
                  </div>
                  <LabeledInput
                    label="Precio"
                    value={pack.price}
                    onChange={(val) => updatePack(idx, { price: val })}
                  />
                  <LabeledInput
                    label="CTA"
                    value={pack.ctaLabel}
                    onChange={(val) => updatePack(idx, { ctaLabel: val })}
                  />
                </div>
              ))}
            </Block>

            <Block title="Freebies + FAQ">
              <div className="flex flex-col gap-3">
                {draft.freebies.map((freebie, idx) => (
                  <div key={freebie.id} className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 flex flex-col gap-2">
                    <LabeledInput
                      label={`Freebie ${idx + 1} título`}
                      value={freebie.title}
                      onChange={(val) => updateFreebie(idx, { title: val })}
                    />
                    <LabeledInput
                      label="Descripción"
                      value={freebie.description}
                      onChange={(val) => updateFreebie(idx, { description: val })}
                    />
                    <LabeledInput
                      label="CTA"
                      value={freebie.ctaLabel}
                      onChange={(val) => updateFreebie(idx, { ctaLabel: val })}
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-3">
                {draft.faq.map((item, idx) => (
                  <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 flex flex-col gap-2">
                    <LabeledInput
                      label={`FAQ ${idx + 1} pregunta`}
                      value={item.question}
                      onChange={(val) => updateFaq(idx, { question: val })}
                    />
                    <LabeledTextarea
                      label="Respuesta"
                      value={item.answer}
                      onChange={(val) => updateFaq(idx, { answer: val })}
                    />
                  </div>
                ))}
              </div>
            </Block>
          </div>
        </div>
      </div>
    </div>
  );

  function updatePack(index: number, data: Partial<EditableCopy["packs"][number]>) {
    updateDraft((prev) => {
      const packs = [...prev.packs];
      packs[index] = { ...packs[index], ...data } as any;
      return { ...prev, packs };
    });
  }

  function updateFreebie(index: number, data: Partial<EditableCopy["freebies"][number]>) {
    updateDraft((prev) => {
      const freebies = [...prev.freebies];
      freebies[index] = { ...freebies[index], ...data };
      return { ...prev, freebies };
    });
  }

  function updateFaq(index: number, data: Partial<EditableCopy["faq"][number]>) {
    updateDraft((prev) => {
      const faq = [...prev.faq];
      faq[index] = { ...faq[index], ...data };
      return { ...prev, faq };
    });
  }
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-300">
      <span>{label}</span>
      <input
        className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-amber-400"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function LabeledTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-300">
      <span>{label}</span>
      <textarea
        className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-amber-400 min-h-[80px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
