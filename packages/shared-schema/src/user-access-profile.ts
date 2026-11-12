import { z } from "zod";
import { ClassicalTradeSchema } from "./equipment.js";
import { SiteIdSchema } from "./locations.js";

export const UserGranularPermissionsSchema = z.object({
  canGeneratePM_WR: z.boolean(),
  canOpenFollowUpFJ: z.boolean(),
  canCreateFJ: z.boolean(),
  canCreateLJ: z.boolean(),
  canClaimUnassignedWR: z.boolean(),
  canCompleteWR78: z.boolean(),
  canCloseWR100: z.boolean(),
  canDefineChecklistPM: z.boolean(),
  canDefineChecklistFJ: z.boolean(),
  canDefineChecklistLJ: z.boolean(),
  canDefinePMSchedule: z.boolean(),
  canAssignPMPToEQ: z.boolean(),
  canManageEquipment: z.boolean(),
  auditTrades: z.array(ClassicalTradeSchema),
  auditWRTypes: z.array(z.enum(["PM", "FJ"])),
  canAuditChooseWRs: z.boolean(),
  canAuditDoInspection: z.boolean(),
  canAuditReopenWR: z.boolean(),
  canManageFailureReasons: z.boolean(),
  canScheduleCraftperson: z.boolean(),
  canOverwriteLaborTime: z.boolean(),
  canManageShiftsAndLeaves: z.boolean(),
  canManageLocationFreezes: z.boolean(),
});
export type UserGranularPermissions = z.infer<typeof UserGranularPermissionsSchema>;

export const RoleDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  description: z.string(),
  badgeColor: z.enum(["amber", "purple", "blue", "emerald", "cyan", "slate", "rose"]),
  baseRoleType: z.enum(["SuperAdmin", "SiteAdministrator", "TeamLeader", "QAInspector", "TechnicalOfficer", "Craftperson", "Helpdesk"]),
  parentRoleId: z.string().min(1).optional(),
  isCustomVariant: z.boolean().optional(),
  permissions: UserGranularPermissionsSchema,
});
export type RoleDefinition = z.infer<typeof RoleDefinitionSchema>;

export const UserAccessProfileSchema = z.object({
  id: z.string().min(1),
  siteId: SiteIdSchema,
  personName: z.string().min(1),
  fullName: z.string().min(1),
  email: z.string().email().optional(),
  username: z.string().min(1).optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
  siteAccess: z.array(SiteIdSchema).optional(),
  isHelpdesk: z.boolean().optional(),
  linkedCraftpersonId: z.string().min(1).optional(),
  primaryRole: z.enum(["Craftperson", "TeamLeader", "QAInspector", "TechnicalOfficer", "SiteAdministrator", "SuperAdmin", "Helpdesk"]),
  isSuperAdmin: z.boolean().optional(),
  managedSiteIds: z.array(SiteIdSchema).optional(),
  siteAdminGovernance: z.object({
    canManageUsersAndVPA: z.boolean(),
    canManageRoleAssignments: z.boolean(),
    canManageAuditQuotas: z.boolean(),
    canManageFreezesAndShifts: z.boolean(),
    canResetOrExportSiteData: z.boolean(),
  }).optional(),
  isTeamLeader: z.boolean(),
  isCraftperson: z.boolean(),
  isQAInspector: z.boolean(),
  isSiteAdmin: z.boolean(),
  vpaTrades: z.array(ClassicalTradeSchema),
  vpaBuildingIds: z.array(z.string().min(1)),
  assignedRoleIds: z.array(z.string().min(1)).optional(),
  permissions: UserGranularPermissionsSchema,
});
export type UserAccessProfile = z.infer<typeof UserAccessProfileSchema>;
