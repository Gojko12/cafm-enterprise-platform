import { UserRole } from "@cafm/shared-schema";
import type { UserRole as Role } from "@cafm/shared-schema";
import { roleHasPermission } from "./rbac-matrix";

type RecordLike = Record<string, unknown>;
export interface GovernanceRegistry {
  users?: unknown[];
  userAccessProfiles?: unknown[];
  roleDefinitions?: unknown[];
  siteRoleAssignments?: unknown[];
  featurePermissionOverrides?: Record<string, boolean>;
}
export interface GovernanceActor {
  id: string;
  name: string;
  roles: Role[];
  isAdmin: boolean;
}
const record = (value: unknown): RecordLike =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const same = (left: unknown, right: unknown) => text(left).toLowerCase() === text(right).toLowerCase() && !!text(left);
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function resolveGovernanceActor(state: GovernanceRegistry, site: string, actorId: string, trade?: string): GovernanceActor | null {
  if (!actorId.trim()) return null;
  const users = (state.users ?? []).map(record);
  const user = users.find((item) => same(item.UserId, actorId) || same(item.DisplayName, actorId));
  const profiles = (state.userAccessProfiles ?? []).map(record).filter((item) => item.siteId === site);
  const keys = (item: RecordLike) => [item.id, item.personName, item.fullName, item.username, item.linkedCraftpersonId];
  const direct = profiles.filter((item) => keys(item).some((value) => same(value, actorId)));
  const matches = direct.length ? direct : profiles.filter((item) => keys(item).some((value) => same(value, user?.DisplayName)));
  if (matches.length > 1) return null;
  const profile = matches[0];
  if (!profile && !user) return null;
  const name = text(profile?.personName) || text(user?.DisplayName);
  const roles = new Set<Role>();
  const add = (value: unknown) => { const parsed = UserRole.safeParse(value); if (parsed.success) roles.add(parsed.data); };
  const workflowRoles = ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_CCM", "ESA_DO", "ESA_IM", "TRADE_CM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"];
  if (user && list(user.AssignedSiteIds).includes(site) && (trade === undefined || !workflowRoles.includes(text(user.SystemRole)))) add(user.SystemRole);
  if (profile) {
    const assigned = list(profile.assignedRoleIds);
    for (const definition of (state.roleDefinitions ?? []).map(record)) {
      if (!assigned.includes(definition.id)) continue;
      const base = text(definition.baseRoleType);
      if (base === "SiteAdministrator" && !list(profile.managedSiteIds).includes(site)) continue;
      add(base === "QAInspector" ? "QA_Inspector" :
        base === "Craftperson" ? "MobileTechnician" : base === "Helpdesk" ? "HELPDESK" : base === "HRAdmin" ? "HR_ADMIN" : base);
    }
    if (profile.isSuperAdmin === true || profile.primaryRole === "SuperAdmin") add("SuperAdmin");
    if ((profile.isSiteAdmin === true || profile.primaryRole === "SiteAdministrator") && list(profile.managedSiteIds).includes(site)) add("SiteAdministrator");
    if (profile.isTeamLeader === true || profile.primaryRole === "TeamLeader") add("TeamLeader");
  }
  for (const assignment of (state.siteRoleAssignments ?? []).map(record)) {
    if (assignment.SiteId === site && same(assignment.PersonName, name) && (trade === undefined || assignment.Trade === "All" || assignment.Trade === trade) &&
      (assignment.AssignmentLevel === "Main" || assignment.AssignmentLevel === "Deputy")) add(assignment.RoleCode);
  }
  const result = [...roles];
  return { id: text(user?.UserId) || text(profile?.username) || text(profile?.id) || actorId, name, roles: result,
    isAdmin: result.includes("SuperAdmin") || result.includes("SiteAdministrator") };
}

export function actorCanPmAction(actor: GovernanceActor | null, permission: "pmWorkRequests.complete" | "pmWorkRequests.cancel", overrides?: Record<string, boolean>): boolean {
  return !!actor && actor.roles.some((role) =>
    (role === "SuperAdmin" || role === "SiteAdministrator" || role === "TeamLeader") &&
    roleHasPermission(role, permission, overrides));
}
