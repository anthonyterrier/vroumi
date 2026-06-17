import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "d MMM yyyy 'à' HH:mm", { locale: fr });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "d MMMM yyyy", { locale: fr });
}

export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "HH:mm", { locale: fr });
}

/** Libellé relatif convivial : "Aujourd'hui", "Hier", sinon date complète. */
export function formatRelativeDay(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isToday(d)) return "Aujourd'hui";
  if (isYesterday(d)) return "Hier";
  return formatDate(d);
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: fr });
}

/** Valeur d'un <input type="date"> à partir d'une Date. */
export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/** Valeur d'un <input type="datetime-local"> à partir d'une Date (heure locale). */
export function toDatetimeLocalValue(date: Date = new Date()): string {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

/** Formate un kilométrage : 123456 -> "123 456 km". */
export function formatMileage(km: number | null | undefined): string {
  if (km == null) return "—";
  return `${km.toLocaleString("fr-FR")} km`;
}

/**
 * Formate un relevé de compteur selon l'unité du véhicule :
 * "123 456 km" (route) ou "1 234 h" (heures moteur).
 */
export function formatUsage(
  value: number | null | undefined,
  unit: string | null | undefined
): string {
  if (value == null) return "—";
  const u = unit === "HOURS" ? "h" : "km";
  return `${value.toLocaleString("fr-FR")} ${u}`;
}

/** Formate un montant en euros : 49.9 -> "49,90 €". */
export function formatEuro(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return amount.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}
