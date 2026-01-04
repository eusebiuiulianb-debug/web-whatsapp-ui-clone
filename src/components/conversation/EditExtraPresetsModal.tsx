import { useState } from "react";
import {
  DEFAULT_EXTRA_PRESETS,
  ExtraPresetKey,
  ExtraPresetsConfig,
} from "../../config/extrasPresets";

type Props = {
  presets: ExtraPresetsConfig;
  onSave: (next: ExtraPresetsConfig) => void;
  onClose: () => void;
};

const order: ExtraPresetKey[] = [
  "PHOTO_DAY",
  "PHOTO_NIGHT",
  "VIDEO_DAY",
  "VIDEO_NIGHT",
  "COMBO_DAY",
  "COMBO_NIGHT",
];

const labels: Record<ExtraPresetKey, string> = {
  PHOTO_DAY: "Foto extra – Día",
  PHOTO_NIGHT: "Foto extra – Noche",
  VIDEO_DAY: "Vídeo extra – Día",
  VIDEO_NIGHT: "Vídeo extra – Noche",
  COMBO_DAY: "Combo – Día",
  COMBO_NIGHT: "Combo – Noche",
};

export function EditExtraPresetsModal({ presets, onSave, onClose }: Props) {
  const [local, setLocal] = useState<ExtraPresetsConfig>(presets);
  const [saving, setSaving] = useState(false);

  function updateField(key: ExtraPresetKey, value: string) {
    setLocal((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    onSave(local);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--surface-overlay)]">
      <div className="w-full max-w-3xl rounded-xl bg-[color:var(--surface-1)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[color:var(--text)]">Editar textos de contenido extra</h2>
          <button
            type="button"
            className="text-sm text-[color:var(--muted)] hover:text-[color:var(--text)]"
            onClick={onClose}
            disabled={saving}
          >
            Cerrar
          </button>
        </div>

        <div className="mb-2 text-[11px] text-[color:var(--muted)]">
          Puedes usar el placeholder {"{precio}"} en cada texto; se sustituirá por el importe sugerido del tier.
        </div>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {order.map((key) => (
            <section
              key={key}
              className="rounded-lg bg-[color:var(--surface-2)] p-4 ring-1 ring-[color:var(--surface-border)]"
            >
              <h3 className="mb-2 text-sm font-semibold text-[color:var(--text)]">{labels[key]}</h3>
              <textarea
                className="w-full rounded-md bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--text)] outline-none ring-1 ring-[color:var(--surface-border)] focus:ring-[color:var(--ring)]"
                rows={4}
                value={local[key]}
                onChange={(e) => updateField(key, e.target.value)}
              />
            </section>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md px-3 py-2 text-sm text-[color:var(--muted)] hover:bg-[color:var(--surface-2)]"
            onClick={() => setLocal(DEFAULT_EXTRA_PRESETS)}
            disabled={saving}
          >
            Restaurar por defecto
          </button>
          <button
            type="button"
            className="rounded-md px-3 py-2 text-sm text-[color:var(--muted)] hover:bg-[color:var(--surface-2)]"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-md bg-[color:var(--brand-strong)] px-4 py-2 text-sm font-medium text-[color:var(--surface-0)] hover:bg-[color:var(--brand)] disabled:opacity-60"
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
