import type { BaseWorkRequest, CraftpersonAbsence } from "@cafm/shared-schema";

export function activeAbsences(absences: CraftpersonAbsence[], site: string, person: string, date: string) {
  return absences.filter((entry) => entry.siteId === site && entry.craftpersonId === person && entry.status === "Approved" && entry.startDate <= date && date <= entry.endDate);
}

export function frozenOn(wr: BaseWorkRequest, date: string) {
  return wr.IsFrozen && (!wr.FreezeStartDate || wr.FreezeStartDate <= date) && (!wr.FreezeEndDate || date <= wr.FreezeEndDate);
}

export function dailyCapacity(wrs: BaseWorkRequest[], absences: CraftpersonAbsence[], site: string, person: string, date: string, shiftHours: number) {
  const leave = activeAbsences(absences, site, person, date);
  const available = leave.some((item) => item.isFullDay) ? 0 : Math.max(0, shiftHours - leave.reduce((total, item) => total + item.unavailableHoursPerDay, 0));
  const assigned = wrs.filter((wr) => wr.SiteId === site && wr.StartDate_DateToPerform === date && wr.AssignedCraftpersonIds.includes(person));
  const allocated = assigned.reduce((total, wr) => total + (frozenOn(wr, date) || wr.Percentage === 78 || wr.Percentage === 100 || wr.Percentage === 27 ? 0 : wr.ExpectedHours ?? 0), 0);
  return { available, allocated, leave, assigned };
}

export function resolveLeaveConflicts(
  requests: BaseWorkRequest[],
  absences: CraftpersonAbsence[],
  people: Array<{ id: string; SiteId: string; Trade: string; ShiftHours: number }>,
  absence: CraftpersonAbsence,
  mode: "unassign" | "reassign",
  audit: (wr: BaseWorkRequest, text: string) => BaseWorkRequest,
) {
  let updated = [...requests];
  let unresolved = 0;
  for (const wr of requests.filter((item) => item.SiteId === absence.siteId && item.StartDate_DateToPerform && item.StartDate_DateToPerform >= absence.startDate && item.StartDate_DateToPerform <= absence.endDate && item.AssignedCraftpersonIds.includes(absence.craftpersonId))) {
    const date = wr.StartDate_DateToPerform!;
    const peer = mode === "reassign" ? people.find((person) => person.SiteId === absence.siteId && person.id !== absence.craftpersonId && person.Trade === wr.TradeName && !wr.AssignedCraftpersonIds.includes(person.id) &&
      (() => { const cap = dailyCapacity(updated, absences, absence.siteId, person.id, date, person.ShiftHours); return !cap.leave.length && cap.allocated + (wr.ExpectedHours ?? 0) <= cap.available; })()) : undefined;
    if (mode === "reassign" && !peer) { unresolved++; continue; }
    const ids = wr.AssignedCraftpersonIds.filter((id) => id !== absence.craftpersonId);
    if (peer) ids.push(peer.id);
    const next = audit({ ...wr, AssignedCraftpersonIds: ids }, `Leave conflict: ${absence.craftpersonId} ${peer ? `reassigned to ${peer.id}` : "unassigned"}`);
    updated = updated.map((item) => item === wr ? next : item);
  }
  return { requests: updated, unresolved };
}

export function calendarDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(date: string, count: number) {
  const [year, month, day] = date.split("-").map(Number);
  return calendarDate(new Date(year, month - 1, day + count, 12));
}
