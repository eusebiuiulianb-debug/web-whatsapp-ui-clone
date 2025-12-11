import type { Conversation } from "../types/Conversation";
import type { FanTone, ManagerObjective } from "../types/manager";

type FanSummaryForPrompt = Pick<
  Conversation,
  | "contactName"
  | "extrasCount"
  | "daysLeft"
  | "customerTier"
  | "isHighPriority"
  | "lifetimeSpend"
  | "extrasSpentTotal"
>;

function formatFanDescriptor(fan: FanSummaryForPrompt) {
  const name = (fan.contactName || "").trim() || "este fan";
  const isVip = fan.isHighPriority || fan.customerTier === "vip";
  const extrasCount = typeof fan.extrasCount === "number" ? fan.extrasCount : null;
  const extrasLabel =
    extrasCount && extrasCount > 0
      ? `${extrasCount} extra${extrasCount === 1 ? "" : "s"}`
      : null;
  const spend = typeof fan.extrasSpentTotal === "number" ? Math.round(fan.extrasSpentTotal) : null;
  const daysLeft = typeof fan.daysLeft === "number" ? fan.daysLeft : null;
  const descriptors: string[] = [];
  if (isVip) descriptors.push("fan VIP");
  if (extrasLabel) descriptors.push(`ha comprado ${extrasLabel}`);
  if (!extrasLabel && spend && spend > 0) descriptors.push(`ha gastado ${spend} € en extras`);
  if (typeof daysLeft === "number" && daysLeft >= 0) {
    descriptors.push(daysLeft === 0 ? "le queda 0 días" : `le quedan ${daysLeft} días de acceso`);
  }
  return { name, descriptor: descriptors.length ? `, ${descriptors.join(" y ")}` : "" };
}

const PROMPTS: Record<ManagerObjective, Partial<Record<FanTone, (fan: FanSummaryForPrompt) => string>>> = {
  renovacion: {
    suave: (fan) => {
      const { name, descriptor } = formatFanDescriptor(fan);
      return `Escribe 2 mensajes para renovar a ${name}${descriptor}. Tono suave y cero presión: recuerda beneficios y ofrece ayudarle a cerrar cuando le venga bien.`;
    },
    intimo: (fan) => {
      const { name, descriptor } = formatFanDescriptor(fan);
      return `Prepara 2 mensajes cercanos para renovar a ${name}${descriptor}. Sé directo con que caduca pronto, recuerda qué le aportó y propone cerrarlo hoy.`;
    },
    picante: (fan) => {
      const { name, descriptor } = formatFanDescriptor(fan);
      return `Dame 2 mensajes con chispa para renovar a ${name}${descriptor}. Resalta que si sigue tendrá contenido especial y que puedes activarlo ya mismo.`;
    },
  },
  reactivar_fan_frio: {
    suave: (fan) => {
      const { name } = formatFanDescriptor(fan);
      return `Escribe 2 mensajes para reactivar a ${name}, que antes respondía y ahora casi no. Tono suave, curiosidad genuina por su vida y propuesta ligera para retomar.`;
    },
    intimo: (fan) => {
      const { name } = formatFanDescriptor(fan);
      return `Dame 2 mensajes íntimos para reactivar a ${name}, que solía ser activo y ahora está frío. Cercanía + curiosidad por lo que vive, ofreciendo retomar con algo sencillo.`;
    },
    picante: (fan) => {
      const { name } = formatFanDescriptor(fan);
      return `Redacta 2 mensajes con chispa para recuperar a ${name}, que antes se enganchaba y ahora está frío. Guiño juguetón + excusa sencilla para que vuelva a escribir.`;
    },
  },
  ofrecer_extra: {
    suave: (fan) => {
      const { name, descriptor } = formatFanDescriptor(fan);
      return `Escribe 2 mensajes profesionales para ofrecer un extra a ${name}${descriptor}. Tono suave: valor añadido sobre lo que ya recibe y fácil de aceptar.`;
    },
    intimo: (fan) => {
      const { name, descriptor } = formatFanDescriptor(fan);
      return `Dame 2 mensajes íntimos para ofrecer un extra a ${name}${descriptor}. Haz sentir que es personalizado y alineado con lo que suele pedir, con invitación clara.`;
    },
    picante: (fan) => {
      const { name, descriptor } = formatFanDescriptor(fan);
      return `Propón 2 mensajes con toque picante para ${name}${descriptor}, ofreciendo un extra especial y distinto. Mantén calidez y deja clara la acción para aceptarlo.`;
    },
  },
  llevar_a_mensual: {
    suave: (fan) => {
      const { name, descriptor } = formatFanDescriptor(fan);
      return `Escribe 2 mensajes claros para invitar a ${name}${descriptor} a pasar a mensual. Tono suave: no pedir pieza a pieza y recibir contenido cuidado semanal.`;
    },
    intimo: (fan) => {
      const { name, descriptor } = formatFanDescriptor(fan);
      return `Redacta 2 mensajes cercanos para que ${name}${descriptor} pase a mensual. Destaca seguimiento continuo y piezas preparadas sin pedirlas.`;
    },
    picante: (fan) => {
      const { name, descriptor } = formatFanDescriptor(fan);
      return `Dame 2 mensajes con chispa para que ${name}${descriptor} pase a mensual. Resalta que cada semana recibiría algo especial y más trabajado sin tener que pedirlo.`;
    },
  },
  bienvenida: {},
  romper_hielo: {},
};

export function getManagerPromptTemplate({
  tone,
  objective,
  fan,
}: {
  tone: FanTone;
  objective: ManagerObjective;
  fan: FanSummaryForPrompt;
}): string | null {
  const byTone = PROMPTS[objective];
  if (!byTone) return null;
  const builder = byTone[tone] || byTone.intimo;
  return builder ? builder(fan) : null;
}
