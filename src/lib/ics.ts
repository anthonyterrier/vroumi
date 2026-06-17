// Génération minimale de fichiers iCalendar (.ics) pour les échéances.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format date "à la journée" (VALUE=DATE) : YYYYMMDD. */
function icsDate(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** Horodatage UTC pour DTSTAMP : YYYYMMDDTHHMMSSZ. */
function icsStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function escape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * Construit un événement « toute la journée » avec un rappel 7 jours avant.
 * `uid` doit être stable et unique (id de l'entrée).
 */
export function buildIcsEvent({
  uid,
  date,
  title,
  description,
}: {
  uid: string;
  date: Date;
  title: string;
  description?: string;
}): string {
  const start = icsDate(date);
  const end = icsDate(new Date(date.getTime() + 24 * 60 * 60 * 1000));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vroumi//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@vroumi`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escape(title)}`,
    description ? `DESCRIPTION:${escape(description)}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-P7D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escape(title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n");
}
