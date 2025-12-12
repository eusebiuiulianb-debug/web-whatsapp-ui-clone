import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { CreatorContentSnapshot } from "../../lib/creatorContentManager";

type ContentManagerChatMessage = {
  id: string;
  role: "CREATOR" | "ASSISTANT";
  content: string;
  createdAt: string;
};

type ContentChatGetResponse = {
  messages: ContentManagerChatMessage[];
};

type ContentChatPostResponse = {
  reply: { text: string };
  creditsUsed: number;
  creditsRemaining: number;
  usedFallback?: boolean;
};

const suggestions = [
  "¿Qué pack debería promocionar este fin de semana?",
  "¿Qué huecos tengo ahora mismo en el catálogo?",
  "Qué pack nuevo te parece que falta.",
];

type Props = {
  initialSnapshot?: CreatorContentSnapshot | null;
  hideTitle?: boolean;
  embedded?: boolean;
};

export function ContentManagerChatCard({ initialSnapshot, hideTitle = false, embedded = false }: Props) {
  const [messages, setMessages] = useState<ContentManagerChatMessage[]>([]);
  const [snapshot, setSnapshot] = useState<CreatorContentSnapshot | null>(initialSnapshot ?? null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    void loadMessages();
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (initialSnapshot) {
      setSnapshot(initialSnapshot);
    }
  }, [initialSnapshot]);

  async function loadMessages(opts?: { silent?: boolean }) {
    try {
      if (!opts?.silent) {
        setLoading(true);
      }
      setError(null);
      const res = await fetch("/api/creator/ai-manager/messages?tab=CONTENT");
      if (!res.ok) throw new Error("No se pudo cargar el historial");
      const data = (await res.json()) as ContentChatGetResponse;
      setMessages((data?.messages ?? []).slice(-50));
      if (!opts?.silent) {
        setUsedFallback(false);
      }
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar el chat del Manager IA de contenido.");
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
        body: JSON.stringify({ tab: "CONTENT", message: input.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Error enviando mensaje");
      }
      const data = (await res.json()) as ContentChatPostResponse;
      const assistantMessage: ContentManagerChatMessage = {
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
      setError("No se pudo enviar el mensaje al Manager IA de contenido.");
    } finally {
      setSending(false);
    }
  }

  const summaryText = snapshot
    ? `${snapshot.totalPacks} packs activos · Pack fuerte: ${snapshot.bestPack30d?.name ?? "ninguno"} · Ingresos 30d: ${formatCurrency(snapshot.ingresosTotales30d)}`
    : "Cargando snapshot de packs...";

  const containerClass = clsx(
    "rounded-2xl border border-slate-800 bg-slate-900/80",
    "flex flex-col h-full min-h-0",
    embedded ? "p-3 lg:p-4 gap-3" : "p-4 gap-3"
  );

  return (
    <section className={containerClass}>
      {!hideTitle && (
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Manager IA de contenido</h2>
          <p className="text-xs text-slate-400">Diagnóstico rápido de tus packs y qué contenido crear o empujar a continuación.</p>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-100 space-y-2">
        <div className="text-[12px] text-slate-100">{summaryText}</div>
        {usedFallback && (
          <div className="text-[11px] text-amber-200">
            Estás en modo demo: aún no hay IA real conectada para contenido. Conecta tu OPENAI_API_KEY para respuestas con tus datos reales.
          </div>
        )}
      </div>

      <div className="flex min-h-[260px] flex-1 flex-col rounded-xl border border-slate-900 bg-slate-950/50 px-3 py-3">
        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto pr-1 min-h-[200px]">
          {loading && <div className="text-[12px] text-slate-400">Cargando chat…</div>}
          {!loading && messages.length === 0 && <div className="text-[12px] text-slate-400">Aún no hay mensajes.</div>}
          {!loading &&
            messages.map((msg) => {
              const isCreator = msg.role === "CREATOR";
              const time = formatTime(msg.createdAt);
              return (
                <div key={msg.id} className={isCreator ? "flex justify-end" : "flex justify-start"}>
                  <div className="max-w-[75%]">
                    <p
                      className={clsx(
                        "mb-1 text-[10px] uppercase tracking-wide text-slate-400",
                        isCreator ? "text-right" : undefined
                      )}
                    >
                      {isCreator ? "Tú" : "Manager"} • {time}
                    </p>
                    <div
                      className={clsx(
                        "rounded-2xl px-4 py-2 text-sm shadow whitespace-pre-wrap",
                        isCreator ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-50"
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {error && <div className="text-[11px] text-rose-300">{error}</div>}
      <div className="text-[11px] text-slate-500">Solo tú ves este chat.</div>

      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="flex gap-2"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          placeholder="Pregúntale al Manager IA de contenido."
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

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
