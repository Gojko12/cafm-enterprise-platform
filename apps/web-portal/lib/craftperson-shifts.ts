import type { CraftpersonShift, ShiftType } from "@cafm/shared-schema";

export type ShiftPerson = { baseShiftType?: ShiftType; shiftStart?: string; shiftEnd?: string; shiftOverrides?: Record<string, CraftpersonShift> };
export const DEFAULT_SHIFTS: Record<Exclude<ShiftType, "Custom">, CraftpersonShift> = {
  Early: { shiftType: "Early", shiftStart: "06:00", shiftEnd: "14:30" },
  Standard: { shiftType: "Standard", shiftStart: "07:00", shiftEnd: "15:30" },
  Late: { shiftType: "Late", shiftStart: "14:00", shiftEnd: "22:30" },
  Night: { shiftType: "Night", shiftStart: "22:00", shiftEnd: "06:30" },
};
export function getEffectiveCraftpersonShift(person: ShiftPerson, dateStr: string): CraftpersonShift {
  const type = person.baseShiftType ?? "Standard";
  const preset = type === "Custom" ? DEFAULT_SHIFTS.Standard : DEFAULT_SHIFTS[type];
  return person.shiftOverrides?.[dateStr] ?? { shiftType: type, shiftStart: person.shiftStart ?? preset.shiftStart, shiftEnd: person.shiftEnd ?? preset.shiftEnd };
}
export function shiftSegments(person: ShiftPerson, day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  const start = date.getTime() / 60000, end = start + 1440;
  const previous = new Date(date.getTime() - 86400000).toISOString().slice(0, 10);
  const segments = [previous, day].map((shiftDay) => {
    const shift = getEffectiveCraftpersonShift(person, shiftDay);
    const origin = Date.parse(`${shiftDay}T00:00:00Z`) / 60000;
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const a = origin + minutes(shift.shiftStart), b = origin + minutes(shift.shiftEnd) + (shift.shiftEnd <= shift.shiftStart ? 1440 : 0);
    return { start: Math.max(start, a), end: Math.min(end, b) };
  }).filter((segment) => segment.start < segment.end).sort((a, b) => a.start - b.start);
  return segments.reduce<Array<{ start: number; end: number }>>((result, segment) => {
    const last = result[result.length - 1];
    if (last && segment.start <= last.end) last.end = Math.max(last.end, segment.end);
    else result.push({ ...segment });
    return result;
  }, []);
}
export function dailyShiftCapacitySegments(person: ShiftPerson, day: string, capacityHours: number) {
  const midnight = Date.parse(`${day}T00:00:00Z`) / 60000;
  const previous = new Date((midnight - 1440) * 60000).toISOString().slice(0, 10);
  return [previous, day].map((shiftDay) => {
    const shift = getEffectiveCraftpersonShift(person, shiftDay);
    const origin = Date.parse(`${shiftDay}T00:00:00Z`) / 60000;
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const begin = origin + minutes(shift.shiftStart);
    const finish = origin + minutes(shift.shiftEnd) + (shift.shiftEnd <= shift.shiftStart ? 1440 : 0);
    return { start: Math.max(midnight, begin), end: Math.min(midnight + 1440, finish), rate: Math.min(1, capacityHours * 60 / (finish - begin)) };
  }).filter((segment) => segment.start < segment.end);
}
export function isOutsideShift(person: ShiftPerson, start: string, end: string) {
  let cursor = Date.parse(`${start.slice(0, 16)}:00Z`) / 60000;
  const finish = Date.parse(`${end.slice(0, 16)}:00Z`) / 60000;
  while (cursor < finish) {
    const day = new Date(cursor * 60000).toISOString().slice(0, 10);
    const segment = shiftSegments(person, day).find((item) => item.start <= cursor && item.end > cursor);
    if (!segment) return true;
    cursor = Math.min(finish, segment.end);
  }
  return false;
}
