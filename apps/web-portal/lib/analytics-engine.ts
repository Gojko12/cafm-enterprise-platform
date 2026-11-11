import type { BaseWorkRequest, Equipment } from "@cafm/shared-schema";
import { formatDateDDMMYYYY } from "@cafm/shared-schema";
import type { AuditFinding } from "./audit-assurance-types";
import { qaStatus } from "./qa-audits";

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

function parseStamp(value: string | undefined): number | null {
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

// ---------------------------------------------------------------------------
// C. Long Jobs end-to-end & stage bottleneck analytics
// ---------------------------------------------------------------------------

export const LJ_STAGE_KEYS = ["10%", "20%", "30–40%", "50%", "55%", "78%"] as const;
export type LjStageKey = (typeof LJ_STAGE_KEYS)[number];

export function ljStageKey(percentage: number): LjStageKey | null {
  if (percentage >= 78 && percentage < 100) return "78%";
  if (percentage === 55) return "55%";
  if (percentage >= 50 && percentage < 55) return "50%";
  if (percentage >= 30 && percentage < 50) return "30–40%";
  if (percentage >= 20 && percentage < 30) return "20%";
  if (percentage >= 1 && percentage < 20) return "10%";
  return null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export interface LjStageStat {
  stage: LjStageKey;
  avgDays: number | null;
  medianDays: number | null;
  maxDays: number | null;
  currentCount: number;
  currentLjs: BaseWorkRequest[];
}

export const LJ_AGE_BUCKETS = ["0–7d", "8–30d", "31–60d", "61–90d", "90d+"] as const;

export interface LjAnalytics {
  openNow: BaseWorkRequest[];
  openByStage: Record<LjStageKey, BaseWorkRequest[]>;
  openByAgeBucket: Record<(typeof LJ_AGE_BUCKETS)[number], BaseWorkRequest[]>;
  avgDaysInProcessOpen: number | null;
  medianDaysInProcessOpen: number | null;
  blockedOnHold: BaseWorkRequest[];
  overdueTarget: BaseWorkRequest[];
  stageDwellStats: LjStageStat[];
  completed: BaseWorkRequest[];
  completedLeadTime: { avg: number | null; median: number | null; min: number | null; max: number | null };
  monthlyThroughput: Array<{ month: string; label: string; created: number; completed: number; avgLeadDays: number | null }>;
  hoursVariance: { expected: number; actual: number };
  costVariance: { estimated: number; actual: number };
  longestOpen: Array<{ wr: BaseWorkRequest; ageDays: number }>;
}

export function longJobAnalytics(workRequests: BaseWorkRequest[], now: Date): LjAnalytics {
  const nowMs = now.getTime();
  const ljs = workRequests.filter((wr) => wr.WR_Type === "LJ" && !isCancelled(wr));
  const open = ljs.filter((wr) => wr.Percentage < 100);
  const completed = ljs.filter((wr) => wr.Percentage >= 100);
  const ageDays = (wr: BaseWorkRequest) => Math.max(0, (nowMs - createdMs(wr)) / DAY_MS);

  const openByStage = Object.fromEntries(LJ_STAGE_KEYS.map((key) => [key, [] as BaseWorkRequest[]])) as Record<LjStageKey, BaseWorkRequest[]>;
  for (const wr of open) {
    const key = ljStageKey(wr.Percentage);
    if (key) openByStage[key].push(wr);
  }
  const openByAgeBucket = Object.fromEntries(LJ_AGE_BUCKETS.map((key) => [key, [] as BaseWorkRequest[]])) as Record<(typeof LJ_AGE_BUCKETS)[number], BaseWorkRequest[]>;
  for (const wr of open) {
    const age = ageDays(wr);
    const bucket = age <= 7 ? "0–7d" : age <= 30 ? "8–30d" : age <= 60 ? "31–60d" : age <= 90 ? "61–90d" : "90d+";
    openByAgeBucket[bucket].push(wr);
  }

  // Stage dwell durations from StageHistory (fallback: open LJs without history dwell in their current stage since creation).
  const dwellByStage = new Map<LjStageKey, number[]>(LJ_STAGE_KEYS.map((key) => [key, []]));
  for (const wr of ljs) {
    if (wr.StageHistory?.length) {
      for (const entry of wr.StageHistory) {
        const key = entry.percentage !== undefined ? ljStageKey(entry.percentage) : null;
        if (!key) continue;
        const entered = parseStamp(entry.enteredAt);
        if (entered === null) continue;
        const exited = parseStamp(entry.exitedAt) ?? nowMs;
        dwellByStage.get(key)!.push(Math.max(0, (exited - entered) / DAY_MS));
      }
    } else if (wr.Percentage < 100) {
      const key = ljStageKey(wr.Percentage);
      if (key) dwellByStage.get(key)!.push(ageDays(wr));
    }
  }
  const stageDwellStats: LjStageStat[] = LJ_STAGE_KEYS.map((stage) => {
    const durations = dwellByStage.get(stage)!;
    return {
      stage,
      avgDays: average(durations),
      medianDays: median(durations),
      maxDays: durations.length ? Math.max(...durations) : null,
      currentCount: openByStage[stage].length,
      currentLjs: openByStage[stage],
    };
  });

  const leadTimes = completed
    .map((wr) => { const closed = completionMs(wr); return closed === null ? null : Math.max(0, (closed - createdMs(wr)) / DAY_MS); })
    .filter((value): value is number => value !== null);

  const monthlyThroughput = Array.from({ length: Math.min(12, now.getUTCMonth() + 1) }, (_, index) => {
    const month = `2026-${String(index + 1).padStart(2, "0")}`;
    const created = ljs.filter((wr) => wr.CreatedDate.startsWith(month)).length;
    const completedInMonth = completed.filter((wr) => {
      const closed = completionMs(wr);
      return closed !== null && dayString(closed).startsWith(month);
    });
    const monthLead = completedInMonth
      .map((wr) => { const closed = completionMs(wr); return closed === null ? null : (closed - createdMs(wr)) / DAY_MS; })
      .filter((value): value is number => value !== null);
    return { month, label: `${month.slice(5)}-${month.slice(0, 4)}`, created, completed: completedInMonth.length, avgLeadDays: average(monthLead) };
  });

  const actualHours = (wr: BaseWorkRequest) => (wr.TotalTimeMinutes ?? 0) / 60;
  return {
    openNow: open,
    openByStage,
    openByAgeBucket,
    avgDaysInProcessOpen: average(open.map(ageDays)),
    medianDaysInProcessOpen: median(open.map(ageDays)),
    blockedOnHold: open.filter((wr) => wr.Percentage === 55 || wr.IsFrozen),
    overdueTarget: open.filter((wr) => { const due = dueMs(wr); return due !== null && due < nowMs; }),
    stageDwellStats,
    completed,
    completedLeadTime: {
      avg: average(leadTimes), median: median(leadTimes),
      min: leadTimes.length ? Math.min(...leadTimes) : null,
      max: leadTimes.length ? Math.max(...leadTimes) : null,
    },
    monthlyThroughput,
    hoursVariance: {
      expected: ljs.reduce((sum, wr) => sum + (wr.ExpectedHours ?? 0), 0),
      actual: ljs.reduce((sum, wr) => sum + actualHours(wr), 0),
    },
    costVariance: {
      estimated: ljs.reduce((sum, wr) => sum + (wr.EstimatedCostEur ?? 0), 0),
      actual: ljs.reduce((sum, wr) => sum + (wr.ActualCostEur ?? 0), 0),
    },
    longestOpen: open.map((wr) => ({ wr, ageDays: ageDays(wr) })).sort((a, b) => b.ageDays - a.ageDays),
  };
}

// ---------------------------------------------------------------------------
// D. Technical audit findings analytics
// ---------------------------------------------------------------------------

export type FindingSeverity = "Critical" | "Major" | "Minor";

export interface NormalizedFinding {
  finding: AuditFinding;
  severity: FindingSeverity;
  dueDate: string | null;
  addressedAt: string | null;
  addressed: boolean;
  overdue: boolean;
  remediationDays: number | null;
  addressedOnTime: boolean | null;
}

export function normalizeFinding(finding: AuditFinding, now: Date): NormalizedFinding {
  const severity: FindingSeverity = finding.severity
    ?? (finding.urgency === "N0" ? "Critical" : finding.urgency === "N1" ? "Major" : "Minor");
  const dueDate = finding.dueDate ?? (finding.calculatedDeadline !== "No action" ? finding.calculatedDeadline : null);
  const addressedAt = finding.addressedAt
    ?? finding.verification?.verifiedAt
    ?? (finding.assuranceState === "FindingVerified_Closed" ? finding.evidence?.submittedAt ?? null : null)
    ?? null;
  const addressed = Boolean(addressedAt) || finding.assuranceState === "FindingVerified_Closed" || finding.status === "Closed" || finding.status === "Addressed";
  const addressedMs = parseStamp(addressedAt ?? undefined);
  const discoveredMs = parseStamp(finding.discoveredAt);
  const dueEnd = dueDate ? endOfDayMs(dueDate) : null;
  return {
    finding,
    severity,
    dueDate,
    addressedAt,
    addressed,
    overdue: !addressed && dueEnd !== null && dueEnd < now.getTime(),
    remediationDays: addressed && addressedMs !== null && discoveredMs !== null ? Math.max(0, (addressedMs - discoveredMs) / DAY_MS) : null,
    addressedOnTime: addressed && addressedMs !== null && dueEnd !== null ? addressedMs <= dueEnd : null,
  };
}

export interface FindingAnalytics {
  all: NormalizedFinding[];
  totalFindings: number;
  addressedCount: number;
  addressedPct: number | null;
  addressedOnTimeCount: number;
  addressedLateCount: number;
  openInWindow: NormalizedFinding[];
  overdueFindings: NormalizedFinding[];
  avgRemediationDays: number | null;
  bySeverity: Record<FindingSeverity, { total: number; open: number; overdue: number }>;
  byBuilding: Array<{ buildingId: string; total: number; overdue: number }>;
  monthlyTrend: Array<{ month: string; label: string; opened: number; addressed: number }>;
}

export function auditFindingAnalytics(findings: AuditFinding[], siteId: string, filters: AnalyticsFilters, now: Date): FindingAnalytics {
  const all = findings
    .filter((finding) => finding.siteId === siteId &&
      (!filters.buildingId || finding.buildingId === filters.buildingId) &&
      (!filters.trade || finding.trade === filters.trade))
    .map((finding) => normalizeFinding(finding, now));
  const addressed = all.filter((entry) => entry.addressed);
  const bySeverity = Object.fromEntries((["Critical", "Major", "Minor"] as const).map((severity) => {
    const subset = all.filter((entry) => entry.severity === severity);
    return [severity, { total: subset.length, open: subset.filter((entry) => !entry.addressed).length, overdue: subset.filter((entry) => entry.overdue).length }];
  })) as FindingAnalytics["bySeverity"];
  const buildings = new Map<string, { total: number; overdue: number }>();
  for (const entry of all) {
    const bucket = buildings.get(entry.finding.buildingId) ?? { total: 0, overdue: 0 };
    bucket.total++;
    if (entry.overdue) bucket.overdue++;
    buildings.set(entry.finding.buildingId, bucket);
  }
  const monthlyTrend = Array.from({ length: Math.min(12, now.getUTCMonth() + 1) }, (_, index) => {
    const month = `2026-${String(index + 1).padStart(2, "0")}`;
    return {
      month,
      label: `${month.slice(5)}-${month.slice(0, 4)}`,
      opened: all.filter((entry) => entry.finding.discoveredAt.startsWith(month)).length,
      addressed: all.filter((entry) => entry.addressedAt?.startsWith(month)).length,
    };
  });
  return {
    all,
    totalFindings: all.length,
    addressedCount: addressed.length,
    addressedPct: all.length ? (addressed.length / all.length) * 100 : null,
    addressedOnTimeCount: addressed.filter((entry) => entry.addressedOnTime === true).length,
    addressedLateCount: addressed.filter((entry) => entry.addressedOnTime === false).length,
    openInWindow: all.filter((entry) => !entry.addressed && !entry.overdue),
    overdueFindings: all.filter((entry) => entry.overdue),
    avgRemediationDays: average(addressed.map((entry) => entry.remediationDays).filter((value): value is number => value !== null)),
    bySeverity,
    byBuilding: [...buildings.entries()].map(([buildingId, bucket]) => ({ buildingId, ...bucket })).sort((a, b) => b.total - a.total),
    monthlyTrend,
  };
}

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

// ---------------------------------------------------------------------------
// F. Problematic equipment ("Bad Actors")
// ---------------------------------------------------------------------------

export interface BadActor {
  equipmentCode: string;
  equipment: Equipment | null;
  equipmentName: string;
  location: string;
  reactiveFJs: BaseWorkRequest[];
  unfavourablePmSteps: number;
  unfavourablePmWRs: BaseWorkRequest[];
  auditFindings: NormalizedFinding[];
  linkedLJs: BaseWorkRequest[];
  openWRs: BaseWorkRequest[];
  overdueWRs: BaseWorkRequest[];
  totalRepairHours: number;
  estimatedDowntimeHours: number;
  mtbfDays: number | null;
  mttrHours: number | null;
  issueScore: number;
  cumulativePct: number;
}

export function badActorAnalytics(
  workRequests: BaseWorkRequest[],
  findings: NormalizedFinding[],
  equipment: Equipment[],
  now: Date,
): BadActor[] {
  const nowMs = now.getTime();
  const equipmentByCode = new Map(equipment.map((asset) => [asset.EquipmentCode, asset]));
  const codes = new Set<string>();
  for (const wr of workRequests) for (const code of wr.EquipmentCodes) codes.add(code);
  for (const entry of findings) codes.add(entry.finding.equipmentId);

  const actors: BadActor[] = [];
  for (const code of codes) {
    const asset = equipmentByCode.get(code) ?? null;
    const wrs = workRequests.filter((wr) => wr.EquipmentCodes.includes(code) && !isCancelled(wr));
    const reactiveFJs = wrs.filter((wr) => wr.WR_Type === "FJ");
    const unfavourablePmWRs = wrs.filter((wr) => wr.WR_Type === "PM" && (wr.ChecklistResults ?? []).some((result) => !result.passed));
    const unfavourablePmSteps = wrs.filter((wr) => wr.WR_Type === "PM")
      .reduce((sum, wr) => sum + (wr.ChecklistResults ?? []).filter((result) => !result.passed).length, 0);
    const assetFindings = findings.filter((entry) => entry.finding.equipmentId === code);
    const linkedLJs = wrs.filter((wr) => wr.WR_Type === "LJ");
    const openWRs = wrs.filter((wr) => isActiveAt(wr, nowMs));
    const repairPool = [...reactiveFJs, ...linkedLJs];
    const totalRepairHours = repairPool.reduce((sum, wr) => sum + (wr.TotalTimeMinutes ?? 0) / 60, 0);
    const downtimeHours = wrs.reduce((sum, wr) => sum + (wr.DowntimeMinutes ?? 0) / 60, 0);
    const failureTimes = reactiveFJs.map((wr) => createdMs(wr)).sort((a, b) => a - b);
    const observationDays = Math.max(1, (nowMs - Date.parse("2026-01-01T00:00:00.000Z")) / DAY_MS);
    const issueScore = reactiveFJs.length + unfavourablePmSteps + assetFindings.length + linkedLJs.length;
    if (!issueScore) continue;
    actors.push({
      equipmentCode: code,
      equipment: asset,
      equipmentName: asset?.EquipmentName ?? code,
      location: asset ? `${asset.bl_id} > ${asset.LevelName} > ${asset.RoomCode}` : "—",
      reactiveFJs,
      unfavourablePmSteps,
      unfavourablePmWRs,
      auditFindings: assetFindings,
      linkedLJs,
      openWRs,
      overdueWRs: wrs.filter((wr) => isOverdueAt(wr, nowMs)),
      totalRepairHours,
      estimatedDowntimeHours: downtimeHours,
      mtbfDays: failureTimes.length ? observationDays / failureTimes.length : null,
      mttrHours: reactiveFJs.length && totalRepairHours ? totalRepairHours / reactiveFJs.length : null,
      issueScore,
      cumulativePct: 0,
    });
  }
  actors.sort((a, b) => b.issueScore - a.issueScore || a.equipmentCode.localeCompare(b.equipmentCode));
  const totalIssues = actors.reduce((sum, actor) => sum + actor.issueScore, 0);
  let running = 0;
  for (const actor of actors) {
    running += actor.issueScore;
    actor.cumulativePct = totalIssues ? (running / totalIssues) * 100 : 0;
  }
  return actors;
}

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
