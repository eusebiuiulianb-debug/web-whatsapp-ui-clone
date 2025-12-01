import Head from "next/head";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { FormEvent, useEffect, useMemo, useState } from "react";
import MessageBalloon from "../../components/MessageBalloon";
import { useCreatorConfig } from "../../context/CreatorConfigContext";
import {
  ContentType,
  ContentVisibility,
  getContentTypeLabel,
  getContentVisibilityLabel,
} from "../../types/content";
import { AccessSummary, getAccessSummary } from "../../lib/access";
import { getFanContents, IncludedContent } from "../../lib/fanContent";
import prisma from "../../lib/prisma";

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
};

type FanChatPageProps = {
  includedContent: IncludedContent[];
  initialAccessSummary: AccessSummary;
};

export default function FanChatPage({ includedContent, initialAccessSummary }: FanChatPageProps) {
  const router = useRouter();
  const fanId = typeof router.query.fanId === "string" ? router.query.fanId : undefined;
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

  useEffect(() => {
    if (!fanId) return;
    fetchMessages(fanId, { showLoading: true });
    const timer = setInterval(() => fetchMessages(fanId), 4000);
    return () => clearInterval(timer);
  }, [fanId]);

  useEffect(() => {
    if (!fanId) return;
    fetchAccessInfo(fanId);
  }, [fanId]);

  async function fetchMessages(targetFanId: string, options?: { showLoading?: boolean }) {
    const showLoading = options?.showLoading ?? false;
    try {
      if (showLoading) setLoading(true);
      setError("");
      const res = await fetch(`/api/messages?fanId=${targetFanId}`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const apiMessages = Array.isArray(data.messages) ? (data.messages as ApiMessage[]) : [];
      setMessages(apiMessages);
    } catch (_err) {
      setError("Error cargando mensajes");
      setMessages([]);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function fetchAccessInfo(targetFanId: string) {
    try {
      setAccessLoading(true);
      const res = await fetch("/api/fans");
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const fans = Array.isArray(data.fans) ? data.fans : [];
      const target = fans.find((fan: any) => fan.id === targetFanId);
      const hasHistory =
        (target?.paidGrantsCount ?? 0) > 0 ||
        (typeof target?.membershipStatus === "string" && target.membershipStatus.trim().length > 0);
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
        setMessages((prev) => [...prev, ...newMessages]);
      }
      setDraft("");
    } catch (_err) {
      setSendError("Error enviando mensaje");
    } finally {
      setSending(false);
    }
  }

  const headerSubtitle = useMemo(
    () => `Chat privado con ${creatorName}`,
    [creatorName]
  );

  return (
    <div className="min-h-screen bg-[#0b141a] text-white flex flex-col">
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

      <div className="px-4 sm:px-6 mt-3">
        {accessLoading && !accessSummary ? (
          <div className="rounded-xl border border-slate-800 bg-[#0f1f26] px-4 py-3 text-sm text-slate-200">
            Cargando acceso...
          </div>
        ) : accessSummary ? (
          <AccessBanner summary={accessSummary} />
        ) : null}
        <div className="mt-3">
          <IncludedContentSection items={included} />
        </div>
      </div>

      <main className="flex flex-col flex-1 overflow-hidden">
        <div
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-4"
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
              />
            );
          })}
        </div>

        <form onSubmit={handleSendMessage} className="flex items-center bg-[#202c33] w-full h-auto py-3 px-4 text-[#8696a0] gap-3">
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
      hasAccessHistory =
        fan.accessGrants.length > 0 || (fan.membershipStatus?.trim().length ?? 0) > 0;
      membershipStatus = fan.membershipStatus || null;
      daysLeft = typeof fan.daysLeft === "number" ? fan.daysLeft : null;

      const activeGrants = fan.accessGrants
        .filter((grant) => grant.expiresAt >= now)
        .sort(
          (a, b) =>
            b.expiresAt.getTime() - a.expiresAt.getTime() ||
            b.createdAt.getTime() - a.createdAt.getTime()
        );

      activeGrantTypes = activeGrants.map((grant) => grant.type);

      const primaryGrant = activeGrants[0];
      if (primaryGrant) {
        const mapTypeToStatus: Record<string, string> = {
          trial: "Prueba 7 días",
          monthly: "Suscripción mensual",
          special: "Contenido individual",
          single: "Contenido individual",
        };
        membershipStatus = mapTypeToStatus[primaryGrant.type] || membershipStatus;
        const diffMs = primaryGrant.expiresAt.getTime() - now.getTime();
        const msPerDay = 1000 * 60 * 60 * 24;
        const diffDays = Math.ceil(diffMs / msPerDay);
        daysLeft = diffDays > 0 ? diffDays : 0;
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
