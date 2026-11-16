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

const ignoredUpdateFields = new Set(["WR_ID", "SiteId", "UpdatedAt", "updatedAt"]);
const terminalStatusFields = new Set(["Percentage", "WorkRequestStatus", "WorkRequestSubstatus", "IsFrozen", "ClosedAt", "CompletedAt"]);
const arrayIdentity: Record<string, string> = {
  Activity: "id", ChecklistResults: "stepId", ChecklistHistory: "id", StepAuditLogs: "AuditLogId",
  ChecklistInstances: "StepInstanceId", MobileWorkSessions: "SessionId", Attachments: "id",
  timeSessions: "id", laborEntries: "craftpersonId", SpareParts: "id", ChecklistSteps: "StepId",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nextStamp(server: BaseWorkRequest, local?: BaseWorkRequest): string {
  return new Date(Math.max(
    Date.now(),
    Date.parse(String(server.UpdatedAt ?? "")) || 0,
    Date.parse(String(server.updatedAt ?? "")) || 0,
    Date.parse(String(local?.UpdatedAt ?? "")) || 0,
    Date.parse(String(local?.updatedAt ?? "")) || 0,
  ) + 1).toISOString();
}

function mergeChangedValue(field: string, base: unknown, current: unknown, local: unknown): unknown {
  if (Array.isArray(base) && Array.isArray(current) && Array.isArray(local)) {
    return mergeChangedArray(field, base, current, local);
  }
  if (isRecord(base) && isRecord(current) && isRecord(local)) {
    return mergeChangedRecord(base, current, local);
  }
  return local;
}

function mergeChangedRecord(base: Record<string, unknown>, current: Record<string, unknown>, local: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...current };
  for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
    if (stable(base[key]) === stable(local[key])) continue;
    merged[key] = mergeChangedValue(key, base[key], current[key], local[key]);
  }
  return merged;
}

function mergeChangedArray(field: string, base: unknown[], current: unknown[], local: unknown[]): unknown[] {
  const identity = arrayIdentity[field];
  if (!identity || [...base, ...current, ...local].some((item) => !isRecord(item) || typeof item[identity] !== "string")) {
    if ([...base, ...current, ...local].every((item) => typeof item === "string")) {
      const baseSet = new Set(base as string[]), localSet = new Set(local as string[]);
      return [...new Set([...(current as string[]).filter((item) => !baseSet.has(item) || localSet.has(item)), ...(local as string[]).filter((item) => !baseSet.has(item))])];
    }
    return local;
  }
  const baseById = new Map(base.map((item) => [(item as Record<string, unknown>)[identity] as string, item]));
  const localById = new Map(local.map((item) => [(item as Record<string, unknown>)[identity] as string, item]));
  const merged = [...current];
  for (const [id, localItem] of localById) {
    const baseItem = baseById.get(id);
    if (baseItem !== undefined && stable(baseItem) === stable(localItem)) continue;
    const index = merged.findIndex((item) => (item as Record<string, unknown>)[identity] === id);
    if (index < 0) merged.push(localItem);
    else {
      const currentItem = merged[index];
      merged[index] = isRecord(baseItem) && isRecord(currentItem) && isRecord(localItem)
        ? mergeChangedRecord(baseItem, currentItem, localItem)
        : localItem;
    }
  }
  for (const [id, baseItem] of baseById) {
    if (localById.has(id)) continue;
    const index = merged.findIndex((item) => (item as Record<string, unknown>)[identity] === id);
    if (index >= 0 && stable(merged[index]) === stable(baseItem)) merged.splice(index, 1);
  }
  return merged;
}

function mergeLocalWorkRequestChanges(server: BaseWorkRequest, base: BaseWorkRequest, local: BaseWorkRequest): BaseWorkRequest {
  const next: Record<string, unknown> = { ...server };
  const baseRecord = base as unknown as Record<string, unknown>;
  const localRecord = local as unknown as Record<string, unknown>;
  const serverRecord = server as unknown as Record<string, unknown>;
  const terminal = server.Percentage === 100 || server.Percentage === 27 || server.Percentage === 29;
  for (const key of new Set([...Object.keys(baseRecord), ...Object.keys(localRecord)])) {
    if (ignoredUpdateFields.has(key) || stable(baseRecord[key]) === stable(localRecord[key])) continue;
    if (terminal && terminalStatusFields.has(key)) continue;
    const localValue = localRecord[key], baseValue = baseRecord[key], serverValue = serverRecord[key];
    next[key] = Array.isArray(localValue) && Array.isArray(baseValue) && Array.isArray(serverValue)
      ? mergeChangedArray(key, baseValue, serverValue, localValue)
      : localValue;
  }
  const timestamp = nextStamp(server, local);
  return workRequestSchema.parse({
    ...next, WR_ID: server.WR_ID, SiteId: server.SiteId, UpdatedAt: timestamp, updatedAt: timestamp,
  });
}

function findServerWorkRequest(state: State, local: BaseWorkRequest): BaseWorkRequest | undefined {
  return state.workRequests.find((item) => item.SiteId === local.SiteId && item.WR_ID === local.WR_ID) ??
    (local.JobID ? state.workRequests.find((item) => item.SiteId === local.SiteId && item.JobID === local.JobID) : undefined);
}

function replaceRequest(state: State, wr: BaseWorkRequest, previous?: BaseWorkRequest) {
  const index = state.workRequests.findIndex((item) => previous ? item === previous :
    item.SiteId === wr.SiteId && (item.WR_ID === wr.WR_ID || !!wr.JobID && item.JobID === wr.JobID));
  if (index < 0) state.workRequests.push(wr);
  else state.workRequests[index] = wr;
}

export async function synchronizePortal(
  db: IDBPDatabase<MobileAppDB>, site: SiteId, person: string,
  queued: SyncQueueEntry[], photos: OfflinePhotoQueueEntry[], signal?: AbortSignal, conflictRetry = 0,
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
  const applied = new Set(state.mobileMutationIds ?? []);
  const failedMessages = new Map<string, string>();
  const failedEntries = new Map<string, SyncQueueEntry | OfflinePhotoQueueEntry>();
  const markFailed = (item: SyncQueueEntry | OfflinePhotoQueueEntry, error: unknown) => {
    const message = error instanceof Error ? error.message : "Invalid legacy synchronization item.";
    console.error(`Skipping malformed mobile sync item ${item.QueueId}:`, error);
    failedEntries.set(item.QueueId, item);
    failedMessages.set(item.QueueId, message);
  };
  const selected: SyncQueueEntry[] = [];
  const selectedPhotos: OfflinePhotoQueueEntry[] = [];
  for (const item of queued) {
    if (!item || typeof item.QueueId !== "string" || !item.QueueId) {
      console.error("Skipping malformed mobile sync item with no queue ID:", item);
      continue;
    }
    if (!item.Payload || typeof item.Payload !== "object" || Array.isArray(item.Payload)) {
      markFailed(item, new Error("Queued mutation has an invalid payload."));
      continue;
    }
    if (item.MutationType === "AUDIT_FINDING" || item.MutationType === "EQUIPMENT_INSPECTION") {
      if (typeof item.Payload.siteId !== "string") markFailed(item, new Error("Queued mutation has no site ID."));
      else if (item.Payload.siteId === site) selected.push(item);
      continue;
    }
    const wrId = item.Payload.WR_ID;
    if (typeof wrId !== "string") { markFailed(item, new Error("Queued mutation has no work request ID.")); continue; }
    const itemSite = item.MutationType === "WR_UPDATE" ? item.Payload.SiteId : localById.get(wrId)?.SiteId;
    if (typeof itemSite !== "string") { markFailed(item, new Error("Cannot determine the site of queued mutation.")); continue; }
    if (itemSite === site) selected.push(item);
  }
  for (const photo of photos) {
    if (!photo || typeof photo.QueueId !== "string" || !photo.QueueId) {
      console.error("Skipping malformed mobile photo item with no queue ID:", photo);
      continue;
    }
    if (typeof photo.WR_ID !== "string" || typeof photo.CompressedDataUrl !== "string" ||
        typeof photo.CreatedAt !== "string" || !Number.isFinite(photo.CompressedSizeKB)) {
      markFailed(photo, new Error("Queued photo has an invalid payload."));
      continue;
    }
    const itemSite = localById.get(photo.WR_ID)?.SiteId;
    if (!itemSite) { markFailed(photo, new Error("Cannot determine the site of queued photo.")); continue; }
    if (itemSite === site) selectedPhotos.push(photo);
  }

  const updates = selected.filter((entry) => entry.MutationType === "WR_UPDATE" || entry.MutationType === "WR_ASSIGNMENT")
    .sort((a, b) => a.CreatedAt.localeCompare(b.CreatedAt) || a.QueueId.localeCompare(b.QueueId));
  for (const item of updates) {
    if (applied.has(item.QueueId)) continue;
    try {
      const parsed = workRequestSchema.safeParse(item.Payload);
      if (!parsed.success || parsed.data.SiteId !== site) throw new Error("Invalid queued work request.");
      const serverCurrent = findServerWorkRequest(state, parsed.data);
      const base = item.BaseWorkRequest ?? null;
      if (serverCurrent && base) {
        replaceRequest(state, mergeLocalWorkRequestChanges(serverCurrent, base, parsed.data), serverCurrent);
      } else if (serverCurrent && stable({ ...serverCurrent, UpdatedAt: undefined, updatedAt: undefined }) === stable({ ...parsed.data, UpdatedAt: undefined, updatedAt: undefined })) {
        applied.add(item.QueueId);
        continue;
      } else if (serverCurrent) {
        replaceRequest(state, mergeLocalWorkRequestChanges(serverCurrent, serverCurrent, { ...serverCurrent, ...parsed.data }), serverCurrent);
      } else {
        replaceRequest(state, parsed.data);
      }
      applied.add(item.QueueId);
    } catch (error) {
      markFailed(item, error);
    }
  }

  for (const item of selected.filter((entry) => entry.MutationType === "AUDIT_FINDING")) {
    if (applied.has(item.QueueId)) continue;
    try {
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
    } catch (error) {
      markFailed(item, error);
    }
  }
  for (const item of selected.filter((entry) => entry.MutationType === "EQUIPMENT_INSPECTION")) {
    if (applied.has(item.QueueId)) continue;
    try {
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
    } catch (error) {
      markFailed(item, error);
    }
  }
  for (const item of selected.filter((entry) => entry.MutationType !== "WR_UPDATE" && entry.MutationType !== "WR_ASSIGNMENT" && entry.MutationType !== "AUDIT_FINDING" && entry.MutationType !== "EQUIPMENT_INSPECTION")) {
    if (applied.has(item.QueueId)) continue;
    try {
    const wrId = item.Payload.WR_ID;
    if (typeof wrId !== "string") throw new Error(`Queued mutation ${item.QueueId} has no work request ID.`);
    const localRequest = localById.get(wrId);
    const wr = state.workRequests.find((entry) => entry.WR_ID === wrId && (!localRequest || entry.SiteId === localRequest.SiteId)) ??
      (localRequest ? findServerWorkRequest(state, localRequest) : undefined);
    if (!wr) throw new Error(`Cannot synchronize mutation ${item.QueueId}: work request not found.`);
    if (item.MutationType === "STEP_COMPLETE") {
      const step = stepSchema.parse(item.Payload);
      const previousResult = wr.ChecklistResults?.find((result) => result.stepId === step.StepId);
      const results = [...(wr.ChecklistResults ?? [])].filter((result) => result.stepId !== step.StepId);
      const timestamp = nextStamp(wr);
      results.push({
        stepId: step.StepId, passed: step.Action !== "FAIL",
        value: typeof step.Result === "boolean" ? String(step.Result) : step.Result ?? "",
        completedAt: step.Timestamp, ...(step.TechnicianComment ? { comment: step.TechnicianComment } : {}),
        ...(previousResult?.photoPaths ? { photoPaths: previousResult.photoPaths } : {}),
      });
      replaceRequest(state, {
        ...wr, UpdatedAt: timestamp, updatedAt: timestamp, ChecklistResults: results,
        ChecklistHistory: (wr.ChecklistHistory ?? []).some((entry) => entry.id === step.AuditId) ? wr.ChecklistHistory : [...(wr.ChecklistHistory ?? []), {
          id: step.AuditId, timestamp: step.Timestamp, performedBy: step.TechnicianId,
          actionType: step.Action, stepReference: step.StepId,
          details: `${step.Action}: ${String(step.Result ?? "")}${step.TechnicianComment ? `; ${step.TechnicianComment}` : ""} (checksum ${step.ImmutableChecksum})`,
        }],
      });
    } else if (item.MutationType === "SESSION_LOG") {
      const session = sessionSchema.parse(item.Payload);
      const existingSession = (wr.MobileWorkSessions ?? []).some((entry) => entry.SessionId === session.SessionId);
      const timestamp = nextStamp(wr);
      replaceRequest(state, {
        ...wr, UpdatedAt: timestamp, updatedAt: timestamp,
        TotalTimeMinutes: (wr.TotalTimeMinutes ?? 0) + (existingSession ? 0 : session.TotalTimeMinutes),
        MobileWorkSessions: existingSession ? wr.MobileWorkSessions : [...(wr.MobileWorkSessions ?? []), session],
        Activity: (wr.Activity ?? []).some((entry) => entry.id === session.SessionId) ? wr.Activity : [...(wr.Activity ?? []), {
          id: session.SessionId, kind: "log", actorId: person, actorName: person, actorRole: "MobileTechnician",
          createdAt: session.StoppedAt,
          text: `Work session: ${session.TotalTimeMinutes} minutes${session.TimerOverrideReason ? `; ${session.TimerOverrideReason}` : ""}`,
        }],
      });
    } else {
      throw new Error(`Unsupported queued mutation ${item.MutationType}; it remains on this device.`);
    }
    applied.add(item.QueueId);
    } catch (error) {
      markFailed(item, error);
    }
  }
  for (const photo of selectedPhotos) {
    if (applied.has(photo.QueueId)) continue;
    try {
    const localRequest = localById.get(photo.WR_ID);
    const wr = state.workRequests.find((entry) => entry.WR_ID === photo.WR_ID && (!localRequest || entry.SiteId === localRequest.SiteId)) ??
      (localRequest ? findServerWorkRequest(state, localRequest) : undefined);
    if (!wr) throw new Error(`Cannot synchronize photo ${photo.QueueId}: work request not found.`);
    const timestamp = nextStamp(wr);
    replaceRequest(state, {
      ...wr,
      UpdatedAt: timestamp, updatedAt: timestamp,
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
    } catch (error) {
      markFailed(photo, error);
    }
  }

  const serverMutationIds = new Set(response.state.mobileMutationIds ?? []);
  const changed = [...applied].some((id) => !serverMutationIds.has(id));
  state.mobileMutationIds = [...applied];
  if (changed) {
    try { await request(site, person, "POST", { revision: response.revision, state }, signal); }
    catch (error) {
      if (error instanceof SyncRequestError && error.status === 409 && conflictRetry < 2) {
        return synchronizePortal(db, site, person, queued, photos, signal, conflictRetry + 1);
      }
      throw error;
    }
  }

  const syncedAt = new Date().toISOString();
  const tx = db.transaction(["workRequests", "buildings", "floors", "rooms", "equipment", "checklists", "schedules", "syncQueue", "photoQueue", "syncMetadata"], "readwrite");
  const pendingNow = await tx.objectStore("syncQueue").getAll();
  const pendingPhotosNow = await tx.objectStore("photoQueue").getAll();
  const confirmed = new Set([...selected.map((item) => item.QueueId), ...failedEntries.keys()]);
  const confirmedPhotos = new Set([...selectedPhotos.map((item) => item.QueueId), ...failedEntries.keys()]);
  const dirtyIds = new Set(pendingNow.filter((item) => item.SyncStatus === "PENDING" && !confirmed.has(item.QueueId))
    .map((item) => item.Payload.WR_ID).filter((id): id is string => typeof id === "string"));
  for (const item of failedEntries.values()) {
    const wrId = "Payload" in item ? item.Payload.WR_ID : item.WR_ID;
    if (typeof wrId === "string") dirtyIds.add(wrId);
  }
  const requests = tx.objectStore("workRequests");
  const [storedRequests, storedBuildings, storedFloors, storedRooms, storedEquipment, storedSchedules, storedChecklists] = await Promise.all([
    requests.getAll(), tx.objectStore("buildings").getAll(), tx.objectStore("floors").getAll(),
    tx.objectStore("rooms").getAll(), tx.objectStore("equipment").getAll(), tx.objectStore("schedules").getAll(),
    tx.objectStore("checklists").getAll(),
  ]);
  // Auto-heal: stale records stored under another/legacy site id that share identifiers with the server snapshot are purged, never blocking sync.
  for (const old of storedRequests) if (old.SiteId !== site && state.workRequests.some((item) => item.WR_ID === old.WR_ID)) await requests.delete(old.WR_ID);
  for (const old of storedBuildings) if (old.SiteId !== site && state.buildings.some((item) => item.bl_id === old.bl_id)) await tx.objectStore("buildings").delete(old.bl_id);
  for (const old of storedFloors) if (old.SiteId !== site && state.floors.some((item) => item.bl_id === old.bl_id && item.LevelName === old.LevelName)) await tx.objectStore("floors").delete([old.bl_id, old.LevelName]);
  for (const old of storedRooms) if (old.SiteId !== site && state.rooms.some((item) => item.bl_id === old.bl_id && item.LevelName === old.LevelName && item.RoomCode === old.RoomCode)) await tx.objectStore("rooms").delete([old.bl_id, old.LevelName, old.RoomCode]);
  for (const old of storedEquipment) if (old.SiteId !== site && state.equipment.some((item) => item.EquipmentCode === old.EquipmentCode)) await tx.objectStore("equipment").delete(old.EquipmentCode);
  for (const old of storedSchedules) if (old.SiteId !== site && state.schedules.some((item) => item.ScheduleId === old.ScheduleId)) await tx.objectStore("schedules").delete(old.ScheduleId);
  for (const old of storedChecklists) {
    if (state.blueprints.some((item) => item.ChecklistCode === old.ChecklistCode &&
      ((old.SiteId !== undefined && old.SiteId !== site) || (!old.SiteId && stable(old) !== stable(item))))) await tx.objectStore("checklists").delete(old.ChecklistCode);
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
  for (const item of [...selected, ...failedEntries.values()].filter((entry): entry is SyncQueueEntry => "Payload" in entry)) {
    const message = failedMessages.get(item.QueueId);
    await tx.objectStore("syncQueue").put(message ? { ...item, SyncStatus: "FAILED", ErrorMessage: message } : { ...item, SyncStatus: "SYNCED", SyncedAt: syncedAt });
  }
  for (const item of [...selectedPhotos, ...failedEntries.values()].filter((entry): entry is OfflinePhotoQueueEntry => !("Payload" in entry))) {
    const message = failedMessages.get(item.QueueId);
    await tx.objectStore("photoQueue").put(message ? { ...item, SyncStatus: "FAILED", ErrorMessage: message } : { ...item, SyncStatus: "SYNCED", SyncedAt: syncedAt });
  }
  await tx.objectStore("syncMetadata").put({ key: "lastSyncTime", value: syncedAt, updatedAt: syncedAt });
  await tx.objectStore("syncMetadata").put({ key: `siteContext:${site}`, value: JSON.stringify({ craftspeople: state.craftspeople ?? [], userAccessProfiles: state.userAccessProfiles ?? [], locationFreezes: state.locationFreezes ?? [],   suppressedPmOccurrences: state.suppressedPmOccurrences ?? [], stakeholderTeams: state.stakeholderTeams ?? [], coordinationRequirements: state.coordinationRequirements ?? [], pmCoordination: state.pmCoordination ?? [] }), updatedAt: syncedAt });
  await tx.objectStore("syncMetadata").put({ key: `auditContext:${site}`, value: JSON.stringify({ auditCampaigns: state.auditCampaigns ?? [], auditFindings: state.auditFindings ?? [], auditInspections: state.auditInspections ?? [], auditSettings: state.auditSettings, auditTemplates: state.auditTemplates ?? [], auditAssurance: state.auditAssurance }), updatedAt: syncedAt });
  await tx.done;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("cafm-audit-sync", { detail: site }));
  const pending = pendingNow.filter((item) => item.SyncStatus === "PENDING" && !confirmed.has(item.QueueId)).length +
    pendingPhotosNow.filter((item) => item.SyncStatus === "PENDING" && !confirmedPhotos.has(item.QueueId)).length;
  return {
    synced: selected.filter((item) => applied.has(item.QueueId)).length +
      selectedPhotos.filter((item) => applied.has(item.QueueId)).length,
    failed: failedEntries.size, pending, lastSyncTime: syncedAt,
  };
}
