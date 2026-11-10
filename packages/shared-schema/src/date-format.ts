const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_DATE_PATTERN = /^(\d{2})-(\d{2})-(\d{4})$/;
const DISPLAY_DATE_TIME_PATTERN = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/;

function isValidParts(year: number, month: number, day: number): boolean {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}

function dateParts(value: string | Date): [number, number, number] | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return [value.getFullYear(), value.getMonth() + 1, value.getDate()];
  }
  const match = DATE_ONLY_PATTERN.exec(value);
  if (match) {
    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText), month = Number(monthText), day = Number(dayText);
    return isValidParts(year, month, day) ? [year, month, day] : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? [parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()] : null;
}

function formatParts([year, month, day]: [number, number, number]): string {
  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${String(year).padStart(4, "0")}`;
}

function timeParts(value: string | Date): [number, number] | null {
  if (typeof value === "string" && DATE_ONLY_PATTERN.test(value)) return [0, 0];
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return [parsed.getHours(), parsed.getMinutes()];
}

function isDateOnly(value: string | Date): boolean {
  return typeof value === "string" && DATE_ONLY_PATTERN.test(value);
}

export function formatDateDDMMYYYY(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "";
  const parts = dateParts(value);
  return parts ? formatParts(parts) : "Invalid date";
}

export function formatDateTimeDDMMYYYY(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "";
  const parts = dateParts(value);
  const time = timeParts(value);
  if (!parts || !time) return "Invalid date";
  return `${formatParts(parts)} ${String(time[0]).padStart(2, "0")}:${String(time[1]).padStart(2, "0")}`;
}

export function formatDateRangeDDMMYYYY(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
): string {
  if (start == null || start === "" || end == null || end === "") return "";
  const startParts = dateParts(start), endParts = dateParts(end);
  if (!startParts || !endParts) return "Invalid date range";
  const sameDay = startParts.every((part, index) => part === endParts[index]);
  if (sameDay) {
    return isDateOnly(start) && isDateOnly(end)
      ? formatParts(startParts)
      : `${formatParts(startParts)} ${formatTime(timeParts(start)!)}–${formatTime(timeParts(end)!)}`;
  }
  return isDateOnly(start) && isDateOnly(end)
    ? `${formatParts(startParts)} – ${formatParts(endParts)}`
    : `${formatDateTimeDDMMYYYY(start)} – ${formatDateTimeDDMMYYYY(end)}`;
}

function formatTime(value: [number, number] | null): string {
  if (!value) return "Invalid time";
  return `${String(value[0]).padStart(2, "0")}:${String(value[1]).padStart(2, "0")}`;
}

export function parseDateDDMMYYYY(value: string): string | null {
  const match = DISPLAY_DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText), month = Number(monthText), year = Number(yearText);
  if (!isValidParts(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDateTimeDDMMYYYY(value: string): string | null {
  const match = DISPLAY_DATE_TIME_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, dayText, monthText, yearText, hourText, minuteText] = match;
  const day = Number(dayText), month = Number(monthText), year = Number(yearText);
  const hour = Number(hourText), minute = Number(minuteText);
  if (!isValidParts(year, month, day) || hour > 23 || minute > 59) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
