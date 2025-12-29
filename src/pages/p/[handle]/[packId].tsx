import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";

type PackLandingProps = {
  notFound?: boolean;
  creatorName?: string;
  creatorHandle?: string;
  pack?: {
    id: string;
    title: string;
    description: string | null;
    priceCents: number;
    currency: string;
    coverUrl: string | null;
    slug: string;
  };
};

export default function PublicPackLanding({ notFound, creatorName, creatorHandle, pack }: PackLandingProps) {
  if (notFound || !pack || !creatorHandle) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300 px-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Pack no disponible</h1>
          <p className="text-sm text-slate-400">Este pack aún no está publicado.</p>
        </div>
      </div>
    );
  }

  const priceLabel = formatPriceCents(pack.priceCents, pack.currency);
  const draft = buildPackDraft(pack);
  const chatHref = { pathname: `/go/${creatorHandle}`, query: { draft } };

  return (
    <>
      <Head>
        <title>{`${pack.title} · ${creatorName || "Pack"}`}</title>
      </Head>
      <div className="min-h-screen bg-[#0b141a] text-white">
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
          <header className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80">
            <div
              className="h-56 w-full bg-slate-950/80"
              style={
                pack.coverUrl
                  ? {
                      backgroundImage: `linear-gradient(135deg, rgba(11,20,26,0.85), rgba(11,20,26,0.55)), url('${pack.coverUrl}')`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : undefined
              }
            />
            <div className="px-6 py-5 space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-emerald-200">Pack público</p>
              <h1 className="text-2xl md:text-3xl font-semibold">{pack.title}</h1>
              <p className="text-lg font-semibold text-amber-300">{priceLabel}</p>
              {pack.description && <p className="text-sm text-slate-300 leading-relaxed">{pack.description}</p>}
            </div>
          </header>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={chatHref}
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400"
            >
              Pedir
            </Link>
            <Link
              href={`/c/${creatorHandle}`}
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-800/80"
            >
              Volver al perfil
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PackLandingProps> = async (ctx) => {
  const prisma = (await import("../../../lib/prisma.server")).default;
  const handleParam = typeof ctx.params?.handle === "string" ? ctx.params.handle : "";
  const packId = typeof ctx.params?.packId === "string" ? ctx.params.packId : "";
  if (!handleParam || !packId) {
    return { props: { notFound: true } };
  }

  const creators = await prisma.creator.findMany({ include: { packs: true } });
  const creator = creators.find((item) => slugify(item.name) === handleParam);
  if (!creator) {
    return { props: { notFound: true } };
  }

  const packKey = normalizeContentPackKey(packId);
  if (packKey) {
    const creatorPack =
      creator.packs.find((pack) => pack.id.toLowerCase() === packKey) ||
      creator.packs.find((pack) => slugify(pack.name) === packKey);
    const fallback = DEFAULT_PACK_META[packKey];
    const title = creatorPack?.name || fallback.title;
    const priceMeta = creatorPack ? parsePriceToCents(creatorPack.price) : { cents: fallback.priceCents, currency: "EUR" };
    const profile = await prisma.creatorProfile.findUnique({
      where: { creatorId: creator.id },
      select: { coverUrl: true },
    });
    const clip = await prisma.popClip.findFirst({
      where: {
        creatorId: creator.id,
        isActive: true,
        contentItem: { pack: packKey.toUpperCase() as "WELCOME" | "MONTHLY" | "SPECIAL" },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: { posterUrl: true },
    });

    return {
      props: {
        creatorName: creator.name || "Creador",
        creatorHandle: slugify(creator.name),
        pack: {
          id: packKey,
          title,
          description: creatorPack?.description ?? null,
          priceCents: priceMeta.cents,
          currency: priceMeta.currency,
          coverUrl: clip?.posterUrl ?? profile?.coverUrl ?? null,
          slug: slugify(title),
        },
      },
    };
  }

  const pack = await prisma.catalogItem.findFirst({
    where: {
      id: packId,
      creatorId: creator.id,
      type: "PACK",
      isActive: true,
      isPublic: true,
    },
    select: {
      id: true,
      title: true,
      description: true,
      priceCents: true,
      currency: true,
    },
  });

  if (!pack) {
    return { props: { notFound: true } };
  }

  const clip = await prisma.popClip.findFirst({
    where: {
      catalogItemId: pack.id,
      creatorId: creator.id,
      isActive: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      posterUrl: true,
    },
  });

  return {
    props: {
      creatorName: creator.name || "Creador",
      creatorHandle: slugify(creator.name),
      pack: {
        id: pack.id,
        title: pack.title,
        description: pack.description ?? null,
        priceCents: pack.priceCents,
        currency: pack.currency,
        coverUrl: clip?.posterUrl ?? null,
        slug: slugify(pack.title),
      },
    },
  };
};

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

const DEFAULT_PACK_META: Record<string, { title: string; priceCents: number }> = {
  welcome: { title: "Pack bienvenida", priceCents: 900 },
  monthly: { title: "Suscripción mensual", priceCents: 2500 },
  special: { title: "Pack especial", priceCents: 4900 },
};

function normalizeContentPackKey(value?: string | null) {
  const key = (value || "").toLowerCase().trim();
  if (key === "welcome" || key === "monthly" || key === "special") return key;
  return "";
}

function parsePriceToCents(value?: string | null) {
  const raw = (value || "").trim();
  if (!raw) return { cents: 0, currency: "EUR" };
  const currency = raw.includes("$") ? "USD" : raw.includes("£") ? "GBP" : "EUR";
  const normalized = raw.replace(/[^\d.,]/g, "").replace(",", ".");
  const amount = Number.parseFloat(normalized);
  if (Number.isNaN(amount)) return { cents: 0, currency };
  return { cents: Math.round(amount * 100), currency };
}

function formatPriceCents(cents: number, currency = "EUR") {
  const amount = cents / 100;
  const hasDecimals = cents % 100 !== 0;
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0,
    }).format(amount);
  } catch {
    const fixed = hasDecimals ? amount.toFixed(2) : Math.round(amount).toString();
    return `${fixed} ${currency}`;
  }
}

function buildPackDraft(pack: { id: string; title: string; priceCents: number; currency: string; slug?: string }) {
  const priceLabel = formatPriceCents(pack.priceCents, pack.currency);
  const refParts = [`productId=${pack.id}`];
  if (pack.slug) refParts.push(`slug=${pack.slug}`);
  return `Quiero el pack "${pack.title}" (${priceLabel}). ¿Me lo activas?\n\nRef pack: ${refParts.join(" ")}`;
}
