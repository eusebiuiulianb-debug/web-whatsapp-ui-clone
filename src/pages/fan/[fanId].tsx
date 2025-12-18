import Head from "next/head";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import MessageBalloon from "../../components/MessageBalloon";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import {
  ContentType,
  ContentVisibility,
  getContentTypeLabel,
  getContentVisibilityLabel,
} from "../../types/content";
import { AccessSummary, getAccessSummary } from "../../lib/access";
import type { IncludedContent } from "../../lib/fanContent";

type ApiContentItem = {
  id: string;
  title: string;
  type: ContentType;
  visibility: ContentVisibility;
  externalUrl?: string | null;
  mediaPath?: string | null;
  description?: string | null;
  isPreview?: boolean | null;
};

type ApiMessage = {
  id: string;
  fanId: string;
  from: "creator" | "fan";
  text: string | null;
  time?: string | null;
  isLastFromCreator?: boolean | null;
  type?: "TEXT" | "CONTENT";
  contentItem?: ApiContentItem | null;
  status?: "sending" | "failed" | "sent";
};

type FanChatPageProps = {
  includedContent: IncludedContent[];
  initialAccessSummary: AccessSummary;
};

export default function FanChatPage({ includedContent, initialAccessSummary }: FanChatPageProps) {
  const router = useRouter();
  const fanId = useMemo(
    () => (typeof router.query.fanId === "string" ? router.query.fanId : undefined),
    [router.query.fanId]
  );
  const { config } = useCreatorConfig();
  const creatorName = config.creatorName || "Tu creador";
  const creatorInitial = creatorName.trim().charAt(0).toUpperCase() || "C";

  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [accessSummary, setAccessSummary] = useState<AccessSummary | null>(initialAccessSummary || null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [included, setIncluded] = useState<IncludedContent[]>(includedContent || []);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const sortMessages = useCallback((list: ApiMessage[]) => {
    return [...list].sort((a, b) => {
      const at = a.id ? String(a.id) : "";
      const bt = b.id ? String(b.id) : "";
      if (at === bt) return 0;
      return at > bt ? 1 : -1;
    });
  }, []);

  const fetchMessages = useCallback(
    async (targetFanId: string, options?: { showLoading?: boolean }) => {
      if (!targetFanId) return;
      const showLoading = options?.showLoading ?? false;
      try {
        if (showLoading) setLoading(true);
        setError("");
        if (pollAbortRef.current) {
          pollAbortRef.current.abort();
        }
        const controller = new AbortController();
        pollAbortRef.current = controller;
        const res = await fetch(`/api/messages?fanId=${encodeURIComponent(targetFanId)}`, { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || "No se pudieron cargar mensajes");
        }
        const apiMessages = Array.isArray(data.items)
          ? (data.items as ApiMessage[])
          : Array.isArray(data.messages)
          ? (data.messages as ApiMessage[])
          : [];
        setMessages((prev) => reconcileMessages(prev, apiMessages, sortMessages, targetFanId));
      } catch (_err) {
        setError("No se pudieron cargar mensajes");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [sortMessages]
  );

  useEffect(() => {
    if (!fanId) return;
    setMessages([]);
    fetchMessages(fanId, { showLoading: true });
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current as any);
      pollIntervalRef.current = null;
    }
    pollIntervalRef.current = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void fetchMessages(fanId, { showLoading: false });
    }, 1800) as any;
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current as any);
      if (pollAbortRef.current) pollAbortRef.current.abort();
    };
  }, [fanId, fetchMessages]);

  useEffect(() => {
    if (!fanId) return;
    fetchAccessInfo(fanId);
  }, [fanId]);


  async function fetchAccessInfo(targetFanId: string) {
    try {
      setAccessLoading(true);
      const res = await fetch("/api/fans");
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const fans = Array.isArray(data.fans) ? data.fans : [];
      const target = fans.find((fan: any) => fan.id === targetFanId);
      const hasHistory =
        typeof target?.hasAccessHistory === "boolean"
          ? target.hasAccessHistory
          : (target?.paidGrantsCount ?? 0) > 0;
      const summary = getAccessSummary({
        membershipStatus: target?.membershipStatus,
        daysLeft: target?.daysLeft,
        hasAccessHistory: hasHistory,
        activeGrantTypes: Array.isArray(target?.activeGrantTypes) ? target.activeGrantTypes : undefined,
      });
      setAccessSummary(summary);
    } catch (_err) {
      setAccessSummary(
        getAccessSummary({
          membershipStatus: null,
          daysLeft: 0,
          hasAccessHistory: false,
        })
      );
    } finally {
      setAccessLoading(false);
    }
  }

  async function handleSendMessage(evt: FormEvent<HTMLFormElement>) {
    evt.preventDefault();
    if (!fanId) return;
    const trimmed = draft.trim();
    if (!trimmed) return;

    try {
      setSending(true);
      setSendError("");
      const tempId = `temp-${Date.now()}`;
      const temp: ApiMessage = {
        id: tempId,
        fanId,
        from: "fan",
        text: trimmed,
        time: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false }),
        status: "sending",
      };
      setMessages((prev) => reconcileMessages(prev, [temp], sortMessages, fanId));
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fanId, from: "fan", type: "TEXT", text: trimmed }),
      });
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const newMessages: ApiMessage[] = Array.isArray(data.messages)
        ? (data.messages as ApiMessage[])
        : data.message
        ? [data.message as ApiMessage]
        : [];
      if (newMessages.length) {
        setMessages((prev) => {
          const withoutTemp = (prev || []).filter((m) => m.id !== tempId);
          return reconcileMessages(withoutTemp, newMessages, sortMessages, fanId);
        });
      }
      setDraft("");
    } catch (_err) {
      setSendError("Error enviando mensaje");
      setMessages((prev) =>
        (prev || []).map((m) => (m.status === "sending" ? { ...m, status: "failed" as const } : m))
      );
    } finally {
      setSending(false);
    }
  }

  const headerSubtitle = useMemo(
    () => `Chat privado con ${creatorName}`,
    [creatorName]
  );

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight - el.clientHeight,
      behavior,
    });
  };

  useLayoutEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const threshold = 80;
      const distanceToBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
      setIsAtBottom(distanceToBottom < threshold);
    };
    onScroll();
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    scrollToBottom("auto");
  }, [fanId]);

  useLayoutEffect(() => {
    if (!isAtBottom) return;
    scrollToBottom("smooth");
  }, [messages.length, isAtBottom]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible" && fanId) {
        void fetchMessages(fanId, { showLoading: false });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fanId, fetchMessages]);

  return (
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#0b141a] text-white">
      <Head>
        <title>{`Chat con ${creatorName} · NOVSY`}</title>
      </Head>

      <header className="flex items-center gap-3 px-4 py-3 bg-[#111b21] border-b border-[rgba(134,150,160,0.15)]">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#2a3942] text-white font-semibold">
          {creatorInitial}
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-white font-medium text-sm">{creatorName}</span>
          <span className="text-[#8696a0] text-sm">{headerSubtitle}</span>
        </div>
      </header>

      {error && (
        <div className="px-4 py-2 text-sm text-rose-200 bg-rose-900/30 border-b border-rose-700/50 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            className="rounded-full border border-rose-300/70 px-3 py-1 text-xs font-semibold hover:bg-rose-800/30"
            onClick={() => fanId && fetchMessages(fanId, { showLoading: true })}
          >
            Reintentar
          </button>
        </div>
      )}

      <main className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-4 sm:px-6 pt-3 space-y-3">
            {accessLoading && !accessSummary ? (
              <div className="rounded-xl border border-slate-800 bg-[#0f1f26] px-4 py-3 text-sm text-slate-200">
                Cargando acceso...
              </div>
            ) : accessSummary ? (
              <AccessBanner summary={accessSummary} />
            ) : null}
            {included?.length ? <IncludedContentSection items={included} /> : null}
          </div>
          <div
            className="px-4 sm:px-6 py-4"
            style={{ backgroundImage: "url('/assets/images/background.jpg')" }}
          >
            {loading && <div className="text-center text-[#aebac1] text-sm mt-2">Cargando mensajes...</div>}
            {error && !loading && <div className="text-center text-red-400 text-sm mt-2">{error}</div>}
            {!loading && !error && messages.length === 0 && (
              <div className="text-center text-[#aebac1] text-sm mt-2">Aún no hay mensajes.</div>
            )}
            {messages.map((msg) => {
              const isContent = msg.type === "CONTENT" && !!msg.contentItem;
              if (isContent) {
                return <ContentCard key={msg.id} message={msg} />;
              }
              return (
                <MessageBalloon
                  key={msg.id}
                  me={msg.from === "fan"}
                  message={msg.text || ""}
                  seen={!!msg.isLastFromCreator}
                  time={msg.time || undefined}
                  status={msg.status}
                />
              );
            })}
          </div>
        </div>

        <form
          onSubmit={handleSendMessage}
          className="flex items-center bg-[#202c33] w-full h-auto py-3 px-4 text-[#8696a0] gap-3 shrink-0"
        >
          <div className="flex flex-1 h-12">
            <input
              type="text"
              className="bg-[#2a3942] rounded-lg w-full px-3 py-3 text-white"
              placeholder="Escribe un mensaje..."
              onChange={(evt) => setDraft(evt.target.value)}
              value={draft}
              disabled={sending}
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            className="flex justify-center items-center h-12 px-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
          >
            Enviar
          </button>
        </form>
        {sendError && (
          <div className="px-4 pb-3 text-sm text-rose-300">
            {sendError}
          </div>
        )}
      </main>
    </div>
  );
}

function ContentCard({ message }: { message: ApiMessage }) {
  const content = message.contentItem;
  const title = content?.title || "Contenido adjunto";
  const visibilityLabel = content ? getContentVisibilityLabel(content.visibility) : "";
  const typeLabel = content ? getContentTypeLabel(content.type) : "Contenido";
  const emoji = getContentEmoji(content?.type);
  const alignItems = message.from === "fan" ? "items-end" : "items-start";
  const mediaUrl = (content?.mediaPath || content?.externalUrl || "").trim();

  const badgeClass = (() => {
    if (visibilityLabel.toLowerCase().includes("vip")) return "border-amber-400/80 text-amber-200";
    if (visibilityLabel.toLowerCase().includes("extra")) return "border-sky-400/70 text-sky-200";
    if (visibilityLabel.toLowerCase().includes("incluido")) return "border-emerald-400/70 text-emerald-200";
    return "border-slate-600 text-slate-200";
  })();

  return (
    <div className={`flex flex-col ${alignItems} w-full h-max`}>
      <div className="flex flex-col min-w-[5%] max-w-[70%] bg-[#202c33] border border-slate-800 p-3 text-white rounded-lg mb-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-lg">{emoji}</span>
          <span className="truncate">{title}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-300 mt-1">
          <span>{typeLabel}</span>
          {visibilityLabel && <span className="w-1 h-1 rounded-full bg-slate-600" />}
          {visibilityLabel && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 border text-[11px] ${badgeClass}`}>
              {visibilityLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          className="mt-2 inline-flex w-fit items-center rounded-md border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-amber-200 hover:border-amber-400/70 hover:text-amber-100 transition"
          onClick={() => openContentLink(mediaUrl)}
        >
          Ver contenido
        </button>
        <div className="flex justify-end items-center gap-2 text-[hsla(0,0%,100%,0.6)] text-xs mt-2">
          <span>{message.time || ""}</span>
          {message.from === "fan" && message.isLastFromCreator ? (
            <span className="text-[#8edafc] text-[11px]">✔✔ Visto</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getContentEmoji(type?: ContentType) {
  if (type === "VIDEO") return "🎥";
  if (type === "AUDIO") return "🎧";
  if (type === "TEXT") return "📝";
  return "📷";
}

function IncludedContentSection({ items }: { items: IncludedContent[] }) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-[#111b21] px-4 py-3 text-sm text-slate-300">
        Todavía no tienes contenido incluido en tu suscripción.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0f1f26] px-4 py-4">
      <div className="text-sm font-semibold text-white mb-3">Tu contenido incluido</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => {
          const visibilityLabel = getContentVisibilityLabel(item.visibility as ContentVisibility);
          const badgeClass = visibilityLabel.toLowerCase().includes("incluido")
            ? "border-emerald-400/70 text-emerald-200"
            : "border-slate-600 text-slate-200";
          const emoji = getContentEmoji(item.type as ContentType);
          const mediaUrl = (item.mediaPath || item.externalUrl || "").trim();
          return (
            <div
              key={item.id}
              className="rounded-xl border border-slate-800 bg-[#202c33] p-3 text-white flex flex-col gap-2 shadow-sm"
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="text-lg">{emoji}</span>
                <span className="truncate">{item.title}</span>
              </div>
              {item.description && (
                <p className="text-xs text-slate-300 line-clamp-3">{item.description}</p>
              )}
              <div className="flex items-center gap-2 text-[11px] text-slate-300">
                <span>{getContentTypeLabel(item.type as ContentType)}</span>
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 border text-[11px] ${badgeClass}`}>
                  {visibilityLabel}
                </span>
              </div>
              <button
                type="button"
                className="mt-1 inline-flex w-fit items-center rounded-md border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-amber-200 hover:border-amber-400/70 hover:text-amber-100 transition"
                onClick={() => openContentLink(mediaUrl)}
              >
                Ver contenido
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function openContentLink(mediaUrl?: string) {
  const url = (mediaUrl || "").trim();
  if (url) {
    window.open(url, "_blank");
  } else {
    alert("Contenido no disponible todavía");
  }
}

function reconcileMessages(
  existing: ApiMessage[],
  incoming: ApiMessage[],
  sorter: (list: ApiMessage[]) => ApiMessage[],
  targetFanId?: string
): ApiMessage[] {
  const filteredIncoming = targetFanId
    ? incoming.filter((msg) => msg.fanId === targetFanId)
    : incoming;
  if (!filteredIncoming.length) return sorter(existing);
  const map = new Map<string, ApiMessage>();
  const orderedKeys: string[] = [];
  const push = (msg: ApiMessage, fallbackIdx: number) => {
    const key = msg.id || msg.time || `incoming-${fallbackIdx}`;
    if (!map.has(key)) {
      orderedKeys.push(key);
    }
    const prev = map.get(key);
    map.set(key, { ...(prev || {}), ...msg, status: msg.status || prev?.status || "sent" });
  };
  existing.forEach((msg, idx) => push(msg, idx));
  filteredIncoming.forEach((msg, idx) => push(msg, idx + existing.length));
  const merged = orderedKeys.map((k) => map.get(k)).filter(Boolean) as ApiMessage[];
  return sorter(merged);
}

function AccessBanner({ summary }: { summary: AccessSummary }) {
  let containerClass = "rounded-xl border px-4 py-3";
  let titleClass = "text-sm font-semibold";
  let subtitleClass = "text-xs mt-1";

  if (summary.state === "ACTIVE") {
    containerClass += " border-slate-800 bg-[#0f1f26]";
    titleClass += " text-white";
    subtitleClass += " text-slate-300";
  } else if (summary.state === "EXPIRED") {
    containerClass += " border-amber-500/40 bg-[#2a1f1a]";
    titleClass += " text-amber-100";
    subtitleClass += " text-amber-200/80";
  } else {
    containerClass += " border-slate-800 bg-[#111b21]";
    titleClass += " text-white";
    subtitleClass += " text-slate-300";
  }

  return (
    <div className={containerClass}>
      <div className={titleClass}>{summary.primaryLabel}</div>
      {summary.secondaryLabel && <div className={subtitleClass}>{summary.secondaryLabel}</div>}
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<FanChatPageProps> = async (context) => {
  const prisma = (await import("../../lib/prisma.server")).default;
  const { getFanContents } = await import("../../lib/fanContent");
  const creatorId = "creator-1";
  const fanId = typeof context.params?.fanId === "string" ? context.params.fanId : "";
  const now = new Date();

  let membershipStatus: string | null = null;
  let daysLeft: number | null = null;
  let hasAccessHistory = false;
  let activeGrantTypes: string[] = [];

  if (fanId) {
    const fan = await prisma.fan.findUnique({
      where: { id: fanId },
      include: { accessGrants: true },
    });

    if (fan) {
      hasAccessHistory = fan.accessGrants.length > 0;

      const activeGrants = fan.accessGrants.filter((grant) => grant.expiresAt > now);
      activeGrantTypes = activeGrants.map((grant) => grant.type);

      const latestExpiry = activeGrants.reduce<Date | null>((acc, grant) => {
        if (!acc) return grant.expiresAt;
        return grant.expiresAt > acc ? grant.expiresAt : acc;
      }, null);

      daysLeft = latestExpiry
        ? Math.max(0, Math.ceil((latestExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : hasAccessHistory
        ? 0
        : null;

      if (activeGrants.length > 0) {
        membershipStatus = "active";
      } else if (hasAccessHistory) {
        membershipStatus = "expired";
      } else {
        membershipStatus = "none";
      }
    }
  }

  const accessSummary = getAccessSummary({
    membershipStatus,
    daysLeft,
    hasAccessHistory,
    activeGrantTypes,
  });

  const includedContent = await getFanContents(creatorId, accessSummary, activeGrantTypes);

  return {
    props: {
      includedContent,
      initialAccessSummary: accessSummary,
    },
  };
};
