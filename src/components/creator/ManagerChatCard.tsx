import { forwardRef, ReactNode, useEffect, useImperativeHandle, useRef, useState } from "react";
import clsx from "clsx";
import type { CreatorBusinessSnapshot } from "../../lib/creatorManager";
import MessageBalloon from "../MessageBalloon";

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
};

type ManagerActionIntent = "ROMPER_EL_HIELO" | "REACTIVAR_FAN_FRIO" | "OFRECER_UN_EXTRA" | "LLEVAR_A_MENSUAL" | "RESUMEN_PULSO_HOY";

const defaultSuggestions = [
  "¿A qué fans debería escribir hoy?",
  "Resúmeme mis números clave de esta semana.",
  "Dame una acción concreta para aumentar ingresos hoy.",
];

type Props = {
  businessSnapshot?: CreatorBusinessSnapshot | null;
  hideTitle?: boolean;
  embedded?: boolean;
  suggestions?: string[];
  density?: "comfortable" | "compact";
  variant?: "card" | "chat";
  onBackToBoard?: () => void;
  onShowSummary?: () => void;
  title?: string;
  avatarUrl?: string;
  statusText?: string;
  onOpenInsights?: () => void;
  onOpenSettings?: () => void;
  contextContent?: ReactNode;
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
    onShowSummary,
    title,
    avatarUrl,
    statusText,
    onOpenInsights,
    onOpenSettings,
    contextContent,
  }: Props,
  ref
) {
  const [messages, setMessages] = useState<ManagerChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [usedFallback, setUsedFallback] = useState(false);
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

  const quickSuggestions = suggestions && suggestions.length > 0 ? suggestions : defaultSuggestions;

  if (variant === "chat") {
    const headerLabel = title || "Manager IA";
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
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
              <span className="truncate text-sm font-semibold text-slate-50">{headerLabel}</span>
              <span className="inline-flex items-center rounded-full border border-emerald-400/70 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-100">
                IA
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onOpenInsights && (
                <button
                  type="button"
                  onClick={onOpenInsights}
                  className="inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-600/15 px-3 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-600/25"
                >
                  Insights
                </button>
              )}
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-[11px] font-semibold text-slate-100 hover:border-emerald-500/60"
                >
                  Ajustes
                </button>
              )}
            </div>
          </header>
        )}
        <div className="hidden md:flex items-center justify-between gap-3 bg-slate-950/70 border-b border-slate-800 px-6 py-4">
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
          <div className="flex items-center gap-2">
            {onOpenInsights && (
              <button
                type="button"
                onClick={onOpenInsights}
                className="rounded-full border border-emerald-500/60 bg-emerald-600/15 px-3 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-600/25"
              >
                Insights
              </button>
            )}
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-semibold text-slate-100 hover:border-emerald-500/60"
              >
                Ajustes
              </button>
            )}
            {onShowSummary && (
              <button
                type="button"
                onClick={onShowSummary}
                className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-semibold text-slate-100 hover:border-emerald-500/60"
              >
                Ver ficha
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {contextContent ? (
            <div className="bg-[#0f1f26] border-b border-slate-800 px-4 py-3">{contextContent}</div>
          ) : null}
          <div
            ref={listRef}
            className="flex-1 min-h-0 overflow-y-auto"
            style={{ backgroundImage: "url('/assets/images/background.jpg')" }}
          >
            <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-3">
              {loading && <div className="text-center text-[#aebac1] text-sm mt-2">Cargando mensajes...</div>}
              {error && !loading && <div className="text-center text-red-400 text-sm mt-2">{error}</div>}
              {!loading && !error && messages.length === 0 && (
                <div className="text-center text-[#aebac1] text-sm mt-2">Aún no hay mensajes.</div>
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
              Modo demo activo: conecta tu OPENAI_API_KEY para respuestas con tus datos reales.
            </div>
          )}
          <div className="flex flex-col bg-[#202c33] w-full h-auto py-3 px-4 text-[#8696a0] gap-3 flex-shrink-0 overflow-visible">
            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
              {quickSuggestions.map((sugg) => (
                <button
                  key={sugg}
                  type="button"
                  className="rounded-full border border-slate-700 bg-slate-900/60 text-slate-100 hover:bg-slate-800 transition px-3 py-1.5 text-xs"
                  onClick={() => {
                    setInput(sugg);
                    inputRef.current?.focus();
                    void handleSend(sugg);
                  }}
                  disabled={sending}
                >
                  {sugg}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              className="flex items-center gap-3"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={sending}
                placeholder="Cuéntale al Manager IA en qué necesitas ayuda."
                className="flex-1 bg-[#2a3942] rounded-lg w-full px-3 py-3 text-white resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-70"
                rows={2}
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
                className="flex justify-center items-center h-12 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
              >
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </form>
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
  const chipClass = clsx(
    "rounded-full border border-slate-700 bg-slate-900/60 text-slate-100 hover:bg-slate-800 transition",
    density === "compact" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
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
                Estás en modo demo: la IA usará respuestas genéricas hasta que conectes tu OPENAI_API_KEY.
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
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
          {quickSuggestions.map((sugg) => (
            <button
              key={sugg}
              type="button"
              className={chipClass}
              onClick={() => {
                setInput(sugg);
                inputRef.current?.focus();
                void handleSend(sugg);
              }}
              disabled={sending}
            >
              {sugg}
            </button>
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
