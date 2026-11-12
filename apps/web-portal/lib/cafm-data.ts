import type { BaseWorkRequest, Building, CraftpersonAbsence, CraftpersonShift, Equipment, Floor, LocationFreeze, PM_ChecklistStandard, PM_Schedule, QAInspectorAssignment, QAAuditReport, Room, ShiftType, SiteId, SiteRoleAssignment, UserAccess, UserAccessProfile, RoleDefinition } from "@cafm/shared-schema";
import type { AuditCampaign, AuditFinding, AuditInspection, AuditSettings, AuditTemplate, AuditImport } from "./audit-assurance-types";
import type { AuditAssurance } from "./equipment-inspection";
import type { SuppressedPmOccurrence, BlueprintAuditEntry, SiteStakeholderTeam, SiteCoordinationRequirement, PmCoordinationRecord, SiteSlaConfig, CifmPerson } from "@cafm/shared-schema";

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
  stakeholderTeams?: SiteStakeholderTeam[];
  coordinationRequirements?: SiteCoordinationRequirement[];
  pmCoordination?: PmCoordinationRecord[];
  ljStageMatrix?: Record<string, "act" | "notify" | "none" | "P" | "O">;
  featurePermissionOverrides?: Record<string, boolean>;
  siteSlaConfig?: SiteSlaConfig;
  cifmPeople?: CifmPerson[];
  onboardingRequests?: import("@cafm/shared-schema").OnboardingRequest[];
  fjNotifications?: { id: string; wrId: string; recipient: string; createdAt: string; kind: "FJ_DISSATISFACTION"; message: string; read?: boolean }[];
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
