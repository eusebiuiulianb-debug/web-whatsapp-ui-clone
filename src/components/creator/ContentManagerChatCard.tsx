import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import type { CreatorContentSnapshot } from "../../lib/creatorContentManager";
import { useCortexProviderStatus } from "../../hooks/useCortexProviderStatus";

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
  ok?: boolean;
  reply?: { text?: string };
  message?: { role?: string; content?: string };
  items?: Array<{ role?: string; content?: string }>;
  creditsUsed?: number;
  creditsRemaining?: number;
  usedFallback?: boolean;
  settingsStatus?: "ok" | "settings_missing";
};

const contentSuggestions = [
  "¿Qué pack debería promocionar este fin de semana?",
  "¿Qué huecos tengo ahora mismo en el catálogo?",
  "Qué pack nuevo te parece que falta.",
];

const growthSuggestions = ["Leer métricas", "3 movimientos para crecer", "Ideas de contenido", "Riesgos esta semana"];

type Props = {
  initialSnapshot?: CreatorContentSnapshot | null;
  hideTitle?: boolean;
  embedded?: boolean;
  mode?: "CONTENT" | "GROWTH";
};

export type ContentManagerChatCardHandle = {
  setDraft: (text: string) => void;
  sendQuickPrompt: (text: string) => void;
};

export const ContentManagerChatCard = forwardRef<ContentManagerChatCardHandle, Props>(function ContentManagerChatCard(
  { initialSnapshot, hideTitle = false, embedded = false, mode = "CONTENT" }: Props,
  ref
) {
  const [messages, setMessages] = useState<ContentManagerChatMessage[]>([]);
  const [snapshot, setSnapshot] = useState<CreatorContentSnapshot | null>(initialSnapshot ?? null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<"ok" | "settings_missing" | null>(null);
  const [input, setInput] = useState("");
  const [resolvedCreatorId, setResolvedCreatorId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const cortexStatus = useCortexProviderStatus();
  const showDemoBanner = cortexStatus
    ? cortexStatus.provider === "demo" || !cortexStatus.configured
    : !process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  const resolveCreatorId = useCallback(async () => {
    if (resolvedCreatorId) return resolvedCreatorId;
    try {
      const res = await fetch("/api/creator");
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      const idValue = typeof data?.creator?.id === "string" ? data.creator.id : null;
      if (idValue) {
        setResolvedCreatorId(idValue);
      }
      return idValue;
    } catch (_err) {
      return null;
    }
  }, [resolvedCreatorId]);

  const loadMessages = useCallback(
    async (opts?: { silent?: boolean }) => {
      try {
        if (!opts?.silent) {
          setLoading(true);
        }
        setError(null);
        const res = await fetch(`/api/creator/ai-manager/messages?tab=${mode}`);
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
    },
    [mode]
  );

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (initialSnapshot) {
      setSnapshot(initialSnapshot);
    }
  }, [initialSnapshot]);

  async function handleSend(externalText?: string, action?: string | null) {
    const text = (typeof externalText === "string" ? externalText : input).trim();
    if (!text || sending) return;
    try {
      setSending(true);
      setError(null);
      const creatorIdValue = await resolveCreatorId();
      if (!creatorIdValue) {
        throw new Error("No se pudo detectar el creador.");
      }
      const now = new Date().toISOString();
      const optimisticId = `local-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: optimisticId, role: "CREATOR", content: text, createdAt: now },
      ]);

      const res = await fetch("/api/creator/ai-manager/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId: creatorIdValue, tab: mode, message: text, action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message =
          typeof body?.error === "string"
            ? body.error
            : typeof body?.message === "string"
            ? body.message
            : "Error enviando mensaje";
        throw new Error(message);
      }
      const data = (await res.json()) as ContentChatPostResponse;
      const replyText =
        typeof data?.reply?.text === "string"
          ? data.reply.text
          : typeof data?.message?.content === "string"
          ? data.message.content
          : typeof data?.items?.[0]?.content === "string"
          ? data.items[0].content
          : "Sin respuesta";
      const assistantMessage: ContentManagerChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "ASSISTANT",
        content: replyText,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) =>
        [...prev.filter((m) => m.id !== optimisticId), assistantMessage].slice(-50)
      );
      setUsedFallback(Boolean(data?.usedFallback));
      setSettingsStatus(data?.settingsStatus ?? null);
      void loadMessages({ silent: true });
      if (!externalText) setInput("");
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("local-")));
      const fallback =
        mode === "GROWTH"
          ? "Modo demo crecimiento: aquí verías un resumen de métricas y 3 movimientos para crecer. Configura el proveedor de IA para recomendaciones reales."
          : "Modo demo: configura el proveedor de IA para respuestas con tus datos de catálogo.";
      setMessages((prev) => [
        ...prev,
        { id: `assistant-${Date.now()}`, role: "ASSISTANT", content: fallback, createdAt: new Date().toISOString() },
      ]);
      setError(null);
      setUsedFallback(true);
    } finally {
      setSending(false);
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      setDraft: (text: string) => {
        setInput(text);
        inputRef.current?.focus();
      },
      sendQuickPrompt: (text: string) => {
        setInput(text);
        inputRef.current?.focus();
        void handleSend(text);
      },
    })
  );

  const summaryText =
    mode === "CONTENT"
      ? snapshot
        ? `${snapshot.totalPacks} packs activos · Pack fuerte: ${snapshot.bestPack30d?.name ?? "ninguno"} · Ingresos 30d: ${formatCurrency(snapshot.ingresosTotales30d)}`
        : "Cargando snapshot de packs..."
      : "Crecimiento semanal: pega métricas de YouTube/TikTok/Instagram y te doy diagnóstico + 3 movimientos.";

  const containerClass = clsx(
    "rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]",
    "flex flex-col h-full min-h-0",
    embedded ? "p-3 lg:p-4 gap-3" : "p-4 gap-3"
  );

  const fallbackBanner =
    settingsStatus === "settings_missing" ? (
      <span>
        Revisar ajustes: falta configurar el proveedor de IA o no se pudo descifrar.{" "}
        <Link href="/creator/ai-settings">
          <a className="underline hover:text-[color:var(--text)]">Abrir ajustes</a>
        </Link>
      </span>
    ) : (
      "Modo demo: configura el proveedor de IA para respuestas con tus datos reales."
    );
  const showFallbackBanner = usedFallback && showDemoBanner;

  return (
    <section className={containerClass}>
      {!hideTitle && (
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{mode === "CONTENT" ? "Manager IA de contenido" : "Manager IA de crecimiento"}</h2>
          <p className="text-xs text-[color:var(--muted)]">
            {mode === "CONTENT"
              ? "Diagnóstico rápido de tus packs y qué contenido crear o empujar a continuación."
              : "Pega tus métricas semanales y recibe 3 movimientos para crecer tus canales."}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)] space-y-2">
        <div className="text-[12px] text-[color:var(--text)]">{summaryText}</div>
        {showFallbackBanner && (
          <div className="text-[11px] text-[color:var(--warning)]">
            {fallbackBanner}
          </div>
        )}
      </div>

      <div className="flex min-h-[260px] flex-1 flex-col rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-3">
        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto pr-1 min-h-[200px]">
          {loading && <div className="text-[12px] text-[color:var(--muted)]">Cargando chat…</div>}
          {!loading && messages.length === 0 && <div className="text-[12px] text-[color:var(--muted)]">Aún no hay mensajes.</div>}
          {!loading &&
            messages.map((msg) => {
              const isCreator = msg.role === "CREATOR";
              const time = formatTime(msg.createdAt);
              return (
                <div key={msg.id} className={isCreator ? "flex justify-end" : "flex justify-start"}>
                  <div className="max-w-[75%]">
                    <p
                      className={clsx(
                        "mb-1 text-[10px] uppercase tracking-wide text-[color:var(--muted)]",
                        isCreator ? "text-right" : undefined
                      )}
                    >
                      {isCreator ? "Tú" : "Manager"} • {time}
                    </p>
                    <div
                      className={clsx(
                        "rounded-2xl px-4 py-2 text-sm shadow whitespace-pre-wrap",
                        isCreator ? "bg-[color:var(--brand-strong)] text-[color:var(--text)]" : "bg-[color:var(--surface-2)] text-[color:var(--text)]"
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

      {error && <div className="text-[11px] text-[color:var(--danger)]">{error}</div>}
      <div className="text-[11px] ui-muted">Solo tú ves este chat.</div>

      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
        {(mode === "CONTENT" ? contentSuggestions : growthSuggestions).map((sugg) => (
          <button
            key={sugg}
            type="button"
            className="rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
            onClick={() => {
              setInput(sugg);
              inputRef.current?.focus();
              const action =
                mode === "GROWTH"
                  ? sugg.toLowerCase().includes("riesgo")
                    ? "growth_risks"
                    : sugg.toLowerCase().includes("ideas")
                    ? "growth_content_ideas"
                    : sugg.toLowerCase().includes("movimientos")
                    ? "growth_3_moves"
                    : "growth_read_metrics"
                  : undefined;
              void handleSend(sugg, action);
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
          placeholder={
            mode === "CONTENT"
              ? "Pregúntale al Manager IA de catálogo."
              : "Pega aquí tus métricas de la semana (seguidores, visitas, ingresos, etc.) o cuéntame qué ha pasado…"
          }
          className="flex-1 resize-none rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-70"
          rows={2}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="self-end rounded-xl bg-[color:var(--brand-strong)] px-4 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--brand-strong)] disabled:opacity-50"
        >
          {sending ? "Enviando..." : "Enviar"}
        </button>
      </form>
    </section>
  );
});

ContentManagerChatCard.displayName = "ContentManagerChatCard";

function formatCurrency(amount: number) {
  return `${Math.round(amount)} €`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
