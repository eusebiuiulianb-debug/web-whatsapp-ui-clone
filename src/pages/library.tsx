import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useCreatorConfig } from "../context/CreatorConfigContext";
import CreatorHeader from "../components/CreatorHeader";
import { ContentType } from "../types/content";
import {
  ContentItem as PrismaContentItem,
  ContentPack,
  ContentType as PrismaContentType,
  ExtraTier,
  TimeOfDay,
} from "@prisma/client";
import { NewContentModal } from "../components/content/NewContentModal";

type PackKey = "WELCOME" | "MONTHLY" | "SPECIAL";
type ContentTypeKey = ContentType | "TEXT";
type ExtraTier = "T0" | "T1" | "T2" | "T3";
type TimeOfDay = "DAY" | "NIGHT" | "ANY";

const PACK_LABELS: Record<PackKey, string> = {
  WELCOME: "Pack bienvenida",
  MONTHLY: "Suscripción mensual",
  SPECIAL: "Pack especial",
};

const TYPE_LABELS: Record<ContentTypeKey, string> = {
  IMAGE: "Foto",
  VIDEO: "Vídeo",
  AUDIO: "Audio",
  TEXT: "Texto",
};

type PackSummary = {
  key: PackKey;
  label: string;
  total: number;
  byType: { AUDIO: number; VIDEO: number; PHOTO: number; TEXT: number };
};

function summarizeByPack(items: PrismaContentItem[]): PackSummary[] {
  const base: Record<PackKey, PackSummary> = {
    WELCOME: { key: "WELCOME", label: PACK_LABELS.WELCOME, total: 0, byType: { AUDIO: 0, VIDEO: 0, PHOTO: 0, TEXT: 0 } },
    MONTHLY: { key: "MONTHLY", label: PACK_LABELS.MONTHLY, total: 0, byType: { AUDIO: 0, VIDEO: 0, PHOTO: 0, TEXT: 0 } },
    SPECIAL: { key: "SPECIAL", label: PACK_LABELS.SPECIAL, total: 0, byType: { AUDIO: 0, VIDEO: 0, PHOTO: 0, TEXT: 0 } },
  };

  items.forEach((item) => {
    const packKey = (item.pack as PackKey) || "WELCOME";
    const summary = base[packKey];
    summary.total += 1;
    if (item.type === "AUDIO") summary.byType.AUDIO += 1;
    else if (item.type === "VIDEO") summary.byType.VIDEO += 1;
    else if (item.type === "IMAGE") summary.byType.PHOTO += 1;
    else summary.byType.TEXT += 1;
  });

  return [base.WELCOME, base.MONTHLY, base.SPECIAL];
}

export default function LibraryPage() {
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";
  const [items, setItems] = useState<PrismaContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedContent, setSelectedContent] = useState<PrismaContentItem | undefined>();
  const router = useRouter();
  const [activePack, setActivePack] = useState<PackKey | null>(null);
  const [mode, setMode] = useState<"packs" | "extras">("packs");
  const createDefaults = useMemo(
    () => (mode === "extras" ? { visibility: "EXTRA" as const, extraTier: "T1" as ExtraTier, timeOfDay: "ANY" as TimeOfDay } : undefined),
    [mode]
  );

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/content");
      if (!res.ok) throw new Error("Error loading content");
      const data = await res.json();
      const contentItems = Array.isArray(data.items) ? (data.items as PrismaContentItem[]) : [];
      setItems(contentItems);
    } catch (_err) {
      setError("Error cargando contenidos");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const summaries = useMemo(() => summarizeByPack(items), [items]);
  const filteredItems = useMemo(
    () => (activePack ? items.filter((item) => item.pack === activePack) : items),
    [items, activePack]
  );

  const extraItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.visibility === "EXTRA" || // marcado como extra por visibilidad
          (item as any).isExtra === true // compatibilidad con flag explícito
      ),
    [items]
  );

  const extrasByTier = useMemo(() => {
    const base: Record<ExtraTier, PrismaContentItem[]> = {
      T0: [],
      T1: [],
      T2: [],
      T3: [],
    };
    extraItems.forEach((item) => {
      const tier = ((item as any).extraTier as ExtraTier) || "T1";
      base[tier as ExtraTier]?.push(item);
    });
    return base;
  }, [extraItems]);

  const tierTitles: Record<ExtraTier, string> = {
    T0: "T0 – Gratis / incluido",
    T1: "T1 – Foto extra básica",
    T2: "T2 – Vídeo extra",
    T3: "T3 – Combo foto + vídeo",
  };

  const modeHelperText =
    mode === "packs"
      ? "Aquí organizas lo que está incluido en tus packs."
      : "Aquí organizas lo que vendes aparte por chat (extras PPV).";

  return (
    <div className="min-h-screen bg-[#0b141a] text-white">
      <Head>
        <title>Biblioteca de contenido – NOVSY</title>
      </Head>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        <CreatorHeader
          name={config.creatorName}
          role="Creador"
          subtitle={config.creatorSubtitle}
          initial={creatorInitial}
          onOpenSettings={() => {}}
        />

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Biblioteca de contenido</h1>
            <p className="text-sm text-slate-300 mt-1">
              Fotos, vídeos y audios que podrás adjuntar en tus chats privados.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <div className="inline-flex rounded-full border border-slate-700 bg-slate-900/60 p-1">
                {(["packs", "extras"] as const).map((value) => {
                  const isActive = mode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                        isActive
                          ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/70"
                          : "text-slate-200"
                      }`}
                      onClick={() => {
                        setMode(value);
                        if (value === "extras") setActivePack(null);
                      }}
                    >
                      {value === "packs" ? "Packs" : "Extras PPV"}
                    </button>
                  );
                })}
              </div>
              <p className="text-[12px] text-slate-400">{modeHelperText}</p>
            </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelectedContent(undefined);
            setModalMode("create");
            setShowModal(true);
          }}
          className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm font-semibold text-slate-100 hover:border-amber-400/70 hover:text-amber-100 transition"
        >
          Nuevo contenido
        </button>
      </div>

        {mode === "packs" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {summaries.map((summary) => {
              const isActive = activePack === summary.key;
              const descriptionParts = [
                `${summary.total} pieza${summary.total === 1 ? "" : "s"}`,
                summary.byType.AUDIO ? `${summary.byType.AUDIO} audio${summary.byType.AUDIO === 1 ? "" : "s"}` : null,
                summary.byType.VIDEO ? `${summary.byType.VIDEO} vídeo${summary.byType.VIDEO === 1 ? "" : "s"}` : null,
                summary.byType.PHOTO ? `${summary.byType.PHOTO} foto${summary.byType.PHOTO === 1 ? "" : "s"}` : null,
                summary.byType.TEXT ? `${summary.byType.TEXT} texto${summary.byType.TEXT === 1 ? "" : "s"}` : null,
              ].filter(Boolean);
              const description = descriptionParts.join(" · ");
              return (
                <div
                  key={summary.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActivePack((prev) => (prev === summary.key ? null : summary.key))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActivePack((prev) => (prev === summary.key ? null : summary.key));
                    }
                  }}
                  className={`rounded-2xl border p-4 bg-slate-900/70 transition cursor-pointer ${
                    isActive ? "border-emerald-500 bg-slate-900" : "border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="text-sm font-semibold text-white">{summary.label}</div>
                  <div className="text-xs text-slate-300 mt-1">{description}</div>
                </div>
              );
            })}
          </div>
        )}

        {error && <div className="text-sm text-rose-300">{error}</div>}
        {loading && <div className="text-sm text-slate-300">Cargando contenidos...</div>}

        {mode === "packs" && (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => (
              <ContentCard
                key={item.id}
                content={item}
                onEdit={(content) => {
                  setSelectedContent(content);
                  setModalMode("edit");
                  setShowModal(true);
                }}
                onDelete={async (content) => {
                  if (!window.confirm("¿Seguro que quieres eliminar este contenido?")) return;
                  try {
                    const res = await fetch(`/api/content/${content.id}`, { method: "DELETE" });
                    if (!res.ok && res.status !== 204) {
                      console.error("Error al eliminar contenido");
                    }
                    router.reload();
                  } catch (err) {
                    console.error(err);
                  }
                }}
              />
            ))}
          </div>
        )}

        {mode === "extras" && (
          <div className="mt-6 space-y-6">
            {(Object.keys(tierTitles) as ExtraTier[]).map((tierKey) => {
              const tierItems = extrasByTier[tierKey] || [];
              if (!tierItems.length) return null;

              const dayItems = tierItems.filter((item) => {
                const tod = ((item as any).timeOfDay as TimeOfDay) || "ANY";
                return tod === "DAY" || tod === "ANY";
              });
              const nightItems = tierItems.filter((item) => {
                const tod = ((item as any).timeOfDay as TimeOfDay) || "ANY";
                return tod === "NIGHT" || tod === "ANY";
              });

              const renderGroup = (group: PrismaContentItem[], label: string) => {
                if (!group.length) return null;
                const regularItems = group.filter((item) => !(item.title || "").startsWith("[REG]"));
                const registerOnlyItems = group.filter((item) => (item.title || "").startsWith("[REG]"));
                return (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-300 uppercase tracking-wide">{label}</p>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {regularItems.map((item) => (
                        <ContentCard
                          key={item.id}
                          content={item}
                          onEdit={(content) => {
                            setSelectedContent(content);
                            setModalMode("edit");
                            setShowModal(true);
                          }}
                          onDelete={async (content) => {
                            if (!window.confirm("¿Seguro que quieres eliminar este contenido?")) return;
                            try {
                              const res = await fetch(`/api/content/${content.id}`, { method: "DELETE" });
                              if (!res.ok && res.status !== 204) {
                                console.error("Error al eliminar contenido");
                              }
                              router.reload();
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                        />
                      ))}
                      {registerOnlyItems.map((item) => (
                        <ContentCard
                          key={item.id}
                          content={item}
                          badge="Solo historial"
                          onEdit={(content) => {
                            setSelectedContent(content);
                            setModalMode("edit");
                            setShowModal(true);
                          }}
                          onDelete={async (content) => {
                            if (!window.confirm("¿Seguro que quieres eliminar este contenido?")) return;
                            try {
                              const res = await fetch(`/api/content/${content.id}`, { method: "DELETE" });
                              if (!res.ok && res.status !== 204) {
                                console.error("Error al eliminar contenido");
                              }
                              router.reload();
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              };

              return (
                <section key={tierKey} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">{tierTitles[tierKey]}</h3>
                    <span className="text-xs text-slate-400">{tierItems.length} ítem{tierItems.length === 1 ? "" : "s"}</span>
                  </div>
                  {renderGroup(dayItems, "Día")}
                  {renderGroup(nightItems, "Noche")}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <NewContentModal
          mode={modalMode}
          initialContent={modalMode === "edit" ? selectedContent : undefined}
          createDefaults={createDefaults}
          onClose={() => {
            setShowModal(false);
            setSelectedContent(undefined);
          }}
        />
      )}
    </div>
  );
}

function getEmojiForType(type: ContentType) {
  if (type === "VIDEO") return "🎥";
  if (type === "AUDIO") return "🎧";
  return "📷";
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function mapTypeToLabel(type: PrismaContentType): string {
  switch (type) {
    case "IMAGE":
      return "Foto";
    case "VIDEO":
      return "Vídeo";
    case "AUDIO":
      return "Audio";
    case "TEXT":
      return "Texto";
    default:
      return type;
  }
}

function mapPackToLabel(pack: ContentPack): string {
  switch (pack) {
    case "WELCOME":
      return "Pack bienvenida";
    case "MONTHLY":
      return "Suscripción mensual";
    case "SPECIAL":
      return "Pack especial";
    default:
      return pack;
  }
}

type ContentCardProps = {
  content: PrismaContentItem;
  onEdit?: (content: PrismaContentItem) => void;
  onDelete?: (content: PrismaContentItem) => void;
  badge?: string;
};

function ContentCard({ content, onEdit, onDelete, badge }: ContentCardProps) {
  const isExtra = content.visibility === "EXTRA";
  const typeLabel = mapTypeToLabel(content.type as PrismaContentType);
  const packLabel = mapPackToLabel(content.pack as ContentPack);
  const visibilityLabel = isExtra ? "Extra de pago" : "Incluido en tu suscripción";
  const formattedDate = formatDate(content.createdAt as unknown as string);

  return (
    <div className="flex h-full flex-col justify-between rounded-xl bg-slate-900/60 p-4 shadow-sm border border-slate-800">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">{content.title}</p>
            <p className="text-xs text-slate-300">
              {isExtra ? `${typeLabel} · Extra por chat` : `${typeLabel} · ${packLabel}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-[11px] text-slate-400">
            {badge && (
              <span className="inline-flex items-center rounded-full border border-amber-400/60 bg-amber-500/10 px-2 py-[2px] text-amber-100">
                {badge}
              </span>
            )}
            <button
              type="button"
              className="text-slate-300 hover:text-white"
              onClick={() => onEdit?.(content)}
            >
              Editar
            </button>
            <button
              type="button"
              className="text-rose-300 hover:text-rose-200"
              onClick={() => onDelete?.(content)}
            >
              Eliminar
            </button>
          </div>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${
            isExtra ? "border border-amber-400/70 text-amber-300" : "bg-emerald-500/10 text-emerald-300"
          }`}
        >
          {visibilityLabel}
        </span>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Añadido el {formattedDate}</p>
    </div>
  );
}
