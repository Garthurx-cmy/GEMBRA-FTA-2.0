import { normalizeName } from "./operational";

export function normalizeInspectionDate(value: any): Date {
  if (!value) return new Date();

  // 1. Firebase Timestamp
  if (value && typeof value.toDate === "function") {
    value = value.toDate();
  } else if (value && typeof value === "object" && value.seconds) {
    value = new Date(value.seconds * 1000);
  }

  // 2. Date instance
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  // 3. String date
  if (typeof value === "string") {
    // Check for "YYYY-MM-DD" style at the beginning
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      return new Date(year, month, day, 12, 0, 0, 0); // mid-day to avoid TZ and DST boundaries
    }
    
    // Check for "DD/MM/YYYY" style
    const matchBR = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (matchBR) {
      const day = parseInt(matchBR[1], 10);
      const month = parseInt(matchBR[2], 10) - 1;
      const year = parseInt(matchBR[3], 10);
      return new Date(year, month, day, 12, 0, 0, 0);
    }

    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (typeof value === "number") {
    return new Date(value);
  }

  return new Date();
}

export function getOperationalWeek(referenceDate?: any): { start: Date; end: Date } {
  const date = normalizeInspectionDate(referenceDate);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  const daysSinceFriday = (d.getDay() - 5 + 7) % 7;
  
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  start.setDate(start.getDate() - daysSinceFriday);

  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
  end.setDate(end.getDate() + 6);

  return { start, end };
}

export function getOperationalWeekFromDateKey(dateKey: string): { start: Date; end: Date } {
  return getOperationalWeek(dateKey);
}

export function getPreviousOperationalWeek(referenceDate?: any): { start: Date; end: Date } {
  const currentWeek = getOperationalWeek(referenceDate);
  const prevDate = new Date(currentWeek.start.getTime());
  prevDate.setDate(prevDate.getDate() - 1); // Go to Thursday before
  return getOperationalWeek(prevDate);
}

export function isDateInsideOperationalWeek(date: any, week: { start: Date; end: Date }): boolean {
  const d = normalizeInspectionDate(date);
  return d.getTime() >= week.start.getTime() && d.getTime() <= week.end.getTime();
}

export function formatDateBR(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatOperationalWeekLabel(week: { start: Date; end: Date }): string {
  return `${formatDateBR(week.start)} até ${formatDateBR(week.end)}`;
}
