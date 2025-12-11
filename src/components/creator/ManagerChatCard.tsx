import { useEffect, useRef, useState } from "react";
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

const suggestions = [
  "¿A qué fans debería escribir hoy?",
  "Resúmeme mis números clave de esta semana.",
  "Dame una acción concreta para aumentar ingresos hoy.",
];

type Props = {
  businessSnapshot?: CreatorBusinessSnapshot | null;
  hideTitle?: boolean;
  embedded?: boolean;
};

export function ManagerChatCard({ businessSnapshot, hideTitle = false, embedded = false }: Props) {
  const [messages, setMessages] = useState<ManagerChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [usedFallback, setUsedFallback] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [snapshot, setSnapshot] = useState<CreatorBusinessSnapshot | null>(businessSnapshot ?? null);

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

  async function handleSend() {
    if (!input.trim() || sending) return;
    try {
      setSending(true);
      setError(null);
      const now = new Date().toISOString();
      const optimisticId = `local-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: optimisticId, role: "CREATOR", content: input.trim(), createdAt: now },
      ]);

      const res = await fetch("/api/creator/ai-manager/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: "STRATEGY", message: input.trim() }),
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

  const containerClass = clsx(
    "rounded-2xl border border-slate-800 bg-slate-900/80 p-4",
    "flex flex-col h-full",
    embedded ? "space-y-4 min-h-[520px]" : "space-y-4"
  );

  return (
    <section className={containerClass}>
      <div className="space-y-3">
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
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Top 3 fans de hoy</div>
            <div className="text-[11px] text-slate-500">Ordenados por prioridad según salud, caducidad y gasto.</div>
            <div className="space-y-2">
              {snapshot && snapshot.prioritizedFansToday && snapshot.prioritizedFansToday.length > 0 ? (
                snapshot.prioritizedFansToday.slice(0, 3).map((fan) => (
                  <div
                    key={fan.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
                  >
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm font-semibold text-slate-100">{fan.name}</span>
                      <span className="text-[11px] text-slate-400">{formatExpire(fan.daysToExpire)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-200">
                      <span className="rounded-full border border-slate-700 px-2 py-[2px] uppercase tracking-wide">
                        {fan.segment}
                      </span>
                      <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-[2px] text-emerald-100">
                        Salud {fan.health}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-[12px] text-slate-400">
                  Hoy no hay fans priorizados en la cola. Revisa la lista de fans para ver quién está más cerca de caducar.
                </div>
              )}
            </div>
          </div>
          {usedFallback && (
            <div className="text-[11px] text-amber-200">
              Estás en modo demo: aún no hay IA real conectada. Cuando añadas tu OPENAI_API_KEY, el manager responderá usando tus datos en
              tiempo real.
            </div>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-2">
          {suggestions.map((sugg) => (
            <button
              key={sugg}
              type="button"
              className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800"
              onClick={() => {
                setInput(sugg);
                inputRef.current?.focus();
              }}
              disabled={sending}
            >
              {sugg}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex-1 rounded-xl border border-slate-900 bg-slate-950/50 px-4 py-3 flex flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
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
      </div>

      {error && <div className="text-[11px] text-rose-300 mt-2">{error}</div>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="mt-3 flex gap-2"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          placeholder="Cuéntale al Manager IA en qué necesitas ayuda."
          className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-70"
          rows={2}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="self-end rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {sending ? "Enviando..." : "Enviar"}
        </button>
      </form>
    </section>
  );
}

function formatCurrency(amount: number) {
  return `${Math.round(amount)} €`;
}

function formatExpire(days: number | null | undefined) {
  if (typeof days !== "number") return "Caducidad: n/d";
  if (days <= 0) return "Caduca: hoy";
  if (days === 1) return "Caduca: en 1 día";
  return `Caduca: en ${Math.round(days)} días`;
}
