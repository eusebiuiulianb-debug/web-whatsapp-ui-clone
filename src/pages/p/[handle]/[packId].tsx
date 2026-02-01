import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { PackLandingSkeleton } from "../../../components/skeletons/PackLandingSkeleton";

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
  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-0)] text-[color:var(--muted)] px-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Pack no disponible</h1>
          <p className="text-sm text-[color:var(--muted)]">Este pack aún no está publicado.</p>
        </div>
      </div>
    );
  }

  if (!pack || !creatorHandle) {
    return <PackLandingSkeleton />;
  }

  const priceLabel = formatPriceCents(pack.priceCents, pack.currency);
  const draft = buildPackDraft(pack);
  const chatHref = { pathname: `/go/${creatorHandle}`, query: { draft } };
  const profileHref = `/c/${creatorHandle}`;
  const exploreHref = "/explore";
  const creatorLabel = creatorName ? creatorName : `@${creatorHandle}`;
  const descriptionLine = pack.description?.split("\n").find((line) => line.trim());
  const valueLine = descriptionLine ?? "Acceso privado + coordinación directa en chat.";
  const includes = [
    "Acceso privado al pack seleccionado.",
    "Entrega directa por chat.",
    "Coordinación directa con el creador.",
  ];
  const audience = [
    "Fans que quieren acceso directo y privado.",
    "Personas que buscan un pack específico sin complicaciones.",
  ];
  const formatItems = [
    { label: "Formato", value: "Contenido digital privado" },
    { label: "Entrega", value: "Directo en el chat" },
    { label: "Tiempo", value: "Se coordina con el creador" },
  ];

  return (
    <>
      <Head>
        <title>{`${pack.title} · ${creatorName || "Pack"}`}</title>
      </Head>
      <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
        <div className="mx-auto max-w-4xl px-4 pt-8 pb-[calc(env(safe-area-inset-bottom)+96px)] sm:pb-12 space-y-8">
          <header className="relative overflow-hidden rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] shadow-sm">
            <div className="relative h-[180px] sm:h-[220px] lg:h-[240px]">
              <div
                className="absolute inset-0 bg-[color:var(--surface-2)]"
                style={
                  pack.coverUrl
                    ? {
                        backgroundImage: `linear-gradient(135deg, rgba(8,14,28,0.65), rgba(8,14,28,0.35)), url('${pack.coverUrl}')`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
              />
              {!pack.coverUrl ? (
                <div className="absolute inset-0 bg-gradient-to-br from-[color:rgba(24,33,53,0.95)] via-[color:rgba(15,20,33,0.92)] to-[color:rgba(8,12,22,0.98)]">
                  <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                  <div className="absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70">
                      Pack
                    </span>
                  </div>
                </div>
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent" />
              <div className="relative z-10 flex h-full flex-col justify-end gap-2 px-6 pb-5 pt-10 text-white">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">
                  Pack público
                </span>
                <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{pack.title}</h1>
                <p className="text-xs text-white/70">por {creatorLabel}</p>
                <div className="flex flex-wrap items-center gap-3 text-sm text-white/90">
                  <span className="text-lg font-semibold text-white sm:text-xl">{priceLabel}</span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold">
                    Acceso privado
                  </span>
                </div>
                <p className="max-w-2xl text-sm text-white/80 line-clamp-1">{valueLine}</p>
              </div>
            </div>
          </header>

          <div className="hidden flex-wrap items-center gap-3 sm:flex">
            <Link
              href={chatHref}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[color:var(--brand-strong)] px-6 text-sm font-semibold text-[color:var(--surface-0)] shadow-lg shadow-emerald-900/30 transition hover:bg-[color:var(--brand)]"
            >
              Abrir chat y pedir
            </Link>
            <Link
              href={profileHref}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-5 text-sm font-semibold text-[color:var(--text)] transition hover:bg-[color:var(--surface-2)]"
            >
              Volver al perfil de @{creatorHandle}
            </Link>
            <Link
              href={exploreHref}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-transparent px-3 text-sm font-semibold text-[color:var(--muted)] hover:text-[color:var(--text)]"
            >
              Volver a explorar
            </Link>
          </div>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-5">
                <h2 className="text-sm font-semibold">Qué incluye</h2>
                <ul className="mt-3 space-y-2 text-sm text-[color:var(--muted)]">
                  {includes.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[color:var(--brand-strong)]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-5">
                <h2 className="text-sm font-semibold">Para quién es</h2>
                <ul className="mt-3 space-y-2 text-sm text-[color:var(--muted)]">
                  {audience.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[color:var(--brand-strong)]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {pack.description ? (
                <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-5">
                  <h2 className="text-sm font-semibold">Sobre este pack</h2>
                  <p className="mt-3 text-sm text-[color:var(--muted)] whitespace-pre-line">
                    {pack.description}
                  </p>
                </div>
              ) : null}
            </div>

            <aside className="space-y-5">
              <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-5">
                <h2 className="text-sm font-semibold">Formato y entrega</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {formatItems.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)]/60 p-4"
                    >
                      <p className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">{item.label}</p>
                      <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] p-5">
                <p className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Creador</p>
                <p className="mt-2 text-lg font-semibold">{creatorLabel}</p>
                <p className="text-sm text-[color:var(--muted)]">@{creatorHandle}</p>
                <div className="mt-4 flex flex-col gap-2">
                  <Link
                    href={profileHref}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-4 text-sm font-semibold text-[color:var(--text)] transition hover:bg-[color:var(--surface-1)]"
                  >
                    Volver al perfil de @{creatorHandle}
                  </Link>
                  <Link
                    href={exploreHref}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-[color:var(--surface-border)] px-4 text-sm font-semibold text-[color:var(--muted)] transition hover:text-[color:var(--text)]"
                  >
                    Volver a explorar
                  </Link>
                </div>
              </div>
            </aside>
          </section>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[color:var(--surface-border)] bg-[color:var(--surface-1)]/95 backdrop-blur sm:hidden">
          <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
            <Link
              href={chatHref}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[color:var(--brand-strong)] px-6 text-sm font-semibold text-[color:var(--surface-0)] shadow-lg shadow-emerald-900/30 transition hover:bg-[color:var(--brand)]"
            >
              Pedir este pack
            </Link>
            <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
              <Link href={profileHref} className="hover:text-[color:var(--text)]">
                Volver al perfil
              </Link>
              <Link href={exploreHref} className="hover:text-[color:var(--text)]">
                Explorar
              </Link>
            </div>
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
