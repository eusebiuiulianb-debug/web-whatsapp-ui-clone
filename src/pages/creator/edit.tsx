import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import type { GetServerSideProps } from "next";
import PublicProfileView from "../../components/public-profile/PublicProfileView";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { PublicProfileCopy, PublicProfileMode, PublicProfileStats } from "../../types/publicProfile";
import {
  clearPublicProfileOverrides,
  getPublicProfileOverrides,
  savePublicProfileOverrides,
} from "../../lib/publicProfileStorage";
import { PROFILE_COPY, mapToPublicProfileCopy } from "../../lib/publicProfileCopy";
import { getPublicProfileStats } from "../../lib/publicProfileStats";

const CREATOR_ID = "creator-1";

type EditableCopy = PublicProfileCopy;
type Props = { stats: PublicProfileStats };

function mergeProfileCopy(base: PublicProfileCopy, overrides: Partial<PublicProfileCopy>): PublicProfileCopy {
  return {
    ...base,
    ...overrides,
    hero: {
      ...base.hero,
      ...(overrides.hero || {}),
      chips: overrides.hero?.chips
        ? overrides.hero.chips.map((chip) => {
            if (typeof (chip as any) === "string") return { label: chip as any, visible: true };
            return { label: (chip as any).label, visible: (chip as any).visible ?? true };
          })
        : base.hero.chips,
      whatInsideBullets: overrides.hero?.whatInsideBullets ?? base.hero.whatInsideBullets,
    },
    packs: base.packs.map((pack) => {
      const override = overrides.packs?.find((p) => p.id === pack.id);
      return { ...pack, ...(override || {}), visible: override?.visible ?? pack.visible ?? true };
    }),
    freebiesSectionVisible: overrides.freebiesSectionVisible ?? base.freebiesSectionVisible ?? true,
    freebies: base.freebies.map((freebie) => {
      const override = overrides.freebies?.find((f) => f.id === freebie.id);
      return {
        ...freebie,
        ...(override || {}),
        visible: override?.visible ?? freebie.visible ?? true,
      };
    }),
    faqSectionVisible: overrides.faqSectionVisible ?? base.faqSectionVisible ?? true,
    faq: overrides.faq ? overrides.faq.map((f, idx) => ({ ...base.faq[idx], ...f })) : base.faq,
    recommendedPackId: overrides.recommendedPackId ?? base.recommendedPackId,
    mode: overrides.mode ?? base.mode,
  };
}

export default function CreatorEditPage({ stats }: Props) {
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
      const merged = mergeProfileCopy(baseCopy, overrides);
      setDraft(merged);
      setMode(merged.mode);
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
    <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
      <Head>
        <title>Editar perfil público - NOVSY</title>
      </Head>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Editar perfil público</h1>
            <p className="text-sm text-[color:var(--muted)]">Ajusta los textos visibles en /creator. Se guardan en este navegador.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm font-semibold text-[color:var(--text)] hover:border-[color:rgba(245,158,11,0.7)] hover:text-[color:var(--text)]"
            >
              Restaurar texto por defecto
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg border border-[color:var(--brand)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)]"
            >
              Guardar cambios
            </button>
          </div>
        </div>
        {toast && <div className="text-sm text-[color:var(--brand)]">{toast}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border border-[color:var(--surface-border)] rounded-2xl overflow-hidden">
            <PublicProfileView
              copy={draft}
              creatorName={config.creatorName}
              creatorInitial={creatorInitial}
              subtitle={config.creatorSubtitle}
              avatarUrl={config.avatarUrl}
              stats={stats}
              creatorHandle={
                config.creatorHandle && config.creatorHandle !== "creator"
                  ? config.creatorHandle
                  : slugifyHandle(config.creatorName)
              }
            />
          </div>
          <div className="border border-[color:var(--surface-border)] rounded-2xl bg-[color:var(--surface-1)] p-4 flex flex-col gap-4">
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
              <LabeledInput
                label="Imagen de portada (coverImageUrl)"
                value={draft.hero.coverImageUrl ?? ""}
                onChange={(val) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, coverImageUrl: val } }))}
              />
              <div className="flex flex-col gap-2">
                <span className="text-sm text-[color:var(--muted)]">Chips (hasta 3)</span>
                {draft.hero.chips.map((chip, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <input
                      className="flex-1 rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--warning)]"
                      value={chip.label}
                      onChange={(e) =>
                        updateDraft((prev) => {
                          const chips = [...prev.hero.chips];
                          chips[idx] = { ...chips[idx], label: e.target.value };
                          return { ...prev, hero: { ...prev.hero, chips } };
                        })
                      }
                    />
                    <label className="flex items-center gap-1 text-xs text-[color:var(--muted)]">
                      <input
                        type="checkbox"
                        checked={chip.visible}
                        onChange={(e) =>
                          updateDraft((prev) => {
                            const chips = [...prev.hero.chips];
                            chips[idx] = { ...chips[idx], visible: e.target.checked };
                            return { ...prev, hero: { ...prev.hero, chips } };
                          })
                        }
                      />
                      Visible
                    </label>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-[color:var(--text)]">
                <input
                  type="checkbox"
                  checked={draft.hero.showStats !== false}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, showStats: e.target.checked } }))}
                />
                Mostrar stats de comunidad y contenido
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <LabeledInput
                  label="Texto botón principal"
                  value={draft.hero.primaryCtaLabel}
                  onChange={(val) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, primaryCtaLabel: val } }))}
                />
                <LabeledInput
                  label="Texto botón secundario"
                  value={draft.hero.secondaryCtaLabel}
                  onChange={(val) =>
                    updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, secondaryCtaLabel: val } }))
                  }
                />
              </div>
              <div className="flex flex-col gap-2 rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
                <label className="flex items-center gap-2 text-sm text-[color:var(--text)]">
                  <input
                    type="checkbox"
                    checked={draft.hero.showWhatInside}
                    onChange={(e) =>
                      updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, showWhatInside: e.target.checked } }))
                    }
                  />
                  Mostrar bloque “Qué hay dentro”
                </label>
                <LabeledInput
                  label="Título del bloque"
                  value={draft.hero.whatInsideTitle}
                  onChange={(val) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, whatInsideTitle: val } }))}
                />
                <LabeledTextarea
                  label="Bullets (una por línea)"
                  value={draft.hero.whatInsideBullets.join("\n")}
                  onChange={(val) =>
                    updateDraft((prev) => ({
                      ...prev,
                      hero: { ...prev.hero, whatInsideBullets: val.split("\n").filter(Boolean) },
                    }))
                  }
                />
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
                <div key={pack.id} className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm text-[color:var(--text)]">
                    <input
                      type="checkbox"
                      checked={pack.visible}
                      onChange={(e) => updatePack(idx, { visible: e.target.checked })}
                    />
                    Mostrar este pack
                  </label>
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
              <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
                <label className="flex items-center gap-2 text-sm text-[color:var(--text)]">
                  <input
                    type="checkbox"
                    checked={draft.freebiesSectionVisible}
                    onChange={(e) => updateDraft((prev) => ({ ...prev, freebiesSectionVisible: e.target.checked }))}
                  />
                  Mostrar sección “Para los que aún estáis curioseando”
                </label>
                {draft.freebies.map((freebie, idx) => (
                  <div key={freebie.id} className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
                      <input
                        type="checkbox"
                        checked={freebie.visible}
                        onChange={(e) => updateFreebie(idx, { visible: e.target.checked })}
                      />
                      Visible
                    </label>
                    <LabeledInput
                      label={`Card ${idx + 1} título`}
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
                    <LabeledInput
                      label="Link (opcional)"
                      value={freebie.link || ""}
                      onChange={(val) => updateFreebie(idx, { link: val })}
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3">
                <label className="flex items-center gap-2 text-sm text-[color:var(--text)]">
                  <input
                    type="checkbox"
                    checked={draft.faqSectionVisible}
                    onChange={(e) => updateDraft((prev) => ({ ...prev, faqSectionVisible: e.target.checked }))}
                  />
                  Mostrar sección de dudas / FAQ
                </label>
                {draft.faq.map((item, idx) => (
                  <div key={item.id} className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 flex flex-col gap-2">
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

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  let stats: PublicProfileStats = { activeMembers: 0, images: 0, videos: 0, audios: 0 };
  try {
    stats = await getPublicProfileStats(CREATOR_ID);
  } catch (err) {
    console.error("Error fetching public profile stats (edit)", err);
  }
  return { props: { stats } };
};

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function slugifyHandle(value?: string) {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-[color:var(--muted)]">
      <span>{label}</span>
      <input
        className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--warning)]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function LabeledTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-[color:var(--muted)]">
      <span>{label}</span>
      <textarea
        className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--warning)] min-h-[80px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
