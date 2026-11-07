import type { BaseWorkRequest, LocationFreeze } from "@cafm/shared-schema";
import { addDays } from "./dispatch";

export function getActiveFreezeConflictsForWR(wr: BaseWorkRequest, freezes: LocationFreeze[]) {
  if (!wr.AssignedCraftpersonIds.length) return [];
  const times = (wr.CraftpersonAssignments ?? []).filter((entry) => wr.AssignedCraftpersonIds.includes(entry.craftpersonId));
  const timedIds = new Set(times.map((entry) => entry.craftpersonId));
  const intervals = times.map((entry) => [entry.assignedStartDateTime, entry.assignedEndDateTime] as const);
  if (wr.StartDate_DateToPerform && wr.AssignedCraftpersonIds.some((id) => !timedIds.has(id))) {
    intervals.push([`${wr.StartDate_DateToPerform}T00:00`, `${addDays(wr.StartDate_DateToPerform, 1)}T00:00`]);
  }
  return freezes.filter((freeze) => freeze.siteId === wr.SiteId && freeze.buildingId === wr.bl_id &&
    (!freeze.floorId || freeze.floorId === wr.LevelName) && (!freeze.roomId || freeze.roomId === wr.RoomCode) &&
    !({ PM: freeze.allowPM, FJ: freeze.allowFJ, LJ: freeze.allowLJ })[wr.WR_Type] &&
    intervals.some(([start, end]) => start < freeze.endDateTime && end > freeze.startDateTime));
}

export function describeLocationFreeze(freeze: LocationFreeze) {
  return `${freeze.title} · ${freeze.responsiblePerson} · ${[freeze.buildingId, freeze.floorId, freeze.roomId].filter(Boolean).join(" / ")} · ${freeze.startDateTime} – ${freeze.endDateTime}`;
}

export function getCurrentLocationFreezes(wr: BaseWorkRequest, freezes: LocationFreeze[], now: string) {
  return freezes.filter((freeze) => freeze.siteId === wr.SiteId && freeze.buildingId === wr.bl_id &&
    (!freeze.floorId || freeze.floorId === wr.LevelName) && (!freeze.roomId || freeze.roomId === wr.RoomCode) &&
    freeze.startDateTime <= now && now < freeze.endDateTime);
}
