import type { BaseWorkRequest, LocationFreeze } from "@cafm/shared-schema";
import { addDays } from "./dispatch";

export function freezeLocations(freeze: LocationFreeze) {
  return {
    buildings: freeze.buildingIds ?? [freeze.buildingId],
    floors: freeze.floorIds ?? (freeze.floorId ? [freeze.floorId] : []),
    rooms: freeze.roomIds ?? (freeze.roomId ? [freeze.roomId] : []),
  };
}

export function freezeLocationLabel(freeze: LocationFreeze) {
  const { buildings, floors, rooms } = freezeLocations(freeze);
  return [buildings.join(", "), floors.join(", "), rooms.join(", ")].filter(Boolean).join(" / ");
}

export function matchesFreezeLocation(wr: BaseWorkRequest, freeze: LocationFreeze) {
  if (!freeze.buildingIds) return freeze.buildingId === wr.bl_id && (!freeze.floorId || freeze.floorId === wr.LevelName) && (!freeze.roomId || freeze.roomId === wr.RoomCode);
  const { buildings, floors, rooms } = freezeLocations(freeze);
  return (!!wr.bl_id && buildings.includes(wr.bl_id)) || (!!wr.LevelName && floors.includes(wr.LevelName)) || (!!wr.RoomCode && rooms.includes(wr.RoomCode));
}

export function getActiveFreezeConflictsForWR(wr: BaseWorkRequest, freezes: LocationFreeze[]) {
  if (!wr.AssignedCraftpersonIds.length) return [];
  const times = (wr.CraftpersonAssignments ?? []).filter((entry) => wr.AssignedCraftpersonIds.includes(entry.craftpersonId));
  const timedIds = new Set(times.map((entry) => entry.craftpersonId));
  const intervals = times.map((entry) => [entry.assignedStartDateTime, entry.assignedEndDateTime] as const);
  if (wr.StartDate_DateToPerform && wr.AssignedCraftpersonIds.some((id) => !timedIds.has(id))) {
    intervals.push([`${wr.StartDate_DateToPerform}T00:00`, `${addDays(wr.StartDate_DateToPerform, 1)}T00:00`]);
  }
  return freezes.filter((freeze) => freeze.siteId === wr.SiteId && matchesFreezeLocation(wr, freeze) &&
    !({ PM: freeze.allowPM, FJ: freeze.allowFJ, LJ: freeze.allowLJ })[wr.WR_Type] &&
    intervals.some(([start, end]) => start < freeze.endDateTime && end > freeze.startDateTime));
}

export function describeLocationFreeze(freeze: LocationFreeze) {
  return `${freeze.title} · ${freeze.responsiblePerson} · ${freezeLocationLabel(freeze)} · ${freeze.startDateTime} – ${freeze.endDateTime}`;
}

export function getCurrentLocationFreezes(wr: BaseWorkRequest, freezes: LocationFreeze[], now: string) {
  return freezes.filter((freeze) => freeze.siteId === wr.SiteId && matchesFreezeLocation(wr, freeze) &&
    freeze.startDateTime <= now && now < freeze.endDateTime);
}
