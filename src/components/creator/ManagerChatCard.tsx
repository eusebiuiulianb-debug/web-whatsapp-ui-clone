import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import clsx from "clsx";
import type { CreatorBusinessSnapshot } from "../../lib/creatorManager";

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
};

export type ManagerChatCardHandle = {
  sendQuickPrompt: (message: string) => void;
  setDraft: (message: string) => void;
};

export const ManagerChatCard = forwardRef<ManagerChatCardHandle, Props>(function ManagerChatCard(
  { businessSnapshot, hideTitle = false, embedded = false, suggestions, density = "comfortable" }: Props,
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

  async function handleSend(externalMessage?: string) {
    const text = typeof externalMessage === "string" ? externalMessage.trim() : input.trim();
    if (!text || sending) return;
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
        body: JSON.stringify({ tab: "STRATEGY", message: text }),
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
    sendQuickPrompt: (message: string) => {
      setInput(message);
      void handleSend(message);
    },
    setDraft: (message: string) => {
      setInput(message);
      inputRef.current?.focus();
    },
  }));

  const quickSuggestions = suggestions && suggestions.length > 0 ? suggestions : defaultSuggestions;

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
