export type PackCode = "trial" | "monthly" | "special";

export const PACKS: Record<
  PackCode,
  { code: PackCode; name: string; shortLabel: string; description: string; price: number; durationDays: number }
> = {
  trial: {
    code: "trial",
    name: "Prueba 7 días",
    shortLabel: "Prueba 7 días",
    description: "Primer contacto + 3 audios base personalizados.",
    price: 0,
    durationDays: 7,
  },
  monthly: {
    code: "monthly",
    name: "Suscripción mensual",
    shortLabel: "Suscripción mensual",
    description: "Acceso al chat 1:1 y contenido nuevo cada semana.",
    price: 25,
    durationDays: 30,
  },
  special: {
    code: "special",
    name: "Pack especial pareja",
    shortLabel: "Pack especial pareja",
    description: "Sesión intensiva + material extra para pareja.",
    price: 49,
    durationDays: 30,
  },
};
