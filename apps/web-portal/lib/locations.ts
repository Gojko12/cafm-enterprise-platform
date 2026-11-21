// V52 Locations Workbench helpers: stats, deletion guards and form validation for the
// buildings / floors / rooms management UI (MASTER_SPEC Section 102).
// Identity fields (bl_id, LevelName, RoomCode) are immutable after creation because
// equipment, desks, PM schedules and work requests reference them; edits cover every
// descriptive field (see validateLocationForm for the rules).
import type { Building, Floor, Room } from "@cafm/shared-schema";
import { pmTargetType } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";

export type LocationKind = "building" | "floor" | "room";
export type AnyLocation = Building | Floor | Room;

export function isLocationActive(item: AnyLocation): boolean {
  return item.IsActive !== false;
}

export function formatGps(building: Building): string | null {
  const gps = building.GPSCoordinates;
  if (!gps) return null;
  const lat = gps.latitude.toFixed(6);
  const lon = gps.longitude.toFixed(6);
  return gps.elevationMeters !== undefined
    ? `${lat}, ${lon} · ${gps.elevationMeters} m`
    : `${lat}, ${lon}`;
}

export interface BuildingStats {
  floors: number;
  rooms: number;
  equipment: number;
  openWrCount: number;
  grossArea: number;
}

export function buildingStats(data: DemoData, siteId: string, blId: string): BuildingStats {
  const floors = data.floors.filter((item) => item.SiteId === siteId && item.bl_id === blId);
  const rooms = data.rooms.filter((item) => item.SiteId === siteId && item.bl_id === blId);
  const wrs = data.workRequests.filter((wr) => wr.SiteId === siteId && wr.bl_id === blId && wr.Percentage < 100);
  return {
    floors: floors.length,
    rooms: rooms.length,
    equipment: data.equipment.filter((eq) => eq.SiteId === siteId && eq.bl_id === blId).length,
    openWrCount: wrs.length,
    grossArea: floors.reduce((sum, floor) => sum + (floor.GrossAreaM2 ?? 0), 0),
  };
}

export interface FloorStats {
  rooms: number;
  equipment: number;
  desks: number;
  openWrCount: number;
  netArea: number;
}

export function floorStats(data: DemoData, siteId: string, blId: string, levelName: string): FloorStats {
  const rooms = data.rooms.filter((item) => item.SiteId === siteId && item.bl_id === blId && item.LevelName === levelName);
  const wrs = data.workRequests.filter((wr) => wr.SiteId === siteId && wr.bl_id === blId && wr.LevelName === levelName && wr.Percentage < 100);
  return {
    rooms: rooms.length,
    equipment: data.equipment.filter((eq) => eq.SiteId === siteId && eq.bl_id === blId && eq.LevelName === levelName).length,
    desks: data.desks.filter((desk) => desk.SiteId === siteId && desk.bl_id === blId && desk.LevelName === levelName).length,
    openWrCount: wrs.length,
    netArea: rooms.reduce((sum, room) => sum + (room.NetAreaM2 ?? 0), 0),
  };
}

export interface RoomStats {
  equipment: number;
  desks: number;
  openWrCount: number;
}

export function roomStats(data: DemoData, siteId: string, blId: string, levelName: string, roomCode: string): RoomStats {
  const wrs = data.workRequests.filter((wr) => wr.SiteId === siteId && wr.bl_id === blId && wr.LevelName === levelName && wr.RoomCode === roomCode && wr.Percentage < 100);
  return {
    equipment: data.equipment.filter((eq) => eq.SiteId === siteId && eq.bl_id === blId && eq.LevelName === levelName && eq.RoomCode === roomCode).length,
    desks: data.desks.filter((desk) => desk.SiteId === siteId && desk.bl_id === blId && desk.LevelName === levelName && desk.RoomCode === roomCode).length,
    openWrCount: wrs.length,
  };
}

// Reasons a location cannot be deleted right now. A location may only be removed when
// nothing references it; otherwise deactivate it instead.
export function locationDeleteBlockers(data: DemoData, siteId: string, kind: LocationKind, target: AnyLocation): string[] {
  const blockers: string[] = [];
  const building = target as Building;
  const floor = target as Floor;
  const room = target as Room;
  if (kind === "building") {
    if (data.floors.some((item) => item.SiteId === siteId && item.bl_id === building.bl_id)) blockers.push("floors exist under this building");
    if (data.rooms.some((item) => item.SiteId === siteId && item.bl_id === building.bl_id)) blockers.push("rooms exist under this building");
    if (data.equipment.some((eq) => eq.SiteId === siteId && eq.bl_id === building.bl_id)) blockers.push("equipment is installed in this building");
    if (data.schedules.some((order) => order.bl_id === building.bl_id)) blockers.push("PM schedules target this building");
    if (data.workRequests.some((wr) => wr.SiteId === siteId && wr.bl_id === building.bl_id)) blockers.push("work requests reference this building");
  } else if (kind === "floor") {
    const floorLevel = (order: { levelName?: string; LevelName?: string }) => order.levelName ?? order.LevelName;
    if (data.rooms.some((item) => item.SiteId === siteId && item.bl_id === floor.bl_id && item.LevelName === floor.LevelName)) blockers.push("rooms exist on this floor");
    if (data.equipment.some((eq) => eq.SiteId === siteId && eq.bl_id === floor.bl_id && eq.LevelName === floor.LevelName)) blockers.push("equipment is installed on this floor");
    if (data.desks.some((desk) => desk.SiteId === siteId && desk.bl_id === floor.bl_id && desk.LevelName === floor.LevelName)) blockers.push("desks are placed on this floor");
    if (data.schedules.some((order) => (pmTargetType(order) === "floor" || pmTargetType(order) === "room") && order.bl_id === floor.bl_id && floorLevel(order) === floor.LevelName)) blockers.push("PM schedules target this floor");
    if (data.workRequests.some((wr) => wr.SiteId === siteId && wr.bl_id === floor.bl_id && wr.LevelName === floor.LevelName)) blockers.push("work requests reference this floor");
  } else {
    const roomLevel = (order: { levelName?: string; LevelName?: string }) => order.levelName ?? order.LevelName;
    const roomCode = (order: { roomCode?: string; RoomCode?: string }) => order.roomCode ?? order.RoomCode;
    if (data.equipment.some((eq) => eq.SiteId === siteId && eq.bl_id === room.bl_id && eq.LevelName === room.LevelName && eq.RoomCode === room.RoomCode)) blockers.push("equipment is installed in this room");
    if (data.desks.some((desk) => desk.SiteId === siteId && desk.bl_id === room.bl_id && desk.LevelName === room.LevelName && desk.RoomCode === room.RoomCode)) blockers.push("desks are placed in this room");
    if (data.schedules.some((order) => pmTargetType(order) === "room" && order.bl_id === room.bl_id && roomLevel(order) === room.LevelName && roomCode(order) === room.RoomCode)) blockers.push("PM schedules target this room");
    if (data.workRequests.some((wr) => wr.SiteId === siteId && wr.bl_id === room.bl_id && wr.LevelName === room.LevelName && wr.RoomCode === room.RoomCode)) blockers.push("work requests reference this room");
  }
  return blockers;
}

const urlPattern = /^https?:\/\/\S+$/i;

export interface LocationFormValues {
  // building
  blId: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  elevation: string;
  // floor + room
  levelName: string;
  floorNumber: string;
  grossArea: string;
  floorPlanUrl: string;
  floorPlanFormat: string;
  // room
  roomCode: string;
  roomCategory: string;
  usage: string;
  department: string;
  costCenter: string;
  netArea: string;
  // shared
  isActive: boolean;
  deskReservable: boolean;
}

export function emptyLocationForm(): LocationFormValues {
  return {
    blId: "", name: "", address: "", latitude: "", longitude: "", elevation: "",
    levelName: "", floorNumber: "", grossArea: "", floorPlanUrl: "", floorPlanFormat: "",
    roomCode: "", roomCategory: "", usage: "", department: "", costCenter: "", netArea: "",
    isActive: true, deskReservable: false,
  };
}

function integerOrEmpty(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function nonNegativeNumberOrEmpty(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

// Mirrors BuildingSchema / FloorSchema / RoomSchema plus one-level-uniqueness
// (bl_id unique per site, LevelName unique per building, RoomCode unique per floor).
export function validateLocationForm(
  kind: LocationKind,
  mode: "create" | "edit",
  values: LocationFormValues,
  data: DemoData,
  siteId: string,
): Partial<Record<keyof LocationFormValues, string>> {
  const errors: Partial<Record<keyof LocationFormValues, string>> = {};
  const trimmed = (key: keyof LocationFormValues) => String(values[key] ?? "").trim();

  if (mode === "create" && !trimmed("blId")) errors.blId = "Building code is required.";
  const hasGps = trimmed("latitude") !== "" || trimmed("longitude") !== "" || trimmed("elevation") !== "";
  const latitude = Number(trimmed("latitude"));
  const longitude = Number(trimmed("longitude"));

  if (kind === "building") {
    if (mode === "create" && data.buildings.some((item) => item.SiteId === siteId && item.bl_id === trimmed("blId")))
      errors.blId = "A building with this code already exists on this site.";
    if (!trimmed("name")) errors.name = "Name is required.";
    if (!trimmed("address")) errors.address = "Address is required.";
    if (hasGps && (!Number.isFinite(latitude) || !Number.isFinite(longitude)))
      errors.latitude = "Longitude and latitude must both be valid numbers (or both empty).";
    if (Number.isFinite(latitude) && (Math.abs(latitude) > 90)) errors.latitude = "Latitude must be between -90 and 90.";
    if (Number.isFinite(longitude) && (Math.abs(longitude) > 180)) errors.longitude = "Longitude must be between -180 and 180.";
    if (trimmed("latitude") === "" && trimmed("longitude") === "" && hasGps && !errors.latitude)
      errors.latitude = "Elevation alone is not a position; enter latitude and longitude too.";
  } else if (kind === "floor") {
    if (!trimmed("blId")) errors.blId = "Building is required.";
    if (mode === "create" && data.floors.some((item) => item.SiteId === siteId && item.bl_id === trimmed("blId") && item.LevelName === trimmed("levelName")))
      errors.levelName = "This building already has a floor with this name.";
    if (!trimmed("levelName")) errors.levelName = "Level name is required.";
    const floorNumber = integerOrEmpty(trimmed("floorNumber"));
    if (trimmed("floorNumber") === "") errors.floorNumber = "Floor number is required (a whole number, e.g. -1 for a basement).";
    else if (Number.isNaN(floorNumber)) errors.floorNumber = "Floor number must be a whole number (e.g. -1 for a basement).";
    const grossArea = nonNegativeNumberOrEmpty(trimmed("grossArea"));
    if (Number.isNaN(grossArea)) errors.grossArea = "Gross area must be zero or a positive number.";
    if (trimmed("floorPlanUrl") && !urlPattern.test(trimmed("floorPlanUrl"))) errors.floorPlanUrl = "Plan URL must start with http:// or https://";
  } else {
    if (!trimmed("blId")) errors.blId = "Building is required.";
    if (!trimmed("levelName")) errors.levelName = "Floor is required.";
    if (mode === "create" && !trimmed("roomCode")) errors.roomCode = "Room code is required.";
    if (mode === "create" && data.rooms.some((item) =>
        item.SiteId === siteId && item.bl_id === trimmed("blId") && item.LevelName === trimmed("levelName") && item.RoomCode === trimmed("roomCode")))
      errors.roomCode = "This floor already has a room with this code.";
    if (!trimmed("name")) errors.name = "Name is required.";
    const netArea = nonNegativeNumberOrEmpty(trimmed("netArea"));
    if (Number.isNaN(netArea)) errors.netArea = "Net area must be zero or a positive number.";
  }
  return errors;
}

// Floors and rooms whose numeric area fields can legitimately be deleted mid-edit.
export function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function sortBySiteOrder<T extends { SiteId: string }>(items: T[], siteId: string, matches: (item: T) => string): T[] {
  return items.filter((item) => item.SiteId === siteId).sort((a, b) => matches(a).localeCompare(matches(b), undefined, { numeric: true }));
}
