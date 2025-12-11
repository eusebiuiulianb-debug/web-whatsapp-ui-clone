import { useCallback, useEffect, useMemo, useState } from "react";
import { BioLinkPublicView } from "../public-profile/BioLinkPublicView";
import type { BioLinkConfig, BioLinkSecondaryLink } from "../../types/bioLink";
import { useCreatorConfig } from "../../context/CreatorConfigContext";

const MAX_LINKS = 4;

const DEFAULT_CONFIG: BioLinkConfig = {
  enabled: false,
  title: "Mi bio-link",
  tagline: "Charlas privadas y contenido exclusivo en NOVSY.",
  avatarUrl: "",
  primaryCtaLabel: "Entrar a mi chat privado",
  primaryCtaUrl: "/creator",
  secondaryLinks: [],
  handle: "creator",
};

export function BioLinkEditor({ handle, onOpenSettings }: { handle: string; onOpenSettings?: () => void }) {
  const { config: creatorConfig } = useCreatorConfig();
  const [config, setConfig] = useState<BioLinkConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const previewConfig = useMemo(() => config, [config]);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/creator/bio-link");
      const data = await res.json();
      if (data?.config) {
        setConfig((prev) => ({
          ...prev,
          ...(data.config as BioLinkConfig),
          title: creatorConfig.creatorName || (data.config as BioLinkConfig).title,
          tagline: creatorConfig.creatorSubtitle || (data.config as BioLinkConfig).tagline,
          avatarUrl: creatorConfig.avatarUrl || (data.config as BioLinkConfig).avatarUrl,
          handle,
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [creatorConfig.avatarUrl, creatorConfig.creatorName, creatorConfig.creatorSubtitle, handle]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    setConfig((prev) => ({
      ...prev,
      title: creatorConfig.creatorName || prev.title,
      tagline: creatorConfig.creatorSubtitle || prev.tagline,
      avatarUrl: creatorConfig.avatarUrl || prev.avatarUrl,
    }));
  }, [creatorConfig.avatarUrl, creatorConfig.creatorName, creatorConfig.creatorSubtitle]);

  async function handleSave() {
    try {
      setSaving(true);
      const payload: Partial<BioLinkConfig> = {
        enabled: config.enabled,
        primaryCtaLabel: config.primaryCtaLabel,
        primaryCtaUrl: config.primaryCtaUrl,
        secondaryLinks: config.secondaryLinks,
      };
      const res = await fetch("/api/creator/bio-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.config) {
          setConfig((prev) => ({
            ...prev,
            ...(data.config as BioLinkConfig),
            title: creatorConfig.creatorName || (data.config as BioLinkConfig).title,
            tagline: creatorConfig.creatorSubtitle || (data.config as BioLinkConfig).tagline,
            avatarUrl: creatorConfig.avatarUrl || (data.config as BioLinkConfig).avatarUrl,
          }));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const linkUrl = typeof window !== "undefined" ? `${window.location.origin}/link/${handle}` : `/link/${handle}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex items-center justify-center">
        <div className="w-full max-w-xl">
          <BioLinkPublicView config={previewConfig} />
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Configurar bio-link</h2>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            Activar página bio-link
          </label>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-200">Identidad</p>
          <LabeledInput
            label="Título"
            value={config.title}
            onChange={() => {}}
            readOnly
          />
          <LabeledInput
            label="Tagline"
            value={config.tagline}
            onChange={() => {}}
            readOnly
          />
          <LabeledInput
            label="Avatar (URL)"
            value={config.avatarUrl || ""}
            onChange={() => {}}
            readOnly
            helper="Nombre, tagline y foto se editan en Ajustes del creador."
          />
          <div className="text-[12px] text-slate-400">
            Usa el modal de ajustes para cambiar tu identidad.
            {onOpenSettings && (
              <button
                type="button"
                className="ml-2 text-emerald-200 hover:text-emerald-100 underline"
                onClick={onOpenSettings}
              >
                Abrir ajustes
              </button>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
          <p className="text-sm font-semibold">Botón principal</p>
          <LabeledInput
            label="Label"
            value={config.primaryCtaLabel}
            onChange={(val) => setConfig((prev) => ({ ...prev, primaryCtaLabel: val }))}
          />
          <LabeledInput
            label="URL"
            value={config.primaryCtaUrl}
            onChange={(val) => setConfig((prev) => ({ ...prev, primaryCtaUrl: val }))}
          />
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Enlaces secundarios</p>
            {config.secondaryLinks.length < MAX_LINKS && (
              <button
                type="button"
                className="text-xs rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 hover:border-emerald-400 hover:text-emerald-100"
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    secondaryLinks: [...prev.secondaryLinks, { label: "", url: "", iconKey: "custom" }],
                  }))
                }
              >
                Añadir enlace
              </button>
            )}
          </div>
          <div className="space-y-3">
            {config.secondaryLinks.map((link, idx) => (
              <div key={idx} className="rounded-lg border border-slate-800 bg-slate-900 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Enlace #{idx + 1}</span>
                  <button
                    type="button"
                    className="text-rose-300 hover:text-rose-200"
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        secondaryLinks: prev.secondaryLinks.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    Borrar
                  </button>
                </div>
                <LabeledInput
                  label="Label"
                  value={link.label}
                  onChange={(val) => updateLink(idx, { label: val })}
                />
                <LabeledInput
                  label="URL"
                  value={link.url}
                  onChange={(val) => updateLink(idx, { url: val })}
                />
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  <span>Icono</span>
                  <select
                    className="rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400"
                    value={link.iconKey || "custom"}
                    onChange={(e) => updateLink(idx, { iconKey: e.target.value as BioLinkSecondaryLink["iconKey"] })}
                  >
                    <option value="custom">Custom</option>
                    <option value="tiktok">TikTok</option>
                    <option value="instagram">Instagram</option>
                    <option value="twitter">X</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-slate-300">URL del bio-link</p>
          <input
            readOnly
            value={linkUrl}
            className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
          {loading && <span className="text-xs text-slate-400">Cargando...</span>}
        </div>
      </div>
    </div>
  );

  function updateLink(index: number, data: Partial<BioLinkSecondaryLink>) {
    setConfig((prev) => {
      const links = [...prev.secondaryLinks];
      links[index] = { ...links[index], ...data };
      return { ...prev, secondaryLinks: links };
    });
  }
}

function LabeledInput({
  label,
  value,
  onChange,
  helper,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  helper?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-300">
      <span>{label}</span>
      <input
        className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-400"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
      />
      {helper && <span className="text-[11px] text-slate-500">{helper}</span>}
    </label>
  );
}
