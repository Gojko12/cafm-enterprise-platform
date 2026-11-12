import type { BaseWorkRequest } from "@cafm/shared-schema";
import { DAY_MS, filterWorkRequests, startOfDayMs, endOfDayMs, dayString, addDaysIso, createdMs, isCancelled, completionMs, dueMs, marginMs, isActiveAt, isOverdueAt, isOverMarginAt, parseStamp, median, average } from "./core";
import type { AnalyticsFilters } from "./core";
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

