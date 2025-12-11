import type { FanTone, ManagerObjective as BaseManagerObjective } from "../types/manager";

export type ManagerTone = FanTone;
export type ManagerObjective = Extract<
  BaseManagerObjective,
  "renovacion" | "reactivar_fan_frio" | "ofrecer_extra" | "llevar_a_mensual"
>;

export interface FanSummaryForAutopilot {
  name: string;
  isVip: boolean;
  extrasCount: number;
  daysLeft: number | null;
  totalSpent: number;
}

function formatDescriptor(fan: FanSummaryForAutopilot) {
  const bits: string[] = [];
  if (fan.isVip) bits.push("fan VIP");
  if (fan.extrasCount > 0) bits.push(`ha comprado ${fan.extrasCount} extra${fan.extrasCount === 1 ? "" : "s"}`);
  if (!fan.extrasCount && fan.totalSpent > 0) bits.push(`ha gastado ${Math.round(fan.totalSpent)} €`);
  if (fan.daysLeft !== null && fan.daysLeft >= 0) {
    bits.push(fan.daysLeft === 0 ? "le queda 0 días de acceso" : `le quedan ${fan.daysLeft} días de acceso`);
  }
  return bits.length ? ` (${bits.join(" · ")})` : "";
}

function buildDraft({
  tone,
  objective,
  fan,
}: {
  tone: ManagerTone;
  objective: ManagerObjective;
  fan: FanSummaryForAutopilot;
}) {
  const name = fan.name?.trim() || "este fan";
  const descriptor = formatDescriptor(fan);

  switch (objective) {
    case "reactivar_fan_frio":
      if (tone === "picante") {
        return `Hola ${name}${descriptor}, echo de menos tus mensajes. ¿Te mando algo más travieso para que volvamos a hablar? Dímelo y te preparo algo especial ahora mismo.`;
      }
      if (tone === "suave") {
        return `Hola ${name}${descriptor}, hace tiempo que no hablamos y me gustaría saber cómo sigues. Si quieres retomar con algo sencillo, dime qué necesitas y lo preparo.`;
      }
      return `Hola ${name}${descriptor}, me encantaría que retomáramos. Cuéntame en una frase qué te apetecería ahora y te mando algo pensado para ti.`;
    case "ofrecer_extra":
      if (tone === "picante") {
        return `${name}${descriptor}, tengo un extra especial y más intenso pensado para ti. Si te apetece, dímelo y te lo envío ahora mismo.`;
      }
      if (tone === "suave") {
        return `${name}${descriptor}, puedo prepararte un extra muy alineado con lo que te ha gustado hasta ahora. ¿Te interesa que te envíe opciones y eliges?`;
      }
      return `${name}${descriptor}, tengo un extra personalizado para ti. Puedo enviarte hoy algo que encaje con lo que sueles pedirme. ¿Te lo paso?`;
    case "llevar_a_mensual":
      if (tone === "picante") {
        return `${name}${descriptor}, en vez de ir pieza a pieza puedo cuidarte cada semana con contenido más trabajado y sugerente. ¿Quieres que te pase el enlace para pasar a mensual?`;
      }
      if (tone === "suave") {
        return `${name}${descriptor}, podemos pasar a mensual para que recibas contenido cuidado cada semana sin tener que pedirlo. ¿Quieres que te envíe el enlace?`;
      }
      return `${name}${descriptor}, para que no tengas que pedir cada extra, puedo darte acceso mensual y enviarte algo especial cada semana. ¿Te paso el enlace y lo activamos hoy?`;
    case "renovacion":
    default:
      if (tone === "picante") {
        return `${name}${descriptor}, tu acceso está por caducar. Si renuevas ahora puedo enviarte contenido más personal y picante sin pausas. ¿Te paso el enlace?`;
      }
      if (tone === "suave") {
        return `${name}${descriptor}, queda poco para que caduque tu acceso. Si quieres seguir, te paso el enlace para renovar cuando te vaya bien.`;
      }
      return `${name}${descriptor}, tu acceso termina pronto. Si te ha servido, te envío el enlace para renovar y seguimos trabajando juntos sin interrupciones.`;
  }
}

export async function getAutopilotDraft(params: {
  tone: ManagerTone;
  objective: ManagerObjective;
  fan: FanSummaryForAutopilot;
}): Promise<string> {
  // Simulación frontend: se devolverá más adelante con IA real.
  return Promise.resolve(buildDraft(params));
}
