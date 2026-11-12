import type { BaseWorkRequest } from "@cafm/shared-schema";
import { formatDateDDMMYYYY } from "@cafm/shared-schema";
import { DAY_MS, filterWorkRequests, startOfDayMs, endOfDayMs, dayString, addDaysIso, createdMs, isCancelled, completionMs, dueMs, marginMs, isActiveAt, isOverdueAt, isOverMarginAt, parseStamp, median, average } from "./core";
import type { AnalyticsFilters } from "./core";
// ---------------------------------------------------------------------------
// A. Point-in-time OverDue & OverMargin series (01-01-2026 -> today)
// ---------------------------------------------------------------------------

export type CheckpointGranularity = "monthly" | "weekly" | "daily";

export interface BreachCheckpoint {
  /** ISO calendar date of the checkpoint. */
  date: string;
  /** Display label in DD-MM-YYYY. */
  label: string;
  pmOverdue: BaseWorkRequest[];
  fjOverdue: BaseWorkRequest[];
  pmOverMargin: BaseWorkRequest[];
  fjOverMargin: BaseWorkRequest[];
}

export function buildCheckpoints(granularity: CheckpointGranularity, now: Date): string[] {
  const today = now.toISOString().slice(0, 10);
  if (granularity === "monthly") {
    const dates: string[] = [];
    for (let month = 1; month <= 12; month++) {
      const date = `2026-${String(month).padStart(2, "0")}-01`;
      if (date <= today) dates.push(date);
    }
    if (!dates.includes(today)) dates.push(today);
    return dates;
  }
  if (granularity === "weekly") {
    return Array.from({ length: 12 }, (_, index) => dayString(endOfDayMs(today) - (11 - index) * 7 * DAY_MS));
  }
  return Array.from({ length: 30 }, (_, index) => dayString(endOfDayMs(today) - (29 - index) * DAY_MS));
}

export function pointInTimeBreachSeries(workRequests: BaseWorkRequest[], granularity: CheckpointGranularity, now: Date): BreachCheckpoint[] {
  const pool = workRequests.filter((wr) => (wr.WR_Type === "PM" || wr.WR_Type === "FJ") && !isCancelled(wr));
  return buildCheckpoints(granularity, now).map((date) => {
    const at = Math.min(endOfDayMs(date), now.getTime());
    const overdue = pool.filter((wr) => isOverdueAt(wr, at));
    const overMargin = pool.filter((wr) => isOverMarginAt(wr, at));
    return {
      date,
      label: formatDateDDMMYYYY(date),
      pmOverdue: overdue.filter((wr) => wr.WR_Type === "PM"),
      fjOverdue: overdue.filter((wr) => wr.WR_Type === "FJ"),
      pmOverMargin: overMargin.filter((wr) => wr.WR_Type === "PM"),
      fjOverMargin: overMargin.filter((wr) => wr.WR_Type === "FJ"),
    };
  });
}

/** Net trend improvement % between the first and last checkpoint (positive = improvement). */
export function netTrendPct(series: BreachCheckpoint[], metric: "overdue" | "overmargin"): number | null {
  if (series.length < 2) return null;
  const count = (point: BreachCheckpoint) => metric === "overdue"
    ? point.pmOverdue.length + point.fjOverdue.length
    : point.pmOverMargin.length + point.fjOverMargin.length;
  const first = count(series[0]);
  const last = count(series[series.length - 1]);
  if (first === 0) return last === 0 ? 0 : null;
  return ((first - last) / first) * 100;
}

// ---------------------------------------------------------------------------
// B. Breach recovery vs. new breach inflow (24h / 7d / 30d)
// ---------------------------------------------------------------------------

export type WrTypeFilter = "ALL" | "PM" | "FJ";

export interface BreachChurn {
  metric: "overdue" | "overmargin";
  windowDays: number;
  prior: BaseWorkRequest[];
  closedFromPrior: BaseWorkRequest[];
  recoveryPct: number | null;
  newlyEnteredStillOpen: BaseWorkRequest[];
  newlyEnteredClosed: BaseWorkRequest[];
  current: BaseWorkRequest[];
  netChange: number;
}

export function breachChurn(
  workRequests: BaseWorkRequest[],
  metric: "overdue" | "overmargin",
  windowDays: number,
  typeFilter: WrTypeFilter,
  now: Date,
): BreachChurn {
  const nowMs = now.getTime();
  const startMs = nowMs - windowDays * DAY_MS;
  const pool = workRequests.filter((wr) => (wr.WR_Type === "PM" || wr.WR_Type === "FJ") && !isCancelled(wr) &&
    (typeFilter === "ALL" || wr.WR_Type === typeFilter));
  const breachDate = metric === "overdue" ? dueMs : marginMs;
  const inBreachAt = metric === "overdue" ? isOverdueAt : isOverMarginAt;

  const prior = pool.filter((wr) => inBreachAt(wr, startMs));
  const closedFromPrior = prior.filter((wr) => {
    const completion = completionMs(wr);
    return completion !== null && completion > startMs && completion <= nowMs;
  });
  const newlyEntered = pool.filter((wr) => {
    if (inBreachAt(wr, startMs)) return false;
    const threshold = breachDate(wr);
    if (threshold === null || threshold <= startMs || threshold > nowMs) return false;
    // Must still have been uncompleted when it crossed the threshold.
    return isActiveAt(wr, threshold);
  });
  const newlyEnteredStillOpen = newlyEntered.filter((wr) => inBreachAt(wr, nowMs));
  const newlyEnteredClosed = newlyEntered.filter((wr) => !inBreachAt(wr, nowMs));
  const current = pool.filter((wr) => inBreachAt(wr, nowMs));
  return {
    metric,
    windowDays,
    prior,
    closedFromPrior,
    recoveryPct: prior.length ? (closedFromPrior.length / prior.length) * 100 : null,
    newlyEnteredStillOpen,
    newlyEnteredClosed,
    current,
    netChange: newlyEnteredStillOpen.length - closedFromPrior.length,
  };
}

