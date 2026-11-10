import type { BaseWorkRequest, PM_Schedule } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { addDays, calendarDate, fromWallMinutes, wallMinutes } from "./dispatch";

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const RECURRENCE_PATTERNS = ["Daily", "Weekly", "Biweekly", "Monthly", "Quarterly"] as const;

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

function matchesDay(pms: PM_Schedule, date: string) {
  const pattern = pms.defaultRecurrencePattern ?? "Weekly";
  const anchor = pms.defaultAnchorDate ?? date;
  if (pattern === "Daily") {
    const days = pms.defaultWeekdays?.length ? pms.defaultWeekdays : [1, 2, 3, 4, 5];
    return days.includes(weekdayOf(date));
  }
  if (pattern === "Weekly" || pattern === "Biweekly") {
    const days = pms.defaultWeekdays?.length ? pms.defaultWeekdays : [weekdayOf(anchor)];
    if (!days.includes(weekdayOf(date))) return false;
    if (pattern === "Weekly") return true;
    const weeks = Math.floor((wallMinutes(`${date}T00:00`) - wallMinutes(`${anchor}T00:00`)) / 60 / 24 / 7);
    return weeks % 2 === 0;
  }
  const dayOfMonth = pms.defaultDayOfMonth ?? Number(anchor.slice(8, 10));
  if (Number(date.slice(8, 10)) !== Math.min(dayOfMonth, 28)) return false;
  if (pattern === "Monthly") return true;
  const diff = (Number(date.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 + Number(date.slice(5, 7)) - Number(anchor.slice(5, 7));
  return ((diff % 3) + 3) % 3 === 0;
}

/** First date on or after `from` that satisfies the rule, searched up to 400 days ahead. */
export function nextScheduledDate(pms: PM_Schedule, from: string): string | null {
  for (let i = 0; i < 400; i++) {
    const date = addDays(from, i);
    if (matchesDay(pms, date)) return date;
  }
  return null;
}

export function timeWindowLabel(pms: Pick<PM_Schedule, "defaultStartTime" | "defaultDurationHours">) {
  if (!pms.defaultStartTime) return "—";
  const start = `2000-01-01T${pms.defaultStartTime}`;
  const end = fromWallMinutes(wallMinutes(start) + Math.round((pms.defaultDurationHours ?? 1) * 60)).slice(11, 16);
  return `${pms.defaultStartTime} – ${end} (${(pms.defaultDurationHours ?? 1).toFixed(1)}h)`;
}

export function frequencyLabel(pms: PM_Schedule) {
  const pattern = pms.defaultRecurrencePattern;
  if (!pattern) return "Not configured";
  const days = [...(pms.defaultWeekdays ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (pattern === "Daily") return days.length === 0 || days.join() === "1,2,3,4,5" ? "Daily Mon–Fri" : `Daily on ${days.map((d) => WEEKDAY_LABELS[d]).join("/")}`;
  if (pattern === "Weekly" || pattern === "Biweekly") return `${pattern === "Weekly" ? "Weekly" : "Every 2 weeks"} on ${days.map((d) => WEEKDAY_LABELS[d]).join("/") || "anchor weekday"}`;
  return `${pattern} on day ${pms.defaultDayOfMonth ?? "—"}`;
}

export function isAutoScheduleReady(pms: PM_Schedule) {
  return !!pms.autoScheduleEnabled && !!pms.defaultTechnicianIds?.length && !!pms.defaultStartTime && !!pms.defaultRecurrencePattern;
}

export type Craftsperson = DemoData["craftspeople"][number];
type Assignment = NonNullable<BaseWorkRequest["CraftpersonAssignments"]>[number];

export function buildAutoAssignments(pms: PM_Schedule, people: Craftsperson[], date: string): Assignment[] {
  const start = `${date}T${pms.defaultStartTime}`;
  const end = fromWallMinutes(wallMinutes(start) + Math.round((pms.defaultDurationHours ?? 1) * 60));
  return (pms.defaultTechnicianIds ?? []).map((id) => {
    const person = people.find((item) => item.id === id);
    return {
      craftpersonId: id, assignedStartDateTime: start, assignedEndDateTime: end, autoScheduledFromPmsId: pms.ScheduleId,
      ...(person ? { name: person.Name, lastName: person.LastName, hourlyRate: person.HourlyRate } : {}),
    } as Assignment;
  });
}

const isOpenPm = (wr: BaseWorkRequest, pms: PM_Schedule) => wr.WR_Type === "PM" && wr.SiteId === pms.SiteId && wr.Percentage === 50 && (wr as { ScheduleId?: string }).ScheduleId === pms.ScheduleId;
const isAutoOwned = (wr: BaseWorkRequest) => !wr.CraftpersonAssignments?.length || wr.CraftpersonAssignments.every((entry) => !!entry.autoScheduledFromPmsId);

/**
 * Applies the rule to open 50% PM WRs of the schedule. Manually scheduled WRs are kept unless `force` is set.
 * Each WR gets the next free occurrence (one occurrence per WR, in WR-id order).
 */
export function applyPmsAutoSchedule(workRequests: BaseWorkRequest[], pms: PM_Schedule, people: Craftsperson[], options: { force?: boolean; from?: string; onlyIds?: Set<string> } = {}): BaseWorkRequest[] {
  if (!isAutoScheduleReady(pms)) return workRequests;
  const from = options.from ?? pms.defaultAnchorDate ?? calendarDate(new Date());
  const targets = workRequests.filter((wr) => isOpenPm(wr, pms) && (!options.onlyIds || options.onlyIds.has(wr.WR_ID)) && (options.force || isAutoOwned(wr))).sort((a, b) => a.WR_ID.localeCompare(b.WR_ID));
  const updates = new Map<string, BaseWorkRequest>();
  let cursor = from;
  for (const wr of targets) {
    const date = nextScheduledDate(pms, cursor);
    if (!date) break;
    cursor = addDays(date, 1);
    const assignments = buildAutoAssignments(pms, people, date);
    const ids = assignments.map((item) => item.craftpersonId);
    updates.set(wr.WR_ID, { ...wr, AssignedCraftpersonIds: ids, CraftpersonAssignments: assignments, StartDate_DateToPerform: date, StartDateTBD: false, ExpectedHours: pms.defaultDurationHours ?? wr.ExpectedHours });
  }
  return updates.size ? workRequests.map((wr) => updates.get(wr.WR_ID) ?? wr) : workRequests;
}

export function applyAllPmsAutoSchedules(workRequests: BaseWorkRequest[], schedules: PM_Schedule[], people: Craftsperson[], options: { force?: boolean; from?: string; onlyIds?: Set<string> } = {}) {
  return schedules.reduce((current, pms) => applyPmsAutoSchedule(current, pms, people.filter((item) => item.SiteId === pms.SiteId), options), workRequests);
}
