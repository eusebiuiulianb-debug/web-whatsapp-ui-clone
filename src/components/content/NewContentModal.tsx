import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import type {
  ChatPpvTier,
  ContentPack,
  ContentType,
  ContentVisibility,
  ExtraSlot,
  ExtraTier,
  TimeOfDay,
  ContentItem as PrismaContentItem,
} from "@prisma/client";

type ContentItem = PrismaContentItem;

type NewContentModalProps = {
  mode: "create" | "edit";
  initialContent?: ContentItem;
  createDefaults?: {
    visibility?: ContentVisibility;
    extraTier?: ExtraTier;
    extraSlot?: ExtraSlot;
  };
  onClose: () => void;
};

const typeOptions: ContentType[] = ["IMAGE", "VIDEO", "AUDIO", "TEXT"];
const packOptions: ContentPack[] = ["WELCOME", "MONTHLY", "SPECIAL"];
const visibilityOptions: ContentVisibility[] = ["INCLUDED_MONTHLY", "VIP", "EXTRA"];
const extraTierOptions: ExtraTier[] = ["T0", "T1", "T2", "T3"];
const chatTierOptions: ChatPpvTier[] = ["CHAT_T0", "CHAT_T1", "CHAT_T2", "CHAT_T3"];
const extraSlotOptions: ExtraSlot[] = ["DAY_1", "DAY_2", "NIGHT_1", "NIGHT_2", "ANY"];
const resolveSlotFromLegacy = (slot?: ExtraSlot | null, timeOfDay?: TimeOfDay | null) => {
  if (slot) return slot;
  if (timeOfDay === "DAY") return "DAY_1";
  if (timeOfDay === "NIGHT") return "NIGHT_1";
  return "ANY";
};
const resolveTimeOfDayFromSlot = (slot: ExtraSlot): TimeOfDay => {
  if (slot === "DAY_1" || slot === "DAY_2") return "DAY";
  if (slot === "NIGHT_1" || slot === "NIGHT_2") return "NIGHT";
  return "ANY";
};

export function NewContentModal({ onClose, mode, initialContent, createDefaults }: NewContentModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialContent?.title ?? "");
  const [description, setDescription] = useState(initialContent?.description ?? "");
  const [type, setType] = useState<ContentType>(initialContent?.type ?? typeOptions[0]);
  const [pack, setPack] = useState<ContentPack>(initialContent?.pack ?? packOptions[0]);
  const [visibility, setVisibility] = useState<ContentVisibility>(initialContent?.visibility ?? createDefaults?.visibility ?? visibilityOptions[0]);
  const [extraTier, setExtraTier] = useState<ExtraTier>(initialContent?.extraTier ?? createDefaults?.extraTier ?? "T1");
  const [chatTier, setChatTier] = useState<ChatPpvTier | "">(initialContent?.chatTier ?? "");
  const [extraSlot, setExtraSlot] = useState<ExtraSlot>(
    resolveSlotFromLegacy(initialContent?.extraSlot ?? null, initialContent?.timeOfDay ?? null) ??
      createDefaults?.extraSlot ??
      "ANY"
  );
  const [defaultCopy, setDefaultCopy] = useState(initialContent?.defaultCopy ?? "");
  const [mediaPath, setMediaPath] = useState(initialContent?.mediaPath ?? "");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "edit" && initialContent) {
      setTitle(initialContent.title);
      setDescription(initialContent.description ?? "");
      setType(initialContent.type);
      setPack(initialContent.pack);
      setVisibility(initialContent.visibility);
      setExtraTier(initialContent.extraTier ?? "T1");
      setChatTier(initialContent.chatTier ?? "");
      setExtraSlot(resolveSlotFromLegacy(initialContent.extraSlot ?? null, initialContent.timeOfDay ?? null));
      setDefaultCopy(initialContent.defaultCopy ?? "");
      setMediaPath(initialContent.mediaPath ?? "");
    }
    if (mode === "create") {
      setTitle("");
      setDescription("");
      setType(typeOptions[0]);
      setPack(packOptions[0]);
      setVisibility(createDefaults?.visibility ?? visibilityOptions[0]);
      setExtraTier(createDefaults?.extraTier ?? "T1");
      setChatTier("");
      setExtraSlot(createDefaults?.extraSlot ?? "ANY");
      setDefaultCopy("");
      setMediaPath("");
    }
  }, [mode, initialContent, createDefaults]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const url = mode === "edit" && initialContent ? `/api/content/${initialContent.id}` : "/api/content";
      const method = mode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          type,
          pack,
          visibility,
          extraTier: visibility === "EXTRA" ? extraTier : undefined,
          extraSlot: visibility === "EXTRA" ? extraSlot : undefined,
          chatTier: visibility === "EXTRA" && chatTier ? chatTier : undefined,
          defaultCopy: visibility === "EXTRA" ? defaultCopy : undefined,
          timeOfDay: visibility === "EXTRA" ? resolveTimeOfDayFromSlot(extraSlot) : undefined,
          mediaPath,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data?.error || "No se pudo crear el contenido.");
        setLoading(false);
        return;
      }

      onClose();
      router.reload();
    } catch (err) {
      console.error(err);
      setErrorMsg("Error de red al crear el contenido.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--surface-overlay)]">
      <div className="w-full max-w-lg rounded-xl bg-[color:var(--surface-1)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[color:var(--text)]">
            {mode === "edit" ? "Editar contenido" : "Nuevo contenido"}
          </h2>
          <button
            type="button"
            className="text-sm text-[color:var(--muted)] hover:text-[color:var(--text)]"
            onClick={onClose}
            disabled={loading}
          >
            Cerrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-[color:var(--muted)]">Título*</label>
            <input
              className="w-full rounded-md bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)] outline-none ring-1 ring-[color:var(--surface-border)] focus:ring-[color:var(--ring)]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-[color:var(--muted)]">Descripción</label>
            <textarea
              className="w-full resize-none rounded-md bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)] outline-none ring-1 ring-[color:var(--surface-border)] focus:ring-[color:var(--ring)]"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted)]">Tipo*</label>
              <select
                className="w-full rounded-md bg-[color:var(--surface-2)] px-2 py-2 text-sm text-[color:var(--text)] outline-none ring-1 ring-[color:var(--surface-border)] focus:ring-[color:var(--ring)]"
                value={type}
                onChange={(e) => setType(e.target.value as ContentType)}
              >
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted)]">Pack*</label>
              <select
                className="w-full rounded-md bg-[color:var(--surface-2)] px-2 py-2 text-sm text-[color:var(--text)] outline-none ring-1 ring-[color:var(--surface-border)] focus:ring-[color:var(--ring)]"
                value={pack}
                onChange={(e) => setPack(e.target.value as ContentPack)}
              >
                {packOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted)]">Visibilidad*</label>
              <select
                className="w-full rounded-md bg-[color:var(--surface-2)] px-2 py-2 text-sm text-[color:var(--text)] outline-none ring-1 ring-[color:var(--surface-border)] focus:ring-[color:var(--ring)]"
                value={visibility}
                onChange={(e) => {
                  const nextVisibility = e.target.value as ContentVisibility;
                  setVisibility(nextVisibility);
                  if (nextVisibility === "EXTRA") {
                    setExtraTier((prev) => prev || "T1");
                    setExtraSlot((prev) => prev || "ANY");
                  }
                }}
              >
                {visibilityOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-[color:var(--muted)]">
              Media path* (ej. <code>/media/welcome/foto_x.jpg</code>)
            </label>
            <input
              className="w-full rounded-md bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)] outline-none ring-1 ring-[color:var(--surface-border)] focus:ring-[color:var(--ring)]"
              value={mediaPath}
              onChange={(e) => setMediaPath(e.target.value)}
              required
            />
          </div>

          {visibility === "EXTRA" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted)]">Tier del extra</label>
                <select
                  className="w-full rounded-md bg-[color:var(--surface-2)] px-2 py-2 text-sm text-[color:var(--text)] outline-none ring-1 ring-[color:var(--surface-border)] focus:ring-[color:var(--ring)]"
                  value={extraTier}
                  onChange={(e) => setExtraTier(e.target.value as ExtraTier)}
                >
                  {extraTierOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === "T0" && "T0 – Gratis / incluido"}
                      {option === "T1" && "T1 – Foto extra básica"}
                      {option === "T2" && "T2 – Vídeo extra"}
                      {option === "T3" && "T3 – Techo / pack caro"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted)]">Tier PPV (chat)</label>
                <select
                  className="w-full rounded-md bg-[color:var(--surface-2)] px-2 py-2 text-sm text-[color:var(--text)] outline-none ring-1 ring-[color:var(--surface-border)] focus:ring-[color:var(--ring)]"
                  value={chatTier}
                  onChange={(e) => setChatTier(e.target.value as ChatPpvTier | "")}
                >
                  <option value="">Sin tier</option>
                  {chatTierOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.replace("CHAT_", "")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted)]">Fase</label>
                <select
                  className="w-full rounded-md bg-[color:var(--surface-2)] px-2 py-2 text-sm text-[color:var(--text)] outline-none ring-1 ring-[color:var(--surface-border)] focus:ring-[color:var(--ring)]"
                  value={extraSlot}
                  onChange={(e) => setExtraSlot(e.target.value as ExtraSlot)}
                >
                  {extraSlotOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === "DAY_1" && "Suave · Día"}
                      {option === "DAY_2" && "Picante · Día"}
                      {option === "NIGHT_1" && "Directo · Noche"}
                      {option === "NIGHT_2" && "Final · Noche"}
                      {option === "ANY" && "Cualquiera"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {visibility === "EXTRA" && (
            <div>
              <label className="mb-1 block text-sm text-[color:var(--muted)]">Copy por defecto (opcional)</label>
              <textarea
                className="w-full resize-none rounded-md bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)] outline-none ring-1 ring-[color:var(--surface-border)] focus:ring-[color:var(--ring)]"
                rows={3}
                value={defaultCopy}
                onChange={(e) => setDefaultCopy(e.target.value)}
              />
            </div>
          )}

          {errorMsg && <p className="text-sm text-[color:var(--danger)]">{errorMsg}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md px-3 py-2 text-sm text-[color:var(--muted)] hover:bg-[color:var(--surface-2)]"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-md bg-[color:var(--brand-strong)] px-4 py-2 text-sm font-medium text-[color:var(--surface-0)] hover:bg-[color:var(--brand)] disabled:opacity-60"
              disabled={loading}
            >
              {loading
                ? mode === "edit"
                  ? "Guardando cambios…"
                  : "Guardando…"
                : mode === "edit"
                ? "Guardar cambios"
                : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
