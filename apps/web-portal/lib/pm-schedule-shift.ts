import { createPMCycleKey, getPmCycle, pmVisit, firstVisitOnOrAfter, getNextUnsuppressedOccurrence, addCycleInterval } from "@cafm/shared-schema";
import type { BaseWorkRequest, PM_ChecklistStandard, PM_Schedule } from "@cafm/shared-schema";
import { isUnstarted, resolveBlueprintSchedule, shiftDays } from "./pm-suppression";

export function shiftPmSchedule(schedules: PM_Schedule[], blueprints: PM_ChecklistStandard[], requests: BaseWorkRequest[],
  order: PM_Schedule, currentCycle: string, newDate: string, action: "move" | "keep", actor: string, now: string, peakSlotIndex?: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !Number.isFinite(Date.parse(newDate)))
    throw new Error("Choose a valid Cycle Date.");
  addCycleInterval(newDate, 0, "days");
  const configured = schedules.map((item) => resolveBlueprintSchedule(item, blueprints));
  const original = configured.find((item) => item.SiteId === order.SiteId && item.ScheduleId === order.ScheduleId);
  if (!original) throw new Error("The selected PMS no longer exists.");
  const oldCycle = getPmCycle(original, configured);
  const peak = peakSlotIndex ?? oldCycle.peakSlotIndex;
  if (newDate === oldCycle.cycleDate && peak === oldCycle.peakSlotIndex) throw new Error("The cycle date and peak position are unchanged.");
  const ids = new Set(oldCycle.group.map((item) => item.ScheduleId));
  const effective = newDate > now.slice(0, 10) ? newDate : now.slice(0, 10);
  const changed = configured.map((item) => item.SiteId === order.SiteId && ids.has(item.ScheduleId) ? {
    ...item, cycleDate: newDate, anchorDate: newDate, sharedAnchorDate: newDate, peakSlotIndex: peak,
    annualSlotIndex: oldCycle.unit === "months" ? (peak - 1) % Math.max(1, oldCycle.visitsPerYear) + 1 : undefined,
    peakYearIndex: oldCycle.unit === "months" ? Math.floor((peak - 1) / Math.max(1, oldCycle.visitsPerYear)) + 1 : undefined,
    effectiveFromDate: effective, UpdatedAt: now,
  } : item);
  const newCycle = getPmCycle(changed.find((item) => item.ScheduleId === order.ScheduleId)!, changed);
  const mappings = new Map<string, Array<{ wrId: string; dueDate: string }>>();
  const moved = new Map<string, string>();
  const reserved = new Set<string>();
  const relevant = requests.filter((wr) => wr.SiteId === order.SiteId && wr.ScheduleId && ids.has(wr.ScheduleId) && wr.DueDate && wr.Percentage !== 27)
    .sort((a, b) => a.DueDate!.localeCompare(b.DueDate!) || a.WR_ID.localeCompare(b.WR_ID));
  for (const wr of relevant) {
    const schedule = oldCycle.group.find((item) => item.ScheduleId === wr.ScheduleId)!;
    const previous = [...(schedule.scheduleChangeLog ?? [])].reverse().flatMap((entry) => entry.preservedCycles ?? []).find((item) => item.wrId === wr.WR_ID);
    const priorDate = previous?.dueDate ?? wr.DueDate!.slice(0, 10);
    if (priorDate < currentCycle && isUnstarted(wr)) continue;
    let visit = firstVisitOnOrAfter(oldCycle, priorDate);
    let occurrence = pmVisit(newCycle, visit);
    if (action === "move" && isUnstarted(wr)) {
      if (occurrence.dueDate < effective) visit = firstVisitOnOrAfter(newCycle, effective);
      const limit = visit + newCycle.visits * (relevant.length + 1);
      while (visit < limit) {
        occurrence = pmVisit(newCycle, visit);
        if (occurrence.winner.ScheduleId === wr.ScheduleId && !reserved.has(occurrence.dueDate)) break;
        visit++;
      }
      if (visit === limit) throw new Error(`No unique winning visit available for PMS #${wr.ScheduleId}.`);
      moved.set(wr.WR_ID, occurrence.dueDate);
    }
    reserved.add(occurrence.dueDate);
    const winner = occurrence.winner.ScheduleId;
    mappings.set(winner, [...(mappings.get(winner) ?? []), { wrId: wr.WR_ID, dueDate: occurrence.dueDate }]);
  }
  const updatedSchedules = changed.map((item) => {
    if (item.SiteId !== order.SiteId || !ids.has(item.ScheduleId)) return item;
    let next = getNextUnsuppressedOccurrence(item, changed, effective);
    while (next && reserved.has(next.date)) next = getNextUnsuppressedOccurrence(item, changed, shiftDays(next.date, 1));
    return { ...item, NextDueDate: next?.date ?? item.NextDueDate,
      scheduleChangeLog: [...(item.scheduleChangeLog ?? []), { changedAt: now, changedBy: actor,
        oldAnchor: oldCycle.cycleDate, newAnchor: newDate, oldPeakSlotIndex: oldCycle.peakSlotIndex, newPeakSlotIndex: peak,
        effectiveFrom: effective, openWrAction: action, preservedCycles: mappings.get(item.ScheduleId) ?? [] }] };
  });
  const workRequests = requests.map((wr) => {
    const due = moved.get(wr.WR_ID);
    if (!due || wr.SiteId !== order.SiteId) return wr;
    const offset = Math.round((Date.parse(due) - Date.parse(wr.DueDate!.slice(0, 10))) / 86400000);
    const shift = (date: string | undefined) => date ? shiftDays(date.slice(0, 10), offset) : date;
    const slotDate = (date: string) => `${shiftDays(date.slice(0, 10), offset)}${date.slice(10)}`;
    return { ...wr, DueDate: due, StartDate: shift(wr.StartDate), StartDate_DateToPerform: shift(wr.StartDate_DateToPerform), MarginDate: shift(wr.MarginDate),
      PM_CycleKey: `${createPMCycleKey(wr.ScheduleId!, due)}::${wr.EquipmentCodes[0] ?? "location"}`,
      CraftpersonAssignments: wr.CraftpersonAssignments?.map((slot) => slot.autoScheduledFromPmsId ?
        { ...slot, assignedStartDateTime: slotDate(slot.assignedStartDateTime), assignedEndDateTime: slotDate(slot.assignedEndDateTime) } : slot),
      UpdatedAt: now, updatedAt: now,
      Activity: [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log" as const, actorId: actor, actorName: actor, actorRole: "Scheduler", createdAt: now,
        text: `[Schedule Shifted] PMS #${wr.ScheduleId}: cycle position changed by ${actor}; peak visit #${peak}.` }] };
  });
  return { schedules: updatedSchedules, workRequests };
}
