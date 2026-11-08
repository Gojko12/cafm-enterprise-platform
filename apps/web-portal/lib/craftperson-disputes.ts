import type { BaseWorkRequest, CraftpersonAbsence } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { getEffectiveCraftpersonShift, isOutsideShift } from "./craftperson-shifts";
import { absenceInterval, addDays, dailyCapacity, fromWallMinutes, intervalFor, wallMinutes } from "./dispatch";

type Person = DemoData["craftspeople"][number];
export type CraftpersonDispute = {
  date: string;
  type: "Leave" | "Shift Hours" | "Capacity" | "Overlap";
  wr: BaseWorkRequest;
  message: string;
};

export function getCraftpersonDisputes(person: Person, workRequests: BaseWorkRequest[], absences: CraftpersonAbsence[], dateRange: { start: string; end: string }): CraftpersonDispute[] {
  const result: CraftpersonDispute[] = [];
  const assignments = workRequests.filter((wr) => wr.SiteId === person.SiteId).flatMap((wr) => {
    const interval = intervalFor(wr, person.id);
    if (!interval) return [];
    const start = wallMinutes(interval.assignedStartDateTime), end = wallMinutes(interval.assignedEndDateTime);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ wr, start, end }] : [];
  });
  for (let day = dateRange.start; day <= dateRange.end; day = addDays(day, 1)) {
    const start = wallMinutes(`${day}T00:00`), end = start + 1440;
    const entries = assignments.filter((item) => item.start < end && item.end > start);
    const allocated = entries.reduce((sum, item) => sum + (Math.min(end, item.end) - Math.max(start, item.start)) / 60, 0);
    const available = dailyCapacity([], absences, person.SiteId, person.id, day, person.ShiftHours, person.shiftStart, person.shiftEnd, person).available;
    for (const entry of entries) {
      const begin = Math.max(start, entry.start), finish = Math.min(end, entry.end);
      const time = `${fromWallMinutes(begin).slice(11)}–${finish === end ? "24:00" : fromWallMinutes(finish).slice(11)}`;
      const prefix = `${entry.wr.WR_ID} ${time}`;
      const shift = getEffectiveCraftpersonShift(person, day);
      if (isOutsideShift(person, fromWallMinutes(begin), fromWallMinutes(finish))) result.push({ date: day, type: "Shift Hours", wr: entry.wr, message: `${prefix} is outside ${shift.shiftType} shift ${shift.shiftStart}–${shift.shiftEnd}` });
      for (const absence of absences) {
        if (absence.siteId !== person.SiteId || absence.craftpersonId !== person.id || !["Vacation", "Training", "SickLeave"].includes(absence.absenceType)) continue;
        const interval = absenceInterval(absence, day);
        if (interval && begin < wallMinutes(interval[1]) && finish > wallMinutes(interval[0])) result.push({ date: day, type: "Leave", wr: entry.wr, message: `${prefix} overlaps ${absence.absenceType}` });
      }
      if (allocated > available + 0.0001) result.push({ date: day, type: "Capacity", wr: entry.wr, message: `${prefix}: ${allocated.toFixed(1)} h scheduled / ${available.toFixed(1)} h available` });
      for (const other of entries) {
        if (other.wr.WR_ID <= entry.wr.WR_ID || entry.start >= other.end || entry.end <= other.start || Math.max(begin, other.start) >= Math.min(finish, other.end)) continue;
        result.push({ date: day, type: "Overlap", wr: entry.wr, message: `${prefix} overlaps ${other.wr.WR_ID}` });
        result.push({ date: day, type: "Overlap", wr: other.wr, message: `${other.wr.WR_ID} overlaps ${entry.wr.WR_ID}` });
      }
    }
  }
  return result;
}
