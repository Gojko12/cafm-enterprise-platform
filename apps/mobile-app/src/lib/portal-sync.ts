import { z } from "zod";
import {
  BaseWorkRequestSchema, BuildingSchema, FloorSchema, RoomSchema, EquipmentSchema,
  PM_ChecklistStandardSchema, PM_ScheduleSchema,
} from "@cafm/shared-schema";
import type {
  BaseWorkRequest, Building, Floor, Room, Equipment, PM_ChecklistStandard, PM_Schedule, SiteId,
} from "@cafm/shared-schema";
import type { IDBPDatabase } from "idb";
import type { MobileAppDB, OfflinePhotoQueueEntry, SyncQueueEntry } from "./db";

const workRequestSchema = z.custom<BaseWorkRequest>((value) => BaseWorkRequestSchema.safeParse(value).success);
const stateSchema = z.object({
  buildings: z.array(z.custom<Building>((value) => BuildingSchema.safeParse(value).success)),
  floors: z.array(z.custom<Floor>((value) => FloorSchema.safeParse(value).success)),
  rooms: z.array(z.custom<Room>((value) => RoomSchema.safeParse(value).success)),
  equipment: z.array(z.custom<Equipment>((value) => EquipmentSchema.safeParse(value).success)),
  blueprints: z.array(z.custom<PM_ChecklistStandard>((value) => PM_ChecklistStandardSchema.safeParse(value).success)),
  schedules: z.array(z.custom<PM_Schedule>((value) => PM_ScheduleSchema.safeParse(value).success)),
  workRequests: z.array(workRequestSchema),
  mobileMutationIds: z.array(z.string()).optional(),
}).passthrough();
const responseSchema = z.object({ revision: z.number().int().nonnegative(), state: stateSchema.nullable() });
const stepSchema = z.object({
  AuditId: z.string().min(1), StepId: z.string().min(1), WR_ID: z.string().min(1),
  Action: z.enum(["PASS", "FAIL", "UPDATE_VALUE"]), Result: z.union([z.string(), z.number(), z.boolean()]).optional(),
  TechnicianId: z.string().min(1), Timestamp: z.string().min(1), ImmutableChecksum: z.string().min(1),
  TechnicianComment: z.string().optional(),
});
const sessionSchema = z.object({
  SessionId: z.string().min(1), WR_ID: z.string().min(1), TechnicianId: z.string().optional(),
  StartedAt: z.string().min(1), PausedAt: z.string().optional(), ResumedAt: z.string().optional(),
  PausedDurationMs: z.number().nonnegative().optional(),
  TotalTimeMinutes: z.number().nonnegative(), StoppedAt: z.string().min(1),
  TimerOverrideReason: z.string().optional(), Status: z.literal("STOPPED"),
});
type State = z.infer<typeof stateSchema>;

export function stable(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function request(site: SiteId, person: string, method: "GET" | "POST", body?: unknown) {
  const token = import.meta.env.VITE_CAFM_SYNC_TOKEN ||
    (import.meta.env.DEV && typeof window !== "undefined" && window.location.hostname === "localhost"
      ? "cafm-local-development-sync-token-2026" : undefined);
  if (!token || token.length < 32) throw new Error("Synchronization is not configured. Changes remain on this device.");
  const response = await fetch("http://localhost:3000/api/cafm-state", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-CAFM-Site-Id": site,
      "X-CAFM-Person": person,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data ? String(data.error) : `HTTP ${response.status}`;
    throw new Error(`Synchronization failed: ${message}`);
  }
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) throw new Error("The portal returned invalid synchronization data.");
  return parsed.data;
}

function replaceRequest(state: State, wr: BaseWorkRequest) {
  const index = state.workRequests.findIndex((item) => item.WR_ID === wr.WR_ID);
  if (index < 0) state.workRequests.push(wr);
  else state.workRequests[index] = wr;
}

export async function synchronizePortal(
  db: IDBPDatabase<MobileAppDB>, site: SiteId, person: string,
  queued: SyncQueueEntry[], photos: OfflinePhotoQueueEntry[],
) {
  const response = await request(site, person, "GET");
  if (!response.state) throw new Error("The portal has no state for this site. Open the portal and retry.");
  const state = response.state;
  if (state.buildings.some((item) => item.SiteId !== site) ||
      state.floors.some((item) => item.SiteId !== site) ||
      state.rooms.some((item) => item.SiteId !== site) ||
      state.equipment.some((item) => item.SiteId !== site) ||
      state.schedules.some((item) => item.SiteId !== site) ||
      state.blueprints.some((item) => item.SiteId !== undefined && item.SiteId !== site) ||
      state.workRequests.some((item) => item.SiteId !== site)) {
    throw new Error("The portal returned records belonging to another site.");
  }
  const localRequests = await db.getAll("workRequests");
  const localById = new Map(localRequests.map((item) => [item.WR_ID, item]));
  const serverById = new Map(state.workRequests.map((item) => [item.WR_ID, item]));
  const applied = new Set(state.mobileMutationIds ?? []);
  const selected: SyncQueueEntry[] = [];
  const selectedPhotos: OfflinePhotoQueueEntry[] = [];
  for (const item of queued) {
    const wrId = item.Payload.WR_ID;
    if (typeof wrId !== "string") throw new Error(`Queued mutation ${item.QueueId} has no work request ID.`);
    const itemSite = item.MutationType === "WR_UPDATE" ? item.Payload.SiteId : localById.get(wrId)?.SiteId;
    if (!itemSite) throw new Error(`Cannot determine the site of queued mutation ${item.QueueId}.`);
    if (itemSite === site) selected.push(item);
  }
  for (const photo of photos) {
    const itemSite = localById.get(photo.WR_ID)?.SiteId;
    if (!itemSite) throw new Error(`Cannot determine the site of queued photo ${photo.QueueId}.`);
    if (itemSite === site) selectedPhotos.push(photo);
  }

  for (const item of selected.filter((entry) => entry.MutationType === "WR_UPDATE")) {
    if (applied.has(item.QueueId)) continue;
    const parsed = workRequestSchema.safeParse(item.Payload);
    if (!parsed.success || parsed.data.SiteId !== site) throw new Error(`Invalid queued work request ${item.QueueId}.`);
    const existing = state.workRequests.find((wr) => wr.WR_ID === parsed.data.WR_ID);
    if (item.BaseWorkRequest === undefined && existing) {
      throw new Error(`Work request ${parsed.data.WR_ID} has no recorded sync baseline; its changes were retained.`);
    }
    if (stable(existing ?? null) !== stable(item.BaseWorkRequest ?? null)) {
      throw new Error(`Work request ${parsed.data.WR_ID} changed on the portal; its local changes were retained.`);
    }
    replaceRequest(state, parsed.data);
    applied.add(item.QueueId);
  }

  for (const item of selected.filter((entry) => entry.MutationType !== "WR_UPDATE")) {
    if (applied.has(item.QueueId)) continue;
    const wrId = item.Payload.WR_ID;
    const wr = state.workRequests.find((entry) => entry.WR_ID === wrId);
    if (!wr) throw new Error(`Cannot synchronize mutation ${item.QueueId}: work request not found.`);
    if (item.MutationType === "STEP_COMPLETE") {
      const step = stepSchema.parse(item.Payload);
      const serverResult = serverById.get(step.WR_ID)?.ChecklistResults?.find((result) => result.stepId === step.StepId);
      const baseResult = item.BaseWorkRequest?.ChecklistResults?.find((result) => result.stepId === step.StepId);
      if (stable(serverResult) !== stable(baseResult)) {
        throw new Error(`Checklist step ${step.StepId} changed on the portal; its local changes were retained.`);
      }
      const previousResult = wr.ChecklistResults?.find((result) => result.stepId === step.StepId);
      const results = [...(wr.ChecklistResults ?? [])].filter((result) => result.stepId !== step.StepId);
      results.push({
        stepId: step.StepId, passed: step.Action !== "FAIL",
        value: typeof step.Result === "boolean" ? String(step.Result) : step.Result ?? "",
        completedAt: step.Timestamp, ...(step.TechnicianComment ? { comment: step.TechnicianComment } : {}),
        ...(previousResult?.photoPaths ? { photoPaths: previousResult.photoPaths } : {}),
      });
      replaceRequest(state, {
        ...wr, ChecklistResults: results,
        ChecklistHistory: [...(wr.ChecklistHistory ?? []), {
          id: step.AuditId, timestamp: step.Timestamp, performedBy: step.TechnicianId,
          actionType: step.Action, stepReference: step.StepId,
          details: `${step.Action}: ${String(step.Result ?? "")}${step.TechnicianComment ? `; ${step.TechnicianComment}` : ""} (checksum ${step.ImmutableChecksum})`,
        }],
      });
    } else if (item.MutationType === "SESSION_LOG") {
      const session = sessionSchema.parse(item.Payload);
      replaceRequest(state, {
        ...wr, TotalTimeMinutes: (wr.TotalTimeMinutes ?? 0) + session.TotalTimeMinutes,
        MobileWorkSessions: [...(wr.MobileWorkSessions ?? []), session],
        Activity: [...(wr.Activity ?? []), {
          id: session.SessionId, kind: "log", actorId: person, actorName: person, actorRole: "MobileTechnician",
          createdAt: session.StoppedAt,
          text: `Work session: ${session.TotalTimeMinutes} minutes${session.TimerOverrideReason ? `; ${session.TimerOverrideReason}` : ""}`,
        }],
      });
    } else {
      throw new Error(`Unsupported queued mutation ${item.MutationType}; it remains on this device.`);
    }
    applied.add(item.QueueId);
  }
  for (const photo of selectedPhotos) {
    if (applied.has(photo.QueueId)) continue;
    const wr = state.workRequests.find((entry) => entry.WR_ID === photo.WR_ID);
    if (!wr) throw new Error(`Cannot synchronize photo ${photo.QueueId}: work request not found.`);
    replaceRequest(state, {
      ...wr,
      Attachments: [...(wr.Attachments ?? []), {
        id: photo.QueueId, name: photo.StepId ? `Step ${photo.StepId} photo` : "Mobile photo",
        type: "image", dataUrl: photo.CompressedDataUrl,
      }],
      ChecklistResults: photo.StepId ? (wr.ChecklistResults ?? []).map((result) =>
        result.stepId === photo.StepId
          ? { ...result, photoPaths: [...(result.photoPaths ?? []), photo.CompressedDataUrl] }
          : result) : wr.ChecklistResults,
    });
    applied.add(photo.QueueId);
  }

  const changed = selected.some((item) => !(response.state?.mobileMutationIds ?? []).includes(item.QueueId)) ||
    selectedPhotos.some((item) => !(response.state?.mobileMutationIds ?? []).includes(item.QueueId));
  state.mobileMutationIds = [...applied];
  if (changed) await request(site, person, "POST", { revision: response.revision, state });

  const syncedAt = new Date().toISOString();
  const tx = db.transaction(["workRequests", "buildings", "floors", "rooms", "equipment", "checklists", "schedules", "syncQueue", "photoQueue", "syncMetadata"], "readwrite");
  const pendingNow = await tx.objectStore("syncQueue").getAll();
  const pendingPhotosNow = await tx.objectStore("photoQueue").getAll();
  const confirmed = new Set(selected.map((item) => item.QueueId));
  const confirmedPhotos = new Set(selectedPhotos.map((item) => item.QueueId));
  const dirtyIds = new Set(pendingNow.filter((item) => item.SyncStatus === "PENDING" && !confirmed.has(item.QueueId))
    .map((item) => item.Payload.WR_ID).filter((id): id is string => typeof id === "string"));
  const requests = tx.objectStore("workRequests");
  const [storedRequests, storedBuildings, storedFloors, storedRooms, storedEquipment, storedSchedules, storedChecklists] = await Promise.all([
    requests.getAll(), tx.objectStore("buildings").getAll(), tx.objectStore("floors").getAll(),
    tx.objectStore("rooms").getAll(), tx.objectStore("equipment").getAll(), tx.objectStore("schedules").getAll(),
    tx.objectStore("checklists").getAll(),
  ]);
  const collision =
    storedRequests.some((old) => old.SiteId !== site && state.workRequests.some((item) => item.WR_ID === old.WR_ID)) ||
    storedBuildings.some((old) => old.SiteId !== site && state.buildings.some((item) => item.bl_id === old.bl_id)) ||
    storedFloors.some((old) => old.SiteId !== site && state.floors.some((item) => item.bl_id === old.bl_id && item.LevelName === old.LevelName)) ||
    storedRooms.some((old) => old.SiteId !== site && state.rooms.some((item) => item.bl_id === old.bl_id && item.LevelName === old.LevelName && item.RoomCode === old.RoomCode)) ||
    storedEquipment.some((old) => old.SiteId !== site && state.equipment.some((item) => item.EquipmentCode === old.EquipmentCode)) ||
    storedSchedules.some((old) => old.SiteId !== site && state.schedules.some((item) => item.ScheduleId === old.ScheduleId)) ||
    storedChecklists.some((old) => state.blueprints.some((item) =>
      item.ChecklistCode === old.ChecklistCode &&
      ((old.SiteId !== undefined && old.SiteId !== site) || (!old.SiteId && stable(old) !== stable(item)))));
  if (collision) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new Error("Cannot synchronize: identifiers collide with another site's local data.");
  }
  for (const wr of storedRequests) {
    if (wr.SiteId === site && !dirtyIds.has(wr.WR_ID) && !state.workRequests.some((item) => item.WR_ID === wr.WR_ID)) {
      await requests.delete(wr.WR_ID);
    }
    for (const item of storedBuildings) if (item.SiteId === site && !state.buildings.some((next) => next.bl_id === item.bl_id)) await tx.objectStore("buildings").delete(item.bl_id);
    for (const item of storedFloors) if (item.SiteId === site && !state.floors.some((next) => next.bl_id === item.bl_id && next.LevelName === item.LevelName)) await tx.objectStore("floors").delete([item.bl_id, item.LevelName]);
    for (const item of storedRooms) if (item.SiteId === site && !state.rooms.some((next) => next.bl_id === item.bl_id && next.LevelName === item.LevelName && next.RoomCode === item.RoomCode)) await tx.objectStore("rooms").delete([item.bl_id, item.LevelName, item.RoomCode]);
    for (const item of storedEquipment) if (item.SiteId === site && !state.equipment.some((next) => next.EquipmentCode === item.EquipmentCode)) await tx.objectStore("equipment").delete(item.EquipmentCode);
    for (const item of storedSchedules) if (item.SiteId === site && !state.schedules.some((next) => next.ScheduleId === item.ScheduleId)) await tx.objectStore("schedules").delete(item.ScheduleId);
    for (const item of storedChecklists) if (item.SiteId === site && !state.blueprints.some((next) => next.ChecklistCode === item.ChecklistCode)) await tx.objectStore("checklists").delete(item.ChecklistCode);
  }
  for (const wr of state.workRequests) if (!dirtyIds.has(wr.WR_ID)) await requests.put(wr);
  for (const item of state.buildings) await tx.objectStore("buildings").put(item);
  for (const item of state.floors) await tx.objectStore("floors").put(item);
  for (const item of state.rooms) await tx.objectStore("rooms").put(item);
  for (const item of state.equipment) await tx.objectStore("equipment").put(item);
  for (const item of state.blueprints) await tx.objectStore("checklists").put(item);
  for (const item of state.schedules) await tx.objectStore("schedules").put(item);
  for (const item of selected) await tx.objectStore("syncQueue").put({ ...item, SyncStatus: "SYNCED", SyncedAt: syncedAt });
  for (const item of selectedPhotos) await tx.objectStore("photoQueue").put({ ...item, SyncStatus: "SYNCED", SyncedAt: syncedAt });
  await tx.objectStore("syncMetadata").put({ key: "lastSyncTime", value: syncedAt, updatedAt: syncedAt });
  await tx.done;
  const pending = pendingNow.filter((item) => item.SyncStatus === "PENDING" && !confirmed.has(item.QueueId)).length +
    pendingPhotosNow.filter((item) => item.SyncStatus === "PENDING" && !confirmedPhotos.has(item.QueueId)).length;
  return { synced: selected.length + selectedPhotos.length, pending, lastSyncTime: syncedAt };
}
