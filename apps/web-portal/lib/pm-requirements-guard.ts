import type { UserAccessProfile, UserRole } from "@cafm/shared-schema";

export const PMS_REQUIREMENT_EDITOR_ROLES: readonly string[] = [
  "SuperAdmin", "SiteAdministrator", "PM_Planner", "TeamLeader", "QA_Inspector",
  "ESA_TO", "ESA_TM", "ESA_CCM", "ESA_LJM", "TRADE_TM", "TRADE_CM",
];
const CRAFT_ROLES: readonly string[] = ["Craftsperson", "MobileTechnician", "StandardEmployee"];

interface SiteRoleLike { SiteId?: string; PersonName?: string; RoleCode?: string }

// Both the person's site-level profile and the active RBAC role must pass; craftspeople/technicians are always blocked.
export function canUpdatePmsRequirementsFromWr(
  profile: UserAccessProfile | undefined,
  siteRoleAssignments: readonly SiteRoleLike[],
  currentRole: UserRole | string,
  activePerson: string,
  siteId: string,
): boolean {
  if (CRAFT_ROLES.includes(currentRole)) return false;
  const heldRoles = siteRoleAssignments
    .filter((item) => item.SiteId === siteId && item.PersonName === activePerson && item.RoleCode)
    .map((item) => item.RoleCode as string);
  const supervisoryRoleHeld = heldRoles.some((role) => PMS_REQUIREMENT_EDITOR_ROLES.includes(role));
  if (profile) {
    if (profile.primaryRole === "Craftperson" && !profile.isSuperAdmin && !profile.isSiteAdmin && !profile.isTeamLeader && !profile.isQAInspector && !supervisoryRoleHeld) return false;
    const supervisoryProfile = profile.isSuperAdmin || profile.isSiteAdmin || profile.isTeamLeader || profile.isQAInspector || profile.primaryRole === "TechnicalOfficer" || supervisoryRoleHeld;
    if (!supervisoryProfile) return false;
  }
  return PMS_REQUIREMENT_EDITOR_ROLES.includes(currentRole) || supervisoryRoleHeld;
}
