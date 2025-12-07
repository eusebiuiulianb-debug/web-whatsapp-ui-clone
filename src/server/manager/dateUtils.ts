import { differenceInDays, addDays, isValid } from "date-fns";

/**
 * Diferencia de días entre dos fechas (a - b).
 * Resultado positivo si 'a' está después de 'b'.
 * Devuelve null si alguna fecha es nula o inválida.
 */
export function daysBetween(a?: Date | null, b?: Date | null): number | null {
  if (!a || !b) return null;
  if (!isValid(a) || !isValid(b)) return null;
  return differenceInDays(a, b);
}

/**
 * Días desde HOY hasta 'date'.
 * Resultado positivo si la fecha está en el futuro, negativo si ya pasó.
 * Devuelve null si no hay fecha o es inválida.
 */
export function daysFromNow(date?: Date | null): number | null {
  if (!date || !isValid(date)) return null;
  return differenceInDays(date, new Date());
}

/**
 * Devuelve una nueva fecha sumando 'days' días a 'date'.
 * Devuelve null si la fecha de entrada es nula o inválida.
 */
export function addDaysFrom(date?: Date | null, days: number = 0): Date | null {
  if (!date || !isValid(date)) return null;
  return addDays(date, days);
}
