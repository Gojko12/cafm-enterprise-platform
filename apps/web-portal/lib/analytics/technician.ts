import type { BaseWorkRequest } from "@cafm/shared-schema";
import { qaStatus } from "../qa-audits";
import { DAY_MS, filterWorkRequests, startOfDayMs, endOfDayMs, dayString, addDaysIso, createdMs, isCancelled, completionMs, dueMs, marginMs, isActiveAt, isOverdueAt, isOverMarginAt, parseStamp, median, average } from "./core";
import type { AnalyticsFilters } from "./core";
// ---------------------------------------------------------------------------
// E. Technician logged hours & reopen / success scorecard
// ---------------------------------------------------------------------------

export type ScorecardWindow = "day" | "week" | "month" | "ytd";

export interface TechnicianStats {
  personId: string;
  name: string;
  trade: string;
  hoursPM: number;
  hoursFJ: number;
  hoursLJ: number;
  totalHours: number;
  capacityHours: number;
  utilizationPct: number | null;
  plannedVsActualPct: number | null;
  completedWRs: BaseWorkRequest[];
  withinMarginPct: number | null;
  reopenedCount: number;
  reopenRatePct: number | null;
  ftrPct: number | null;
  avgHoursPerWr: number | null;
}

export interface TechnicianScorecard {
  windowStartMs: number;
  stats: TechnicianStats[];
  totals: { hours: number; completed: number; reopened: number; avgUtilizationPct: number | null; ftrPct: number | null };
}

export function scorecardWindowStart(window: ScorecardWindow, now: Date): number {
  if (window === "day") return now.getTime() - DAY_MS;
  if (window === "week") return now.getTime() - 7 * DAY_MS;
  if (window === "month") return now.getTime() - 30 * DAY_MS;
  return Date.parse("2026-01-01T00:00:00.000Z");
}

export function scorecardCapacityHours(window: ScorecardWindow, now: Date): number {
  if (window === "day") return 8;
  if (window === "week") return 40;
  if (window === "month") return 168;
  const daysElapsed = Math.max(1, (now.getTime() - Date.parse("2026-01-01T00:00:00.000Z")) / DAY_MS);
  return Math.round(daysElapsed * (5 / 7)) * 8;
}

export function technicianScorecard(
  workRequests: BaseWorkRequest[],
  craftspeople: Array<{ id: string; Name: string; LastName: string; Trade: string }>,
  window: ScorecardWindow,
  now: Date,
): TechnicianScorecard {
  const nowMs = now.getTime();
  const startMs = scorecardWindowStart(window, now);
  const capacity = scorecardCapacityHours(window, now);
  const pool = workRequests.filter((wr) => !isCancelled(wr));

  const stats = craftspeople.map((person) => {
    const name = `${person.Name} ${person.LastName}`;
    let hoursPM = 0, hoursFJ = 0, hoursLJ = 0;
    const loggedByWr = new Map<string, number>();
    for (const wr of pool) {
      for (const log of wr.TimeLogs ?? []) {
        if (log.personId !== person.id) continue;
        const logged = parseStamp(log.loggedAt);
        if (logged === null || logged <= startMs || logged > nowMs) continue;
        if (log.wrType === "PM") hoursPM += log.hours;
        else if (log.wrType === "FJ") hoursFJ += log.hours;
        else hoursLJ += log.hours;
        loggedByWr.set(wr.WR_ID, (loggedByWr.get(wr.WR_ID) ?? 0) + log.hours);
      }
    }
    const totalHours = hoursPM + hoursFJ + hoursLJ;
    const completedWRs = pool.filter((wr) => {
      if (!wr.AssignedCraftpersonIds.includes(person.id)) return false;
      const completion = completionMs(wr);
      return completion !== null && completion > startMs && completion <= nowMs && wr.Percentage >= 78;
    });
    const withinMargin = completedWRs.filter((wr) => {
      const completion = completionMs(wr);
      const margin = marginMs(wr);
      return completion !== null && (margin === null || completion <= margin);
    });
    const reopenedCount = pool.reduce((count, wr) => {
      if (!wr.AssignedCraftpersonIds.includes(person.id)) return count;
      return count + (wr.ReopenedHistory ?? []).filter((event) => {
        const at = parseStamp(event.reopenedAt);
        return at !== null && at > startMs && at <= nowMs;
      }).length;
    }, 0);
    // First-time-right from resolved QA verdicts on this person's WRs (all-time quality signal).
    const verdicts = pool.filter((wr) => wr.AssignedCraftpersonIds.includes(person.id) &&
      ["QA_Passed", "QA_Failed_ActionRequired", "QA_Corrected", "QA_Verified"].includes(qaStatus(wr)));
    const ftrPass = verdicts.filter((wr) => qaStatus(wr) === "QA_Passed").length;
    const plannedHours = completedWRs.reduce((sum, wr) => sum + (wr.ExpectedHours ?? 0), 0);
    const actualOnCompleted = completedWRs.reduce((sum, wr) => sum + (loggedByWr.get(wr.WR_ID) ?? (wr.TotalTimeMinutes ?? 0) / 60), 0);
    return {
      personId: person.id,
      name,
      trade: person.Trade,
      hoursPM, hoursFJ, hoursLJ, totalHours,
      capacityHours: capacity,
      utilizationPct: capacity ? (totalHours / capacity) * 100 : null,
      plannedVsActualPct: actualOnCompleted > 0 && plannedHours > 0 ? (plannedHours / actualOnCompleted) * 100 : null,
      completedWRs,
      withinMarginPct: completedWRs.length ? (withinMargin.length / completedWRs.length) * 100 : null,
      reopenedCount,
      reopenRatePct: completedWRs.length + reopenedCount ? (reopenedCount / (completedWRs.length + reopenedCount)) * 100 : null,
      ftrPct: verdicts.length ? (ftrPass / verdicts.length) * 100 : null,
      avgHoursPerWr: completedWRs.length && totalHours ? totalHours / completedWRs.length : null,
    } satisfies TechnicianStats;
  }).filter((entry) => entry.totalHours > 0 || entry.completedWRs.length > 0 || entry.reopenedCount > 0)
    .sort((a, b) => b.totalHours - a.totalHours);

  const totalVerdicts = stats.reduce((sum, entry) => sum + (entry.ftrPct !== null ? 1 : 0), 0);
  return {
    windowStartMs: startMs,
    stats,
    totals: {
      hours: stats.reduce((sum, entry) => sum + entry.totalHours, 0),
      completed: stats.reduce((sum, entry) => sum + entry.completedWRs.length, 0),
      reopened: stats.reduce((sum, entry) => sum + entry.reopenedCount, 0),
      avgUtilizationPct: average(stats.map((entry) => entry.utilizationPct).filter((value): value is number => value !== null)),
      ftrPct: totalVerdicts ? average(stats.map((entry) => entry.ftrPct).filter((value): value is number => value !== null)) : null,
    },
  };
}

