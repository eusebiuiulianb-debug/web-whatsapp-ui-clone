import { useCallback, useEffect, useMemo, useState } from "react";
import { BioLinkPublicView } from "../public-profile/BioLinkPublicView";
import type { BioLinkConfig, BioLinkSecondaryLink } from "../../types/bioLink";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";

const MAX_LINKS = 4;
const FAQ_SIZE = 3;

type CopyTarget = "TAGLINE" | "CTA" | "DESCRIPTION" | "FAQ";

const COPY_TARGET_OPTIONS: Array<{ value: CopyTarget; label: string }> = [
  { value: "TAGLINE", label: "Tagline" },
  { value: "CTA", label: "CTA botón" },
  { value: "DESCRIPTION", label: "Descripción" },
  { value: "FAQ", label: "FAQ x3" },
];

const DEFAULT_CONFIG: BioLinkConfig = {
  enabled: false,
  title: "Mi bio-link",
  tagline: "Charlas privadas y contenido exclusivo en NOVSY.",
  description: "",
  avatarUrl: "",
  primaryCtaLabel: "Entrar a mi chat privado",
  primaryCtaUrl: "/go/creator",
  secondaryLinks: [],
  faq: [],
  handle: "creator",
};

export function BioLinkEditor({ handle, onOpenSettings }: { handle: string; onOpenSettings?: () => void }) {
  const { config: creatorConfig, setConfig: setCreatorConfig } = useCreatorConfig();
  const [config, setConfig] = useState<BioLinkConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ctaError, setCtaError] = useState<string | null>(null);
  const [linkErrors, setLinkErrors] = useState<Record<string, string>>({});
  const [copyState, setCopyState] = useState<{ link: "idle" | "copied" | "error"; direct: "idle" | "copied" | "error" }>({
    link: "idle",
    direct: "idle",
  });
  const [assistantTarget, setAssistantTarget] = useState<CopyTarget>("TAGLINE");
  const [assistantTone, setAssistantTone] = useState("");
  const [assistantOptions, setAssistantOptions] = useState<string[]>([]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const defaultCtaUrl = `/go/${handle}`;
  const legacyChatUrl = `/c/${handle}`;
  const [ctaMode, setCtaMode] = useState<"chat" | "custom">("chat");
  const previewConfig = useMemo(() => ({ ...config, avatarUrl: normalizeImageSrc(config.avatarUrl || "") }), [config]);
  const faqEntries = useMemo(() => {
    const entries = Array.isArray(config.faq) ? config.faq : [];
    return Array.from({ length: FAQ_SIZE }, (_, idx) => entries[idx] || "");
  }, [config.faq]);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/creator/bio-link");
      const data = await res.json();
      if (data?.config) {
        const nextConfig = data.config as BioLinkConfig;
        setConfig((prev) => ({
          ...prev,
          ...nextConfig,
          title: creatorConfig.creatorName || nextConfig.title,
          tagline:
            typeof nextConfig.tagline === "string"
              ? nextConfig.tagline
              : creatorConfig.creatorSubtitle || prev.tagline,
          avatarUrl: normalizeImageSrc(creatorConfig.avatarUrl || nextConfig.avatarUrl),
          primaryCtaUrl: nextConfig.primaryCtaUrl || defaultCtaUrl,
          description:
            typeof nextConfig.description === "string"
              ? nextConfig.description
              : prev.description,
          faq: Array.isArray(nextConfig.faq) ? nextConfig.faq : prev.faq,
          handle,
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [creatorConfig.avatarUrl, creatorConfig.creatorName, creatorConfig.creatorSubtitle, handle, defaultCtaUrl]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    setConfig((prev) => ({
      ...prev,
      title: creatorConfig.creatorName || prev.title,
      avatarUrl: creatorConfig.avatarUrl || prev.avatarUrl,
    }));
  }, [creatorConfig.avatarUrl, creatorConfig.creatorName]);

  useEffect(() => {
    setCtaMode(deriveCtaMode(config.primaryCtaUrl, defaultCtaUrl, legacyChatUrl));
  }, [config.primaryCtaUrl, defaultCtaUrl, legacyChatUrl]);

  useEffect(() => {
    setAssistantOptions([]);
    setAssistantError(null);
  }, [assistantTarget]);

  async function persistBioLink(nextConfig: BioLinkConfig) {
    const targetCta =
      ctaMode === "chat"
        ? defaultCtaUrl
        : typeof nextConfig.primaryCtaUrl === "string" && nextConfig.primaryCtaUrl.trim().length > 0
        ? nextConfig.primaryCtaUrl.trim()
        : "";
    const invalidCta = ctaMode === "custom" && isForbiddenCtaDestination(targetCta, handle);
    if (invalidCta) {
      setCtaError("Solo se permite https:// o rutas públicas /c/tu-handle.");
      return false;
    }
    if (ctaMode === "custom" && !targetCta) {
      setCtaError("Introduce una URL válida para el botón.");
      return false;
    }
    if (!validateSecondaryLinks(nextConfig.secondaryLinks)) return false;
    setCtaError(null);
    try {
      setSaving(true);
      const normalizedAvatar = normalizeImageSrc(nextConfig.avatarUrl || "");
      const sanitizedFaq = Array.isArray(nextConfig.faq)
        ? nextConfig.faq.map((item) => item.trim()).filter((item) => item.length > 0)
        : [];
      const payload: Partial<BioLinkConfig> = {
        enabled: nextConfig.enabled,
        tagline: nextConfig.tagline.trim(),
        description: typeof nextConfig.description === "string" ? nextConfig.description.trim() : "",
        faq: sanitizedFaq,
        primaryCtaLabel: nextConfig.primaryCtaLabel,
        primaryCtaUrl: targetCta || defaultCtaUrl,
        secondaryLinks: nextConfig.secondaryLinks,
        avatarUrl: normalizedAvatar,
      };
      const res = await fetch("/api/creator/bio-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.error === "SECONDARY_LINK_INVALID") {
          setLinkErrors((prev) => ({ ...prev, general: "Revisa los enlaces secundarios (deben ser http(s))." }));
        }
        return false;
      }
      const data = await res.json();
      if (data?.config) {
        const nextConfig = data.config as BioLinkConfig;
        setConfig((prev) => ({
          ...prev,
          ...nextConfig,
          title: creatorConfig.creatorName || nextConfig.title,
          tagline:
            typeof nextConfig.tagline === "string"
              ? nextConfig.tagline
              : creatorConfig.creatorSubtitle || prev.tagline,
          avatarUrl: normalizeImageSrc(creatorConfig.avatarUrl || nextConfig.avatarUrl),
          description:
            typeof nextConfig.description === "string"
              ? nextConfig.description
              : prev.description,
          faq: Array.isArray(nextConfig.faq) ? nextConfig.faq : prev.faq,
        }));
      }
      setCreatorConfig({ ...creatorConfig, avatarUrl: normalizedAvatar });
      return true;
    } catch (err) {
      console.error(err);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    await persistBioLink(config);
  }

  async function handleSuggestCopy() {
    try {
      setAssistantLoading(true);
      setAssistantError(null);
      setAssistantOptions([]);
      const res = await fetch("/api/creator/bio-link-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: assistantTarget,
          tone: assistantTone.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          setAssistantError("Espera unos segundos antes de pedir nuevas sugerencias.");
          return;
        }
        setAssistantError(data?.error || "No se pudo generar sugerencias.");
        return;
      }
      const options = Array.isArray(data?.options)
        ? data.options.filter((option: unknown) => typeof option === "string" && option.trim().length > 0)
        : [];
      if (options.length === 0) {
        setAssistantError("Respuesta inválida del asistente.");
        return;
      }
      setAssistantOptions(options.slice(0, 3));
    } catch (err) {
      console.error(err);
      setAssistantError("No se pudo generar sugerencias.");
    } finally {
      setAssistantLoading(false);
    }
  }

  function applyCopyOption(option: string) {
    const trimmed = option.trim();
    if (!trimmed) return;
    if (assistantTarget === "TAGLINE") {
      setConfig((prev) => ({ ...prev, tagline: trimmed }));
      return;
    }
    if (assistantTarget === "CTA") {
      setConfig((prev) => ({ ...prev, primaryCtaLabel: trimmed }));
      return;
    }
    if (assistantTarget === "DESCRIPTION") {
      setConfig((prev) => ({ ...prev, description: trimmed }));
      return;
    }
    if (assistantTarget === "FAQ") {
      setConfig((prev) => ({ ...prev, faq: parseFaqOption(trimmed) }));
    }
  }

  const linkUrl = typeof window !== "undefined" ? `${window.location.origin}/link/${handle}` : `/link/${handle}`;
  const directChatUrl = typeof window !== "undefined" ? `${window.location.origin}/go/${handle}` : `/go/${handle}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 flex items-center justify-center">
        <div className="w-full max-w-xl">
          <BioLinkPublicView config={previewConfig} />
        </div>
      </div>
        <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Configurar bio-link</h2>
          <label className="flex items-center gap-2 text-sm text-[color:var(--text)]">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            Activar página bio-link
          </label>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-[color:var(--text)]">Identidad</p>
          <LabeledInput
            label="Título"
            value={config.title}
            onChange={() => {}}
            readOnly
          />
          <LabeledInput
            label="Tagline"
            value={config.tagline}
            onChange={(val) => setConfig((prev) => ({ ...prev, tagline: val }))}
            helper="Texto breve que aparece bajo tu nombre."
          />
          <LabeledTextArea
            label="Descripción corta"
            value={config.description || ""}
            onChange={(val) => setConfig((prev) => ({ ...prev, description: val }))}
            helper="Opcional. Resume en una o dos frases."
          />
          <LabeledInput
            label="Avatar (URL)"
            value={config.avatarUrl || ""}
            onChange={(val) => setConfig((prev) => ({ ...prev, avatarUrl: val }))}
            helper="Si no empieza por http(s) o /, añadiremos / al guardar."
          />
          <div className="text-[12px] text-[color:var(--muted)]">
            El título se gestiona en ajustes. Tagline y descripción se pueden editar aquí.
            {onOpenSettings && (
              <button
                type="button"
                className="ml-2 text-[color:var(--brand)] hover:text-[color:var(--text)] underline"
                onClick={onOpenSettings}
              >
                Abrir ajustes
              </button>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Asistente de copy</p>
            <span className="text-[11px] text-[color:var(--muted)]">Texto breve</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs text-[color:var(--muted)]">
              <span>Qué generar</span>
              <select
                className="rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                value={assistantTarget}
                onChange={(e) => setAssistantTarget(e.target.value as CopyTarget)}
              >
                {COPY_TARGET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--muted)]">
              <span>Estilo/tono (opcional)</span>
              <input
                className="rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                value={assistantTone}
                onChange={(e) => setAssistantTone(e.target.value)}
                placeholder="Directo, cálido, premium..."
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                className="w-full rounded-lg bg-[color:var(--surface-2)] px-3 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)] disabled:opacity-60"
                onClick={() => void handleSuggestCopy()}
                disabled={assistantLoading}
              >
                {assistantLoading ? "Sugiriendo..." : "Sugerir"}
              </button>
            </div>
          </div>
          {assistantError && <p className="text-xs text-[color:var(--danger)]">{assistantError}</p>}
          {assistantOptions.length > 0 && (
            <div className="space-y-2">
              {assistantOptions.map((option, index) => {
                const faqItems = parseFaqOption(option);
                return (
                  <div key={`${assistantTarget}-${index}`} className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-2">
                    {assistantTarget === "FAQ" && faqItems.length > 0 ? (
                      <ul className="space-y-1 text-xs text-[color:var(--text)]">
                        {faqItems.map((item, idx) => (
                          <li key={`${index}-${idx}`} className="flex gap-2">
                            <span className="text-[color:var(--warning)]">-</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-[color:var(--text)]">{option}</p>
                    )}
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg border border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.12)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:rgba(var(--brand-rgb),0.16)]"
                      onClick={() => applyCopyOption(option)}
                    >
                      Usar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-2">
          <p className="text-sm font-semibold">Botón principal</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-[color:var(--text)]">
              <input
                type="radio"
                checked={ctaMode === "chat"}
                onChange={() => {
                  setCtaMode("chat");
                  setConfig((prev) => ({ ...prev, primaryCtaUrl: defaultCtaUrl }));
                  setCtaError(null);
                }}
              />
              Abrir chat (recomendado)
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-[color:var(--text)]">
              <input
                type="radio"
                checked={ctaMode === "custom"}
                onChange={() => {
                  setCtaMode("custom");
                  setCtaError(null);
                }}
              />
              URL personalizada
            </label>
          </div>
          <LabeledInput
            label="Label"
            value={config.primaryCtaLabel}
            onChange={(val) => setConfig((prev) => ({ ...prev, primaryCtaLabel: val }))}
          />
          {ctaMode === "custom" ? (
            <LabeledInput
              label="URL"
              value={config.primaryCtaUrl}
              onChange={(val) => setConfig((prev) => ({ ...prev, primaryCtaUrl: val }))}
              helper="Solo https:// o rutas públicas /c/tu-handle."
            />
          ) : (
            <p className="text-xs text-[color:var(--muted)]">Abrirá tu chat privado en NOVSY ({defaultCtaUrl}).</p>
          )}
          {ctaError && <p className="text-xs text-[color:var(--danger)]">{ctaError}</p>}
        </div>

        <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-2">
          <p className="text-sm font-semibold">FAQ (3 respuestas)</p>
          <div className="space-y-2">
            {faqEntries.map((entry, index) => (
              <LabeledInput
                key={`faq-${index}`}
                label={`Respuesta ${index + 1}`}
                value={entry}
                onChange={(val) => updateFaq(index, val)}
              />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Enlaces secundarios</p>
            {config.secondaryLinks.length < MAX_LINKS && (
              <button
                type="button"
                className="text-xs rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-1 hover:border-[color:var(--brand)] hover:text-[color:var(--text)]"
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
              <div key={idx} className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
                  <span>Enlace #{idx + 1}</span>
                  <button
                    type="button"
                    className="text-[color:var(--danger)] hover:text-[color:var(--danger)]"
                    onClick={() => {
                      setConfig((prev) => ({
                        ...prev,
                        secondaryLinks: prev.secondaryLinks.filter((_, i) => i !== idx),
                      }));
                      setLinkErrors((prev) => {
                        const next: Record<number, string> = {};
                        Object.entries(prev).forEach(([key, val]) => {
                          const num = Number(key);
                          if (Number.isNaN(num)) return;
                          if (num < idx) next[num] = val;
                          if (num > idx) next[num - 1] = val;
                        });
                        return next;
                      });
                    }}
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
                  error={linkErrors[idx]}
                  helper="Debe empezar por http:// o https://"
                />
                <label className="flex flex-col gap-1 text-sm text-[color:var(--muted)]">
                  <span>Icono</span>
                  <select
                    className="rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
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

      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-[color:var(--muted)]">URL del bio-link</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={linkUrl}
              className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
            />
            <button
              type="button"
              className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)] hover:border-[color:var(--brand)]"
              onClick={() => void copyToClipboard(linkUrl, "link")}
            >
              Copiar
            </button>
          </div>
          {copyState.link === "copied" && <p className="text-xs text-[color:var(--brand)]">Copiado</p>}
          {copyState.link === "error" && <p className="text-xs text-[color:var(--danger)]">No se pudo copiar</p>}
        </div>
        <div className="space-y-2">
          <p className="text-sm text-[color:var(--muted)]">URL chat directo</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={directChatUrl}
              className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)]"
            />
            <button
              type="button"
              className="rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)] hover:border-[color:var(--brand)]"
              onClick={() => void copyToClipboard(directChatUrl, "direct")}
            >
              Copiar
            </button>
          </div>
          {copyState.direct === "copied" && <p className="text-xs text-[color:var(--brand)]">Copiado</p>}
          {copyState.direct === "error" && <p className="text-xs text-[color:var(--danger)]">No se pudo copiar</p>}
        </div>
        {linkErrors.general && <p className="text-xs text-[color:var(--danger)]">{linkErrors.general}</p>}
      </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-[color:var(--brand-strong)] px-4 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--brand-strong)] disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
          {loading && <span className="text-xs text-[color:var(--muted)]">Cargando...</span>}
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
    setLinkErrors((prev) => {
      const next = { ...prev };
      const url = (data.url ?? config.secondaryLinks[index]?.url ?? "").trim();
      if (url && isHttpUrl(url)) {
        delete next[index];
      }
      return next;
    });
  }

  function updateFaq(index: number, value: string) {
    setConfig((prev) => {
      const existing = Array.isArray(prev.faq) ? prev.faq : [];
      const next = Array.from({ length: FAQ_SIZE }, (_, idx) => existing[idx] || "");
      next[index] = value;
      return { ...prev, faq: next };
    });
  }

  function validateSecondaryLinks(linksToValidate = config.secondaryLinks) {
    const errors: Record<number, string> = {};
    linksToValidate.forEach((link, idx) => {
      const url = (link.url || "").trim();
      if (url && !isHttpUrl(url)) {
        errors[idx] = "Usa una URL http(s)://";
      }
    });
    setLinkErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function copyToClipboard(value: string, key: "link" | "direct") {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState((prev) => ({ ...prev, [key]: "copied" }));
    } catch (_err) {
      setCopyState((prev) => ({ ...prev, [key]: "error" }));
    } finally {
      setTimeout(() => setCopyState((prev) => ({ ...prev, [key]: "idle" })), 1500);
    }
  }
}

function LabeledInput({
  label,
  value,
  onChange,
  helper,
  readOnly,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  helper?: string;
  readOnly?: boolean;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-[color:var(--muted)]">
      <span>{label}</span>
      <input
        className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
      />
      {helper && <span className="text-[11px] text-[color:var(--text)]0">{helper}</span>}
      {error && <span className="text-[11px] text-[color:var(--danger)]">{error}</span>}
    </label>
  );
}

function LabeledTextArea({
  label,
  value,
  onChange,
  helper,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  helper?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-[color:var(--muted)]">
      <span>{label}</span>
      <textarea
        className="w-full rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)] h-20"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {helper && <span className="text-[11px] text-[color:var(--text)]0">{helper}</span>}
    </label>
  );
}

function isForbiddenCtaDestination(url: string, handle: string) {
  const trimmed = (url || "").trim().toLowerCase();
  if (!trimmed) return true;
  const loopPath = `/link/${handle}`;
  if (trimmed.startsWith("/")) {
    if (trimmed === "/") return true;
    if (trimmed.startsWith("/creator") || trimmed.startsWith("/fan") || trimmed.startsWith("/api") || trimmed.startsWith("/link")) return true;
    if (trimmed.startsWith("/c/")) return false;
    return true;
  }
  if (trimmed === loopPath || trimmed.startsWith(`${loopPath}?`)) return true;
  try {
    const urlObj = new URL(url, "http://localhost");
    const path = urlObj.pathname.toLowerCase();
    if (path.startsWith("/")) {
      if (path === "/") return true;
      if (path.startsWith("/creator") || path.startsWith("/fan") || path.startsWith("/api") || path.startsWith("/link")) return true;
      if (path.startsWith("/c/")) return false;
      return true;
    }
    if (path === loopPath || path.startsWith(`${loopPath}/`)) return true;
  } catch (_err) {
    // ignore parse errors
  }
  return false;
}

function deriveCtaMode(primaryCtaUrl: string, defaultCtaUrl: string, legacyCtaUrl?: string): "chat" | "custom" {
  const normalized = (primaryCtaUrl || "").trim();
  const defaultNormalized = (defaultCtaUrl || "").trim();
  const legacyNormalized = (legacyCtaUrl || "").trim();
  if (!normalized || normalized === defaultNormalized || (legacyNormalized && normalized === legacyNormalized)) return "chat";
  return "custom";
}

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test((url || "").trim());
}

function parseFaqOption(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  let parts: string[] = [];
  if (trimmed.includes("|")) {
    parts = trimmed.split("|");
  } else if (trimmed.includes("\n")) {
    parts = trimmed.split(/\r?\n/);
  } else if (trimmed.includes(";")) {
    parts = trimmed.split(";");
  } else {
    const numbered = trimmed.split(/\s*\d+[.)]\s*/).map((item) => item.trim()).filter(Boolean);
    parts = numbered.length >= 3 ? numbered : [trimmed];
  }

  const cleaned = parts
    .map((item) => item.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);

  if (cleaned.length >= FAQ_SIZE) return cleaned.slice(0, FAQ_SIZE);
  if (cleaned.length === 0) return [];
  return [...cleaned, ...Array(FAQ_SIZE - cleaned.length).fill("")];
}
