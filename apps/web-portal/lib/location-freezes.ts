import type { BaseWorkRequest, LocationFreeze } from "@cafm/shared-schema";
import { formatDateDDMMYYYY, formatDateRangeDDMMYYYY, formatDateTimeDDMMYYYY } from "@cafm/shared-schema";
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
  return `${freeze.title} · ${freeze.responsiblePerson} · ${freezeLocationLabel(freeze)} · ${formatFreezePeriodWindow(freeze.startDateTime, freeze.endDateTime)}`;
}

function parseLocalDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value ?? "");
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0));
}

export function formatHumanDateTime(value: string | undefined, _now: Date = new Date()) {
  if (!value) return "";
  return /^(\d{4})-(\d{2})-(\d{2})$/.test(value) ? formatDateDDMMYYYY(value) : formatDateTimeDDMMYYYY(value);
}

export function formatFreezePeriodWindow(startIso: string, endIso: string, _now: Date = new Date()) {
  const start = parseLocalDateTime(startIso), end = parseLocalDateTime(endIso);
  if (!start || !end) return "Invalid date range";
  return formatDateRangeDDMMYYYY(startIso, endIso);
}

export function getWorkRequestFreezes(wr: BaseWorkRequest, freezes: LocationFreeze[], now: string) {
  const merged = new Map<string, LocationFreeze>();
  for (const freeze of [...getCurrentLocationFreezes(wr, freezes, now), ...getActiveFreezeConflictsForWR(wr, freezes)]) merged.set(freeze.id, freeze);
  return [...merged.values()];
}

export function localNowIso(now: Date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export const FREEZE_ACK_STATEMENTS = [
  "Team Leader is aware I am performing this work during the freeze period",
  "We are taking operational responsibility for executing this task",
  "We will proceed with extra care and follow all freeze precautions",
] as const;

export function buildFreezeAcknowledgment(freezes: LocationFreeze[], person: string, at: string = new Date().toISOString()) {
  return {
    by: person, at,
    freezeTitle: freezes.map((item) => item.title).join(", "),
    freezeWindow: freezes.map((item) => formatFreezePeriodWindow(item.startDateTime, item.endDateTime)).join("; "),
  };
}


export function getCurrentLocationFreezes(wr: BaseWorkRequest, freezes: LocationFreeze[], now: string) {
  return freezes.filter((freeze) => freeze.siteId === wr.SiteId && matchesFreezeLocation(wr, freeze) &&
    freeze.startDateTime <= now && now < freeze.endDateTime);
}
