import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type StepId = "intention" | "style" | "budget" | "responseSpeed" | "useLocation";
type StepOption = { id: string; label: string; description?: string };

type Recommendation = {
  creatorId: string;
  displayName: string;
  avatarUrl?: string | null;
  priceRange?: string;
  responseHours?: number | null;
  reasons: string[];
  handle: string;
  country?: string | null;
  cityApprox?: string | null;
};

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
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<string, "up" | "down">>({});

  useEffect(() => {
    const id = ensureSessionId();
    if (id) setSessionId(id);
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
      const data = (await res.json()) as { recommendations: Recommendation[] };
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
    <div className="min-h-screen bg-[#0b141a] text-white">
      <Head>
        <title>Discovery · Asistente para fans</title>
      </Head>
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12 space-y-8">
        <header className="space-y-3">
          <p className="text-[11px] uppercase tracking-wide text-emerald-300/80">Asistente guiado</p>
          <h1 className="text-3xl md:text-4xl font-semibold">Encuentra tu creador ideal</h1>
          <p className="text-slate-300 max-w-3xl">
            No es un muro de perfiles. Responde 3–5 preguntas rápidas y te recomendamos 3–7 creadores
            descubribles, con razones claras y privacidad respetada.
          </p>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 shadow-2xl shadow-black/30 p-5 md:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-300">
              Paso {currentStep + 1} de {steps.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-emerald-500/60 disabled:opacity-50"
                onClick={handleBack}
                disabled={currentStep === 0}
              >
                Atrás
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-emerald-500/60"
                onClick={handleRestart}
              >
                Reiniciar
              </button>
            </div>
          </div>

          {activeStep && (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">{activeStep.title}</h2>
              {activeStep.helper && <p className="text-sm text-slate-400">{activeStep.helper}</p>}
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
                          ? "border-emerald-500/70 bg-emerald-600/15 text-emerald-100"
                          : "border-slate-800 bg-slate-900/70 text-slate-100 hover:border-emerald-500/50"
                      }`}
                      onClick={() => handleSelectOption(option.id)}
                    >
                      <span className="text-sm font-semibold">{option.label}</span>
                      {option.description && <span className="text-xs text-slate-400">{option.description}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {error && <div className="text-sm text-rose-300">{error}</div>}
          {loading && <div className="text-sm text-slate-300">Buscando creadores…</div>}
        </div>

        {isComplete && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-emerald-300/80">Resultados</p>
                <h3 className="text-2xl font-semibold">Recomendados para ti</h3>
                <p className="text-sm text-slate-400">3–7 creadores, solo perfiles descubribles.</p>
              </div>
              <div className="text-sm text-slate-400">
                Preferencias: {answers.intention}, {answers.style}, {answers.budget}, {answers.responseSpeed}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendations.map((rec) => (
                <article
                  key={rec.creatorId}
                  className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col gap-3 shadow-lg shadow-black/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full overflow-hidden bg-emerald-600/30 border border-emerald-500/30 flex items-center justify-center text-lg font-semibold">
                      {rec.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={rec.avatarUrl} alt={rec.displayName} className="h-full w-full object-cover" />
                      ) : (
                        (rec.displayName || "C")[0]?.toUpperCase()
                      )}
                    </div>
                    <div className="flex flex-col">
                      <div className="text-lg font-semibold leading-tight">{rec.displayName}</div>
                      <div className="text-xs text-slate-400">
                        {rec.priceRange ? rec.priceRange : "Rango privado"} ·{" "}
                        {rec.responseHours ? `Resp. ~${rec.responseHours}h` : "Resp. estándar"}
                      </div>
                      {rec.country && (
                        <div className="text-xs text-slate-500">
                          {rec.country}
                          {rec.cityApprox ? ` · ${rec.cityApprox}` : ""}
                        </div>
                      )}
                    </div>
                  </div>

                  <ul className="space-y-1">
                    {rec.reasons.slice(0, 3).map((reason, idx) => (
                      <li key={`${rec.creatorId}-reason-${idx}`} className="text-sm text-slate-200 flex gap-2">
                        <span className="text-emerald-300">•</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/link/${rec.handle}`} passHref>
                      <a className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:border-emerald-500/60">
                        Ver perfil
                      </a>
                    </Link>
                    <Link href={`/c/${rec.handle}`} passHref>
                      <a className="rounded-full border border-emerald-500/70 bg-emerald-600/20 px-3 py-1.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-600/30">
                        Abrir chat
                      </a>
                    </Link>
                    <div className="ml-auto flex items-center gap-1 text-slate-400 text-xs">
                      <button
                        type="button"
                        aria-label="Me gusta"
                        className={`rounded-full border px-2 py-1 ${feedbackState[rec.creatorId] === "up" ? "border-emerald-500/70 text-emerald-100" : "border-slate-800 hover:border-emerald-400/60"}`}
                        onClick={() => handleFeedback(rec.creatorId, "up")}
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        aria-label="No me encaja"
                        className={`rounded-full border px-2 py-1 ${feedbackState[rec.creatorId] === "down" ? "border-rose-500/70 text-rose-100" : "border-slate-800 hover:border-rose-400/60"}`}
                        onClick={() => handleFeedback(rec.creatorId, "down")}
                      >
                        👎
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {!loading && recommendations.length === 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
                No encontramos suficientes coincidencias. Ajusta las respuestas o intenta sin filtro de ubicación.
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
