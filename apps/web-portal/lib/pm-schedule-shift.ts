import { createPMCycleKey, pmTargetKey } from "@cafm/shared-schema";
import type { BaseWorkRequest, PM_ChecklistStandard, PM_Schedule } from "@cafm/shared-schema";
import { isUnstarted, nextTickOnOrAfter, resolveBlueprintSchedule, shiftDays } from "./pm-suppression";

export function shiftPmSchedule(schedules: PM_Schedule[], blueprints: PM_ChecklistStandard[], requests: BaseWorkRequest[],
  order: PM_Schedule, currentCycle: string, newDate: string, action: "move" | "keep", actor: string, now: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !Number.isFinite(Date.parse(newDate)) || !Number.isFinite(Date.parse(currentCycle)))
    throw new Error("Choose valid current-cycle and new target dates.");
  if (newDate < now.slice(0, 10)) throw new Error("Schedule changes must take effect today or later.");
  const delta = Math.round((Date.parse(newDate) - Date.parse(currentCycle)) / 86400000);
  if (!delta) throw new Error("The new target date is unchanged.");
  const affected = schedules.filter((item) => item.IsActive && item.SiteId === order.SiteId && pmTargetKey(item) === pmTargetKey(order) &&
    (order.suppressionMode === "independent" ? item.ScheduleId === order.ScheduleId : item.suppressionGroupKey === order.suppressionGroupKey));
  const ids = new Set(affected.map((item) => item.ScheduleId));
  const cycleDue = (wr: BaseWorkRequest, schedule: PM_Schedule) => [...(schedule.scheduleChangeLog ?? [])].reverse()
    .flatMap((change) => change.preservedCycles ?? []).find((cycle) => cycle.wrId === wr.WR_ID)?.dueDate ?? wr.DueDate!.slice(0, 10);
  const updatedSchedules = schedules.map((item) => {
    if (!ids.has(item.ScheduleId) || item.SiteId !== order.SiteId) return item;
    const anchor = shiftDays(item.anchorDate!, delta);
    const changed = resolveBlueprintSchedule({ ...item, anchorDate: anchor, effectiveFromDate: newDate }, blueprints);
    let nextDue = nextTickOnOrAfter(changed, shiftDays(item.NextDueDate, delta) < newDate ? newDate : shiftDays(item.NextDueDate, delta));
    // Issued, started and completed cycles retain their identities across the cutover.
    for (const wr of requests.filter((wr) => wr.SiteId === item.SiteId && wr.ScheduleId === item.ScheduleId && wr.DueDate && cycleDue(wr, item) >= currentCycle)) {
      if (action === "keep" || !isUnstarted(wr)) {
        const consumed = shiftDays(cycleDue(wr, item), delta);
        if (nextDue === consumed) nextDue = nextTickOnOrAfter(changed, shiftDays(consumed, 1));
      }
    }
    const preservedCycles = requests.filter((wr) => wr.SiteId === item.SiteId && wr.ScheduleId === item.ScheduleId &&
      wr.DueDate && cycleDue(wr, item) >= currentCycle)
      .map((wr) => ({ wrId: wr.WR_ID, dueDate: shiftDays(cycleDue(wr, item), delta) }));
    return { ...changed, NextDueDate: nextDue, defaultAnchorDate: item.defaultAnchorDate ? shiftDays(item.defaultAnchorDate, delta) : undefined, UpdatedAt: now,
      scheduleChangeLog: [...(item.scheduleChangeLog ?? []), { changedAt: now, changedBy: actor, oldAnchor: item.anchorDate!, newAnchor: anchor, effectiveFrom: newDate, openWrAction: action, preservedCycles }] };
  });
  const workRequests = requests.map((wr) => {
    const schedule = affected.find((item) => item.ScheduleId === wr.ScheduleId);
    if (action !== "move" || wr.SiteId !== order.SiteId || !schedule || !wr.DueDate || cycleDue(wr, schedule) < currentCycle || !isUnstarted(wr)) return wr;
    const due = shiftDays(cycleDue(wr, schedule), delta);
    const offset = Math.round((Date.parse(due) - Date.parse(wr.DueDate.slice(0, 10))) / 86400000);
    const shift = (date: string | undefined) => date ? shiftDays(date.slice(0, 10), offset) : date;
    const shiftSlot = (date: string) => `${shiftDays(date.slice(0, 10), offset)}${date.slice(10)}`;
    return { ...wr, DueDate: due, StartDate: shift(wr.StartDate), StartDate_DateToPerform: shift(wr.StartDate_DateToPerform), MarginDate: shift(wr.MarginDate),
      PM_CycleKey: `${createPMCycleKey(wr.ScheduleId!, due)}::${wr.EquipmentCodes[0] ?? "location"}`,
      CraftpersonAssignments: wr.CraftpersonAssignments?.map((slot) => slot.autoScheduledFromPmsId ?
        { ...slot, assignedStartDateTime: shiftSlot(slot.assignedStartDateTime), assignedEndDateTime: shiftSlot(slot.assignedEndDateTime) } : slot),
      UpdatedAt: now, updatedAt: now,
      Activity: [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log" as const, actorId: actor, actorName: actor, actorRole: "Scheduler", createdAt: now,
        text: `[Schedule Shifted] PMS #${wr.ScheduleId}: ${wr.DueDate.slice(0, 10)} → ${due}; anchor shifted ${delta} days by ${actor}.` }] };
  });
  return { schedules: updatedSchedules, workRequests };
}
