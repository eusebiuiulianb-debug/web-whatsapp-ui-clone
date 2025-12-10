import type { FanTone, ManagerObjective } from "../types/manager";

const PROMPTS: Record<ManagerObjective, Partial<Record<FanTone, string>>> = {
  renovacion: {
    suave:
      "Dame 2 opciones de mensaje claros y profesionales para renovar a un fan cuyo acceso termina en breve. Prioriza urgencia sin sonar agresivo y recuerda los beneficios que mantiene si renueva.",
    intimo:
      "Escribe 2 mensajes para renovar a un fan que caduca pronto. Tono cercano e íntimo, recordando qué le ha aportado y ofreciendo cerrar la renovación hoy mismo.",
  },
  reactivar_fan_frio: {
    intimo:
      "Dame 2 mensajes para reactivar a un fan que antes era activo y ahora casi no responde. Tono íntimo y cuidado, mezcla curiosidad genuina por su vida con una propuesta suave para retomar.",
  },
  ofrecer_extra: {
    intimo:
      "Propón 2 mensajes para ofrecer un extra personalizado a un fan que suele responder bien. Tono íntimo, deja claro que es algo alineado con lo que suele pedir y que es fácil aceptarlo.",
  },
  llevar_a_mensual: {
    picante:
      "Redacta 2 mensajes con un punto más juguetón para invitar a un fan muy implicado a pasar al plan mensual. Resalta que recibirá algo especial cada semana y que no tendrá que pedirlo cada vez.",
  },
  bienvenida: {},
  romper_hielo: {},
};

export function getManagerPromptTemplate({
  tone,
  objective,
}: {
  tone: FanTone;
  objective: ManagerObjective;
}): string | null {
  const byTone = PROMPTS[objective];
  if (!byTone) return null;
  return byTone[tone] || byTone.intimo || null;
}
