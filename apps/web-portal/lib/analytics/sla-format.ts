import type { BaseWorkRequest } from "@cafm/shared-schema";
import { DAY_MS, filterWorkRequests, startOfDayMs, endOfDayMs, dayString, addDaysIso, createdMs, isCancelled, completionMs, dueMs, marginMs, isActiveAt, isOverdueAt, isOverMarginAt, parseStamp, median, average } from "./core";
import type { AnalyticsFilters } from "./core";
// ---------------------------------------------------------------------------
// KPI helpers & CSV export
// ---------------------------------------------------------------------------

export interface SlaKpis {
  onTimePct: number | null;
  withinMarginPct: number | null;
  currentOverdue: BaseWorkRequest[];
  currentOverMargin: BaseWorkRequest[];
}

export function slaKpis(workRequests: BaseWorkRequest[], now: Date): SlaKpis {
  const nowMs = now.getTime();
  const pool = workRequests.filter((wr) => (wr.WR_Type === "PM" || wr.WR_Type === "FJ") && !isCancelled(wr));
  const completed2026 = pool.filter((wr) => {
    const completion = completionMs(wr);
    return completion !== null && completion >= Date.parse("2026-01-01T00:00:00.000Z") && wr.Percentage >= 78;
  });
  const onTime = completed2026.filter((wr) => { const due = dueMs(wr); const done = completionMs(wr)!; return due === null || done <= due; });
  const withinMargin = completed2026.filter((wr) => { const margin = marginMs(wr); const done = completionMs(wr)!; return margin === null || done <= margin; });
  return {
    onTimePct: completed2026.length ? (onTime.length / completed2026.length) * 100 : null,
    withinMarginPct: completed2026.length ? (withinMargin.length / completed2026.length) * 100 : null,
    currentOverdue: pool.filter((wr) => isOverdueAt(wr, nowMs)),
    currentOverMargin: pool.filter((wr) => isOverMarginAt(wr, nowMs)),
  };
}

/** RFC-4180 CSV encoder for the "Export Current Tab" buttons. */
export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const escapeCell = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

export function formatDays(value: number | null): string {
  return value === null ? "—" : value >= 10 ? String(Math.round(value)) : (Math.round(value * 10) / 10).toFixed(1);
}

export function formatPct(value: number | null): string {
  return value === null ? "—" : `${(Math.round(value * 10) / 10).toFixed(1)}%`;
}

export function formatHours(value: number | null): string {
  return value === null ? "—" : `${(Math.round(value * 10) / 10).toFixed(1)}h`;
}
