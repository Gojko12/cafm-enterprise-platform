// V53 (MASTER_SPEC Section 103): safe renames for buildings, floors and rooms.
// The user-facing codes (bl_id, LevelName, RoomCode) stay THE identity of every
// location; renaming one rewrites every stored reference in the same setData, so
// the Stage B delta push and the server's validateSite (which proves schedules
// against buildings/floors/rooms) always see a self-consistent site. Collections
// that only carry location-derived display text (ProblemLocation, freeze titles)
// are intentionally untouched.
//
// Reference inventory this cascade covers (field spellings verified against the
// shared schemas): floors (bl_id), rooms (bl_id, LevelName), desks (bl_id,
// LevelName, RoomCode), equipment (bl_id, LevelName, RoomCode), work requests and
// deleted work requests (bl_id, LevelName, RoomCode), PM schedules and suppressed
// PM occurrences (bl_id plus LevelName/levelName and RoomCode/roomCode variants),
// location freezes (buildingId/buildingIds, floorId/floorIds, roomId/roomIds),
// mission events (buildingIds/floorIds/roomIds), equipment inspection sheets
// (buildingId, roomId must keep matching their equipment) and BIM element links
// (`buildingId:ifcGlobalId` keys).
import type { Building, Floor, Room } from "@cafm/shared-schema";
import type { DemoData, BimElementLink } from "./cafm-data";
import type { AuditAssurance } from "./equipment-inspection";
import type { LocationKind } from "./locations";

export interface LocationRenameRequest {
  kind: LocationKind;
  siteId: string;
  from: { blId: string; levelName: string; roomCode: string };
  to: { blId: string; levelName: string; roomCode: string };
}

export interface RenameImpactEntry {
  label: string;
  count: number;
}

type NameSource = {
  kind: LocationKind;
  mode: string;
  building?: Building | null;
  floor?: Floor | null;
  room?: Room | null;
};

type NameValues = { blId: string; levelName: string; roomCode: string };

const identityOf = (blId: string, levelName = "", roomCode = "") => ({ blId, levelName, roomCode });

// Detects whether this editor submit is a rename (edit mode + identity change) and
// builds the cascade request for it. Returns null when the identity is untouched.
export function formRenameRequest(source: NameSource, values: NameValues): LocationRenameRequest | null {
  if (source.mode !== "edit") return null;
  if (source.kind === "building" && source.building && values.blId.trim() !== source.building.bl_id)
    return { kind: "building", siteId: source.building.SiteId, from: identityOf(source.building.bl_id), to: identityOf(values.blId.trim()) };
  if (source.kind === "floor" && source.floor && values.levelName.trim() !== source.floor.LevelName)
    return {
      kind: "floor", siteId: source.floor.SiteId,
      from: identityOf(source.floor.bl_id, source.floor.LevelName),
      to: identityOf(source.floor.bl_id, values.levelName.trim()),
    };
  if (source.kind === "room" && source.room && values.roomCode.trim() !== source.room.RoomCode)
    return {
      kind: "room", siteId: source.room.SiteId,
      from: identityOf(source.room.bl_id, source.room.LevelName, source.room.RoomCode),
      to: identityOf(source.room.bl_id, source.room.LevelName, values.roomCode.trim()),
    };
  return null;
}

export function renameLabel(request: LocationRenameRequest): { from: string; to: string } {
  const pick = (identity: { blId: string; levelName: string; roomCode: string }) =>
    request.kind === "building" ? identity.blId : request.kind === "floor" ? identity.levelName : identity.roomCode;
  return { from: pick(request.from), to: pick(request.to) };
}

// Generic match/map for site-scoped rows that reference a location with the flat
// triple bl_id / LevelName / RoomCode (rooms, desks, equipment, work requests):
// the more specific the rename, the more fields must line up.
function refMatch<T extends { bl_id?: string; LevelName?: string; RoomCode?: string }>(request: LocationRenameRequest, ref: T): boolean {
  const value = (field: string | undefined) => field ?? "";
  if (request.kind === "building") return value(ref.bl_id) === request.from.blId;
  if (request.kind === "floor") return value(ref.bl_id) === request.from.blId && value(ref.LevelName) === request.from.levelName;
  return value(ref.bl_id) === request.from.blId && value(ref.LevelName) === request.from.levelName && value(ref.RoomCode) === request.from.roomCode;
}

function refMap<T extends { bl_id?: string; LevelName?: string; RoomCode?: string }>(request: LocationRenameRequest, ref: T): T {
  const next = { ...ref };
  if (request.kind === "building" && next.bl_id !== undefined) next.bl_id = request.to.blId;
  if (request.kind === "floor" && next.LevelName !== undefined) next.LevelName = request.to.levelName;
  if (request.kind === "room" && next.RoomCode !== undefined) next.RoomCode = request.to.roomCode;
  return next;
}

// PM target variants: the same reference may be stored as LevelName/levelName and
// RoomCode/roomCode; preserve whichever spelling the record uses.
function pmTargetMatch(request: LocationRenameRequest, order: { bl_id?: string; levelName?: string; LevelName?: string; roomCode?: string; RoomCode?: string }): boolean {
  if (order.bl_id !== request.from.blId) return false;
  const level = order.levelName ?? order.LevelName;
  if (request.kind === "building") return true;
  if (level !== request.from.levelName) return false;
  return request.kind === "floor" || (order.roomCode ?? order.RoomCode) === request.from.roomCode;
}

function pmTargetMap<T extends { bl_id?: string; levelName?: string; LevelName?: string; roomCode?: string; RoomCode?: string }>(request: LocationRenameRequest, order: T): T {
  const next = { ...order };
  if (request.kind === "building") next.bl_id = request.to.blId;
  if (request.kind === "floor") {
    if (next.levelName !== undefined) next.levelName = request.to.levelName;
    else next.LevelName = request.to.levelName;
  } else {
    if (next.roomCode !== undefined) next.roomCode = request.to.roomCode;
    else next.RoomCode = request.to.roomCode;
  }
  return next;
}

// Undefined rows stay undefined (optional collections never flip to []), and rows
// whose map result is identical are neither counted nor copied.
function rewrite<T>(rows: T[] | undefined, matches: (row: T) => boolean, map: (row: T) => T): { rows: T[] | undefined; changed: number } {
  if (!rows) return { rows: undefined, changed: 0 };
  let changed = 0;
  const next = rows.map((row) => {
    if (!matches(row)) return row;
    const mapped = map(row);
    if (mapped === row) return row;
    changed += 1;
    return mapped;
  });
  return { rows: next, changed };
}

// A freeze/mission floor or room id is matched together with its buildings; only
// entries scoped to exactly the renamed building are safe to rewrite, otherwise a
// shared "Level 0" across several buildings would be ambiguous. Multi-building
// freezes keep their old ids (documented limitation; the freeze engine only
// enforces the site scope server-side).
function scopedToRenamedBuilding(buildingIds: string[] | undefined, buildingId: string, from: string): boolean {
  return buildingIds ? buildingIds.length === 1 && buildingIds[0] === from : buildingId === from;
}

function runCascade(data: DemoData, request: LocationRenameRequest): { next: DemoData; counts: RenameImpactEntry[] } {
  let next = data;
  const counts: RenameImpactEntry[] = [];
  const push = (label: string, changed: number) => { if (changed > 0) counts.push({ label, count: changed }); };

  if (request.kind === "building") {
    // A building rename flips the parent bl_id on every floor below it.
    const pass = rewrite(data.floors, (floor) => floor.SiteId === request.siteId && floor.bl_id === request.from.blId,
      (floor) => ({ ...floor, bl_id: request.to.blId }));
    if (pass.rows) next = { ...next, floors: pass.rows };
    push("floors", pass.changed);
  }

  {
    const pass = rewrite(next.rooms, (row) => row.SiteId === request.siteId && refMatch(request, row), (row) => refMap(request, row));
    if (pass.rows) next = { ...next, rooms: pass.rows };
    push("rooms", pass.changed);
  }
  {
    const pass = rewrite(next.desks, (row) => row.SiteId === request.siteId && refMatch(request, row), (row) => refMap(request, row));
    if (pass.rows) next = { ...next, desks: pass.rows };
    push("desks", pass.changed);
  }
  {
    const pass = rewrite(next.equipment, (row) => row.SiteId === request.siteId && refMatch(request, row), (row) => refMap(request, row));
    if (pass.rows) next = { ...next, equipment: pass.rows };
    push("equipment", pass.changed);
  }
  {
    const pass = rewrite(next.workRequests, (row) => row.SiteId === request.siteId && refMatch(request, row), (row) => refMap(request, row));
    if (pass.rows) next = { ...next, workRequests: pass.rows };
    push("work requests", pass.changed);
  }
  {
    const pass = rewrite(next.deletedWorkRequests, (row) => row.SiteId === request.siteId && refMatch(request, row), (row) => refMap(request, row));
    if (pass.rows) next = { ...next, deletedWorkRequests: pass.rows };
    push("deleted work requests", pass.changed);
  }
  {
    const pass = rewrite(next.schedules, (order) => order.SiteId === request.siteId && pmTargetMatch(request, order),
      (order) => pmTargetMap(request, order));
    if (pass.rows) next = { ...next, schedules: pass.rows };
    push("PM schedules", pass.changed);
  }
  {
    const pass = rewrite(next.suppressedPmOccurrences, (row) => row.siteId === request.siteId && pmTargetMatch(request, row),
      (row) => pmTargetMap(request, row));
    if (pass.rows) next = { ...next, suppressedPmOccurrences: pass.rows };
    push("suppressed PM occurrences", pass.changed);
  }

  {
    const pass = rewrite(next.locationFreezes, (freeze) => {
      if (freeze.siteId !== request.siteId) return false;
      if (request.kind === "building")
        return freeze.buildingId === request.from.blId || (freeze.buildingIds ?? []).includes(request.from.blId);
      if (!scopedToRenamedBuilding(freeze.buildingIds, freeze.buildingId, request.from.blId)) return false;
      return request.kind === "floor"
        ? freeze.floorId === request.from.levelName || (freeze.floorIds ?? []).includes(request.from.levelName)
        : freeze.roomId === request.from.roomCode || (freeze.roomIds ?? []).includes(request.from.roomCode);
    }, (freeze) => {
      const updated = { ...freeze };
      if (request.kind === "building" && freeze.buildingId === request.from.blId) updated.buildingId = request.to.blId;
      if (request.kind === "building" && freeze.buildingIds)
        updated.buildingIds = freeze.buildingIds.map((id) => id === request.from.blId ? request.to.blId : id);
      if (request.kind === "floor" && freeze.floorId === request.from.levelName) updated.floorId = request.to.levelName;
      if (request.kind === "floor" && freeze.floorIds)
        updated.floorIds = freeze.floorIds.map((id) => id === request.from.levelName ? request.to.levelName : id);
      if (request.kind === "room" && freeze.roomId === request.from.roomCode) updated.roomId = request.to.roomCode;
      if (request.kind === "room" && freeze.roomIds)
        updated.roomIds = freeze.roomIds.map((id) => id === request.from.roomCode ? request.to.roomCode : id);
      return updated;
    });
    if (pass.rows) next = { ...next, locationFreezes: pass.rows };
    push("location freezes", pass.changed);
  }

  {
    const pass = rewrite(next.missionEvents, (event) => {
      if (event.siteId !== request.siteId) return false;
      if (request.kind === "building") return event.buildingIds.includes(request.from.blId);
      if (!scopedToRenamedBuilding(event.buildingIds, "", request.from.blId)) return false;
      return request.kind === "floor"
        ? (event.floorIds ?? []).includes(request.from.levelName)
        : (event.roomIds ?? []).includes(request.from.roomCode);
    }, (event) => {
      if (request.kind === "building") return { ...event, buildingIds: event.buildingIds.map((id) => id === request.from.blId ? request.to.blId : id) };
      if (request.kind === "floor") return { ...event, floorIds: (event.floorIds ?? []).map((id) => id === request.from.levelName ? request.to.levelName : id) };
      return { ...event, roomIds: (event.roomIds ?? []).map((id) => id === request.from.roomCode ? request.to.roomCode : id) };
    });
    if (pass.rows) next = { ...next, missionEvents: pass.rows };
    push("mission events", pass.changed);
  }

  {
    const sheets = next.auditAssurance?.equipmentInspections;
    if (sheets) {
      const pass = rewrite(sheets, (sheet) => {
        if (sheet.siteId !== request.siteId) return false;
        if (request.kind === "building") return sheet.buildingId === request.from.blId;
        // Sheets store no level, so a floor rename cannot orphan them. A room
        // rename keeps sheet.roomId equal to the equipment's own RoomCode.
        return request.kind === "room" && sheet.buildingId === request.from.blId && sheet.roomId === request.from.roomCode;
      }, (sheet) => request.kind === "building"
        ? { ...sheet, buildingId: request.to.blId }
        : { ...sheet, roomId: request.to.roomCode });
      if (pass.rows && pass.changed > 0) {
        const auditAssurance: AuditAssurance = { ...next.auditAssurance!, equipmentInspections: pass.rows };
        next = { ...next, auditAssurance };
        push("equipment inspection sheets", pass.changed);
      }
    }
  }

  if (request.kind === "building" && data.bimElementLinks) {
    const entries = Object.entries(data.bimElementLinks).filter(([, link]) => link.buildingId === request.from.blId);
    if (entries.length) {
      const bimElementLinks: Record<string, BimElementLink> = { ...data.bimElementLinks };
      for (const [key, link] of entries) {
        delete bimElementLinks[key];
        bimElementLinks[`${request.to.blId}:${key.slice(request.from.blId.length + 1)}`] = { ...link, buildingId: request.to.blId };
      }
      next = { ...next, bimElementLinks };
      counts.push({ label: "BIM element links", count: entries.length });
    }
  }

  return { next, counts };
}

// Applies every reference rewrite for one rename to the full site state. The edited
// location row itself has already been replaced by the caller; this only fixes the
// rows that point at the old identity.
export function applyLocationRename(data: DemoData, request: LocationRenameRequest): DemoData {
  return runCascade(data, request).next;
}

// Human-readable impact summary for the editor's confirmation UI: which
// collections change and how many records each.
export function locationRenameImpact(data: DemoData, request: LocationRenameRequest): RenameImpactEntry[] {
  return runCascade(data, request).counts;
}
