import type { LocalDateString, Weekday } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function assertDateString(date: string): asserts date is LocalDateString {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`日期必须为 YYYY-MM-DD 格式：${date}`);
  }
}

export function parseDateOnly(date: LocalDateString): Date {
  assertDateString(date);
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateOnly(date: Date): LocalDateString {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayInShanghai(): LocalDateString {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addDays(date: LocalDateString, days: number): LocalDateString {
  const parsed = parseDateOnly(date);
  return formatDateOnly(new Date(parsed.getTime() + days * DAY_MS));
}

export function compareDates(a: LocalDateString, b: LocalDateString): number {
  return parseDateOnly(a).getTime() - parseDateOnly(b).getTime();
}

export function enumerateDateRange(start: LocalDateString, end: LocalDateString): LocalDateString[] {
  if (compareDates(start, end) > 0) {
    return [];
  }

  const dates: LocalDateString[] = [];
  let current = start;
  while (compareDates(current, end) <= 0) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

export function weekdayOf(date: LocalDateString): Weekday {
  return parseDateOnly(date).getUTCDay() as Weekday;
}

export function isRestDate(date: LocalDateString, restWeekdays: Weekday[]): boolean {
  return restWeekdays.includes(weekdayOf(date));
}

export function monthKey(date: LocalDateString): string {
  return date.slice(0, 7);
}

export function startOfIsoWeek(date: LocalDateString): LocalDateString {
  const weekday = weekdayOf(date);
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(date, offset);
}

export function endOfIsoWeek(date: LocalDateString): LocalDateString {
  return addDays(startOfIsoWeek(date), 6);
}

export function clampDate(date: LocalDateString, min: LocalDateString, max: LocalDateString): LocalDateString {
  if (compareDates(date, min) < 0) {
    return min;
  }
  if (compareDates(date, max) > 0) {
    return max;
  }
  return date;
}
