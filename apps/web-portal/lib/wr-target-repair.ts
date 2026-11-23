// V60 (MASTER_SPEC Section 110): PM work requests carry a provenance copy of
// the PM target they were generated from (targetType/targetKey, stamped by
// lib/pm-suppression.ts withCompiledScope). Until V53.1 the rename cascade
// rewrote only the location keys; V60 extends the cascade to rewrite the
// targetKey snapshot too, and supabase-v60-integrity-report.sql repairs the
// six pre-V60 drift copies plus the frozen legacy audit-family rows in SQL.
// This server-side migration heals any stale snapshot that still arrives from
// a browser which has not seen the repair yet: the snapshot is always
// recomputed from the work request's own location fields, so a re-save of an
// old copy can never reintroduce the drift. Untyped generic state (same house
// pattern as migrateWorkRequestIdsTo10Digits) so the zod-inferred save shape
// and DemoData both flow through unchanged.
import { pmTargetKey } from "@cafm/shared-schema";
import type { PMTargetType } from "@cafm/shared-schema";

type WrRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is WrRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const stringOr = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

const LOCATION_TARGET_TYPES = new Set(["building", "floor", "room"]);

type WorkRequestHealRow = {
  WR_Type?: unknown; targetType?: unknown; targetKey?: unknown;
  bl_id?: unknown; LevelName?: unknown; levelName?: unknown; RoomCode?: unknown; roomCode?: unknown;
};

// Recomputes the PM target snapshot for one work request from its own location
// fields (both spellings accepted, like pmTargetKey itself). Rows that are not
// location-targeted PMs, or whose location parents are missing (the same guard
// the SQL drift check uses), keep their snapshot; this never throws.
export function healWorkRequestTargetKey<T extends WorkRequestHealRow>(row: T): T {
  if (row.WR_Type !== "PM" || typeof row.targetKey !== "string" || !row.targetKey) return row;
  const targetType = typeof row.targetType === "string" ? row.targetType : "";
  if (!LOCATION_TARGET_TYPES.has(targetType)) return row;
  const bl_id = stringOr(row.bl_id);
  const LevelName = stringOr(row.LevelName) ?? stringOr(row.levelName);
  const RoomCode = stringOr(row.RoomCode) ?? stringOr(row.roomCode);
  if (!bl_id || ((targetType === "floor" || targetType === "room") && !LevelName) || (targetType === "room" && !RoomCode)) return row;
  let recomputed: string;
  try {
    recomputed = pmTargetKey({ targetType: targetType as PMTargetType, bl_id, LevelName, RoomCode });
  } catch {
    return row;
  }
  return recomputed === row.targetKey ? row : { ...row, targetKey: recomputed } as T;
}

function healWorkRequestArray(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  let changed = false;
  const healed = value.map((row) => {
    const next = isRecord(row) ? healWorkRequestTargetKey(row) : row;
    if (next !== row) changed = true;
    return next;
  });
  return changed ? healed : value;
}

// Server-side save migration wired into the cafm-state route's stateSchema
// transform chain. Pure function: returns the same state object when no work
// request needed healing; arrays that were absent stay absent.
export function migrateWorkRequestTargetKeys<T>(input: T): T {
  if (!isRecord(input)) return input;
  const next: WrRecord = { ...input };
  let changed = false;
  for (const key of ["workRequests", "deletedWorkRequests"] as const) {
    if (Array.isArray(next[key])) {
      const healed = healWorkRequestArray(next[key]);
      if (healed !== next[key]) {
        next[key] = healed;
        changed = true;
      }
    }
  }
  return changed ? next as T : input;
}
