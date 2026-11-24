import type { BaseWorkRequest, Building, CraftpersonAbsence, CraftpersonShift, Equipment, Floor, LocationFreeze, MissionEvent, PM_ChecklistStandard, PM_Schedule, QAInspectorAssignment, QAAuditReport, Room, ShiftType, SiteId, SiteRoleAssignment, UserAccess, UserAccessProfile, RoleDefinition } from "@cafm/shared-schema";
import type { AuditCampaign, AuditFinding, AuditInspection, AuditSettings, AuditTemplate, AuditImport } from "./audit-assurance-types";
import type { AuditAssurance } from "./equipment-inspection";
import type { SuppressedPmOccurrence, BlueprintAuditEntry, SiteStakeholderTeam, SiteCoordinationRequirement, PmCoordinationRecord, SiteSlaConfig, CifmPerson, ChangeLogEntry, ChangeLogSettings, SplatShowcase } from "@cafm/shared-schema";

type AssignmentRole = "ESA_TM" | "ESA_CCM" | "TRADE_TM" | "TRADE_CM" | "ESA_TO" | "ESA_LJM" | "ESA_DO" | "ESA_IM";
export interface TradeRoleMapping {
  SiteId: SiteId;
  Trade: string;
  assignments: Partial<Record<AssignmentRole, string>>;
}
export interface SiteRoleMapping {
  SiteId: SiteId;
  assignments: Partial<Record<AssignmentRole, string>>;
}
export interface ExtractedDesk {
  id: string;
  SiteId: SiteId;
  bl_id: string;
  LevelName: string;
  RoomCode: string;
  centerX: number;
  centerY: number;
  widthM?: number | null;
  heightM?: number | null;
  name?: string | null;
  deskType: string;
  isPermanent: boolean;
}
export interface BimElementLink {
  equipmentCode: string;
  buildingId: string;
  updatedAt: string;
  updatedBy: string;
}
export interface LocationRenameLogEntry {
  id: string;
  at: string;
  actor: string;
  siteId: string;
  kind: "building" | "floor" | "room";
  from: string;
  to: string;
  impact: { label: string; count: number }[];
}
export interface DemoData {
  pmModelVersion?: 60;
  pmMigrationNotes?: string[];
  pmsOrderHighWatermark?: number;
  blueprintHighWatermark?: number;
  blueprintAuditLog?: BlueprintAuditEntry[];
  sites: SiteId[];
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  desks: ExtractedDesk[];
  equipment: Equipment[];
  blueprints: PM_ChecklistStandard[];
  schedules: PM_Schedule[];
  suppressedPmOccurrences?: SuppressedPmOccurrence[];
  workRequests: BaseWorkRequest[];
  deletedWorkRequests?: BaseWorkRequest[];
  users: UserAccess[];
  userAccessProfiles: UserAccessProfile[];
  roleDefinitions: RoleDefinition[];
  craftspeople: { id: string; Name: string; LastName: string; username?: string; Trade: string; HourlyRate: number; ShiftHours: number; SiteId: SiteId; SkillLevel: number; shiftStart?: string; shiftEnd?: string; baseShiftType?: ShiftType; shiftOverrides?: Record<string, CraftpersonShift>; secondaryTradeIds?: string[]; Activity?: NonNullable<BaseWorkRequest["Activity"]> }[];
  craftpersonAbsences: CraftpersonAbsence[];
  locationFreezes: LocationFreeze[];
  missionEvents?: MissionEvent[];
  stakeholderTeams?: SiteStakeholderTeam[];
  coordinationRequirements?: SiteCoordinationRequirement[];
  pmCoordination?: PmCoordinationRecord[];
  ljStageMatrix?: Record<string, "act" | "notify" | "none" | "P" | "O">;
  featurePermissionOverrides?: Record<string, boolean>;
  featureMatrixVersion?: number;
  siteSlaConfig?: SiteSlaConfig;
  cifmPeople?: CifmPerson[];
  onboardingRequests?: import("@cafm/shared-schema").OnboardingRequest[];
  fjNotifications?: { id: string; wrId: string; recipient: string; createdAt: string; kind: "FJ_DISSATISFACTION"; message: string; read?: boolean }[];
  /** V59 (Section 109): optional audit trail of applied location renames, oldest-first, capped at 100 entries. */
  locationRenameLog?: LocationRenameLogEntry[];
  /** V62 (Section 112): dedicated change log, newest-first, capped at CHANGE_LOG_CAP entries (record table public.change_log). */
  changeLog?: ChangeLogEntry[];
  /** V62 (Section 112): per-site SuperAdmin-editable list of which change types are logged (blob kind). */
  changeLogSettings?: ChangeLogSettings;
  /** V68 (Section 118): embedded Gaussian-splat showcase / capture library (blob kind). */
  splatShowcases?: SplatShowcase[];
  tradeRoleMappings: TradeRoleMapping[];
  siteRoleMappings: SiteRoleMapping[];
  siteRoleAssignments: SiteRoleAssignment[];
  qaInspectorAssignments?: QAInspectorAssignment[];
  qaFailureReasons?: string[];
  qaAuditReports?: QAAuditReport[];
  auditCampaigns?: AuditCampaign[];
  auditFindings?: AuditFinding[];
  auditInspections?: AuditInspection[];
  auditSettings?: AuditSettings;
  auditTemplates?: AuditTemplate[];
  auditImports?: AuditImport[];
  auditAssurance?: AuditAssurance;
  /** BIM linkage keyed by `${buildingId}:${ifcGlobalId}` — manual EQ ID assignments made in the 3D viewer. */
  bimElementLinks?: Record<string, BimElementLink>;
  mobileMutationIds: string[];
}
