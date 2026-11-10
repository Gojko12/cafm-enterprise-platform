import { PM_FREQUENCY_RANKS } from "./smart-pm.js";
import type { PMFrequencyCode, PM_Schedule } from "./smart-pm.js";
import { pmTargetKey } from "./pm-targets.js";

export const PM_INTERVALS: Record<PMFrequencyCode, number> = {
  "01D": 1, "01W": 7, "02W": 14, "01M": 1, "03M": 3, "06M": 6, "01Y": 12, "02Y": 24, "05Y": 60, "10Y": 120,
};
const dayMs = 86400000;
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
const lcm = (a: number, b: number) => a / gcd(a, b) * b;
const mod = (a: number, b: number) => ((a % b) + b) % b;
export function addCycleInterval(iso: string, amount: number, unit: "months" | "days"): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso.slice(0, 10)) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso.slice(0, 10))
    throw new Error(`Invalid cycle date: ${iso}`);
  if (unit === "days") date.setUTCDate(date.getUTCDate() + amount);
  else {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + amount);
    date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
  }
  return date.toISOString().slice(0, 10);
}
export function targetFamilyPms(pms: PM_Schedule, schedules: PM_Schedule[]): PM_Schedule[] {
  const peers = schedules.filter((item) => item.IsActive && item.SiteId === pms.SiteId && pmTargetKey(item) === pmTargetKey(pms) &&
    (pms.suppressionMode === "independent" || !pms.suppressionGroupKey ? item.ScheduleId === pms.ScheduleId :
      item.suppressionMode !== "independent" && item.suppressionGroupKey === pms.suppressionGroupKey));
  return (peers.length ? peers : [pms]).sort((a, b) => a.ScheduleId.localeCompare(b.ScheduleId));
}
export function getPmCycle(pms: PM_Schedule, schedules: PM_Schedule[]) {
  const group = targetFamilyPms(pms, schedules);
  if (group.some((item) => !item.frequencyCode)) throw new Error("Every cycle PMS requires a frequency code.");
  const codes = group.map((item) => item.frequencyCode!);
  if (new Set(codes).size !== codes.length) throw new Error("A target family can have only one active PMS per frequency.");
  const hasDays = codes.some((code) => code.endsWith("D") || code.endsWith("W"));
  const hasMonths = codes.some((code) => code.endsWith("M") || code.endsWith("Y"));
  // Calendar months and fixed-day periods cannot share a constant interval lattice.
  if (hasDays && hasMonths) throw new Error("Use separate families for fixed-day/weekly and calendar-month frequencies.");
  const unit = hasMonths ? "months" as const : "days" as const;
  const shortest = [...codes].sort((a, b) => PM_INTERVALS[a] - PM_INTERVALS[b])[0];
  const interval = PM_INTERVALS[shortest];
  const length = codes.map((code) => PM_INTERVALS[code]).reduce(lcm);
  const visits = length / interval;
  const visitsPerYear = unit === "months" ? 12 / interval : 365.2425 / interval;
  const stored = group.find((item) => item.peakSlotIndex !== undefined);
  const position = stored?.peakSlotIndex ?? (pms.annualSlotIndex && pms.peakYearIndex ?
    (pms.peakYearIndex - 1) * visitsPerYear + pms.annualSlotIndex : visits);
  if (!Number.isInteger(position) || position < 1 || position > visits) throw new Error(`Peak visit must be between 1 and ${visits}.`);
  const cycleDate = group[0].cycleDate ?? group[0].anchorDate ?? group[0].sharedAnchorDate ?? group[0].NextDueDate.slice(0, 10);
  return { group, unit, shortest, interval, length, visits, visitsPerYear, peakSlotIndex: position, cycleDate,
    years: unit === "months" ? length / 12 : length / 365.2425 };
}
export function pmVisit(cycle: ReturnType<typeof getPmCycle>, visit: number) {
  const dueDate = addCycleInterval(cycle.cycleDate, (visit - 1) * cycle.interval, cycle.unit);
  const due = cycle.group.filter((item) => mod((visit - cycle.peakSlotIndex) * cycle.interval, PM_INTERVALS[item.frequencyCode!]) === 0)
    .sort((a, b) => PM_FREQUENCY_RANKS[b.frequencyCode!] - PM_FREQUENCY_RANKS[a.frequencyCode!] || a.ScheduleId.localeCompare(b.ScheduleId));
  return { visit, dueDate, winner: due[0], suppressed: due.slice(1) };
}
export function forecastPmCycle(pms: PM_Schedule, schedules: PM_Schedule[]) {
  const cycle = getPmCycle(pms, schedules);
  const visits = Array.from({ length: cycle.visits }, (_, i) => pmVisit(cycle, i + 1));
  return { ...cycle, timeline: visits, annualAverage: visits.length / cycle.years,
    prevented: visits.reduce((total, item) => total + item.suppressed.length, 0) };
}
export function firstVisitOnOrAfter(cycle: ReturnType<typeof getPmCycle>, reference: string): number {
  if (!Number.isFinite(Date.parse(reference))) throw new Error(`Invalid reference date: ${reference}`);
  const diff = cycle.unit === "months" ? (Number(reference.slice(0, 4)) - Number(cycle.cycleDate.slice(0, 4))) * 12 +
    Number(reference.slice(5, 7)) - Number(cycle.cycleDate.slice(5, 7)) : (Date.parse(reference.slice(0, 10)) - Date.parse(cycle.cycleDate)) / dayMs;
  let visit = Math.max(1, Math.floor(diff / cycle.interval) + 1);
  while (pmVisit(cycle, visit).dueDate < reference.slice(0, 10)) visit++;
  return visit;
}
export function getNextUnsuppressedOccurrence(pms: PM_Schedule, allTargetFamilyPms: PM_Schedule[], referenceDateIso: string) {
  const cycle = getPmCycle(pms, allTargetFamilyPms);
  const countPerCycle = Array.from({ length: cycle.visits }, (_, i) => pmVisit(cycle, i + 1))
    .filter((item) => item.winner.ScheduleId === pms.ScheduleId).length;
  if (!countPerCycle) return null;
  const first = firstVisitOnOrAfter(cycle, referenceDateIso);
  for (let visit = first; visit < first + cycle.visits; visit++) {
    const item = pmVisit(cycle, visit);
    if (item.winner.ScheduleId === pms.ScheduleId) return { date: item.dueDate, visitNumber: mod(visit - 1, cycle.visits) + 1, countPerCycle };
  }
  throw new Error(`No unsuppressed occurrence for PMS #${pms.ScheduleId}.`);
}
