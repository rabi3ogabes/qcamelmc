// One place for "what day is it in Qatar" (Asia/Qatar, UTC+3, no daylight saving).

export const QATAR_TZ = "Asia/Qatar";
const OFFSET_MS = 3 * 60 * 60 * 1000;

/** Calendar parts (month 0-based) of an instant as seen in Qatar. */
export function qatarParts(input: string | Date) {
  const shifted = new Date(new Date(input).getTime() + OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/** "YYYY-MM-DD" of the Qatar calendar day containing this instant. */
export function qatarDayKey(input: string | Date): string {
  const { year, month, day } = qatarParts(input);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** UTC instant of Qatar midnight starting the day that contains `input`. */
export function qatarDayStart(input: string | Date = new Date()): Date {
  const { year, month, day } = qatarParts(input);
  return new Date(Date.UTC(year, month, day) - OFFSET_MS);
}

/** UTC instant of the next Qatar midnight (exclusive end of the day). */
export function qatarDayEnd(input: string | Date = new Date()): Date {
  return new Date(qatarDayStart(input).getTime() + 24 * 60 * 60 * 1000);
}

/** Arabic date (Latin digits) in Qatar time. */
export function formatQatarDate(input: string | Date, options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" }, locale = "ar-u-nu-latn") {
  return new Date(input).toLocaleDateString(locale, { ...options, timeZone: QATAR_TZ });
}
