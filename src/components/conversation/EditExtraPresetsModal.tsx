import { useState } from "react";
import { ExtraPreset, ExtraPresetKey } from "../../config/extraPresets";

type PresetsRecord = Record<ExtraPresetKey, ExtraPreset>;

type Props = {
  presets: PresetsRecord;
  onSave: (next: PresetsRecord) => void;
  onClose: () => void;
};

const order: ExtraPresetKey[] = ["PHOTO", "VIDEO", "COMBO"];

const labels: Record<ExtraPresetKey, string> = {
  PHOTO: "Foto extra",
  VIDEO: "Vídeo extra",
  COMBO: "Combo foto + vídeo",
};

export function EditExtraPresetsModal({ presets, onSave, onClose }: Props) {
  const [local, setLocal] = useState<PresetsRecord>(presets);
  const [saving, setSaving] = useState(false);

  function updateField(key: ExtraPresetKey, field: keyof ExtraPreset, value: string) {
    setLocal((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  }

  async function handleSave() {
    setSaving(true);
    onSave(local);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-3xl rounded-xl bg-neutral-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-50">Editar textos de contenido extra</h2>
          <button
            type="button"
            className="text-sm text-neutral-400 hover:text-neutral-200"
            onClick={onClose}
            disabled={saving}
          >
            Cerrar
          </button>
        </div>

        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          {order.map((key) => {
            const preset = local[key];
            return (
              <section
                key={key}
                className="rounded-lg bg-neutral-950/40 p-4 ring-1 ring-neutral-800"
              >
                <h3 className="mb-2 text-sm font-semibold text-neutral-50">{labels[key]}</h3>

                <div className="mb-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-neutral-300">Título de la tarjeta</label>
                    <input
                      className="w-full rounded-md bg-neutral-800 px-3 py-2 text-sm text-neutral-50 outline-none ring-1 ring-neutral-700 focus:ring-emerald-500"
                      value={preset.title}
                      onChange={(e) => updateField(key, "title", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-neutral-300">Subtítulo</label>
                    <input
                      className="w-full rounded-md bg-neutral-800 px-3 py-2 text-sm text-neutral-50 outline-none ring-1 ring-neutral-700 focus:ring-emerald-500"
                      value={preset.subtitle}
                      onChange={(e) => updateField(key, "subtitle", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-neutral-300">Mensaje que se envía en el chat</label>
                  <textarea
                    className="w-full rounded-md bg-neutral-800 px-3 py-2 text-sm text-neutral-50 outline-none ring-1 ring-neutral-700 focus:ring-emerald-500"
                    rows={4}
                    value={preset.message}
                    onChange={(e) => updateField(key, "message", e.target.value)}
                  />
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-60"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
