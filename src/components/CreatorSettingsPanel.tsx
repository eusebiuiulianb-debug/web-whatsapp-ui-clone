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

  useEffect(() => {
    if (isOpen) {
      setFormData(config);
    }
  }, [config, isOpen]);

  if (!isOpen) return null;

  function handleSave() {
    setConfig(formData);
    onClose();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.55)] px-4">
      <div className="w-full max-w-3xl bg-[#111b21] text-white rounded-lg shadow-xl border border-[rgba(134,150,160,0.2)] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(134,150,160,0.2)]">
          <h2 className="text-lg font-semibold">Ajustes del creador</h2>
          <button onClick={onClose} className="text-[#aebac1] hover:text-white">
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-6 px-6 py-4">
          <section className="flex flex-col gap-3">
            <div>
              <label className="block text-sm text-[#aebac1] mb-1">Nombre del creador</label>
              <input
                className="w-full bg-[#1f2c33] border border-[rgba(134,150,160,0.3)] rounded-md px-3 py-2 text-white"
                value={formData.creatorName}
                onChange={e => setFormData(prev => ({ ...prev, creatorName: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm text-[#aebac1] mb-1">Subtítulo corto (header)</label>
              <input
                className="w-full bg-[#1f2c33] border border-[rgba(134,150,160,0.3)] rounded-md px-3 py-2 text-white"
                value={formData.creatorSubtitle}
                onChange={e => setFormData(prev => ({ ...prev, creatorSubtitle: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm text-[#aebac1] mb-1">Descripción larga (página pública)</label>
              <textarea
                className="w-full bg-[#1f2c33] border border-[rgba(134,150,160,0.3)] rounded-md px-3 py-2 text-white h-24"
                value={formData.creatorDescription}
                onChange={e => setFormData(prev => ({ ...prev, creatorDescription: e.target.value }))}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-md font-semibold">Respuestas rápidas</h3>
            <div>
              <label className="block text-sm text-[#aebac1] mb-1">Saludo rápido</label>
              <textarea
                className="w-full bg-[#1f2c33] border border-[rgba(134,150,160,0.3)] rounded-md px-3 py-2 text-white h-20"
                value={formData.quickReplies.saludoRapido}
                onChange={e => updateQuickReply("saludoRapido", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-[#aebac1] mb-1">Pack bienvenida</label>
              <textarea
                className="w-full bg-[#1f2c33] border border-[rgba(134,150,160,0.3)] rounded-md px-3 py-2 text-white h-20"
                value={formData.quickReplies.packBienvenida}
                onChange={e => updateQuickReply("packBienvenida", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-[#aebac1] mb-1">Enlace suscripción</label>
              <textarea
                className="w-full bg-[#1f2c33] border border-[rgba(134,150,160,0.3)] rounded-md px-3 py-2 text-white h-20"
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
                className="flex flex-col gap-2 bg-[#0c1317] border border-[rgba(134,150,160,0.2)] rounded-lg p-3"
              >
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-[#aebac1]">Nombre</label>
                  <input
                    className="w-full bg-[#1f2c33] border border-[rgba(134,150,160,0.3)] rounded-md px-3 py-2 text-white"
                    value={pack.name}
                    onChange={e => updatePack(index, "name", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-[#aebac1]">Precio</label>
                  <input
                    className="w-full bg-[#1f2c33] border border-[rgba(134,150,160,0.3)] rounded-md px-3 py-2 text-white"
                    value={pack.price}
                    onChange={e => updatePack(index, "price", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-[#aebac1]">Descripción</label>
                  <textarea
                    className="w-full bg-[#1f2c33] border border-[rgba(134,150,160,0.3)] rounded-md px-3 py-2 text-white h-20"
                    value={pack.description}
                    onChange={e => updatePack(index, "description", e.target.value)}
                  />
                </div>
              </div>
            ))}
          </section>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[rgba(134,150,160,0.2)]">
          <button
            type="button"
            className="px-3 py-2 rounded-md border border-[rgba(134,150,160,0.3)] text-[#aebac1] hover:text-white"
            onClick={handleReset}
          >
            Restablecer valores por defecto
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-md bg-[#2a3942] text-white hover:bg-[#3b4a54]"
            onClick={handleSave}
          >
            Guardar cambios
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-md bg-[#53bdeb] text-[#0b141a] font-semibold hover:bg-[#5ec7f5]"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
