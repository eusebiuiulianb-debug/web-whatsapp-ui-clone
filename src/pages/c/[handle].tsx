import Head from "next/head";
import type { GetServerSideProps } from "next";
import { useState, type FormEvent } from "react";
import { ANALYTICS_EVENTS } from "../../lib/analyticsEvents";
import { ensureAnalyticsCookie, readAnalyticsCookie } from "../../lib/analyticsCookie";

type Props = {
  creator: {
    id: string;
    name: string;
    subtitle: string;
    avatarUrl?: string | null;
    handle: string;
  } | null;
};

export default function FanEntryPage({ creator }: Props) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!creator) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">Creador no encontrado</h1>
          <p className="text-sm text-slate-400">El chat aún no está disponible.</p>
        </div>
      </div>
    );
  }

  const safeCreator = creator;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) {
      setError("Escribe tu primer mensaje para iniciar el chat.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/public/fan-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: safeCreator.handle, name: name.trim(), message: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "No se pudo iniciar el chat.");
      }
      const data = (await res.json()) as { fanId?: string };
      if (data?.fanId) {
        window.location.href = `/fan/${data.fanId}`;
      } else {
        throw new Error("No se pudo iniciar el chat.");
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "No se pudo iniciar el chat.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Head>
        <title>{safeCreator.name} · Chat privado</title>
      </Head>
      <div className="max-w-lg mx-auto px-4 py-10 space-y-6">
        <header className="flex items-center gap-3">
          {safeCreator.avatarUrl ? (
            <div className="h-12 w-12 rounded-full overflow-hidden border border-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={safeCreator.avatarUrl} alt={safeCreator.name} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="h-12 w-12 rounded-full bg-emerald-500 text-slate-900 font-semibold flex items-center justify-center">
              {(safeCreator.name || "C")[0]}
            </div>
          )}
          <div className="flex flex-col">
            <div className="text-lg font-semibold leading-tight">{safeCreator.name}</div>
            <div className="text-sm text-slate-300">Chat privado · {safeCreator.subtitle || "Responde en menos de 24h"}</div>
          </div>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Empieza la conversación</h2>
            <p className="text-sm text-slate-300">Preséntate y cuenta qué buscas. El creador te contestará aquí.</p>
          </div>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1 text-sm text-slate-200">
              <span>Tu nombre</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Ana"
                className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-400"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-200">
              <span>Primer mensaje</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribe aquí tu mensaje para el creador"
                rows={4}
                className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-400"
              />
            </label>
            {error && <div className="text-xs text-rose-300">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {loading ? "Enviando..." : "Entrar al chat"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const prisma = (await import("../../lib/prisma.server")).default;
  const handleParam = typeof ctx.params?.handle === "string" ? ctx.params.handle : "";
  const creators = await prisma.creator.findMany();
  const match = creators.find((c) => slugify(c.name) === handleParam) || creators[0];

  if (!match) {
    return { props: { creator: null } };
  }

  const referrerHeader = Array.isArray(ctx.req?.headers?.referer)
    ? ctx.req?.headers?.referer[0]
    : typeof ctx.req?.headers?.referer === "string"
    ? ctx.req.headers?.referer
    : Array.isArray(ctx.req?.headers?.referrer)
    ? ctx.req?.headers?.referrer[0]
    : typeof ctx.req?.headers?.referrer === "string"
    ? ctx.req.headers?.referrer
    : "";

  const utmSource = typeof ctx.query.utm_source === "string" ? ctx.query.utm_source : undefined;
  const utmMedium = typeof ctx.query.utm_medium === "string" ? ctx.query.utm_medium : undefined;
  const utmCampaign = typeof ctx.query.utm_campaign === "string" ? ctx.query.utm_campaign : undefined;
  const utmContent = typeof ctx.query.utm_content === "string" ? ctx.query.utm_content : undefined;
  const utmTerm = typeof ctx.query.utm_term === "string" ? ctx.query.utm_term : undefined;

  const cookieData = readAnalyticsCookie(ctx.req as any);
  const merged = ensureAnalyticsCookie(ctx.req as any, ctx.res as any, {
    referrer: cookieData?.referrer || referrerHeader || undefined,
    utmSource: utmSource ?? cookieData?.utmSource,
    utmMedium: utmMedium ?? cookieData?.utmMedium,
    utmCampaign: utmCampaign ?? cookieData?.utmCampaign,
    utmContent: utmContent ?? cookieData?.utmContent,
    utmTerm: utmTerm ?? cookieData?.utmTerm,
  });

  try {
    await prisma.analyticsEvent.create({
      data: {
        creatorId: match.id,
        fanId: null,
        sessionId: merged.sessionId,
        eventName: ANALYTICS_EVENTS.OPEN_CHAT,
        path: `/c/${handleParam}`,
        referrer: merged.referrer || referrerHeader || null,
        utmSource: merged.utmSource || null,
        utmMedium: merged.utmMedium || null,
        utmCampaign: merged.utmCampaign || null,
        utmContent: merged.utmContent || null,
        utmTerm: merged.utmTerm || null,
        meta: { handle: handleParam || slugify(match.name || "creator") },
      },
    });
  } catch (err) {
    console.error("Error tracking open_chat for public entry", err);
  }

  return {
    props: {
      creator: {
        id: match.id,
        name: match.name || "Creador",
        subtitle: match.subtitle || "Responde en menos de 24h",
        avatarUrl: match.bioLinkAvatarUrl || null,
        handle: slugify(match.name || "creator"),
      },
    },
  };
};

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
