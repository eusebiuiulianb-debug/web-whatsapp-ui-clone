type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const DEFAULT_TIME_ZONE = "Europe/Madrid";

function getDatePartsInTimeZone(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getDatePartsInTimeZone(date, timeZone);
  const utcTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return date.getTime() - utcTime;
}

export function startOfDayInTimeZone(date: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): Date {
  const parts = getDatePartsInTimeZone(date, timeZone);
  const utcMidnight = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
  const offset = getTimeZoneOffsetMs(utcMidnight, timeZone);
  return new Date(utcMidnight.getTime() + offset);
}

export function daysAgoInTimeZone(
  days: number,
  date: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE
): Date {
  const parts = getDatePartsInTimeZone(date, timeZone);
  const utcMidnight = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - days, 0, 0, 0));
  const offset = getTimeZoneOffsetMs(utcMidnight, timeZone);
  return new Date(utcMidnight.getTime() + offset);
}

export const DEFAULT_CREATOR_TIME_ZONE = DEFAULT_TIME_ZONE;
