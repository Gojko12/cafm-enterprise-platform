import type { BaseWorkRequest } from "@cafm/shared-schema";

/**
 * Pure, unit-accurate analytics computation engine for the Executive BI dashboard.
 * All functions are deterministic over the provided state, respect the global
 * (building / trade) filters applied by the caller, and expose both aggregate
 * numbers and exact WR drilldown lists for every bucket.
 */

export const DAY_MS = 86_400_000;

export interface AnalyticsFilters {
  buildingId?: string;
  trade?: string;
}

export function filterWorkRequests(workRequests: BaseWorkRequest[], siteId: string, filters: AnalyticsFilters): BaseWorkRequest[] {
  return workRequests.filter((wr) => wr.SiteId === siteId &&
    (!filters.buildingId || wr.bl_id === filters.buildingId) &&
    (!filters.trade || (wr.TradeName ?? wr.TradeId ?? "") === filters.trade));
}

// ---------------------------------------------------------------------------
// Date helpers (UTC-normalised so point-in-time math is consistent everywhere)
// ---------------------------------------------------------------------------

export function parseStamp(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function startOfDayMs(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00.000Z`);
}

export function endOfDayMs(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T23:59:59.999Z`);
}

export function dayString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDaysIso(date: string, days: number): string {
  return dayString(startOfDayMs(date) + days * DAY_MS + DAY_MS / 2);
}

export function createdMs(wr: BaseWorkRequest): number {
  return parseStamp(wr.CreatedDate) ?? startOfDayMs(wr.CreatedDate);
}

export function isCancelled(wr: BaseWorkRequest): boolean {
  return wr.Percentage === 27 || wr.Percentage === 29;
}

/** Completion timestamp: 100% closure, 78% technical completion, or cancellation. */
export function completionMs(wr: BaseWorkRequest): number | null {
  const explicit = parseStamp(wr.ClosedAt) ?? parseStamp(wr.CompletedAt);
  if (explicit !== null) return explicit;
  if (wr.Percentage >= 78 || isCancelled(wr)) {
    return parseStamp(wr.UpdatedAt) ?? parseStamp(wr.updatedAt) ?? endOfDayMs(wr.CreatedDate);
  }
  return null;
}

export function dueMs(wr: BaseWorkRequest): number | null {
  return wr.DueDate ? endOfDayMs(wr.DueDate) : null;
}

/** MarginDate falls back to `DueDate + 7 grace days` when a WR carries none. */
export function marginMs(wr: BaseWorkRequest): number | null {
  if (wr.MarginDate) return endOfDayMs(wr.MarginDate);
  return wr.DueDate ? endOfDayMs(wr.DueDate) + 7 * DAY_MS : null;
}

export function isActiveAt(wr: BaseWorkRequest, atMs: number): boolean {
  if (createdMs(wr) > atMs) return false;
  const completion = completionMs(wr);
  return completion === null || completion > atMs;
}

export function isOverdueAt(wr: BaseWorkRequest, atMs: number): boolean {
  const due = dueMs(wr);
  return due !== null && due < atMs && isActiveAt(wr, atMs);
}

export function isOverMarginAt(wr: BaseWorkRequest, atMs: number): boolean {
  const margin = marginMs(wr);
  return margin !== null && margin < atMs && isActiveAt(wr, atMs);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

