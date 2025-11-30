import Head from "next/head";
import { useEffect, useState } from "react";
import { useCreatorConfig } from "../context/CreatorConfigContext";
import CreatorHeader from "../components/CreatorHeader";
import {
  ContentItem,
  ContentType,
  ContentVisibility,
  getContentTypeLabel,
  getContentVisibilityLabel,
} from "../types/content";

type CreateContentForm = {
  title: string;
  type: ContentType;
  visibility: ContentVisibility;
  externalUrl: string;
};

const DEFAULT_FORM: CreateContentForm = {
  title: "",
  type: "IMAGE",
  visibility: "INCLUDED_MONTHLY",
  externalUrl: "",
};

const TYPE_OPTIONS: { label: string; value: ContentType }[] = [
  { label: "Foto", value: "IMAGE" },
  { label: "Vídeo", value: "VIDEO" },
  { label: "Audio", value: "AUDIO" },
];

const VISIBILITY_OPTIONS: { label: string; value: ContentVisibility }[] = [
  { label: "Incluido mensual", value: "INCLUDED_MONTHLY" },
  { label: "VIP", value: "VIP" },
  { label: "Extra", value: "EXTRA" },
];

export default function LibraryPage() {
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<CreateContentForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

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
      const contentItems = Array.isArray(data.items) ? (data.items as ContentItem[]) : [];
      setItems(contentItems);
    } catch (_err) {
      setError("Error cargando contenidos");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateContent() {
    try {
      setSaving(true);
      setError("");
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("error");
      await fetchItems();
      setShowModal(false);
      setForm(DEFAULT_FORM);
    } catch (_err) {
      setError("No se pudo crear el contenido");
    } finally {
      setSaving(false);
    }
  }

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
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm font-semibold text-slate-100 hover:border-amber-400/70 hover:text-amber-100 transition"
          >
            Nuevo contenido
          </button>
        </div>

        {error && <div className="text-sm text-rose-300">{error}</div>}
        {loading && <div className="text-sm text-slate-300">Cargando contenidos...</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-2 shadow-sm"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <span className="text-lg">{getEmojiForType(item.type)}</span>
                <span className="truncate">{item.title}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span>{getContentTypeLabel(item.type)}</span>
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 border text-[11px] ${
                    item.visibility === "VIP"
                      ? "border-amber-400/80 text-amber-200"
                      : item.visibility === "EXTRA"
                      ? "border-sky-400/70 text-sky-200"
                      : "border-emerald-400/70 text-emerald-200"
                  }`}
                >
                  {getContentVisibilityLabel(item.visibility)}
                </span>
              </div>
              <p className="text-xs text-slate-400">Añadido el {formatDate(item.createdAt)}</p>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 p-6 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-white">Nuevo contenido</h3>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setForm(DEFAULT_FORM);
                }}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-300">Título</label>
                <input
                  className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-amber-400"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-300">Tipo</label>
                <select
                  className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-amber-400"
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as ContentType }))}
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-300">Visibilidad</label>
                <select
                  className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-amber-400"
                  value={form.visibility}
                  onChange={(e) => setForm((prev) => ({ ...prev, visibility: e.target.value as ContentVisibility }))}
                >
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-300">URL externa</label>
                <input
                  className="w-full rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm text-white focus:border-amber-400"
                  value={form.externalUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, externalUrl: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm font-semibold text-slate-100 hover:border-amber-400/70 hover:text-amber-100"
                  onClick={() => {
                    setShowModal(false);
                    setForm(DEFAULT_FORM);
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateContent}
                  disabled={saving}
                  className="rounded-lg border border-amber-400/80 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/20 disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Crear contenido"}
                </button>
              </div>
            </div>
          </div>
        </div>
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
