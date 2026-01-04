import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import OrbitalExplorer from "../components/discovery/OrbitalExplorer";
import StoryViewerModal from "../components/discovery/StoryViewerModal";
import { IconGlyph } from "../components/ui/IconGlyph";
import type { DiscoveryRecommendation } from "../types/discovery";

type StepId = "intention" | "style" | "budget" | "responseSpeed" | "useLocation";
type StepOption = { id: string; label: string; description?: string };

type Answers = {
  intention?: string;
  style?: string;
  budget?: string;
  responseSpeed?: string;
  useLocation?: boolean;
};

const steps: { id: StepId; title: string; helper?: string; options: StepOption[] }[] = [
  {
    id: "intention",
    title: "¿Qué buscas hoy?",
    helper: "Elige el motivo principal. No es un muro, es un asistente guiado.",
    options: [
      { id: "compania", label: "Compañía", description: "Conversación y cercanía" },
      { id: "conversacion", label: "Conversación", description: "Mensajes y audio-notas" },
      { id: "contenido", label: "Contenido", description: "Ideas, guiones o material" },
      { id: "juego", label: "Juego", description: "Retos o dinámicas" },
    ],
  },
  {
    id: "style",
    title: "Estilo de trato",
    options: [
      { id: "calido", label: "Cálido", description: "Cercano y empático" },
      { id: "directo", label: "Directo", description: "Al grano, sin rodeos" },
      { id: "divertido", label: "Divertido", description: "Juguetón, ligero" },
      { id: "elegante", label: "Elegante", description: "Cuidado, premium" },
    ],
  },
  {
    id: "budget",
    title: "Presupuesto",
    options: [
      { id: "0-20", label: "0 – 20 €" },
      { id: "20-50", label: "20 – 50 €" },
      { id: "50-100", label: "50 – 100 €" },
      { id: "100+", label: "100 € +" },
    ],
  },
  {
    id: "responseSpeed",
    title: "Frecuencia de respuesta",
    options: [
      { id: "rapido", label: "Rápido", description: "< 24h" },
      { id: "normal", label: "Normal", description: "24–48h" },
      { id: "indiferente", label: "Me da igual" },
    ],
  },
  {
    id: "useLocation",
    title: "¿Usar ubicación aproximada?",
    helper: "Solo si tú quieres y el creador lo permite.",
    options: [
      { id: "yes", label: "Sí" },
      { id: "no", label: "No" },
    ],
  },
];

function ensureSessionId(): string | null {
  if (typeof window === "undefined") return null;
  const key = "novsy:discovery:session";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
}

export default function DiscoverPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [recommendations, setRecommendations] = useState<DiscoveryRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<string, "up" | "down">>({});
  const [viewMode, setViewMode] = useState<"list" | "orbital">("list");
  const [activeStory, setActiveStory] = useState<DiscoveryRecommendation | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const id = ensureSessionId();
    if (id) setSessionId(id);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const isComplete = useMemo(
    () =>
      Boolean(
        answers.intention &&
          answers.style &&
          answers.budget &&
          answers.responseSpeed &&
          typeof answers.useLocation === "boolean"
      ),
    [answers]
  );

  const answersKey = useMemo(() => JSON.stringify(answers), [answers]);

  const activeStep = steps[currentStep];

  const handleSelectOption = (optionId: string) => {
    if (!activeStep) return;
    const nextAnswers = { ...answers };
    if (activeStep.id === "useLocation") {
      nextAnswers.useLocation = optionId === "yes";
    } else {
      nextAnswers[activeStep.id] = optionId;
    }
    setAnswers(nextAnswers);
    setError("");
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep === 0) return;
    setCurrentStep((prev) => prev - 1);
    setError("");
  };

  const handleRestart = () => {
    setCurrentStep(0);
    setAnswers({});
    setRecommendations([]);
    setError("");
  };

  const fetchRecommendations = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/discovery/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intention: answers.intention,
          style: answers.style,
          budget: answers.budget,
          responseSpeed: answers.responseSpeed,
          useLocation: answers.useLocation,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "No se pudieron generar recomendaciones");
      }
      const data = (await res.json()) as { ok: boolean; recommendations?: DiscoveryRecommendation[]; error?: string };
      if (!data.ok || !Array.isArray(data.recommendations)) {
        throw new Error(data?.error || "No se pudieron generar recomendaciones");
      }
      setRecommendations(data.recommendations || []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "No se pudieron generar recomendaciones");
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  }, [answers.budget, answers.intention, answers.responseSpeed, answers.style, answers.useLocation]);

  useEffect(() => {
    if (!isComplete) return;
    void fetchRecommendations();
  }, [answersKey, fetchRecommendations, isComplete]);

  async function handleFeedback(creatorId: string, vote: "up" | "down") {
    try {
      const session = sessionId || ensureSessionId();
      setFeedbackState((prev) => ({ ...prev, [creatorId]: vote }));
      await fetch("/api/discovery/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId, vote, sessionId: session }),
      });
    } catch (err) {
      console.error("Error sending feedback", err);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b141a] text-[color:var(--text)]">
      <Head>
        <title>Discovery · Asistente para fans</title>
      </Head>
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12 space-y-8">
        <header className="space-y-3">
          <p className="text-[11px] uppercase tracking-wide text-[color:var(--brand)]/80">Asistente guiado</p>
          <h1 className="text-3xl md:text-4xl font-semibold">Encuentra tu creador ideal</h1>
          <p className="text-[color:var(--muted)] max-w-3xl">
            No es un muro de perfiles. Responde 3–5 preguntas rápidas y te recomendamos 3–7 creadores
            descubribles, con razones claras y privacidad respetada.
          </p>
        </header>

        <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-2xl shadow-black/30 p-5 md:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-[color:var(--muted)]">
              Paso {currentStep + 1} de {steps.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)]/60 disabled:opacity-50"
                onClick={handleBack}
                disabled={currentStep === 0}
              >
                Atrás
              </button>
              <button
                type="button"
                className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)]/60"
                onClick={handleRestart}
              >
                Reiniciar
              </button>
            </div>
          </div>

          {activeStep && (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">{activeStep.title}</h2>
              {activeStep.helper && <p className="text-sm text-[color:var(--muted)]">{activeStep.helper}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {activeStep.options.map((option) => {
                  const isSelected =
                    (activeStep.id === "useLocation" && answers.useLocation === (option.id === "yes")) ||
                    answers[activeStep.id] === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`flex flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? "border-[color:var(--brand)]/70 bg-[color:var(--brand-strong)]/15 text-[color:var(--text)]"
                          : "border-[color:var(--surface-border)] bg-[color:var(--surface-1)] text-[color:var(--text)] hover:border-[color:rgba(var(--brand-rgb),0.5)]"
                      }`}
                      onClick={() => handleSelectOption(option.id)}
                    >
                      <span className="text-sm font-semibold">{option.label}</span>
                      {option.description && <span className="text-xs text-[color:var(--muted)]">{option.description}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {error && <div className="text-sm text-[color:var(--danger)]">{error}</div>}
          {loading && <div className="text-sm text-[color:var(--muted)]">Buscando creadores…</div>}
        </div>

        {isComplete && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[color:var(--brand)]/80">Resultados</p>
                <h3 className="text-2xl font-semibold">Recomendados para ti</h3>
                <p className="text-sm text-[color:var(--muted)]">3–7 creadores, solo perfiles descubribles.</p>
              </div>
              <div className="text-sm text-[color:var(--muted)]">
                Preferencias: {answers.intention}, {answers.style}, {answers.budget}, {answers.responseSpeed}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-[color:var(--text)]0">Vista</span>
              {(["list", "orbital"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    viewMode === mode
                      ? "bg-[color:var(--brand-strong)]/20 text-[color:var(--text)] border border-[color:var(--brand)]/60"
                      : "bg-[color:var(--surface-2)] text-[color:var(--text)] border border-[color:var(--surface-border)] hover:border-[color:rgba(var(--brand-rgb),0.5)]"
                  }`}
                  onClick={() => setViewMode(mode)}
                >
                  {mode === "list" ? "Lista" : "Orbital"}
                </button>
              ))}
            </div>

            {viewMode === "list" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recommendations.map((rec) => (
                  <article
                    key={rec.creatorId}
                    className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 flex flex-col gap-3 shadow-lg shadow-black/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full overflow-hidden bg-[color:var(--brand-strong)]/30 border border-[color:rgba(var(--brand-rgb),0.3)] flex items-center justify-center text-lg font-semibold">
                        {rec.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={rec.avatarUrl} alt={rec.displayName} className="h-full w-full object-cover" />
                        ) : (
                          (rec.displayName || "C")[0]?.toUpperCase()
                        )}
                      </div>
                      <div className="flex flex-col">
                        <div className="text-lg font-semibold leading-tight">{rec.displayName}</div>
                        <div className="text-xs text-[color:var(--muted)]">
                          {rec.priceRange ? rec.priceRange : "Rango privado"} ·{" "}
                          {rec.responseHours ? `Resp. ~${rec.responseHours}h` : "Resp. estándar"}
                        </div>
                        {rec.country && (
                          <div className="text-xs text-[color:var(--text)]0">
                            {rec.country}
                            {rec.cityApprox ? ` · ${rec.cityApprox}` : ""}
                          </div>
                        )}
                      </div>
                    </div>

                    <ul className="space-y-1">
                      {rec.reasons.slice(0, 3).map((reason, idx) => (
                        <li key={`${rec.creatorId}-reason-${idx}`} className="text-sm text-[color:var(--text)] flex gap-2">
                          <span className="text-[color:var(--brand)]">•</span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/link/${rec.handle}`} passHref>
                        <a className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-1.5 text-sm font-semibold text-[color:var(--text)] hover:border-[color:var(--brand)]/60">
                          Ver perfil
                        </a>
                      </Link>
                      <Link href={`/c/${rec.handle}`} passHref>
                        <a className="rounded-full border border-[color:var(--brand)]/70 bg-[color:var(--brand-strong)]/20 px-3 py-1.5 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--brand-strong)]/30">
                          Abrir chat
                        </a>
                      </Link>
                      <div className="ml-auto flex items-center gap-1 text-[color:var(--muted)] text-xs">
                        <button
                          type="button"
                          aria-label="Me gusta"
                          className={`rounded-full border px-2 py-1 ${
                            feedbackState[rec.creatorId] === "up"
                              ? "border-[color:var(--brand)]/70 text-[color:var(--text)]"
                              : "border-[color:var(--surface-border)] hover:border-[color:rgba(var(--brand-rgb),0.6)]"
                          }`}
                          onClick={() => handleFeedback(rec.creatorId, "up")}
                        >
                          <IconGlyph name="thumbsUp" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="No me encaja"
                          className={`rounded-full border px-2 py-1 ${
                            feedbackState[rec.creatorId] === "down"
                              ? "border-[color:rgba(244,63,94,0.7)] text-[color:var(--text)]"
                              : "border-[color:var(--surface-border)] hover:border-[color:rgba(244,63,94,0.6)]"
                          }`}
                          onClick={() => handleFeedback(rec.creatorId, "down")}
                        >
                          <IconGlyph name="thumbsDown" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {viewMode === "orbital" && (
              <OrbitalExplorer
                recommendations={recommendations}
                onOpen={(rec) => setActiveStory(rec)}
                reducedMotion={reducedMotion}
              />
            )}

            {!loading && recommendations.length === 0 && (
              <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-4 text-sm text-[color:var(--muted)]">
                No encontramos suficientes coincidencias. Ajusta las respuestas o intenta sin filtro de ubicación.
              </div>
            )}
          </section>
        )}
      </div>
      <StoryViewerModal open={Boolean(activeStory)} recommendation={activeStory} onClose={() => setActiveStory(null)} />
    </div>
  );
}
