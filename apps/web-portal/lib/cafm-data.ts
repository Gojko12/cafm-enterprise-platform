import type { BaseWorkRequest, Building, CraftpersonAbsence, CraftpersonShift, Equipment, Floor, LocationFreeze, PM_ChecklistStandard, PM_Schedule, QAInspectorAssignment, Room, ShiftType, SiteId, SiteRoleAssignment, UserAccess, UserAccessProfile, RoleDefinition } from "@cafm/shared-schema";

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
export interface DemoData {
  sites: SiteId[];
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  desks: ExtractedDesk[];
  equipment: Equipment[];
  blueprints: PM_ChecklistStandard[];
  schedules: PM_Schedule[];
  workRequests: BaseWorkRequest[];
  deletedWorkRequests?: BaseWorkRequest[];
  users: UserAccess[];
  userAccessProfiles: UserAccessProfile[];
  roleDefinitions: RoleDefinition[];
  craftspeople: { id: string; Name: string; LastName: string; username?: string; Trade: string; HourlyRate: number; ShiftHours: number; SiteId: SiteId; SkillLevel: number; shiftStart?: string; shiftEnd?: string; baseShiftType?: ShiftType; shiftOverrides?: Record<string, CraftpersonShift>; secondaryTradeIds?: string[]; Activity?: NonNullable<BaseWorkRequest["Activity"]> }[];
  craftpersonAbsences: CraftpersonAbsence[];
  locationFreezes: LocationFreeze[];
  tradeRoleMappings: TradeRoleMapping[];
  siteRoleMappings: SiteRoleMapping[];
  siteRoleAssignments: SiteRoleAssignment[];
  qaInspectorAssignments?: QAInspectorAssignment[];
  qaFailureReasons?: string[];
  mobileMutationIds: string[];
}
