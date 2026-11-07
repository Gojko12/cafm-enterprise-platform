import type { BaseWorkRequest } from "@cafm/shared-schema";
import type { TimedAssignment } from "./dispatch";

type Filters = {
  dates: string[]; weekends: boolean; firstHour: number; lastHour: number;
  people: string[] | null; trades: string[] | null; buildings: string[] | null;
  availability: string; types: string[];
};

export function revealAssignment(wr: BaseWorkRequest, assignment: TimedAssignment, trade: string, filters: Filters) {
  const day = assignment.assignedStartDateTime.slice(0, 10);
  const startHour = Number(assignment.assignedStartDateTime.slice(11, 13));
  const endHour = assignment.assignedEndDateTime.slice(0, 10) !== day ? 24 :
    Math.ceil(Number(assignment.assignedEndDateTime.slice(11, 13)) + Number(assignment.assignedEndDateTime.slice(14, 16)) / 60);
  const weekend = [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
  const required = [wr.WR_Type, ...(wr.IsFrozen ? ["Frozen"] : []), ...([78, 100].includes(wr.Percentage) ? ["Completed"] : [])];
  const changed: string[] = [];
  if (!filters.dates.includes(day)) changed.push("date");
  if (!filters.weekends && weekend) changed.push("weekends");
  if (startHour < filters.firstHour) changed.push("start hour");
  if (endHour > filters.lastHour) changed.push("end hour");
  if (filters.people !== null && !filters.people.includes(assignment.craftpersonId)) changed.push("craftpeople");
  if (filters.trades !== null && !filters.trades.includes(trade)) changed.push("trades");
  if (filters.buildings !== null && (!wr.bl_id || !filters.buildings.includes(wr.bl_id))) changed.push("buildings");
  if (filters.availability !== "All") changed.push("availability");
  if (required.some((item) => !filters.types.includes(item))) changed.push("request type/status");
  return {
    day, weekends: filters.weekends || weekend, firstHour: Math.min(filters.firstHour, startHour), lastHour: Math.max(filters.lastHour, endHour),
    people: filters.people === null ? null : [...new Set([...filters.people, assignment.craftpersonId])],
    trades: filters.trades === null ? null : [...new Set([...filters.trades, trade])],
    buildings: filters.buildings === null || !wr.bl_id ? null : [...new Set([...filters.buildings, wr.bl_id])],
    types: [...new Set([...filters.types, ...required])], changed,
  };
}
