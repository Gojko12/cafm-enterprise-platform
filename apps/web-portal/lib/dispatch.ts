import type { BaseWorkRequest, CraftpersonAbsence } from "@cafm/shared-schema";

export type TimedAssignment = NonNullable<BaseWorkRequest["CraftpersonAssignments"]>[number];

export function wallMinutes(value: string) {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) / 60000;
}

export function fromWallMinutes(value: number) {
  return new Date(value * 60000).toISOString().slice(0, 16);
}

export function intervalFor(wr: BaseWorkRequest, person: string): TimedAssignment | null {
  if (!wr.AssignedCraftpersonIds.includes(person)) return null;
  const assignment = wr.CraftpersonAssignments?.find((entry) => entry.craftpersonId === person);
  if (assignment) return assignment;
  if (!wr.StartDate_DateToPerform) return null;
  const start = `${wr.StartDate_DateToPerform}T07:00`;
  return { craftpersonId: person, assignedStartDateTime: start, assignedEndDateTime: fromWallMinutes(wallMinutes(start) + Math.max(30, (wr.ExpectedHours ?? 1) * 60)) };
}

export function schedulePerson(wr: BaseWorkRequest, assignment: TimedAssignment): BaseWorkRequest {
  const ids = [...new Set([...wr.AssignedCraftpersonIds, assignment.craftpersonId])];
  const otherIds = wr.AssignedCraftpersonIds.filter((id) => id !== assignment.craftpersonId);
  const previous = otherIds.map((id) => intervalFor(wr, id)).filter((item): item is TimedAssignment => item !== null);
  return {
    ...wr, AssignedCraftpersonIds: ids, CraftpersonAssignments: [...previous, assignment],
    StartDate_DateToPerform: previous.length === otherIds.length ? assignment.assignedStartDateTime.slice(0, 10) : undefined, StartDateTBD: false,
    ...(ids.length === 1 ? { ExpectedHours: (wallMinutes(assignment.assignedEndDateTime) - wallMinutes(assignment.assignedStartDateTime)) / 60 } : {}),
  };
}

export function assignPerson(wr: BaseWorkRequest, labor: NonNullable<BaseWorkRequest["CraftpersonLabor"]>[number]): BaseWorkRequest {
  if (wr.AssignedCraftpersonIds.includes(labor.craftpersonId)) return wr;
  return {
    ...wr,
    AssignedCraftpersonIds: [...wr.AssignedCraftpersonIds, labor.craftpersonId],
    CraftpersonAssignments: wr.AssignedCraftpersonIds.map((id) => intervalFor(wr, id)).filter((item): item is TimedAssignment => item !== null),
    StartDate_DateToPerform: undefined,
    CraftpersonLabor: wr.CraftpersonLabor?.some((item) => item.craftpersonId === labor.craftpersonId) ? wr.CraftpersonLabor : [...(wr.CraftpersonLabor ?? []), labor],
  };
}

export function unassignPerson(wr: BaseWorkRequest, person: string): BaseWorkRequest {
  const ids = wr.AssignedCraftpersonIds.filter((id) => id !== person);
  const assignments = ids.map((id) => intervalFor(wr, id)).filter((item): item is TimedAssignment => item !== null);
  return { ...wr, AssignedCraftpersonIds: ids, CraftpersonAssignments: assignments,
    StartDate_DateToPerform: undefined, StartDateTBD: assignments.length === 0,
    CraftpersonLabor: (wr.CraftpersonLabor ?? []).filter((item) => item.craftpersonId !== person || item.workingTimeMinutes > 0) };
}

export function absenceInterval(absence: CraftpersonAbsence, day: string) {
  if (absence.status !== "Approved" || day < absence.startDate || day > absence.endDate) return null;
  if (absence.isFullDay || !absence.startTime || !absence.endTime) return [`${day}T00:00`, `${addDays(day, 1)}T00:00`] as const;
  return [`${day}T${absence.startTime}`, `${day}T${absence.endTime}`] as const;
}

export function overlaps(start: string, end: string, otherStart: string, otherEnd: string) {
  return start < otherEnd && end > otherStart;
}

export function assignmentAbsences(absences: CraftpersonAbsence[], site: string, assignment: TimedAssignment) {
  return absences.filter((absence) => {
    if (absence.siteId !== site || absence.craftpersonId !== assignment.craftpersonId || absence.status !== "Approved") return false;
    for (let day = absence.startDate > assignment.assignedStartDateTime.slice(0, 10) ? absence.startDate : assignment.assignedStartDateTime.slice(0, 10); day <= absence.endDate && day <= assignment.assignedEndDateTime.slice(0, 10); day = addDays(day, 1)) {
      const interval = absenceInterval(absence, day);
      if (interval && overlaps(assignment.assignedStartDateTime, assignment.assignedEndDateTime, ...interval)) return true;
      if (day >= assignment.assignedEndDateTime.slice(0, 10)) break;
    }
    return false;
  });
}

export function activeAbsences(absences: CraftpersonAbsence[], site: string, person: string, date: string) {
  return absences.filter((entry) => entry.siteId === site && entry.craftpersonId === person && entry.status === "Approved" && entry.startDate <= date && date <= entry.endDate);
}

export function frozenOn(wr: BaseWorkRequest, date: string) {
  return wr.IsFrozen && (!wr.FreezeStartDate || wr.FreezeStartDate <= date) && (!wr.FreezeEndDate || date <= wr.FreezeEndDate);
}

export function dailyCapacity(wrs: BaseWorkRequest[], absences: CraftpersonAbsence[], site: string, person: string, date: string, shiftHours: number, shiftStart = "07:00", shiftEnd = "15:30") {
  const leave = activeAbsences(absences, site, person, date);
  const shiftBegin = wallMinutes(`${date}T${shiftStart}`), shiftFinish = wallMinutes(`${date}T${shiftEnd}`);
  const intervals = leave.filter((item) => !item.isFullDay && item.startTime && item.endTime).map((item) => ({
    start: Math.max(shiftBegin, wallMinutes(`${date}T${item.startTime}`)),
    end: Math.min(shiftFinish, wallMinutes(`${date}T${item.endTime}`)),
  })).filter((item) => item.end > item.start).sort((a, b) => a.start - b.start);
  let covered = 0, last = shiftBegin;
  for (const interval of intervals) { covered += Math.max(0, interval.end - Math.max(last, interval.start)); last = Math.max(last, interval.end); }
  const legacyHours = leave.filter((item) => !item.isFullDay && (!item.startTime || !item.endTime)).reduce((total, item) => total + item.unavailableHoursPerDay, 0);
  const available = leave.some((item) => item.isFullDay) ? 0 : Math.max(0, shiftHours - covered / 60 - legacyHours);
  const start = `${date}T00:00`, end = `${addDays(date, 1)}T00:00`;
  const assigned = wrs.filter((wr) => {
    if (wr.SiteId !== site) return false;
    const interval = intervalFor(wr, person);
    return interval && overlaps(interval.assignedStartDateTime, interval.assignedEndDateTime, start, end);
  });
  const allocated = assigned.reduce((total, wr) => {
    if (frozenOn(wr, date) || [78, 100, 27].includes(wr.Percentage)) return total;
    const interval = intervalFor(wr, person)!;
    if (!wr.CraftpersonAssignments?.some((item) => item.craftpersonId === person)) return interval.assignedStartDateTime.slice(0, 10) === date ? total + (wr.ExpectedHours ?? 0) : total;
    return total + (Math.min(wallMinutes(interval.assignedEndDateTime), wallMinutes(end)) - Math.max(wallMinutes(interval.assignedStartDateTime), wallMinutes(start))) / 60;
  }, 0);
  return { available, allocated, leave, assigned };
}

export function resolveLeaveConflicts(
  requests: BaseWorkRequest[],
  absences: CraftpersonAbsence[],
  people: Array<{ id: string; SiteId: string; Trade: string; ShiftHours: number; Name?: string; LastName?: string; HourlyRate?: number; shiftStart?: string; shiftEnd?: string; secondaryTradeIds?: string[] }>,
  absence: CraftpersonAbsence,
  mode: "unassign" | "reassign",
  audit: (wr: BaseWorkRequest, text: string) => BaseWorkRequest,
) {
  let updated = [...requests];
  let unresolved = 0;
  for (const wr of requests.filter((item) => {
    const interval = intervalFor(item, absence.craftpersonId);
    return item.SiteId === absence.siteId && interval && assignmentAbsences([absence], absence.siteId, interval).length > 0;
  })) {
    const interval = intervalFor(wr, absence.craftpersonId)!;
    const peer = mode === "reassign" ? people.find((person) => person.SiteId === absence.siteId && person.id !== absence.craftpersonId && (person.Trade === wr.TradeName || (wr.TradeName && person.secondaryTradeIds?.includes(wr.TradeName))) && !wr.AssignedCraftpersonIds.includes(person.id) &&
      (() => {
        if (assignmentAbsences(absences, absence.siteId, { ...interval, craftpersonId: person.id }).length) return false;
        for (let day = interval.assignedStartDateTime.slice(0, 10); day <= interval.assignedEndDateTime.slice(0, 10); day = addDays(day, 1)) {
          const begin = Math.max(wallMinutes(interval.assignedStartDateTime), wallMinutes(`${day}T00:00`));
          const end = Math.min(wallMinutes(interval.assignedEndDateTime), wallMinutes(`${addDays(day, 1)}T00:00`));
          if (end <= begin) continue;
          if (begin < wallMinutes(`${day}T${person.shiftStart ?? "07:00"}`) || end > wallMinutes(`${day}T${person.shiftEnd ?? "15:30"}`)) return false;
          const cap = dailyCapacity(updated, absences, absence.siteId, person.id, day, person.ShiftHours, person.shiftStart, person.shiftEnd);
          if (cap.allocated + (end - begin) / 60 > cap.available || cap.assigned.some((other) => { const scheduled = intervalFor(other, person.id); return scheduled && overlaps(interval.assignedStartDateTime, interval.assignedEndDateTime, scheduled.assignedStartDateTime, scheduled.assignedEndDateTime); })) return false;
        }
        return true;
      })()) : undefined;
    if (mode === "reassign" && !peer) { unresolved++; continue; }
    let result = unassignPerson(wr, absence.craftpersonId);
    if (peer) {
      result = assignPerson(result, { craftpersonId: peer.id, name: peer.Name ?? peer.id, lastName: peer.LastName ?? "", hourlyRate: peer.HourlyRate ?? 0, workingTimeMinutes: 0 });
      result = schedulePerson(result, { ...interval, craftpersonId: peer.id });
    }
    const next = audit(result, `Leave conflict: ${absence.craftpersonId} ${peer ? `reassigned to ${peer.id}` : "unassigned"}`);
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
