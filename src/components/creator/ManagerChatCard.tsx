import { forwardRef, ReactNode, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import type { CreatorBusinessSnapshot } from "../../lib/creatorManager";
import MessageBalloon from "../MessageBalloon";
import { PillButton } from "../ui/PillButton";
import {
  CreatorPlatformKey,
  CreatorPlatforms,
  formatPlatformLabel,
  getEnabledPlatforms,
  normalizeCreatorPlatforms,
} from "../../lib/creatorPlatforms";

type ManagerChatMessage = {
  id: string;
  role: "CREATOR" | "ASSISTANT";
  content: string;
  createdAt: string;
};

type ManagerChatGetResponse = {
  messages: ManagerChatMessage[];
};

type ManagerChatPostResponse = {
  reply: { text: string };
  creditsUsed: number;
  creditsRemaining: number;
  usedFallback?: boolean;
  settingsStatus?: "ok" | "settings_missing";
};

type ManagerActionIntent = "ROMPER_EL_HIELO" | "REACTIVAR_FAN_FRIO" | "OFRECER_UN_EXTRA" | "LLEVAR_A_MENSUAL" | "RESUMEN_PULSO_HOY";

const defaultSuggestions = [
  "¿A qué fans debería escribir hoy?",
  "Resúmeme mis números clave de esta semana.",
  "Dame una acción concreta para aumentar ingresos hoy.",
];

type GlobalMode = "HOY" | "VENTAS" | "CATALOGO" | "CRECIMIENTO";

type Props = {
  businessSnapshot?: CreatorBusinessSnapshot | null;
  hideTitle?: boolean;
  embedded?: boolean;
  suggestions?: string[];
  density?: "comfortable" | "compact";
  variant?: "card" | "chat";
  onBackToBoard?: () => void;
  title?: string;
  avatarUrl?: string;
  statusText?: string;
  contextContent?: ReactNode;
  scope?: "global" | "fan";
  platforms?: CreatorPlatforms | null;
};

export type ManagerChatCardHandle = {
  sendQuickPrompt: (message: string, action?: ManagerActionIntent) => void;
  setDraft: (message: string) => void;
};

export const ManagerChatCard = forwardRef<ManagerChatCardHandle, Props>(function ManagerChatCard(
  {
    businessSnapshot,
    hideTitle = false,
    embedded = false,
    suggestions,
    density = "comfortable",
    variant = "card",
    onBackToBoard,
    title,
    avatarUrl,
    statusText,
    contextContent,
    platforms,
    scope = "fan",
  }: Props,
  ref
) {
  const [messages, setMessages] = useState<ManagerChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [usedFallback, setUsedFallback] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<"ok" | "settings_missing" | null>(null);
  const [globalMode, setGlobalMode] = useState<GlobalMode>("HOY");
  const [growthPlatform, setGrowthPlatform] = useState<CreatorPlatformKey>("tiktok");
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [snapshot, setSnapshot] = useState<CreatorBusinessSnapshot | null>(businessSnapshot ?? null);
  const isDemo = !process.env.NEXT_PUBLIC_OPENAI_API_KEY;

  useEffect(() => {
    void loadMessages();
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (businessSnapshot) {
      setSnapshot(businessSnapshot);
    }
  }, [businessSnapshot]);

  async function loadMessages(opts?: { silent?: boolean }) {
    try {
      if (!opts?.silent) {
        setLoading(true);
      }
      setError(null);
      const res = await fetch("/api/creator/ai-manager/messages?tab=STRATEGY");
      if (!res.ok) {
        throw new Error("No se pudo cargar el historial");
      }
      const data = (await res.json()) as ManagerChatGetResponse;
      setMessages((data?.messages ?? []).slice(-50));
      if (!opts?.silent) {
        setUsedFallback(false);
      }
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar el chat del Manager IA.");
    } finally {
      if (!opts?.silent) {
        setLoading(false);
      }
    }
  }

  function buildDemoReply(text: string) {
    const lower = text.toLowerCase();
    if (lower.includes("fans") && lower.includes("escribir")) {
      return "Hoy prioriza:\n• Marta (VIP, caduca en 2d): haz un check-in rápido.\n• Luis (nuevo): da la bienvenida y ofrece pack mensual.\n• Ana (en riesgo): pregúntale qué contenido quiere ver.";
    }
    if (lower.includes("números") || lower.includes("resúmeme mis números")) {
      return "Tus números demo:\n• Ingresos 7d: 652 €\n• Ingresos 30d: 1.930 €\n• Extras 30d: 48 ventas\n• Fans nuevos 30d: 12\n• Riesgo 7d: 25 €";
    }
    if (lower.includes("acción concreta") || lower.includes("ingresos")) {
      return "Acción demo:\n1) Envía un upsell a tus 3 VIP sobre el pack mensual.\n2) Comparte un extra de 15 € con fans en riesgo.\n3) Cierra con un CTA claro a compra hoy.";
    }
    return "Modo demo activo: conecta tu OPENAI_API_KEY para respuestas con tus datos reales.";
  }

  function inferAction(message: string): ManagerActionIntent | null {
    const normalized = message.toLowerCase();
    if (normalized.includes("hielo") || normalized.includes("primer") || normalized.includes("rompe")) return "ROMPER_EL_HIELO";
    if (normalized.includes("frío") || normalized.includes("frio") || normalized.includes("reactivar") || normalized.includes("riesgo")) return "REACTIVAR_FAN_FRIO";
    if (normalized.includes("extra") || normalized.includes("upsell")) return "OFRECER_UN_EXTRA";
    if (normalized.includes("mensual")) return "LLEVAR_A_MENSUAL";
    if (normalized.includes("pulso") || normalized.includes("resumen") || normalized.includes("prioridad")) return "RESUMEN_PULSO_HOY";
    return null;
  }

  async function handleSend(externalMessage?: string, forcedAction?: ManagerActionIntent | null) {
    const text = typeof externalMessage === "string" ? externalMessage.trim() : input.trim();
    if (!text || sending) return;
    const action = forcedAction ?? inferAction(text);
    try {
      setSending(true);
      setError(null);
      const now = new Date().toISOString();
      const optimisticId = `local-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: optimisticId, role: "CREATOR", content: text, createdAt: now },
      ]);

      if (isDemo) {
        const demoReply = buildDemoReply(text);
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticId),
          {
            id: `assistant-${Date.now()}`,
            role: "ASSISTANT",
            content: demoReply,
            createdAt: new Date().toISOString(),
          },
        ]);
        setUsedFallback(true);
        setInput("");
        setSending(false);
        return;
      }

      const res = await fetch("/api/creator/ai-manager/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: "STRATEGY", message: text, action }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Error enviando mensaje");
      }

      const data = (await res.json()) as ManagerChatPostResponse;
      const assistantMessage: ManagerChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "ASSISTANT",
        content: data?.reply?.text ?? "Sin respuesta",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) =>
        [...prev.filter((m) => m.id !== optimisticId), assistantMessage].slice(-50)
      );
      setUsedFallback(Boolean(data?.usedFallback));
      setSettingsStatus(data?.settingsStatus ?? null);
      void loadMessages({ silent: true });
      setInput("");
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("local-")));
      setError("No se pudo enviar el mensaje al Manager IA.");
    } finally {
      setSending(false);
    }
  }

  useImperativeHandle(ref, () => ({
    sendQuickPrompt: (message: string, action?: ManagerActionIntent) => {
      setInput(message);
      void handleSend(message, action);
    },
    setDraft: (message: string) => {
      setInput(message);
      inputRef.current?.focus();
    },
  }));

  const normalizedPlatforms = useMemo(() => normalizeCreatorPlatforms(platforms), [platforms]);
  const enabledPlatforms = useMemo(() => getEnabledPlatforms(normalizedPlatforms), [normalizedPlatforms]);

  useEffect(() => {
    if (enabledPlatforms.length > 0 && !enabledPlatforms.includes(growthPlatform)) {
      setGrowthPlatform(enabledPlatforms[0]);
    }
  }, [enabledPlatforms, growthPlatform]);

  const activeGrowthPlatform: CreatorPlatformKey =
    globalMode === "CRECIMIENTO" && enabledPlatforms.length > 0
      ? enabledPlatforms.includes(growthPlatform)
        ? growthPlatform
        : enabledPlatforms[0]
      : growthPlatform;

  const globalModePrompts: Record<GlobalMode, Record<string, string>> = {
    HOY: {
      "¿Qué priorizo hoy?":
        "Con mis datos de hoy (cola, en riesgo, caducan pronto, VIP activos, ventas 7/30d), dime: 1) top 3 prioridades, 2) por qué, 3) próxima acción concreta para cada una.",
      "Diagnóstico 3 bullets":
        "Haz un diagnóstico en 3 bullets: qué va bien, qué bloquea ingresos, y el cambio mínimo que haría hoy.",
      "3 acciones rápidas":
        "Dame 3 acciones rápidas (15 min c/u) para generar ingresos hoy, sin ser agresivo con los fans.",
      "Plan 7 días":
        "Plan de 7 días: objetivo diario + acción + mensaje sugerido + KPI a mirar.",
      "Rescatar caducan pronto":
        "Redacta mensajes cortos para fans que caducan pronto: 1 suave, 1 directo, 1 juguetón. Sin presión.",
    },
    VENTAS: {
      "Empuje a mensual (hoy)": "Dame un plan rápido para empujar suscripciones mensuales hoy: a quién escribir, 2 plantillas de mensaje (suave/directo) y un CTA claro.",
      "Oferta del día": "Propón una oferta del día convincente: qué producto, precio/bonus, mensaje breve y urgencia sin sonar agresivo.",
      "3 CTAs listos": "Redacta 3 CTAs listos para enviar hoy, cada uno con tono distinto (cálido, directo, juguetón).",
      "Optimizar precios": "Analiza mis precios actuales y sugiere ajustes simples (subir/bajar/crear escalón) con racional y riesgo.",
      "Qué vender a VIP": "Dime qué debería ofrecer a mis VIP hoy: producto, precio, argumento y CTA específico.",
    },
    CATALOGO: {
      "Qué falta grabar": "Dame 5 ideas concretas de contenido que faltan en mi catálogo y por qué ayudarían a vender más.",
      "5 extras nuevos": "Propón 5 extras nuevos con título, precio sugerido y a quién ofrecerlos.",
      "Mejorar packs": "Sugiere mejoras a mis packs actuales: qué añadir/quitar, precio y copy principal.",
      Bundles: "Diseña 2 bundles atractivos con precio, qué incluyen y el mensaje de venta.",
      "Copy de catálogo": "Reescribe el copy del catálogo para subir conversión: 3 versiones cortas con enfoques distintos.",
    },
    CRECIMIENTO: {},
  };

  const fallbackBanner = settingsStatus === "settings_missing"
    ? (
        <span>
          Revisar ajustes: falta `OPENAI_API_KEY` o no se pudo descifrar.{" "}
          <Link href="/creator/ai-settings">
            <a className="underline hover:text-amber-100">Abrir ajustes</a>
          </Link>
        </span>
      )
    : "Modo demo activo: conecta tu OPENAI_API_KEY para respuestas con tus datos reales.";
  const globalModes: GlobalMode[] = ["HOY", "VENTAS", "CATALOGO", "CRECIMIENTO"];
  const growthActiveList = enabledPlatforms.length
    ? enabledPlatforms
        .map((key) => {
          const handle = normalizedPlatforms[key]?.handle?.trim();
          const cleanHandle = handle ? handle.replace(/^@+/, "") : "";
          const suffix = cleanHandle ? ` (@${cleanHandle})` : "";
          return `${formatPlatformLabel(key)}${suffix}`;
        })
        .join(", ")
    : "TikTok, Instagram, YouTube o X";

  const baseGlobalModeContent: Record<GlobalMode, { actions: readonly string[]; suggestions: readonly string[] }> = {
    HOY: {
      actions: ["¿Qué priorizo hoy?", "Diagnóstico 3 bullets", "3 acciones rápidas"],
      suggestions: ["Plan 7 días", "Rescatar caducan pronto"],
    },
    VENTAS: {
      actions: ["Empuje a mensual (hoy)", "Oferta del día", "3 CTAs listos"],
      suggestions: ["Optimizar precios", "Qué vender a VIP"],
    },
    CATALOGO: {
      actions: ["Qué falta grabar", "5 extras nuevos", "Mejorar packs"],
      suggestions: ["Bundles", "Copy de catálogo"],
    },
    CRECIMIENTO: { actions: [], suggestions: [] },
  };

  const growthContent = useMemo(() => {
    const primaryLabel = `3 ideas para ${formatPlatformLabel(activeGrowthPlatform)}`;
    const actions = [primaryLabel, "Calendario 7 días", "Qué publicar hoy"] as const;
    const suggestions = ["Hooks + guiones", "Plan crecimiento 14d"] as const;
    return { actions, suggestions };
  }, [activeGrowthPlatform]);

  const globalModeContent = globalMode === "CRECIMIENTO" ? growthContent : baseGlobalModeContent[globalMode];

  const getGlobalPrompt = (label: string) => {
    if (globalMode === "CRECIMIENTO") {
      const platformLabel = formatPlatformLabel(activeGrowthPlatform);
      const handle = normalizedPlatforms[activeGrowthPlatform]?.handle?.trim();
      const cleanHandle = handle ? handle.replace(/^@+/, "") : "";
      const focusLabel = cleanHandle ? `${platformLabel} (@${cleanHandle})` : platformLabel;
      const objective = "Objetivo: traer tráfico al bio-link y vender packs/extras.";
      if (label.toLowerCase().startsWith("3 ideas")) {
        return `Dame 3 ideas para ${focusLabel}: hook, guion (6-8 líneas) y CTA al bio-link. Plataformas activas: ${growthActiveList}. ${objective}`;
      }
      if (label.toLowerCase().startsWith("calendario")) {
        return `Arma un calendario de 7 días priorizando ${focusLabel} pero usando lo mejor de (${growthActiveList}). Incluye objetivo diario, formato y CTA claro a packs/bio-link. ${objective}`;
      }
      if (label.toLowerCase().startsWith("qué publicar hoy")) {
        return `Dime qué publicar hoy en ${focusLabel}: tema, ángulo y CTA corto. Ten en cuenta mis plataformas activas (${growthActiveList}) y prioriza mover bio-link o packs.`;
      }
      if (label.toLowerCase().startsWith("hooks")) {
        return `Genera 5 hooks + mini guiones (15-25s) listos para grabar en ${focusLabel}. Usa mis plataformas activas (${growthActiveList}) y orienta a tráfico y conversión.`;
      }
      if (label.toLowerCase().startsWith("plan crecimiento 14d") || label.toLowerCase().startsWith("plan de crecimiento")) {
        return `Crea un plan de crecimiento de 14 días combinando ${growthActiveList}. Resume foco semanal, tipo de contenido y meta (tráfico al bio-link / ventas de packs).`;
      }
      return label;
    }
    return globalModePrompts[globalMode]?.[label] ?? label;
  };

  const quickSuggestions =
    scope === "global"
      ? [ ...(globalModeContent?.actions ?? []), ...(globalModeContent?.suggestions ?? []) ]
      : suggestions && suggestions.length > 0
      ? suggestions
      : defaultSuggestions;

  const chipRowClass = clsx("flex flex-wrap items-center gap-2 pb-1", scope === "fan" ? "px-3 py-2" : "");
  const modeRowClass =
    "flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
  const applyPrompt = (prompt: string, autoSend: boolean) => {
    setInput((prev) => {
      if (!prev || !prev.trim()) return prompt;
      return `${prev.trim()}\n\n${prompt}`;
    });
    inputRef.current?.focus();
    if (autoSend) {
      void handleSend(prompt);
    }
  };

  if (variant === "chat") {
    const headerLabel = title || "Manager IA";
    const desktopHeaderClass = clsx(
      "hidden md:flex items-center gap-3 bg-slate-950/70 border-b border-slate-800 px-4 md:px-6",
      hideTitle ? "py-2 justify-end" : "py-3 md:py-4 justify-between"
    );
    return (
      <div className="flex flex-col w-full h-full min-h-0">
        {onBackToBoard && (
          <header className="md:hidden sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 bg-slate-950/90 border-b border-slate-800 backdrop-blur">
            <button
              type="button"
              onClick={onBackToBoard}
              className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
            >
              ← Volver
            </button>
            {!hideTitle && (
              <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
                <span className="truncate text-sm font-semibold text-slate-50">{headerLabel}</span>
                <span className="inline-flex items-center rounded-full border border-emerald-400/70 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-100">
                  IA
                </span>
              </div>
            )}
          </header>
        )}
        <div className={desktopHeaderClass}>
          {!hideTitle && (
            <div className="flex items-center gap-3 min-w-0">
              {avatarUrl ? (
                <div className="w-12 h-12 rounded-full overflow-hidden border border-[rgba(134,150,160,0.2)] bg-[#2a3942] shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarUrl} alt={headerLabel} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#2a3942] text-white font-semibold shadow-md">
                  {headerLabel.trim().charAt(0)}
                </div>
              )}
              <div className="flex flex-col">
                <h1 className="text-base font-semibold text-slate-50">{headerLabel}</h1>
                <p className="text-sm text-slate-300">{statusText || "Chat interno. No se envía nada a tus fans."}</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {contextContent ? (
            <div className="bg-slate-950/80 border-b border-slate-800 px-4 py-2.5">{contextContent}</div>
          ) : null}
          <div
            ref={listRef}
            className="flex-1 min-h-0 overflow-y-auto bg-slate-950/90 bg-cover bg-center"
            style={{
              backgroundImage:
                "linear-gradient(rgba(8, 14, 20, 0.85), rgba(8, 14, 20, 0.85)), url('/assets/images/background.jpg')",
            }}
          >
            <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 space-y-3">
              {loading && <div className="text-center text-[#aebac1] text-sm mt-2">Cargando mensajes...</div>}
              {error && !loading && <div className="text-center text-red-400 text-sm mt-2">{error}</div>}
              {!loading && !error && messages.length === 0 && (
                <MessageBalloon
                  me={false}
                  message="Hola, soy tu Manager IA. Pregúntame qué priorizar, pídeme diagnóstico o un plan de 7 días y te ayudo."
                  time={new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  fromLabel="Manager IA"
                  meLabel="Tú"
                />
              )}
              {messages.map((msg) => {
                const isCreator = msg.role === "CREATOR";
                const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                return (
                  <MessageBalloon
                    key={msg.id}
                    me={isCreator}
                    message={msg.content}
                    time={time}
                    fromLabel="Manager IA"
                    meLabel="Tú"
                  />
                );
              })}
            </div>
          </div>
          {usedFallback && (
            <div className="px-4 pt-2 text-[12px] text-amber-200 bg-amber-500/10 border-t border-amber-500/30">
              {fallbackBanner}
            </div>
          )}
          <div className="px-4 sm:px-6 lg:px-8 py-3 space-y-3">
            {scope === "global" ? (
            <>
              <div className={modeRowClass}>
                {globalModes.map((mode) => {
                  const isActive = globalMode === mode;
                  return (
                    <PillButton
                      key={mode}
                      intent={isActive ? "primary" : "ghost"}
                      size="sm"
                      className="shrink-0"
                      onClick={() => setGlobalMode(mode)}
                    >
                      {mode === "HOY"
                        ? "Hoy"
                        : mode === "VENTAS"
                        ? "Ventas"
                        : mode === "CATALOGO"
                        ? "Catálogo"
                        : "Crecimiento"}
                  </PillButton>
                );
              })}
              </div>
              {globalMode === "CRECIMIENTO" && (
                <div className="flex flex-wrap items-center gap-2 px-1">
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">Plataforma foco</span>
                  {(enabledPlatforms.length > 1 ? enabledPlatforms : enabledPlatforms.length === 1 ? enabledPlatforms : [activeGrowthPlatform]).map((platform) => (
                    <PillButton
                      key={platform}
                      intent={platform === activeGrowthPlatform ? "primary" : "ghost"}
                      size="sm"
                      onClick={() => setGrowthPlatform(platform)}
                    >
                      {formatPlatformLabel(platform)}
                    </PillButton>
                  ))}
                  <span className="text-xs text-slate-400">Activas: {growthActiveList}</span>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {(globalModeContent?.actions ?? []).map((action, idx) => (
                    <PillButton
                      key={action}
                      intent={idx === 0 ? "primary" : "secondary"}
                      size="md"
                      onClick={() => applyPrompt(getGlobalPrompt(action), false)}
                    >
                      {action}
                    </PillButton>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(globalModeContent?.suggestions ?? []).map((sugg) => (
                    <PillButton
                      key={sugg}
                      intent="secondary"
                      size="sm"
                      onClick={() => applyPrompt(getGlobalPrompt(sugg), false)}
                    >
                      {sugg}
                    </PillButton>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className={chipRowClass}>
              {quickSuggestions.map((sugg) => (
                <PillButton
                  key={sugg}
                  intent="secondary"
                  size="sm"
                  onClick={() => {
                    applyPrompt(sugg, false);
                  }}
                  disabled={sending}
                >
                  {sugg}
                </PillButton>
              ))}
            </div>
          )}
            <div className="border-t border-slate-950 bg-slate-950 px-4 py-3 rounded-2xl border border-slate-800/60 shadow-sm">
              <div
                className={clsx(
                  "flex items-center gap-2 rounded-3xl border px-3 py-2.5",
                  "bg-slate-900/90 border-slate-700/80 shadow-sm",
                  "focus-within:border-emerald-500/80 focus-within:ring-1 focus-within:ring-emerald-500/40"
                )}
              >
                <div className="relative">
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-800/80 transition text-slate-400 cursor-not-allowed"
                    title="Adjuntar contenido"
                    aria-label="Adjuntar contenido"
                    disabled
                  >
                    <svg viewBox="0 0 24 24" width="24" height="24" className="cursor-not-allowed">
                      <path fill="currentColor" d="M1.816 15.556v.002c0 1.502.584 2.912 1.646 3.972s2.472 1.647 3.974 1.647a5.58 5.58 0 0 0 3.972-1.645l9.547-9.548c.769-.768 1.147-1.767 1.058-2.817-.079-.968-.548-1.927-1.319-2.698-1.594-1.592-4.068-1.711-5.517-.262l-7.916 7.915c-.881.881-.792 2.25.214 3.261.959.958 2.423 1.053 3.263.215l5.511-5.512c.28-.28.267-.722.053-.936l-.244-.244c-.191-.191-.567-.349-.957.04l-5.506 5.506c-.18.18-.635.127-.976-.214-.098-.097-.576-.613-.213-.973l7.915-7.917c.818-.817 2.267-.699 3.23.262.5.501.802 1.1.849 1.685.051.573-.156 1.111-.589 1.543l-9.547 9.549a3.97 3.97 0 0 1-2.829 1.171 3.975 3.975 0 0 1-2.83-1.173 3.973 3.973 0 0 1-1.172-2.828c0-1.071.415-2.076 1.172-2.83l7.209-7.211c.157-.157.264-.579.028-.814L11.5 4.36a.572.572 0 0 0-.834.018l-7.205 7.207a5.577 5.577 0 0 0-1.645 3.971z">
                      </path>
                    </svg>
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSend();
                  }}
                  className="flex items-center gap-2 flex-1"
                >
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={sending}
                    placeholder="Cuéntale al Manager IA en qué necesitas ayuda."
                    className="flex-1 bg-transparent resize-none overflow-y-auto max-h-44 px-2 text-base leading-relaxed text-slate-50 caret-emerald-400 placeholder:text-slate-300 focus:outline-none"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={sending || !input.trim()}
                    className="ml-1 h-9 px-4 rounded-2xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {sending ? "Enviando..." : "Enviar"}
                  </button>
                </form>
              </div>
              {error && <div className="text-sm text-rose-300 mt-2">{error}</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const containerClass = clsx(
    "rounded-2xl border border-slate-800 bg-slate-900/80",
    density === "compact" ? "p-3" : "p-4",
    "flex flex-col h-full min-h-0",
    density === "compact" ? "space-y-2.5" : "space-y-3"
  );
  return (
    <section className={containerClass}>
        <div className={clsx(density === "compact" ? "space-y-2.5" : "space-y-3")}>
          {!hideTitle && (
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Manager IA – Estrategia y números</h2>
                <p className="text-xs text-slate-400">
                  Dime qué quieres conseguir hoy y te digo con quién hablar y qué hacer para no perder dinero.
                </p>
                <p className="text-[11px] text-slate-500">Chat interno entre tú y tu manager IA (no visible para fans).</p>
              </div>
            </div>
          )}
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-xs text-slate-100 space-y-2">
            <div>
              {snapshot ? (
                <p className="space-x-1">
                  <strong className="text-emerald-100">{snapshot.newFansLast30Days}</strong> fans nuevos ·{" "}
                  <strong className="text-emerald-100">{snapshot.fansAtRisk}</strong> en riesgo ·{" "}
                  <strong className="text-emerald-100">{snapshot.vipActiveCount}</strong> VIP activos ·{" "}
                  <strong className="text-emerald-100">{formatCurrency(snapshot.ingresosUltimos30Dias)}</strong> en 30 días
                </p>
              ) : (
                <span className="text-slate-500">Preparando resumen del negocio...</span>
              )}
            </div>
            {usedFallback && (
              <div className="text-[11px] text-amber-200">
                {fallbackBanner}
              </div>
            )}
          </div>
        </div>

      <div
        className={clsx(
          "mt-3 flex flex-col rounded-xl border border-slate-900 bg-slate-950/50 flex-1 min-h-0",
          density === "compact" ? "gap-2.5 px-3 py-2.5" : "gap-3 px-4 py-3"
        )}
      >
        <div
          className={clsx(
            "flex-1 min-h-0 overflow-y-auto pr-1 pb-24 md:pb-4",
            density === "compact" ? "space-y-2" : "space-y-3",
            "min-h-[220px]"
          )}
          ref={listRef}
        >
          {loading && <div className="text-[12px] text-slate-400">Cargando chat…</div>}
          {!loading && messages.length === 0 && <div className="text-[12px] text-slate-400">Aún no hay mensajes.</div>}
          {!loading &&
            messages.map((msg) => {
              const isCreator = msg.role === "CREATOR";
              const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              if (isCreator) {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[75%]">
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400 text-right">Tú • {time}</p>
                      <div className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm text-white shadow">{msg.content}</div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[75%]">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Manager • {time}</p>
                    <div className="rounded-2xl bg-slate-800 px-4 py-2 text-sm text-slate-50 shadow">{msg.content}</div>
                  </div>
                </div>
              );
            })}
        </div>
        {error && <div className="text-[11px] text-rose-300 mt-2">{error}</div>}
        {scope === "global" && (
          <div className={modeRowClass}>
            {globalModes.map((mode) => {
              const isActive = globalMode === mode;
              return (
                <PillButton
                  key={mode}
                  intent={isActive ? "primary" : "ghost"}
                  size="sm"
                  className="shrink-0"
                  onClick={() => setGlobalMode(mode)}
                >
                  {mode === "HOY" ? "Hoy" : mode === "VENTAS" ? "Ventas" : mode === "CATALOGO" ? "Catálogo" : "Crecimiento"}
                </PillButton>
              );
            })}
          </div>
        )}
        <div className={chipRowClass}>
          {quickSuggestions.map((sugg) => (
            <PillButton
              key={sugg}
              intent="secondary"
              size="sm"
              className={clsx(scope === "global" && "shrink-0")}
              onClick={() => {
                const prompt = scope === "global" ? getGlobalPrompt(sugg) : sugg;
                setInput((prev) => {
                  if (!prev || !prev.trim()) return prompt;
                  return `${prev.trim()}\n\n${prompt}`;
                });
                inputRef.current?.focus();
              }}
              disabled={sending}
            >
              {sugg}
            </PillButton>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="flex gap-2 pt-2 border-t border-slate-800"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
            placeholder="Cuéntale al Manager IA en qué necesitas ayuda."
            className={clsx(
              "flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-70",
              density === "compact" ? "px-2.5 py-2 text-sm" : "px-3 py-2.5"
            )}
            rows={density === "compact" ? 2 : 3}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className={clsx(
              "self-end rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50",
              density === "compact" ? "px-3 py-2" : "px-4 py-2.5"
            )}
          >
            {sending ? "Enviando..." : "Enviar"}
          </button>
        </form>
      </div>
    </section>
  );
});

function formatCurrency(amount: number) {
  return `${Math.round(amount)} €`;
}

function formatExpire(days: number | null | undefined) {
  if (typeof days !== "number") return "Caducidad: n/d";
  if (days <= 0) return "Caduca: hoy";
  if (days === 1) return "Caduca: en 1 día";
  return `Caduca: en ${Math.round(days)} días`;
}
