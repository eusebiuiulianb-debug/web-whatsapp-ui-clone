import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";
import CreatorHeader from "../../../components/CreatorHeader";
import CreatorSettingsPanel from "../../../components/CreatorSettingsPanel";
import { useCreatorConfig } from "../../../context/CreatorConfigContext";

type CreatorDiscoveryProfile = {
  id?: string;
  creatorId?: string;
  isDiscoverable: boolean;
  niches: string[];
  communicationStyle: string;
  limits: string;
  priceMin: number | null;
  priceMax: number | null;
  responseHours: number | null;
  allowLocationMatching: boolean;
  showCountry: boolean;
  showCityApprox: boolean;
  country?: string | null;
  cityApprox?: string | null;
  creatorName?: string;
  avatarUrl?: string | null;
  handle?: string;
};

export default function CreatorDiscoveryPage() {
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [discoveryProfile, setDiscoveryProfile] = useState<CreatorDiscoveryProfile>({
    isDiscoverable: false,
    niches: [],
    communicationStyle: "calido",
    limits: "",
    priceMin: null,
    priceMax: null,
    responseHours: null,
    allowLocationMatching: false,
    showCountry: false,
    showCityApprox: false,
    country: null,
    cityApprox: null,
  });
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoverySaving, setDiscoverySaving] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const loadDiscoveryProfile = useCallback(async () => {
    try {
      setDiscoveryLoading(true);
      setDiscoveryError(null);
      const res = await fetch("/api/creator/discovery-profile");
      if (!res.ok) throw new Error("Error cargando discovery");
      const data = await res.json();
      setDiscoveryProfile((prev) => ({ ...prev, ...data }));
    } catch (err) {
      console.error(err);
      setDiscoveryError("No se pudo cargar Discovery.");
    } finally {
      setDiscoveryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiscoveryProfile();
  }, [loadDiscoveryProfile]);

  const updateDiscoveryField = useCallback(
    (key: keyof CreatorDiscoveryProfile, value: any) => {
      setDiscoveryProfile((prev) => ({ ...prev, [key]: value }));
      setDiscoveryMessage(null);
      setDiscoveryError(null);
    },
    []
  );

  const handleSaveDiscovery = useCallback(async () => {
    const { priceMin, priceMax } = discoveryProfile;
    if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
      setDiscoveryError("priceMin no puede ser mayor que priceMax");
      return;
    }
    try {
      setDiscoverySaving(true);
      setDiscoveryError(null);
      setDiscoveryMessage(null);
      const res = await fetch("/api/creator/discovery-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...discoveryProfile,
          niches: discoveryProfile.niches,
          showCityApprox: discoveryProfile.showCountry && discoveryProfile.showCityApprox,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Error guardando Discovery");
      }
      const data = await res.json();
      setDiscoveryProfile((prev) => ({ ...prev, ...data }));
      setDiscoveryMessage("Guardado");
    } catch (err) {
      console.error(err);
      setDiscoveryError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setDiscoverySaving(false);
    }
  }, [discoveryProfile]);

  const discoveryPreview = useMemo(
    () => ({
      name: discoveryProfile.creatorName || config.creatorName,
      avatar: discoveryProfile.avatarUrl || config.avatarUrl || null,
      priceRange:
        discoveryProfile.priceMin !== null && discoveryProfile.priceMax !== null
          ? `${discoveryProfile.priceMin} EUR - ${discoveryProfile.priceMax} EUR`
          : discoveryProfile.priceMin !== null
          ? `Desde ${discoveryProfile.priceMin} EUR`
          : discoveryProfile.priceMax !== null
          ? `Hasta ${discoveryProfile.priceMax} EUR`
          : "Rango privado",
      response:
        typeof discoveryProfile.responseHours === "number"
          ? `Resp. ~${discoveryProfile.responseHours}h`
          : "Resp. estandar",
      location:
        discoveryProfile.showCountry && discoveryProfile.country
          ? discoveryProfile.cityApprox
            ? `${discoveryProfile.cityApprox}, ${discoveryProfile.country}`
            : discoveryProfile.country
          : null,
      handle: discoveryProfile.handle || "creator",
    }),
    [config.avatarUrl, config.creatorName, discoveryProfile]
  );

  return (
    <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
      <Head>
        <title>Discovery del creador - NOVSY</title>
      </Head>
      <CreatorSettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <CreatorHeader
        name={config.creatorName}
        role="Discovery"
        subtitle={config.creatorSubtitle}
        initial={creatorInitial}
        avatarUrl={config.avatarUrl}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">Bio-link</p>
          <h1 className="text-2xl font-semibold">Ficha Discovery</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Ajusta la ficha que usa el asistente para mostrarte a fans nuevos.
          </p>
        </div>

        <section className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[color:rgba(var(--brand-rgb),0.8)]">Discovery</p>
              <h2 className="text-lg font-semibold text-[color:var(--text)]">Ficha para el asistente de fans</h2>
              <p className="text-sm text-[color:var(--muted)]">
                Activa o desactiva tu visibilidad. Solo se muestra en el asistente guiado, no hay muro publico.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[color:var(--muted)]">Visibilidad</span>
              <button
                type="button"
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  discoveryProfile.isDiscoverable
                    ? "border-[color:rgba(var(--brand-rgb),0.45)] bg-[color:rgba(var(--brand-rgb),0.16)] text-[color:var(--text)]"
                    : "border-[color:var(--surface-border)] bg-[color:var(--surface-2)] text-[color:var(--text)]"
                }`}
                onClick={() => updateDiscoveryField("isDiscoverable", !discoveryProfile.isDiscoverable)}
              >
                {discoveryProfile.isDiscoverable ? "Descubrible" : "Invisible"}
              </button>
            </div>
          </div>

          {discoveryError && <div className="text-sm text-[color:var(--danger)]">{discoveryError}</div>}
          {discoveryMessage && <div className="text-sm text-[color:var(--brand)]">{discoveryMessage}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="space-y-1 text-sm text-[color:var(--text)]">
                <span>Tags / nichos (separados por coma)</span>
                <input
                  type="text"
                  value={discoveryProfile.niches.join(", ")}
                  onChange={(e) =>
                    updateDiscoveryField(
                      "niches",
                      e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean)
                    )
                  }
                  placeholder="compania, conversacion, contenido"
                  className="w-full rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                />
              </label>

              <label className="space-y-1 text-sm text-[color:var(--text)]">
                <span>Estilo de trato</span>
                <select
                  value={discoveryProfile.communicationStyle}
                  onChange={(e) => updateDiscoveryField("communicationStyle", e.target.value)}
                  className="w-full rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                >
                  {["calido", "directo", "divertido", "elegante"].map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm text-[color:var(--text)]">
                <span>Limites</span>
                <textarea
                  value={discoveryProfile.limits}
                  onChange={(e) => updateDiscoveryField("limits", e.target.value)}
                  rows={2}
                  placeholder="Ej: sin contenido explicito, foco en audio y conversacion."
                  className="w-full rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-sm text-[color:var(--text)]">
                  <span>Precio minimo (EUR)</span>
                  <input
                    type="number"
                    value={discoveryProfile.priceMin ?? ""}
                    onChange={(e) =>
                      updateDiscoveryField("priceMin", e.target.value === "" ? null : Number(e.target.value))
                    }
                    className="w-full rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                  />
                </label>
                <label className="space-y-1 text-sm text-[color:var(--text)]">
                  <span>Precio maximo (EUR)</span>
                  <input
                    type="number"
                    value={discoveryProfile.priceMax ?? ""}
                    onChange={(e) =>
                      updateDiscoveryField("priceMax", e.target.value === "" ? null : Number(e.target.value))
                    }
                    className="w-full rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                  />
                </label>
              </div>

              <label className="space-y-1 text-sm text-[color:var(--text)]">
                <span>Tiempo de respuesta (horas)</span>
                <select
                  value={discoveryProfile.responseHours ?? ""}
                  onChange={(e) =>
                    updateDiscoveryField("responseHours", e.target.value === "" ? null : Number(e.target.value))
                  }
                  className="w-full rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                >
                  <option value="">Estandar</option>
                  {[1, 3, 6, 12, 24, 48].map((opt) => (
                    <option key={opt} value={opt}>
                      {opt} h
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[color:var(--text)]">Privacidad y ubicacion</p>
                <p className="text-xs text-[color:var(--muted)]">
                  Solo se muestra pais/ciudad si lo permites. El asistente filtra solo a creadores descubribles.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <ToggleRow
                  label="Permitir usar ubicacion para matching"
                  value={discoveryProfile.allowLocationMatching}
                  onChange={(val) => updateDiscoveryField("allowLocationMatching", val)}
                />
                <ToggleRow
                  label="Mostrar pais"
                  value={discoveryProfile.showCountry}
                  onChange={(val) => {
                    updateDiscoveryField("showCountry", val);
                    if (!val) updateDiscoveryField("showCityApprox", false);
                  }}
                />
                <ToggleRow
                  label="Mostrar ciudad (aprox.)"
                  disabled={!discoveryProfile.showCountry}
                  value={discoveryProfile.showCityApprox}
                  onChange={(val) => updateDiscoveryField("showCityApprox", val)}
                />
                {discoveryProfile.showCountry && (
                  <>
                    <input
                      type="text"
                      value={discoveryProfile.country || ""}
                      onChange={(e) => updateDiscoveryField("country", e.target.value)}
                      placeholder="Pais (opcional)"
                      className="w-full rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                    />
                    {discoveryProfile.showCityApprox && (
                      <input
                        type="text"
                        value={discoveryProfile.cityApprox || ""}
                        onChange={(e) => updateDiscoveryField("cityApprox", e.target.value)}
                        placeholder="Ciudad aproximada (opcional)"
                        className="w-full rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--surface-border)] px-3 py-2 text-sm text-[color:var(--text)] focus:border-[color:var(--surface-border-hover)] focus:ring-2 focus:ring-[color:var(--ring)]"
                      />
                    )}
                  </>
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3">
                <p className="text-sm font-semibold text-[color:var(--text)]">Vista previa /discover</p>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full overflow-hidden bg-[color:rgba(var(--brand-rgb),0.16)] border border-[color:rgba(var(--brand-rgb),0.3)] flex items-center justify-center text-lg font-semibold">
                    {discoveryPreview.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={discoveryPreview.avatar} alt={discoveryPreview.name} className="h-full w-full object-cover" />
                    ) : (
                      (discoveryPreview.name || "C")[0]
                    )}
                  </div>
                  <div className="flex flex-col">
                    <div className="text-sm font-semibold">{discoveryPreview.name}</div>
                    <div className="text-xs text-[color:var(--muted)]">
                      {discoveryPreview.priceRange} - {discoveryPreview.response}
                    </div>
                    {discoveryPreview.location && (
                      <div className="text-xs text-[color:var(--muted)]">{discoveryPreview.location}</div>
                    )}
                  </div>
                </div>
                <div className="text-xs text-[color:var(--muted)]">
                  CTA en /discover -&gt; perfil: <span className="text-[color:var(--brand)]">/link/{discoveryPreview.handle}</span> - chat:{" "}
                  <span className="text-[color:var(--brand)]">/c/{discoveryPreview.handle}</span>
                </div>
              </div>

              <button
                type="button"
                disabled={discoverySaving || discoveryLoading}
                onClick={handleSaveDiscovery}
                className="inline-flex items-center justify-center rounded-lg bg-[color:var(--brand-strong)] px-4 py-2.5 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--brand)] disabled:opacity-50"
              >
                {discoverySaving ? "Guardando..." : "Guardar ficha Discovery"}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
        disabled ? "border-[color:var(--surface-border)] text-[color:var(--muted)]" : "border-[color:var(--surface-border)] text-[color:var(--text)]"
      }`}
    >
      <span className="pr-2">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`rounded-full px-3 py-1 text-xs font-semibold ${
          value
            ? "bg-[color:rgba(var(--brand-rgb),0.16)] border border-[color:rgba(var(--brand-rgb),0.45)] text-[color:var(--text)]"
            : "bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] text-[color:var(--text)]"
        } ${disabled ? "opacity-60" : ""}`}
      >
        {value ? "Si" : "No"}
      </button>
    </label>
  );
}
