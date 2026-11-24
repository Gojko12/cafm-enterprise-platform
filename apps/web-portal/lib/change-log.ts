import {
  CHANGE_LOG_CAP,
  CHANGE_LOG_TYPE_LABELS,
  ChangeLogEntrySchema,
  formatDateDDMMYYYY,
  isChangeTypeEnabled,
  type ChangeLogEntry,
  type ChangeLogSettings,
  type ChangeLogType,
  type SiteId,
} from "@cafm/shared-schema";

import type { DemoData } from "./cafm-data";

/**
 * V62 (MASTER_SPEC Section 112): generic, configurable change log.
 *
 * diffChangeLog(prev, next, ...) compares the watched collections of two state
 * snapshots and produces ChangeLogEntry rows for the rules enabled in
 * changeLogSettings (default: all enabled). oldKey === newKey for ordinary value
 * changes; they differ only for location renames, where the identity field itself
 * changed. Entries are newest-first and capped at CHANGE_LOG_CAP per site.
 * Pure module, no React: unit-testable and reusable from the store pipeline.
 */

type AnyRecord = Record<string, unknown>;

const VALUE_LIMIT = 160;

function short(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return text.length > VALUE_LIMIT ? `${text.slice(0, VALUE_LIMIT)}…` : text;
}

function timeHHMMSS(at: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(at.getHours())}:${p(at.getMinutes())}:${p(at.getSeconds())}`;
}

let idCounter = 0;

function makeEntry(siteId: SiteId, actor: string, atISO: string, changeType: ChangeLogType, collection: string, recordKey: string, oldKey: string, newKey: string, oldValue: string, newValue: string): ChangeLogEntry {
  const at = new Date(atISO);
  idCounter = (idCounter + 1) % 100000;
  return ChangeLogEntrySchema.parse({
    id: `cl-${atISO.replace(/[^0-9]/g, "")}-${idCounter}`,
    siteId,
    changeType,
    collection,
    recordKey,
    oldKey,
    newKey,
    oldValue,
    newValue,
    modifiedBy: actor,
    modifiedDate: formatDateDDMMYYYY(at),
    modifiedTime: timeHHMMSS(at),
    at: atISO,
  });
}

/** Generic per-record diff. keyOf gives the stable identity; modes select created / changed / removed. */
function diffCollection(
  prevRows: AnyRecord[] | undefined, nextRows: AnyRecord[] | undefined, keyOf: (row: AnyRecord) => string,
  ctx: { siteId: SiteId; actor: string; atISO: string; settings?: ChangeLogSettings; changeType: ChangeLogType; collection: string; valueOf: (row: AnyRecord) => unknown },
  modes: { created?: boolean; changed?: boolean; removed?: boolean } = { created: true, changed: true, removed: true },
): ChangeLogEntry[] {
  if (!isChangeTypeEnabled(ctx.settings, ctx.changeType)) return [];
  const prev = prevRows ?? [], next = nextRows ?? [];
  const prevMap = new Map(prev.map((row) => [keyOf(row), row]));
  const nextMap = new Map(next.map((row) => [keyOf(row), row]));
  const out: ChangeLogEntry[] = [];
  for (const [key, row] of nextMap) {
    const old = prevMap.get(key);
    if (!old) {
      if (modes.created) out.push(makeEntry(ctx.siteId, ctx.actor, ctx.atISO, ctx.changeType, ctx.collection, key, key, key, "", short(ctx.valueOf(row))));
    } else if (modes.changed !== false && JSON.stringify(ctx.valueOf(old)) !== JSON.stringify(ctx.valueOf(row))) {
      out.push(makeEntry(ctx.siteId, ctx.actor, ctx.atISO, ctx.changeType, ctx.collection, key, key, key, short(ctx.valueOf(old)), short(ctx.valueOf(row))));
    }
  }
  for (const [key, row] of prevMap) {
    if (!nextMap.has(key) && modes.removed) {
      out.push(makeEntry(ctx.siteId, ctx.actor, ctx.atISO, ctx.changeType, ctx.collection, key, key, key, short(ctx.valueOf(row)), ""));
    }
  }
  return out;
}

/** Location renames: an old identity disappears while a new identity appears with an otherwise identical record. */
function diffLocationRenames(
  prevRows: AnyRecord[] | undefined, nextRows: AnyRecord[] | undefined, identityFields: string[],
  ctx: { siteId: SiteId; actor: string; atISO: string; settings?: ChangeLogSettings; collection: string },
): ChangeLogEntry[] {
  if (!isChangeTypeEnabled(ctx.settings, "location.rename")) return [];
  const prev = prevRows ?? [], next = nextRows ?? [];
  const identity = (row: AnyRecord) => identityFields.map((f) => String(row[f] ?? "")).join("|");
  const strip = (row: AnyRecord) => JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k]) => !identityFields.includes(k))));
  const prevMap = new Map(prev.map((row) => [identity(row), row]));
  const nextMap = new Map(next.map((row) => [identity(row), row]));
  const out: ChangeLogEntry[] = [];
  for (const [oldId, oldRow] of prevMap) {
    if (nextMap.has(oldId)) continue;
    const renamed = next.find((row) => !prevMap.has(identity(row)) && strip(row) === strip(oldRow));
    if (renamed) {
      const newId = identity(renamed);
      out.push(makeEntry(ctx.siteId, ctx.actor, ctx.atISO, "location.rename", ctx.collection, newId, oldId, newId, oldId, newId));
    } else {
      out.push(makeEntry(ctx.siteId, ctx.actor, ctx.atISO, "location.rename", ctx.collection, oldId, oldId, oldId, oldId, ""));
    }
  }
  for (const [newId, row] of nextMap) {
    if (!prevMap.has(newId) && !prev.some((old) => !nextMap.has(identity(old)) && strip(old) === strip(row))) {
      out.push(makeEntry(ctx.siteId, ctx.actor, ctx.atISO, "location.rename", ctx.collection, newId, newId, newId, "", newId));
    }
  }
  return out;
}

const wrStatus = (row: AnyRecord) => `${String(row.WorkRequestStatus ?? "")} · ${String(row.WorkRequestSubstatus ?? "")} · ${String(row.Percentage ?? "")}%`;
const wrAssignment = (row: AnyRecord) => (row.AssignedCraftpersonIds as string[] | undefined)?.join(", ") ?? "";
/** V67: watch ONLY the exceptions object, so a profile edit that does not touch
 *  permissionExceptions never logs (reset-to-defaults logs as a removal). */
const personExceptions = (row: AnyRecord) => row.permissionExceptions ?? null;

/** Computes the log entries for one state transition. Never throws on odd rows. */
export function diffChangeLog(prev: DemoData, next: DemoData, siteId: SiteId, actor: string, atISO: string, settings?: ChangeLogSettings): ChangeLogEntry[] {
  const ctx = { siteId, actor, atISO, settings };
  const entries: ChangeLogEntry[] = [];
  try {
    entries.push(...diffLocationRenames(prev.buildings, next.buildings, ["bl_id"], { ...ctx, collection: "buildings" }));
    entries.push(...diffLocationRenames(prev.floors, next.floors, ["bl_id", "LevelName"], { ...ctx, collection: "floors" }));
    entries.push(...diffLocationRenames(prev.rooms, next.rooms, ["bl_id", "LevelName", "RoomCode"], { ...ctx, collection: "rooms" }));
    entries.push(...diffCollection(prev.workRequests, next.workRequests, (r) => String(r.WR_ID ?? ""), { ...ctx, changeType: "workRequest.created", collection: "workRequests", valueOf: (r) => `${String(r.WR_Type ?? "")} ${wrStatus(r)}` }, { changed: false }));
    entries.push(...diffCollection(prev.workRequests, next.workRequests, (r) => String(r.WR_ID ?? ""), { ...ctx, changeType: "workRequest.status", collection: "workRequests", valueOf: wrStatus }, { created: false, removed: false }));
    entries.push(...diffCollection(prev.workRequests, next.workRequests, (r) => String(r.WR_ID ?? ""), { ...ctx, changeType: "workRequest.assignment", collection: "workRequests", valueOf: wrAssignment }, { created: false, removed: false }));
    entries.push(...diffCollection(prev.equipment, next.equipment, (r) => String(r.EquipmentCode ?? ""), { ...ctx, changeType: "equipment.status", collection: "equipment", valueOf: (r) => String(r.Status ?? "") }));
    entries.push(...diffCollection(prev.locationFreezes, next.locationFreezes, (r) => String(r.id ?? ""), { ...ctx, changeType: "locationFreeze.change", collection: "locationFreezes", valueOf: (r) => `${String(r.title ?? "")} ${String(r.startDateTime ?? "")}→${String(r.endDateTime ?? "")}` }));
    entries.push(...diffCollection(prev.blueprints, next.blueprints, (r) => String(r.ChecklistCode ?? ""), { ...ctx, changeType: "blueprint.change", collection: "blueprints", valueOf: (r) => r }));
    entries.push(...diffCollection(prev.schedules, next.schedules, (r) => String(r.ScheduleId ?? ""), { ...ctx, changeType: "pmSchedule.change", collection: "schedules", valueOf: (r) => r }));
    entries.push(...diffCollection(prev.cifmPeople, next.cifmPeople, (r) => String(r.id ?? ""), { ...ctx, changeType: "person.change", collection: "cifmPeople", valueOf: (r) => r }));
    entries.push(...diffCollection(prev.userAccessProfiles, next.userAccessProfiles, (r) => String(r.personName ?? r.id ?? ""), { ...ctx, changeType: "person.permissionException", collection: "userAccessProfiles", valueOf: personExceptions }));
    if (isChangeTypeEnabled(settings, "sla.change") && JSON.stringify(prev.siteSlaConfig ?? null) !== JSON.stringify(next.siteSlaConfig ?? null)) {
      entries.push(makeEntry(siteId, actor, atISO, "sla.change", "siteSlaConfig", "siteSlaConfig", "siteSlaConfig", "siteSlaConfig", short(prev.siteSlaConfig ?? ""), short(next.siteSlaConfig ?? "")));
    }
  } catch (error) {
    console.warn("change log diff skipped", error);
    return [];
  }
  return entries;
}

/** Appends entries newest-first and caps the per-site log (mirrors LOCATION_RENAME_LOG_CAP). */
export function appendChangeLog(next: DemoData, entries: ChangeLogEntry[]): DemoData {
  if (!entries.length) return next;
  return { ...next, changeLog: [...entries, ...(next.changeLog ?? [])].slice(0, CHANGE_LOG_CAP) };
}

export { CHANGE_LOG_TYPE_LABELS };
