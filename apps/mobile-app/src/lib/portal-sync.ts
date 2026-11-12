import { z } from "zod";
import {
  BaseWorkRequestSchema, BuildingSchema, FloorSchema, RoomSchema, EquipmentSchema,
  PM_ChecklistStandardSchema, PM_ScheduleSchema, SuppressedPmOccurrenceSchema, BlueprintAuditEntrySchema,
  LocationFreezeSchema, SiteIdSchema, UserAccessProfileSchema,
  SiteStakeholderTeamSchema, SiteCoordinationRequirementSchema, PmCoordinationRecordSchema,
} from "@cafm/shared-schema";
import type {
  BaseWorkRequest, Building, Floor, Room, Equipment, PM_ChecklistStandard, PM_Schedule, SiteId,
} from "@cafm/shared-schema";
import type { IDBPDatabase } from "idb";
import type { MobileAppDB, OfflinePhotoQueueEntry, SyncQueueEntry } from "./db";
import { AuditCampaignSchema, AuditFindingSchema, AuditInspectionSchema, AuditSettingsSchema, AuditTemplateSchema } from "../../../web-portal/lib/audit-assurance-types";
import { AuditAssuranceSchema, EquipmentInspectionSheetSchema, completeEquipmentInspection, defaultKmisConfig } from "../../../web-portal/lib/equipment-inspection";
import { seedSiteData } from "../../../web-portal/lib/demo-seed";
import { migratePmState } from "../../../web-portal/lib/pm-orders";

const workRequestSchema = z.custom<BaseWorkRequest>((value) => BaseWorkRequestSchema.safeParse(value).success);
const stateSchema = z.object({
  buildings: z.array(z.custom<Building>((value) => BuildingSchema.safeParse(value).success)),
  floors: z.array(z.custom<Floor>((value) => FloorSchema.safeParse(value).success)),
  rooms: z.array(z.custom<Room>((value) => RoomSchema.safeParse(value).success)),
  equipment: z.array(z.custom<Equipment>((value) => EquipmentSchema.safeParse(value).success)
    .transform((value) => ({ ...value, Status: EquipmentSchema.parse(value).Status }))),
  blueprints: z.array(z.custom<PM_ChecklistStandard>((value) => PM_ChecklistStandardSchema.safeParse(value).success)),
  schedules: z.array(z.custom<PM_Schedule>((value) => PM_ScheduleSchema.safeParse(value).success)),
  suppressedPmOccurrences: z.array(SuppressedPmOccurrenceSchema).optional(),
  blueprintAuditLog: z.array(BlueprintAuditEntrySchema).optional(),
  workRequests: z.array(workRequestSchema),
  craftspeople: z.array(z.object({ id: z.string().min(1), Name: z.string().min(1), LastName: z.string(), Trade: z.string(), HourlyRate: z.number().nonnegative(), SiteId: SiteIdSchema }).passthrough()).optional(),
  userAccessProfiles: z.array(UserAccessProfileSchema).optional(),
  locationFreezes: z.array(LocationFreezeSchema).optional(),
  stakeholderTeams: z.array(SiteStakeholderTeamSchema).optional(),
  coordinationRequirements: z.array(SiteCoordinationRequirementSchema).optional(),
  pmCoordination: z.array(PmCoordinationRecordSchema).optional(),
  mobileMutationIds: z.array(z.string()).optional(),
  auditCampaigns: z.array(AuditCampaignSchema).optional(),
  auditFindings: z.array(AuditFindingSchema).optional(),
  auditInspections: z.array(AuditInspectionSchema).optional(),
  auditSettings: AuditSettingsSchema.optional(),
  auditTemplates: z.array(AuditTemplateSchema).optional(),
  auditAssurance: AuditAssuranceSchema.optional(),
}).passthrough().transform((state, context) => {
  try { return migratePmState(state); }
  catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid PM blueprint family state." }); return z.NEVER; }
});
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
class SyncRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

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

async function request(site: SiteId, person: string, method: "GET" | "POST", body?: unknown, signal?: AbortSignal) {
  const token = import.meta.env.VITE_CAFM_SYNC_TOKEN;
  const override = localStorage.getItem("cafm_api_base_url")?.trim() || import.meta.env.VITE_API_BASE_URL?.trim();
  let endpoint = "/api/cafm-state";
  if (override) {
    const base = new URL(override, window.location.origin);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("The API base URL must be an HTTP(S) URL without credentials, query or fragment.");
    if (window.location.protocol === "https:" && base.protocol !== "https:") throw new Error("An HTTPS app requires an HTTPS API base URL.");
    endpoint = `${base.href.replace(/\/+$/, "")}/api/cafm-state`;
  }
  const options: RequestInit = {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-CAFM-Site-Id": site || "02-ESOC",
      "X-CAFM-Person": person,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  };
  let response: Response;
  try {
    response = await fetch(endpoint, options);
    if (!override && response.status === 404 && ["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.protocol === "http:" && window.location.port !== "3000") {
      response = await fetch("http://localhost:3000/api/cafm-state", options);
    }
    window.dispatchEvent(new CustomEvent("cafm-sync-connection", { detail: true }));
  } catch (error) {
    if (!signal?.aborted) window.dispatchEvent(new CustomEvent("cafm-sync-connection", { detail: false }));
    throw new Error(`Could not reach the CAFM sync API. Changes remain on this device. ${error instanceof Error ? error.message : ""}`);
  }
  const raw = await response.text();
  let data: unknown = null;
  if (raw.trim()) {
    try { data = JSON.parse(raw); }
    catch { throw new SyncRequestError(`Synchronization failed: the portal returned an unreadable response (HTTP ${response.status}).`, response.status); }
  }
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data ? String(data.error) : `HTTP ${response.status}`;
    throw new SyncRequestError(`Synchronization failed: ${message}`, response.status);
  }
  if (data === null) throw new SyncRequestError(`Synchronization failed: the portal returned an empty response (HTTP ${response.status}).`, response.status);
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
  queued: SyncQueueEntry[], photos: OfflinePhotoQueueEntry[], signal?: AbortSignal,
) {
  let response = await request(site, person, "GET", undefined, signal);
  if (!response.state) {
    try {
      response = await request(site, person, "POST", { revision: response.revision, state: seedSiteData(site) }, signal);
    } catch (error) {
      if (!(error instanceof SyncRequestError) || error.status !== 409) throw error;
      const current = await request(site, person, "GET", undefined, signal);
      if (!current.state) throw error;
      response = current;
    }
  }
  if (!response.state) throw new Error("The portal did not initialize this site. Retry synchronization.");
  const state = response.state;
  if (state.buildings.some((item) => item.SiteId !== site) ||
      state.floors.some((item) => item.SiteId !== site) ||
      state.rooms.some((item) => item.SiteId !== site) ||
      state.equipment.some((item) => item.SiteId !== site) ||
      state.schedules.some((item) => item.SiteId !== site) ||
      state.blueprints.some((item) => item.SiteId !== undefined && item.SiteId !== site) ||
      state.craftspeople?.some((item) => item.SiteId !== site) ||
      state.userAccessProfiles?.some((item) => item.siteId !== site) ||
      state.locationFreezes?.some((item) => item.siteId !== site) ||
      state.suppressedPmOccurrences?.some((item) => item.siteId !== site) ||
      state.blueprintAuditLog?.some((item) => item.siteId !== site) ||
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
    if (item.MutationType === "AUDIT_FINDING" || item.MutationType === "EQUIPMENT_INSPECTION") {
      if (item.Payload.siteId === site) selected.push(item);
      continue;
    }
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

  const updates = selected.filter((entry) => entry.MutationType === "WR_UPDATE");
  while (updates.length) {
    const index = updates.findIndex((entry) => {
      if (applied.has(entry.QueueId)) return true;
      const current = state.workRequests.find((wr) => wr.WR_ID === entry.Payload.WR_ID);
      return entry.BaseWorkRequest !== undefined && stable(current ?? null) === stable(entry.BaseWorkRequest);
    });
    if (index < 0) throw new Error(`Work request ${String(updates[0].Payload.WR_ID)} changed on the portal; its local changes were retained.`);
    const [item] = updates.splice(index, 1);
    if (applied.has(item.QueueId)) continue;
    const parsed = workRequestSchema.safeParse(item.Payload);
    if (!parsed.success || parsed.data.SiteId !== site) throw new Error(`Invalid queued work request ${item.QueueId}.`);
    replaceRequest(state, parsed.data);
    applied.add(item.QueueId);
  }

  for (const item of selected.filter((entry) => entry.MutationType === "AUDIT_FINDING")) {
    if (applied.has(item.QueueId)) continue;
    const parsed = AuditFindingSchema.safeParse(item.Payload.finding);
    if (!parsed.success || parsed.data.siteId !== site || parsed.data.validationStatus !== "PendingValidation" || parsed.data.assuranceState !== "AwaitingValidation") throw new Error(`Invalid queued audit finding ${item.QueueId}.`);
    const finding = parsed.data;
    const profile = state.userAccessProfiles?.find((p) => p.siteId === site && p.personName === finding.inspectorName);
    if (!profile || !profile.permissions.canAuditDoInspection || !(profile.isQAInspector || profile.isSuperAdmin)) throw new Error(`Audit inspector ${finding.inspectorName} is no longer authorized; finding retained on device.`);
    const campaign = state.auditCampaigns?.find((c) => c.id === finding.campaignId);
    const asset = state.equipment.find((e) => e.EquipmentCode === finding.equipmentId);
    if (!campaign || !asset || !campaign.selectedEquipmentIds.includes(asset.EquipmentCode) || asset.bl_id !== finding.buildingId || asset.RoomCode !== finding.roomId) throw new Error(`Audit finding ${finding.id} no longer matches campaign scope or equipment location.`);
    if ((profile.vpaBuildingIds.length > 0 && !profile.vpaBuildingIds.includes(asset.bl_id)) || !profile.permissions.auditTrades.some((trade) => trade === asset.PrimaryTradeId)) throw new Error(`Audit finding ${finding.id} is outside the inspector's scope.`);
    if (state.auditFindings?.some((f) => f.id === finding.id)) throw new Error(`Audit finding ID ${finding.id} already exists; local finding retained.`);
    if (item.Payload.inspectionId !== undefined) {
      if (typeof item.Payload.inspectionId !== "string") throw new Error("Invalid inspection route reference.");
      const route = state.auditInspections?.find((r) => r.id === item.Payload.inspectionId);
      if (!route || route.inspector !== finding.inspectorName || route.campaignId !== campaign.id || route.equipmentId !== asset.EquipmentCode) throw new Error(`Inspection route for ${finding.id} changed; local finding retained.`);
      const accessible = finding.operationalStatus !== "Inaccessible";
      state.auditInspections = state.auditInspections?.map((r) => r.id === route.id ? { ...r, status: accessible ? "Completed" : "Planned", accessibility: accessible ? "Accessible" : "Inaccessible", completedAt: accessible ? finding.auditTrail[0]?.timestamp : undefined } : r);
      state.auditCampaigns = state.auditCampaigns?.map((c) => c.id === campaign.id ? { ...c, completedInspectionsCount: c.completedInspectionsCount + (accessible && route.status === "Planned" ? 1 : !accessible && route.status === "Completed" ? -1 : 0), inaccessibleEquipmentIds: accessible ? c.inaccessibleEquipmentIds.filter((id) => id !== asset.EquipmentCode) : [...new Set([...c.inaccessibleEquipmentIds, asset.EquipmentCode])] } : c);
    }
    state.auditFindings = [...(state.auditFindings ?? []), finding];
    applied.add(item.QueueId);
  }
  for (const item of selected.filter((entry) => entry.MutationType === "EQUIPMENT_INSPECTION")) {
    if (applied.has(item.QueueId)) continue;
    const sheet = EquipmentInspectionSheetSchema.parse(item.Payload.sheet);
    if (sheet.siteId !== site) throw new Error("Inspection belongs to another site.");
    const profile = state.userAccessProfiles?.find((p) => p.siteId === site && p.personName === sheet.inspectorName);
    const asset = state.equipment.find((e) => e.EquipmentCode === sheet.equipmentId && e.SiteId === site);
    if (!profile || !profile.permissions.canAuditDoInspection || !(profile.isQAInspector || profile.isSuperAdmin) || !asset || (profile.vpaBuildingIds.length > 0 && !profile.vpaBuildingIds.includes(asset.bl_id)) || !profile.permissions.auditTrades.some((trade) => trade === asset.PrimaryTradeId)) throw new Error("Inspection is outside the inspector's current authorization; it remains on the device.");
    const route = state.auditInspections?.find((r) => r.id === sheet.routeId);
    if (!route || stable(route) !== stable(item.Payload.baseRoute)) throw new Error("The inspection route changed on the portal; the local inspection was retained.");
    const currentSheet = (state.auditAssurance?.equipmentInspections ?? []).find((s) => s.campaignId === sheet.campaignId && s.equipmentId === sheet.equipmentId) ?? null;
    if (stable(currentSheet) !== stable(item.Payload.baseSheet ?? null)) throw new Error("The inspection sheet changed on the portal; the local inspection was retained.");
    const relatedFindings = (state.auditFindings ?? []).filter((f) => f.campaignId === sheet.campaignId && f.equipmentId === sheet.equipmentId);
    if (stable(relatedFindings) !== stable(item.Payload.baseFindings ?? [])) throw new Error("Related findings changed on the portal; the local inspection was retained.");
    if (stable(sheet.scoringConfig) !== stable(state.auditAssurance?.kmisConfig ?? defaultKmisConfig)) throw new Error("KMIS settings changed on the portal; the local inspection was retained for review.");
    Object.assign(state, completeEquipmentInspection(state, sheet));
    applied.add(item.QueueId);
  }
  for (const item of selected.filter((entry) => entry.MutationType !== "WR_UPDATE" && entry.MutationType !== "AUDIT_FINDING" && entry.MutationType !== "EQUIPMENT_INSPECTION")) {
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
  if (changed) await request(site, person, "POST", { revision: response.revision, state }, signal);

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
  await tx.objectStore("syncMetadata").put({ key: `siteContext:${site}`, value: JSON.stringify({ craftspeople: state.craftspeople ?? [], userAccessProfiles: state.userAccessProfiles ?? [], locationFreezes: state.locationFreezes ?? [],   suppressedPmOccurrences: state.suppressedPmOccurrences ?? [], stakeholderTeams: state.stakeholderTeams ?? [], coordinationRequirements: state.coordinationRequirements ?? [], pmCoordination: state.pmCoordination ?? [] }), updatedAt: syncedAt });
  await tx.objectStore("syncMetadata").put({ key: `auditContext:${site}`, value: JSON.stringify({ auditCampaigns: state.auditCampaigns ?? [], auditFindings: state.auditFindings ?? [], auditInspections: state.auditInspections ?? [], auditSettings: state.auditSettings, auditTemplates: state.auditTemplates ?? [], auditAssurance: state.auditAssurance }), updatedAt: syncedAt });
  await tx.done;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("cafm-audit-sync", { detail: site }));
  const pending = pendingNow.filter((item) => item.SyncStatus === "PENDING" && !confirmed.has(item.QueueId)).length +
    pendingPhotosNow.filter((item) => item.SyncStatus === "PENDING" && !confirmedPhotos.has(item.QueueId)).length;
  return { synced: selected.length + selectedPhotos.length, pending, lastSyncTime: syncedAt };
}
