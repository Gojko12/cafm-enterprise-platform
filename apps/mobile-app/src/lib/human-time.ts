import { formatDateRangeDDMMYYYY, formatDateTimeDDMMYYYY } from "@cafm/shared-schema";

export function formatHumanDateTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso), end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return "Invalid time range";
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  const duration = `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
  return `${formatDateRangeDDMMYYYY(start, end)} (${duration})`;
}

const dayKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

export function formatPlannedRange(startIso: string, endIso: string, now: Date = new Date()): string {
  const start = new Date(startIso), end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return "Invalid date range";
  const hours = ((end.getTime() - start.getTime()) / 3600000).toFixed(1);
  return `${formatDateRangeDDMMYYYY(start, end)} (${hours}h)`;
}

export function formatShortDateTime(iso: string | undefined): string {
  if (!iso) return "";
  return formatDateTimeDDMMYYYY(iso);
}
