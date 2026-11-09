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

export const UserAccessProfileSchema = z.object({
  id: z.string().min(1),
  siteId: SiteIdSchema,
  personName: z.string().min(1),
  fullName: z.string().min(1),
  email: z.string().email().optional(),
  linkedCraftpersonId: z.string().min(1).optional(),
  primaryRole: z.enum(["Craftperson", "TeamLeader", "QAInspector", "TechnicalOfficer", "SiteAdministrator"]),
  isTeamLeader: z.boolean(),
  isCraftperson: z.boolean(),
  isQAInspector: z.boolean(),
  isSiteAdmin: z.boolean(),
  vpaTrades: z.array(ClassicalTradeSchema),
  vpaBuildingIds: z.array(z.string().min(1)),
  permissions: UserGranularPermissionsSchema,
});
export type UserAccessProfile = z.infer<typeof UserAccessProfileSchema>;
