import { randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
// Bypass Next's optimized barrel cache, which can retain an outdated export table.
import { QAInspectorAssignmentSchema } from "@cafm/shared-schema/qa-inspector";
import { AuditCampaignSchema, AuditFindingSchema, AuditInspectionSchema, AuditSettingsSchema, AuditTemplateSchema, AuditImportSchema } from "@/lib/audit-assurance-types";
import { reconcileAssurance } from "@/lib/assurance-workflow";
import { AuditAssuranceSchema } from "@/lib/equipment-inspection";
import { SiteStakeholderTeamSchema, SiteSlaConfigSchema, CifmPersonSchema, OnboardingRequestSchema, PLATFORM_SITE_IDS, normalizeSiteId, migrateLegacySiteIds, SiteCoordinationRequirementSchema, PmCoordinationRecordSchema, PM_LegacyChecklistStandardSchema, PM_LegacyScheduleSchema, SuppressedPmOccurrenceSchema, BlueprintAuditEntrySchema, PMTargetFields } from "@cafm/shared-schema";
import { migratePmState, uniquePmsOrdersAcrossSites } from "@/lib/pm-orders";
import { recordBlueprintRevisions } from "@/lib/pm-revisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedOrigins = new Set(["http://localhost:3000", "http://localhost:3001"]);
function allowedOrigin(request: Request, origin: string) {
  if (allowedOrigins.has(origin)) return true;
  let host: URL;
  try { host = new URL(origin); } catch { return false; }
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const own = [new URL(request.url).host, request.headers.get("host"), forwarded].filter(Boolean);
  if (own.includes(host.host)) return true;
  const name = host.hostname;
  return name === "localhost" || name === "127.0.0.1" || name.endsWith(".onrender.com") || name.endsWith(".vercel.app");
}
function cors(request: Request) {
  const origin = request.headers.get("origin");
  return {
    ...(origin && allowedOrigin(request, origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CAFM-Site-Id, X-CAFM-Person",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}
const siteSchema = z.enum(PLATFORM_SITE_IDS);
const tradeSchema = z.enum(["Mechanical", "Electrical", "Civil", "MultiTechnic", "Cleaning", "HeavyGang", "Catering"]);
const permissionsSchema = z.object({
  canGeneratePM_WR: z.boolean(), canOpenFollowUpFJ: z.boolean(), canCreateFJ: z.boolean(), canCreateLJ: z.boolean(),
  canClaimUnassignedWR: z.boolean(), canCompleteWR78: z.boolean(), canCloseWR100: z.boolean(), canDefineChecklistPM: z.boolean(),
  canDefineChecklistFJ: z.boolean(), canDefineChecklistLJ: z.boolean(), canDefinePMSchedule: z.boolean(), canAssignPMPToEQ: z.boolean(),
  canManageEquipment: z.boolean(), auditTrades: z.array(tradeSchema), auditWRTypes: z.array(z.enum(["PM", "FJ"])),
  canAuditChooseWRs: z.boolean(), canAuditDoInspection: z.boolean(), canAuditReopenWR: z.boolean(), canManageFailureReasons: z.boolean(),
  canScheduleCraftperson: z.boolean(), canOverwriteLaborTime: z.boolean(), canManageShiftsAndLeaves: z.boolean(), canManageLocationFreezes: z.boolean(),
});
const UserAccessProfileSchema = z.object({
  id: z.string().min(1), siteId: siteSchema, personName: z.string().min(1), fullName: z.string().min(1),
  email: z.string().email().optional(), linkedCraftpersonId: z.string().min(1).optional(),
  username: z.string().min(1).optional(), phone: z.string().optional(), department: z.string().optional(),
  siteAccess: z.array(siteSchema).optional(), isHelpdesk: z.boolean().optional(), isHrAdmin: z.boolean().optional(),
  primaryRole: z.enum(["Craftperson", "TeamLeader", "QAInspector", "TechnicalOfficer", "SiteAdministrator", "SuperAdmin", "Helpdesk", "HRAdmin"]),
  isTeamLeader: z.boolean(), isCraftperson: z.boolean(), isQAInspector: z.boolean(), isSiteAdmin: z.boolean(),
  isSuperAdmin: z.boolean().optional(), managedSiteIds: z.array(siteSchema).optional(),
  siteAdminGovernance: z.object({ canManageUsersAndVPA: z.boolean(), canManageRoleAssignments: z.boolean(), canManageAuditQuotas: z.boolean(), canManageFreezesAndShifts: z.boolean(), canResetOrExportSiteData: z.boolean() }).optional(),
  vpaTrades: z.array(tradeSchema), vpaBuildingIds: z.array(z.string().min(1)), permissions: permissionsSchema,
  assignedRoleIds: z.array(z.string().min(1)).optional(),
});
const roleDefinitionSchema = z.object({
  id: z.string().min(1), name: z.string().trim().min(1), description: z.string(),
  badgeColor: z.enum(["amber", "purple", "blue", "emerald", "cyan", "slate", "rose"]),
  baseRoleType: z.enum(["Craftperson", "TeamLeader", "QAInspector", "TechnicalOfficer", "SiteAdministrator", "SuperAdmin", "Helpdesk", "HRAdmin"]),
  parentRoleId: z.string().min(1).optional(), isCustomVariant: z.boolean().optional(), permissions: permissionsSchema,
});
const localTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/)
  .refine((value) => z.iso.date().safeParse(value.slice(0, 10)).success, "Invalid local date and time");
const CraftpersonAbsenceSchema = z.object({
  id: z.string().min(1), siteId: siteSchema, craftpersonId: z.string().min(1),
  absenceType: z.enum(["Vacation", "SickLeave", "Training", "PublicHoliday", "OtherAbsence"]),
  startDate: z.iso.date(), endDate: z.iso.date(), isFullDay: z.boolean(),
  startTime: localTime.optional(), endTime: localTime.optional(), unavailableHoursPerDay: z.number().nonnegative().default(8),
  status: z.enum(["Approved", "Pending", "Cancelled"]), notes: z.string(),
}).superRefine((entry, context) => {
  if (entry.startDate > entry.endDate) context.addIssue({ code: "custom", path: ["endDate"], message: "End date must not precede start date." });
  if (!entry.isFullDay && ((entry.startTime && !entry.endTime) || (!entry.startTime && entry.endTime) || (entry.startTime && entry.endTime && entry.startTime >= entry.endTime)))
    context.addIssue({ code: "custom", path: ["endTime"], message: "Provide a start and end time with end after start." });
});
const LocationFreezeSchema = z.preprocess((value) => {
  if (value && typeof value === "object" && "buildingIds" in value && Array.isArray(value.buildingIds) && !("buildingId" in value)) return { ...value, buildingId: value.buildingIds[0] };
  return value;
}, z.object({
  id: z.string().min(1), siteId: siteSchema, buildingId: z.string().min(1), floorId: z.string().min(1).optional(), roomId: z.string().min(1).optional(),
  buildingIds: z.array(z.string().min(1)).min(1).optional(), floorIds: z.array(z.string().min(1)).optional(), roomIds: z.array(z.string().min(1)).optional(),
  title: z.string().trim().min(1), description: z.string().trim().min(1), responsiblePerson: z.string().trim().min(1),
  startDateTime: localDateTime, endDateTime: localDateTime, allowPM: z.boolean(), allowFJ: z.boolean(), allowLJ: z.boolean(),
}).superRefine((entry, context) => {
  if (entry.roomId && !entry.floorId) context.addIssue({ code: "custom", path: ["roomId"], message: "A room requires a floor." });
  if (entry.buildingIds && !entry.buildingIds.includes(entry.buildingId)) context.addIssue({ code: "custom", path: ["buildingId"], message: "The legacy building must be included in the selected buildings." });
  if (entry.roomIds?.length && !entry.floorIds?.length) context.addIssue({ code: "custom", path: ["floorIds"], message: "Selected rooms require their parent floors." });
  if (entry.endDateTime <= entry.startDateTime) context.addIssue({ code: "custom", path: ["endDateTime"], message: "End must be after start." });
}));
const records = z.array(z.record(z.string(), z.unknown()));
const qaStagedVerdictSchema = z.object({
  verdict: z.enum(["Pass", "Fail"]), inspector: z.string().min(1), stagedAt: z.string().min(1),
  failureReason: z.string().optional(), additionalNotes: z.string().optional(), issueDescription: z.string().optional(),
  reopenTo50: z.boolean(), spawnFollowUpFJ: z.boolean(),
  previousStatus: z.enum(["None", "SelectedForAudit", "ToBeInspected", "QA_Staged_Pass", "QA_Staged_Fail", "QA_Passed", "QA_Failed_ActionRequired", "QA_Corrected", "QA_Verified"]).optional(),
});
const qaChallengeSchema = z.object({
  id: z.string().min(1), wrId: z.string().min(1), teamLeaderName: z.string().min(1), createdAt: z.string().min(1),
  challengeReason: z.string().trim().min(1), isReadByInspector: z.boolean(),
  readByInspectorAt: z.string().optional(), readByInspectorName: z.string().optional(),
  resolutionStatus: z.enum(["Pending", "Accepted_ReopenCancelled", "Rejected_ReworkRequired"]),
  inspectorResponse: z.string().optional(), resolvedAt: z.string().optional(),
});
const qaReportSchema = z.object({
  id: z.string().min(1), siteId: siteSchema, createdAt: z.string().min(1), inspector: z.string().min(1),
  executiveSummary: z.string(), recipients: z.array(z.string().trim().min(1)),
  totalInspected: z.number().int().nonnegative(), passedCount: z.number().int().nonnegative(), failedCount: z.number().int().nonnegative(),
  tradeStats: z.array(z.object({ trade: z.string(), inspected: z.number().int().nonnegative(), passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), passRate: z.number().min(0).max(100) })),
  items: z.array(z.object({ wrId: z.string().min(1), wrType: z.enum(["PM", "FJ"]), trade: z.string(), buildingId: z.string(), craftperson: z.string(), verdict: z.enum(["Pass", "Fail"]), issueDescription: z.string().optional(), reopenedTo50: z.boolean().optional(), followUpWrId: z.string().optional() })),
});
const technicianFieldUpdateSchema = z.object({
  id: z.string().min(1), wrId: z.string().min(1), craftpersonId: z.string().min(1), craftpersonName: z.string().min(1),
  createdAt: z.string().min(1),
  reasonCategory: z.enum(["NeedAccess", "NeedTools", "WaitingForParts", "PreviousJobRanLate", "TechnicalIssue", "FinishedEarlyOrLate", "Other"]),
  urgency: z.enum(["InfoOnly", "ActionToday", "UrgentBlocked"]), message: z.string().trim().min(1),
  status: z.enum(["Open", "Acknowledged", "Resolved"]), teamLeaderReply: z.string().optional(),
  resolvedBy: z.string().optional(), resolvedAt: z.string().optional(),
});
const workRequestRecord = z.object({
  ...PMTargetFields,
  WR_ID: z.string().min(1),
  pmsId: z.string().regex(/^(?!00000)\d{5}$/).optional(),
  ParentPM_WR_ID: z.string().min(1).optional(),
  ParentWR_ID: z.string().min(1).optional(),
  parentWrId: z.string().min(1).optional(),
  sourcePmWrId: z.string().min(1).optional(),
  OriginWR_ID: z.string().min(1).optional(),
  FollowUpFJIds: z.array(z.string().min(1)).optional(),
  originatingChecklistStepId: z.string().min(1).optional(),
  originatingChecklistStepLabel: z.string().min(1).optional(),
  updatedAt: z.string().optional(),
  pmFrequency: z.string().optional(),
  absorbedFrequencies: z.array(z.string()).optional(),
  suppressionGroupName: z.string().optional(),
  suppressedByWrId: z.string().optional(),
  QA_AuditStatus: z.enum(["None", "SelectedForAudit", "ToBeInspected", "QA_Staged_Pass", "QA_Staged_Fail", "QA_Passed", "QA_Failed_ActionRequired", "QA_Corrected", "QA_Verified"]).optional(),
  qaStagedVerdict: qaStagedVerdictSchema.optional(),
  qaTeamLeaderChallenges: z.array(qaChallengeSchema).optional(),
  qaReinspectionCount: z.number().int().nonnegative().optional(),
  technicianFieldUpdates: z.array(technicianFieldUpdateSchema).optional(),
}).catchall(z.unknown()).refine((wr) => !wr.technicianFieldUpdates?.some((update) => update.wrId !== wr.WR_ID), { path: ["technicianFieldUpdates"], message: "Field update WR ID must match its work request." })
  .refine((wr) => !wr.qaTeamLeaderChallenges?.some((challenge) => challenge.wrId !== wr.WR_ID), { path: ["qaTeamLeaderChallenges"], message: "Challenge WR ID must match its work request." });
const stateSchema = z.object({
  pmModelVersion: z.literal(60).optional(),
  pmMigrationNotes: z.array(z.string()).optional(),
  pmsOrderHighWatermark: z.number().int().min(0).max(99999).optional(),
  blueprintHighWatermark: z.number().int().min(0).max(9999).optional(),
  blueprintAuditLog: z.array(BlueprintAuditEntrySchema).default([]),
  sites: z.array(z.string().min(1)),
  buildings: records,
  floors: records,
  rooms: records,
  desks: records,
  equipment: records,
  blueprints: z.array(PM_LegacyChecklistStandardSchema),
  schedules: z.array(PM_LegacyScheduleSchema),
  suppressedPmOccurrences: z.array(SuppressedPmOccurrenceSchema).optional(),
  craftspeople: records,
  userAccessProfiles: z.array(UserAccessProfileSchema).optional(),
  roleDefinitions: z.array(roleDefinitionSchema).optional(),
  craftpersonAbsences: z.array(CraftpersonAbsenceSchema).optional(),
  locationFreezes: z.array(LocationFreezeSchema).optional(),
  stakeholderTeams: z.array(SiteStakeholderTeamSchema).optional(),
  coordinationRequirements: z.array(SiteCoordinationRequirementSchema).optional(),
  pmCoordination: z.array(PmCoordinationRecordSchema).optional(),
  ljStageMatrix: z.record(z.string().regex(/^\d{1,3}:[A-Z_]+$/), z.enum(["act", "notify", "none", "P", "O"])).optional(),
  featurePermissionOverrides: z.record(z.string().regex(/^[A-Za-z_]+\|[A-Za-z]+\.[A-Za-z]+$/), z.boolean()).optional(),
  siteSlaConfig: SiteSlaConfigSchema.optional(),
  cifmPeople: z.array(CifmPersonSchema).optional(),
  onboardingRequests: z.array(OnboardingRequestSchema).optional(),
  fjNotifications: z.array(z.object({
    id: z.string().min(1), wrId: z.string().min(1), recipient: z.string().min(1), createdAt: z.string().min(1),
    kind: z.literal("FJ_DISSATISFACTION"), message: z.string(), read: z.boolean().optional(),
  })).optional(),
  siteRoleAssignments: records,
  qaInspectorAssignments: z.array(QAInspectorAssignmentSchema).optional(),
  qaFailureReasons: z.array(z.string().min(1)).optional(),
  qaAuditReports: z.array(qaReportSchema).optional(),
  auditCampaigns: z.array(AuditCampaignSchema).optional(),
  auditFindings: z.array(AuditFindingSchema).optional(),
  auditInspections: z.array(AuditInspectionSchema).optional(),
  auditSettings: AuditSettingsSchema.optional(),
  auditAssurance: AuditAssuranceSchema.optional(),
  auditTemplates: z.array(AuditTemplateSchema).optional(),
  auditImports: z.array(AuditImportSchema).optional(),
  workRequests: z.array(workRequestRecord),
  deletedWorkRequests: z.array(workRequestRecord).optional(),
  users: records,
  tradeRoleMappings: records,
  siteRoleMappings: records,
  mobileMutationIds: z.array(z.string().min(1)).optional(),
  bimElementLinks: z.record(z.string(), z.object({
    equipmentCode: z.string().min(1), buildingId: z.string().min(1), updatedAt: z.string().min(1), updatedBy: z.string().min(1),
  })).optional(),
}).strict().transform((state, context) => {
  try { return migratePmState(state); }
  catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid blueprint family configuration." }); return z.NEVER; }
});
const payloadSchema = z.preprocess(migrateLegacySiteIds, z.object({ revision: z.number().int().nonnegative(), state: stateSchema }));
const envelopeSchema = z.object({ revision: z.number().int().positive(), state: stateSchema });
const databaseSchema = z.preprocess(migrateLegacySiteIds, z.object({
  sites: z.partialRecord(siteSchema, envelopeSchema),
})).transform((database) => {
  const entries = Object.entries(database.sites).sort(([a], [b]) => a.localeCompare(b));
  const states = uniquePmsOrdersAcrossSites(entries.map(([, entry]) => entry.state));
  return { sites: Object.fromEntries(entries.map(([site, entry], index) => [site, { ...entry, state: states[index] }])) };
});
type Database = z.infer<typeof databaseSchema>;
type Backend = { kind: "supabase"; url: string; key: string } | { kind: "disk" | "temporary"; directory: string; filename: string; lockFile: string };
type StoredDatabase = { database: Database; version: string | null };
declare global {
  var __CAFM_CLOUD_STATE__: Database | undefined;
}
const maxBytes = 32 * 1024 * 1024;

function reply(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: cors(request) });
}

function stamp(wr: Record<string, unknown>) {
  const value = Math.max(Date.parse(String(wr.updatedAt ?? "")) || 0, Date.parse(String(wr.UpdatedAt ?? "")) || 0);
  return value;
}

// Keeps the stored copy of any WR that is strictly newer than the incoming one, so a stale tab or device cannot clobber newer work.
function mergeNewerWorkRequests(existing: z.infer<typeof stateSchema>, incoming: z.infer<typeof stateSchema>): z.infer<typeof stateSchema> {
  const stored = new Map(existing.workRequests.map((wr) => [String(wr.WR_ID), wr as Record<string, unknown>]));
  const workRequests = incoming.workRequests.map((wr) => {
    const server = stored.get(String(wr.WR_ID));
    return server && stamp(server) > stamp(wr as Record<string, unknown>) ? (server as typeof wr) : wr;
  });
  return { ...incoming, workRequests };
}

function scope(request: Request) {
  const header = request.headers.get("x-cafm-site-id");
  const query = new URL(request.url).searchParams.get("siteId");
  const site = siteSchema.safeParse(normalizeSiteId(query ?? header));
  return site.success ? site.data : siteSchema.parse("02-ESOC");
}

function validateSite(state: z.infer<typeof stateSchema>, site: string) {
  if (state.sites.length !== 1 || state.sites[0] !== site) return false;
  const scoped = ["buildings", "floors", "rooms", "desks", "equipment", "schedules", "craftspeople", "siteRoleAssignments", "workRequests", "tradeRoleMappings", "siteRoleMappings"] as const;
  if (scoped.some((key) => state[key].some((item) => item.SiteId !== site))) return false;
  if (state.blueprints.some((item) => item.SiteId !== undefined && item.SiteId !== site)) return false;
  if (state.blueprintAuditLog.some((item) => item.siteId !== site)) return false;
  if (state.schedules.some((order) => !state.blueprints.some((bp) => bp.ChecklistCode === order.ChecklistCode) ||
      !state.buildings.some((building) => building.bl_id === order.bl_id) ||
      order.targetType === "equipment" && !state.equipment.some((asset) => asset.EquipmentCode === order.EquipmentCodes[0]) ||
      (order.targetType === "floor" || order.targetType === "room") && !state.floors.some((floor) => floor.bl_id === order.bl_id && floor.LevelName === order.LevelName) ||
      order.targetType === "room" && !state.rooms.some((room) => room.bl_id === order.bl_id && room.LevelName === order.LevelName && room.RoomCode === order.RoomCode))) return false;
  if (state.suppressedPmOccurrences?.some((item) => item.siteId !== site ||
      (item.targetType && item.targetType !== "equipment" ? !state.schedules.some((order) => order.targetKey === item.targetKey) : !state.equipment.some((asset) => asset.EquipmentCode === item.equipmentCode && asset.SiteId === site)) ||
      !state.workRequests.some((wr) => wr.WR_ID === item.coveredByWrId && wr.SiteId === site) &&
      !state.deletedWorkRequests?.some((wr) => wr.WR_ID === item.coveredByWrId && wr.SiteId === site))) return false;
  if (state.qaInspectorAssignments?.some((item) => item.siteId !== site)) return false;
  if (state.onboardingRequests?.some((item) => item.stationedSiteId !== site)) return false;
  if (state.qaAuditReports?.some((item) => item.siteId !== site)) return false;
  if (state.auditCampaigns?.some((item) => item.siteId !== site)) return false;
  if (state.auditFindings?.some((item) => item.siteId !== site || !state.auditCampaigns?.some((campaign) => campaign.id === item.campaignId))) return false;
  if (state.auditInspections?.some((item) => item.siteId !== site || !state.auditCampaigns?.some((campaign) => campaign.id === item.campaignId))) return false;
  if ((state.auditAssurance?.equipmentInspections ?? []).some((sheet) => sheet.siteId !== site || !state.auditCampaigns?.some((campaign) => campaign.id === sheet.campaignId && campaign.selectedEquipmentIds.includes(sheet.equipmentId)) || !state.equipment.some((asset) => asset.SiteId === site && asset.EquipmentCode === sheet.equipmentId && asset.bl_id === sheet.buildingId && asset.RoomCode === sheet.roomId))) return false;
  if (state.auditTemplates?.some((item) => item.siteId !== site)) return false;
  if (state.auditImports?.some((item) => item.siteId !== site || !state.auditCampaigns?.some((campaign) => campaign.id === item.campaignId))) return false;
  if (state.userAccessProfiles?.some((item) => item.siteId !== site)) return false;
  if (state.deletedWorkRequests?.some((item) => item.SiteId !== site)) return false;
  if (state.stakeholderTeams?.some((item) => item.siteId !== site) || state.coordinationRequirements?.some((item) => item.siteId !== site) || state.pmCoordination?.some((item) => item.siteId !== site)) return false;
  if (state.craftpersonAbsences?.some((item) => item.siteId !== site || !state.craftspeople.some((person) => person.id === item.craftpersonId && person.SiteId === site))) return false;
  if (state.locationFreezes?.some((item) => item.siteId !== site ||
    (item.buildingIds ? item.buildingIds.some((id) => !state.buildings.some((building) => building.bl_id === id)) ||
      (item.floorIds ?? []).some((id) => !state.floors.some((floor) => item.buildingIds!.includes(String(floor.bl_id)) && floor.LevelName === id)) ||
      (item.roomIds ?? []).some((id) => !state.rooms.some((room) => item.buildingIds!.includes(String(room.bl_id)) && (item.floorIds ?? []).includes(String(room.LevelName)) && room.RoomCode === id)) :
      !state.buildings.some((building) => building.bl_id === item.buildingId) ||
      (item.floorId && !state.floors.some((floor) => floor.bl_id === item.buildingId && floor.LevelName === item.floorId)) ||
      (item.roomId && !state.rooms.some((room) => room.bl_id === item.buildingId && room.LevelName === item.floorId && room.RoomCode === item.roomId))))) return false;
  if (state.users.some((user) => !Array.isArray(user.AssignedSiteIds) || user.AssignedSiteIds.length !== 1 || user.AssignedSiteIds[0] !== site)) return false;
  if (state.bimElementLinks && Object.entries(state.bimElementLinks).some(([key, link]) =>
    !key.startsWith(`${link.buildingId}:`) || !state.equipment.some((asset) => asset.EquipmentCode === link.equipmentCode && asset.SiteId === site))) return false;
  return true;
}

function authorize(request: Request) {
  const expected = process.env.CAFM_SYNC_TOKEN || process.env.CAFM_API_TOKEN;
  if (!expected) return true;
  if (expected.length < 32) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function backend(): Promise<Backend> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (url || key) {
    if (!url || !key) throw new Error("Both SUPABASE_URL and a Supabase key are required.");
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") throw new Error("Supabase URL must use HTTPS.");
    return { kind: "supabase", url: `${url.replace(/\/+$/, "")}/rest/v1/cafm_state`, key };
  }
  const directory = path.join(process.cwd(), ".data");
  try {
    if (process.env.VERCEL) throw Object.assign(new Error("Serverless deployment"), { code: "EROFS" });
    await mkdir(directory, { recursive: true });
    await access(directory, constants.W_OK);
    return { kind: "disk", directory, filename: path.join(directory, "cafm-db.json"), lockFile: path.join(directory, "cafm-db.lock") };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code !== "EROFS" && code !== "EACCES" && code !== "EPERM") throw error;
    try { await access(path.join(directory, "cafm-db.json")); throw new Error("Existing CAFM database is not writable; refusing to switch storage."); }
    catch (existingError) {
      if (!(existingError instanceof Error && "code" in existingError && existingError.code === "ENOENT")) throw existingError;
    }
    const temporaryDirectory = path.join(os.tmpdir(), "cafm-state");
    await mkdir(temporaryDirectory, { recursive: true });
    console.warn("CAFM state is using temporary, instance-local storage; it is not durable or shared between instances.");
    return { kind: "temporary", directory: temporaryDirectory, filename: path.join(temporaryDirectory, "cafm-db.json"), lockFile: path.join(temporaryDirectory, "cafm-db.lock") };
  }
}

async function supabaseRequest(storage: Extract<Backend, { kind: "supabase" }>, query: string, init: RequestInit = {}) {
  const response = await fetch(`${storage.url}${query}`, {
    ...init,
    headers: { apikey: storage.key, Authorization: `Bearer ${storage.key}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 409) return null;
    throw new Error(`Supabase CAFM state request failed (${response.status}); check table, permissions, and configuration.`);
  }
  return response.json() as Promise<unknown>;
}

async function load(storage: Backend): Promise<StoredDatabase> {
  if (storage.kind === "supabase") {
    const result = await supabaseRequest(storage, "?id=eq.default&select=payload,version");
    const rows = z.array(z.object({ payload: databaseSchema, version: z.string().uuid() })).parse(result);
    if (rows.length > 1) throw new Error("Supabase CAFM state contains duplicate rows.");
    return rows.length ? { database: rows[0].payload, version: rows[0].version } : { database: { sites: {} }, version: null };
  }
  try {
    return { database: databaseSchema.parse(JSON.parse(await readFile(storage.filename, "utf8"))), version: null };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { database: storage.kind === "temporary" && globalThis.__CAFM_CLOUD_STATE__ ? databaseSchema.parse(globalThis.__CAFM_CLOUD_STATE__) : { sites: {} }, version: null };
    }
    throw error;
  }
}

async function replaceDatabase(temporary: string, filename: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temporary, filename);
      return;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (process.platform !== "win32" || (code !== "EPERM" && code !== "EBUSY") || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

function persistenceError(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return "Could not persist the CAFM state: the existing database is invalid. The database was not replaced.";
  }
  const code = error instanceof Error && "code" in error ? error.code : undefined;
  if (code === "ENOSPC") return "Could not persist the CAFM state: the server disk is full.";
  if (code === "EACCES" || code === "EPERM") return "Could not persist the CAFM state: the server cannot write or replace the database file.";
  if (code === "EBUSY") return "Could not persist the CAFM state: the database file is busy. Please retry.";
  return "Could not persist the CAFM state. See the server log for details.";
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function GET(request: Request) {
  const site = scope(request);
  if (!authorize(request)) return reply(request, { error: "Local demo sync is disabled or the token is invalid." }, 401);
  try {
    const storage = await backend();
    const { database } = await load(storage);
    const current = database.sites[site];
    const highWatermark = Math.max(0, ...Object.values(database.sites).flatMap((entry) => [entry.state.pmsOrderHighWatermark ?? 0, ...entry.state.schedules.map((order) => Number(order.ScheduleId))]));
    const blueprintHighWatermark = Math.max(0, ...Object.values(database.sites).flatMap((entry) => [entry.state.blueprintHighWatermark ?? 0, ...entry.state.blueprints.map((bp) => Number(/^CB-(\d{4})-/.exec(bp.ChecklistCode)?.[1] ?? 0))]));
    const response = reply(request, current ? { ...current, state: { ...current.state, pmsOrderHighWatermark: highWatermark, blueprintHighWatermark } } : { revision: 0, state: null });
    response.headers.set("X-CAFM-Storage", storage.kind);
    return response;
  } catch (error) {
    console.error("Could not read CAFM state", error);
    return reply(request, { error: "Could not read the persisted CAFM state." }, 500);
  }
}

export async function POST(request: Request) {
  const site = scope(request);
  if (!authorize(request)) return reply(request, { error: "Local demo sync is disabled or the token is invalid." }, 401);
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  let lockFile: string | undefined;
  let temporary: string | undefined;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > maxBytes) return reply(request, { error: "State exceeds 32 MB." }, 413);
    let json: unknown;
    try { json = JSON.parse(text); } catch { return reply(request, { error: "Invalid JSON." }, 400); }
    const parsed = payloadSchema.safeParse(json);
    if (!parsed.success) return reply(request, { error: "Invalid state or revision.", details: parsed.error.issues }, 400);
    if (!validateSite(parsed.data.state, site)) return reply(request, { error: "State contains records from another site." }, 400);
    const storage = await backend();
    if (storage.kind !== "supabase") {
      lockFile = storage.lockFile;
      try {
        lock = await open(lockFile, "wx", 0o600);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "EEXIST") {
          return reply(request, { error: "Another state write is in progress." }, 503);
        }
        throw error;
      }
    }
    const { database, version } = await load(storage);
    const current = database.sites[site];
    if (parsed.data.revision !== (current?.revision ?? 0)) {
      return reply(request, { error: "State has changed; reload and resolve the conflict.", revision: current?.revision ?? 0 }, 409);
    }
    const existing = new Set((current?.state.workRequests ?? []).map((wr) => wr.WR_ID));
    const otherIds = new Set(Object.entries(database.sites).filter(([id]) => id !== site).flatMap(([, envelope]) => envelope.state.workRequests.map((wr) => wr.WR_ID)));
    const duplicate = parsed.data.state.workRequests.find((wr) => typeof wr.OriginatingWR_ID === "string" && !existing.has(wr.WR_ID) && otherIds.has(wr.WR_ID));
    if (duplicate) return reply(request, { error: `Follow-up work request ID ${String(duplicate.WR_ID)} is already in use at another site.` }, 409);
    const forceReset = new URL(request.url).searchParams.get("reset") === "1" || (json as { forceReset?: unknown } | null)?.forceReset === true;
    if (forceReset) {
      const otherStates = Object.entries(database.sites).filter(([id]) => id !== site).map(([, entry]) => entry.state);
      parsed.data.state = uniquePmsOrdersAcrossSites([...otherStates, parsed.data.state]).at(-1)!;
    }
    const otherOrders = new Set(Object.entries(database.sites).filter(([id]) => id !== site).flatMap(([, entry]) => entry.state.schedules.map((order) => order.ScheduleId)));
    const existingOrders = new Set(current?.state.schedules.map((order) => order.ScheduleId) ?? []);
    const collision = parsed.data.state.schedules.find((order) => !existingOrders.has(order.ScheduleId) && otherOrders.has(order.ScheduleId));
    if (collision) return reply(request, { error: `PMS #${collision.ScheduleId} was allocated at another site. Refresh site data and retry the assignment.` }, 409);
    const otherBlueprints = new Set(Object.entries(database.sites).filter(([id]) => id !== site).flatMap(([, entry]) => entry.state.blueprints.map((bp) => bp.ChecklistCode.slice(0, 7))));
    const blueprintCollision = parsed.data.state.blueprints.find((bp) => otherBlueprints.has(bp.ChecklistCode.slice(0, 7)));
    if (blueprintCollision) return reply(request, { error: `Blueprint ${blueprintCollision.ChecklistCode} is in use at another site. Refresh site data and retry.` }, 409);
    if (!forceReset && current) {
      const changed = parsed.data.state.blueprints.find((bp) => current.state.blueprints.some((old) =>
        old.ChecklistCode === bp.ChecklistCode && old.SiteId === bp.SiteId && old.frequencyCode !== bp.frequencyCode));
      if (changed) return reply(request, { error: `Blueprint ${changed.ChecklistCode} has a locked frequency. Create a new blueprint instead.` }, 400);
    }
    const merged = forceReset || !current ? parsed.data.state : mergeNewerWorkRequests(current.state, parsed.data.state);
    const next = { revision: (current?.revision ?? 0) + 1, state: reconcileAssurance(recordBlueprintRevisions(current?.state, merged, request.headers.get("X-CAFM-Person")?.trim() || "Web Portal")) };
    database.sites[site] = next;
    if (storage.kind === "supabase") {
      const newVersion = randomUUID();
      const result = await supabaseRequest(storage, version ? `?id=eq.default&version=eq.${version}` : "", {
        method: version ? "PATCH" : "POST",
        body: JSON.stringify({ ...(version ? {} : { id: "default" }), payload: database, version: newVersion, updated_at: new Date().toISOString() }),
      });
      if (!Array.isArray(result) || result.length !== 1) return reply(request, { error: "State changed during save; reload and resolve the conflict." }, 409);
    } else {
      temporary = path.join(storage.directory, `cafm-db-${randomUUID()}.tmp`);
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(database), "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      await replaceDatabase(temporary, storage.filename);
      temporary = undefined;
      if (storage.kind === "temporary") globalThis.__CAFM_CLOUD_STATE__ = database;
    }
    const response = reply(request, next);
    response.headers.set("X-CAFM-Storage", storage.kind);
    return response;
  } catch (error) {
    console.error("Could not persist CAFM state", error);
    return reply(request, { error: persistenceError(error) }, 500);
  } finally {
    if (temporary) await unlink(temporary).catch((error) => console.error("Could not remove temporary state file", error));
    if (lock && lockFile) {
      try {
        await lock.close();
        await unlink(lockFile);
      } catch (error) {
        console.error("Could not release CAFM state write lock", error);
      }
    }
  }
}
