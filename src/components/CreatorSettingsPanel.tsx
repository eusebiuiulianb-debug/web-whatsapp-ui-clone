import { useEffect, useState } from "react";
import {
  CreatorConfig,
  DEFAULT_CREATOR_CONFIG,
} from "../config/creatorConfig";
import { useCreatorConfig } from "../context/CreatorConfigContext";

interface CreatorSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreatorSettingsPanel({ isOpen, onClose }: CreatorSettingsPanelProps) {
  const { config, setConfig, resetConfig } = useCreatorConfig();
  const [formData, setFormData] = useState<CreatorConfig>(config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setFormData(config);
      setError("");
    }
  }, [config, isOpen]);

  if (!isOpen) return null;

  async function handleSave() {
    try {
      setSaving(true);
      setError("");
      setConfig(formData);
      await fetch("/api/creator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.creatorName,
          subtitle: formData.creatorSubtitle,
          description: formData.creatorDescription,
          avatarUrl: formData.avatarUrl || "",
        }),
      });
      onClose();
    } catch (_err) {
      setError("No se pudieron guardar en el servidor. Los cambios locales se han aplicado.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setFormData(DEFAULT_CREATOR_CONFIG);
    setConfig(DEFAULT_CREATOR_CONFIG);
  }

  function updateQuickReply(key: keyof CreatorConfig["quickReplies"], value: string) {
    setFormData(prev => ({
      ...prev,
      quickReplies: {
        ...prev.quickReplies,
        [key]: value,
      },
    }));
  }

  function updatePack(index: number, field: "name" | "price" | "description", value: string) {
    setFormData(prev => {
      const updated = [...prev.packs];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, packs: updated };
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--surface-overlay)] px-4">
      <div className="w-full max-w-3xl bg-[color:var(--surface-1)] text-[color:var(--text)] rounded-lg shadow-xl border border-[color:var(--surface-border)] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--surface-border)]">
          <h2 className="text-lg font-semibold">Ajustes del creador</h2>
          <button onClick={onClose} className="text-[color:var(--muted)] hover:text-[color:var(--text)]">
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-6 px-6 py-4">
          {error && <div className="text-sm text-[color:var(--danger)]">{error}</div>}
          <section className="flex flex-col gap-3">
            <div>
              <label className="block text-sm text-[color:var(--muted)] mb-1">Nombre del creador</label>
              <input
                className="w-full bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] rounded-md px-3 py-2 text-[color:var(--text)]"
                value={formData.creatorName}
                onChange={e => setFormData(prev => ({ ...prev, creatorName: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm text-[color:var(--muted)] mb-1">Subtítulo corto (header)</label>
              <input
                className="w-full bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] rounded-md px-3 py-2 text-[color:var(--text)]"
                value={formData.creatorSubtitle}
                onChange={e => setFormData(prev => ({ ...prev, creatorSubtitle: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm text-[color:var(--muted)] mb-1">Avatar (URL)</label>
              <input
                className="w-full bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] rounded-md px-3 py-2 text-[color:var(--text)]"
                value={formData.avatarUrl || ""}
                placeholder="https://..."
                onChange={e => setFormData(prev => ({ ...prev, avatarUrl: e.target.value }))}
              />
              <p className="text-[12px] text-[color:var(--muted)] mt-1">Se usa en el header, bio-link y perfil público.</p>
            </div>
            <div>
              <label className="block text-sm text-[color:var(--muted)] mb-1">Descripción larga (página pública)</label>
              <textarea
                className="w-full bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] rounded-md px-3 py-2 text-[color:var(--text)] h-24"
                value={formData.creatorDescription}
                onChange={e => setFormData(prev => ({ ...prev, creatorDescription: e.target.value }))}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-md font-semibold">Respuestas rápidas</h3>
            <div>
              <label className="block text-sm text-[color:var(--muted)] mb-1">Saludo rápido</label>
              <textarea
                className="w-full bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] rounded-md px-3 py-2 text-[color:var(--text)] h-20"
                value={formData.quickReplies.saludoRapido}
                onChange={e => updateQuickReply("saludoRapido", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-[color:var(--muted)] mb-1">Pack bienvenida</label>
              <textarea
                className="w-full bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] rounded-md px-3 py-2 text-[color:var(--text)] h-20"
                value={formData.quickReplies.packBienvenida}
                onChange={e => updateQuickReply("packBienvenida", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-[color:var(--muted)] mb-1">Enlace suscripción</label>
              <textarea
                className="w-full bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] rounded-md px-3 py-2 text-[color:var(--text)] h-20"
                value={formData.quickReplies.enlaceSuscripcion}
                onChange={e => updateQuickReply("enlaceSuscripcion", e.target.value)}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-md font-semibold">Packs</h3>
            {formData.packs.map((pack, index) => (
              <div
                key={pack.id}
                className="flex flex-col gap-2 bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] rounded-lg p-3"
              >
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-[color:var(--muted)]">Nombre</label>
                  <input
                    className="w-full bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] rounded-md px-3 py-2 text-[color:var(--text)]"
                    value={pack.name}
                    onChange={e => updatePack(index, "name", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-[color:var(--muted)]">Precio</label>
                  <input
                    className="w-full bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] rounded-md px-3 py-2 text-[color:var(--text)]"
                    value={pack.price}
                    onChange={e => updatePack(index, "price", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-[color:var(--muted)]">Descripción</label>
                  <textarea
                    className="w-full bg-[color:var(--surface-2)] border border-[color:var(--surface-border)] rounded-md px-3 py-2 text-[color:var(--text)] h-20"
                    value={pack.description}
                    onChange={e => updatePack(index, "description", e.target.value)}
                  />
                </div>
              </div>
            ))}
          </section>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[color:var(--surface-border)]">
          <button
            type="button"
            className="px-3 py-2 rounded-md border border-[color:var(--surface-border)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
            onClick={handleReset}
          >
            Restablecer valores por defecto
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-md bg-[color:var(--surface-2)] text-[color:var(--text)] hover:bg-[color:var(--surface-1)]"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-md bg-[color:var(--brand-strong)] text-[color:var(--text)] font-semibold hover:bg-[color:var(--brand)]"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
