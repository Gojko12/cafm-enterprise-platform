import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { UserAccessProfile, UserGranularPermissions, SiteId, RoleDefinition } from "@cafm/shared-schema";

export type AccessPreset = "Craftperson" | "TeamLeader" | "QAInspector" | "PMEngineer" | "FullAdmin";
export const ALL_SITES: SiteId[] = ["SITE-01", "SITE-02", "SITE-03"];
export const DEFAULT_SITE_ADMIN_GOVERNANCE = {
  canManageUsersAndVPA: true, canManageRoleAssignments: true, canManageAuditQuotas: true,
  canManageFreezesAndShifts: true, canResetOrExportSiteData: true,
};
export function permissionsForPreset(preset: AccessPreset): UserGranularPermissions {
  const craft = preset === "Craftperson" || preset === "TeamLeader" || preset === "FullAdmin";
  const manager = preset === "TeamLeader" || preset === "FullAdmin";
  const engineer = manager || preset === "PMEngineer";
  const inspector = manager || preset === "QAInspector";
  return {
    canGeneratePM_WR: engineer, canOpenFollowUpFJ: craft || inspector, canCreateFJ: craft, canCreateLJ: manager,
    canClaimUnassignedWR: craft, canCompleteWR78: craft, canCloseWR100: manager,
    canDefineChecklistPM: engineer, canDefineChecklistFJ: engineer, canDefineChecklistLJ: engineer,
    canDefinePMSchedule: engineer, canAssignPMPToEQ: engineer, canManageEquipment: manager,
    auditTrades: inspector ? [...CLASSICAL_TRADES] : [], auditWRTypes: inspector ? ["PM", "FJ"] : [],
    canAuditChooseWRs: inspector, canAuditDoInspection: inspector, canAuditReopenWR: inspector,
    canManageFailureReasons: inspector, canScheduleCraftperson: manager, canOverwriteLaborTime: manager,
    canManageShiftsAndLeaves: manager, canManageLocationFreezes: manager,
  };
}
const placeholder = /^(?:(?:esa )?(?:trade manager|cost centre manager|long job manager|technical officer)|trade contract manager|(?:cifm )?inventory admin|draftsman|teamleader|siteadmin)(?:\s*\(site-\d+\))?$/i;
export const isPersonProfile = (profile: UserAccessProfile) => !placeholder.test(profile.personName.trim()) && !placeholder.test(profile.fullName.trim());

export function defaultRoleDefinitions(): RoleDefinition[] {
  return [
    { id: "super-admin", name: "Super Admin", description: "Global governance.", badgeColor: "amber", baseRoleType: "SuperAdmin", permissions: permissionsForPreset("FullAdmin") },
    { id: "site-admin", name: "Site Administrator", description: "Site administration.", badgeColor: "purple", baseRoleType: "SiteAdministrator", permissions: permissionsForPreset("FullAdmin") },
    { id: "team-leader", name: "Team Leader", description: "Supervision and dispatch.", badgeColor: "blue", baseRoleType: "TeamLeader", permissions: permissionsForPreset("TeamLeader") },
    { id: "qa-inspector", name: "QA Inspector", description: "Technical inspection.", badgeColor: "emerald", baseRoleType: "QAInspector", permissions: permissionsForPreset("QAInspector") },
    { id: "pm-engineer", name: "PM & Asset Engineer", description: "Preventive maintenance engineering.", badgeColor: "cyan", baseRoleType: "TechnicalOfficer", permissions: permissionsForPreset("PMEngineer") },
    { id: "senior-craft", name: "Senior Craftperson", description: "Field work and task planning.", badgeColor: "rose", baseRoleType: "Craftperson", permissions: { ...permissionsForPreset("Craftperson"), canDefineChecklistFJ: true, canDefineChecklistLJ: true } },
    { id: "craftperson", name: "Craftperson", description: "Field execution.", badgeColor: "slate", baseRoleType: "Craftperson", permissions: permissionsForPreset("Craftperson") },
  ];
}
const permissionFlags: Array<Exclude<keyof UserGranularPermissions, "auditTrades" | "auditWRTypes">> = [
  "canGeneratePM_WR", "canOpenFollowUpFJ", "canCreateFJ", "canCreateLJ", "canClaimUnassignedWR", "canCompleteWR78", "canCloseWR100",
  "canDefineChecklistPM", "canDefineChecklistFJ", "canDefineChecklistLJ", "canDefinePMSchedule", "canAssignPMPToEQ", "canManageEquipment",
  "canAuditChooseWRs", "canAuditDoInspection", "canAuditReopenWR", "canManageFailureReasons", "canScheduleCraftperson",
  "canOverwriteLaborTime", "canManageShiftsAndLeaves", "canManageLocationFreezes",
];
export function resolveEffectivePermissions(profile: UserAccessProfile, definitions: RoleDefinition[]): UserGranularPermissions {
  const result = permissionsForPreset("Craftperson");
  for (const key of permissionFlags) result[key] = false;
  result.auditTrades = []; result.auditWRTypes = [];
  for (const role of definitions.filter((item) => profile.assignedRoleIds?.includes(item.id))) {
    for (const key of permissionFlags) result[key] ||= role.permissions[key];
    result.auditTrades = [...new Set([...result.auditTrades, ...role.permissions.auditTrades])];
    result.auditWRTypes = [...new Set([...result.auditWRTypes, ...role.permissions.auditWRTypes])];
  }
  return result;
}

export function migrateRoles(profiles: UserAccessProfile[], existing?: RoleDefinition[]) {
  const roles = existing ? [...existing] : defaultRoleDefinitions();
  const next = profiles.filter(isPersonProfile).map((original) => {
    const cleanName = (value: string) => value.replace(/\s*\((?:ESTEC|ESRIN) Admin\)$/i, "");
    const profile = { ...original, personName: cleanName(original.personName), fullName: cleanName(original.fullName) };
    if (profile.assignedRoleIds) return { ...profile, permissions: resolveEffectivePermissions(profile, roles) };
    const same = roles.find((role) => role.baseRoleType === profile.primaryRole && JSON.stringify(role.permissions) === JSON.stringify(profile.permissions));
    const id = same?.id ?? `legacy-${profile.id}`;
    if (!same) roles.push({ id, name: `${profile.fullName} — Existing permissions`, description: "Preserved from the previous access profile.", badgeColor: "slate", baseRoleType: profile.primaryRole, isCustomVariant: true, permissions: profile.permissions });
    const updated = { ...profile, assignedRoleIds: [id] };
    return { ...updated, permissions: resolveEffectivePermissions(updated, roles) };
  });
  return { roles, profiles: next };
}
export function assignRoles(profile: UserAccessProfile, ids: string[], roles: RoleDefinition[]): UserAccessProfile {
  const selected = roles.filter((role) => ids.includes(role.id));
  const priority: RoleDefinition["baseRoleType"][] = ["SuperAdmin", "SiteAdministrator", "TeamLeader", "QAInspector", "TechnicalOfficer", "Craftperson"];
  const primaryRole = priority.find((role) => selected.some((item) => item.baseRoleType === role)) ?? "Craftperson";
  const updated: UserAccessProfile = { ...profile, assignedRoleIds: ids, primaryRole,
    isSuperAdmin: primaryRole === "SuperAdmin", isSiteAdmin: primaryRole === "SuperAdmin" || primaryRole === "SiteAdministrator",
    isTeamLeader: selected.some((item) => item.baseRoleType === "TeamLeader"),
    isQAInspector: selected.some((item) => item.baseRoleType === "QAInspector"),
    isCraftperson: selected.some((item) => item.baseRoleType === "Craftperson"),
    managedSiteIds: primaryRole === "SuperAdmin" ? [...ALL_SITES] : primaryRole === "SiteAdministrator" ? [profile.siteId] : [],
    siteAdminGovernance: primaryRole === "SiteAdministrator" ? profile.siteAdminGovernance ?? { ...DEFAULT_SITE_ADMIN_GOVERNANCE } : undefined,
  };
  return { ...updated, permissions: resolveEffectivePermissions(updated, roles) };
}

export function seedAccessProfiles(sites: SiteId[], people: Array<{ id: string; Name: string; LastName: string; Trade: string; SiteId: SiteId }>, users: Array<{ DisplayName: string; AssignedSiteIds: SiteId[] }>): UserAccessProfile[] {
  return sites.flatMap((siteId) => {
    const craftProfiles: UserAccessProfile[] = people.filter((p) => p.SiteId === siteId).map((person) => ({
      id: `${siteId}-profile-${person.id}`, siteId, personName: `${person.Name} ${person.LastName}`,
      fullName: `${person.Name} ${person.LastName}`, linkedCraftpersonId: person.id, primaryRole: person.Name === "Gregor" ? "SuperAdmin" : "Craftperson",
      isSuperAdmin: person.Name === "Gregor", managedSiteIds: person.Name === "Gregor" ? [...ALL_SITES] : [],
      isCraftperson: true, isTeamLeader: person.Name === "Gregor", isQAInspector: person.Name === "Gregor", isSiteAdmin: person.Name === "Gregor",
      vpaTrades: [...CLASSICAL_TRADES], vpaBuildingIds: [], permissions: permissionsForPreset(person.Name === "Gregor" ? "FullAdmin" : "Craftperson"),
    }));
    const names = new Set(["Mark", "Yvonne", "Claudia", "Bastian", "Thomas", "Lidija", "Stefan", ...(siteId === "SITE-02" ? ["Jan de Vries"] : siteId === "SITE-03" ? ["Marco Rossi"] : [])]);
    const profiles: UserAccessProfile[] = [...names].map((name) => {
      const superAdmin = name === "Mark" || name === "Gregor";
      const siteAdmin = (siteId === "SITE-01" && name === "Bastian") || (siteId === "SITE-02" && name === "Jan de Vries") || (siteId === "SITE-03" && name === "Marco Rossi");
      const preset: AccessPreset = superAdmin || siteAdmin ? "FullAdmin" : ["TeamLeader", "Claudia", "Bastian"].includes(name) ? "TeamLeader" : ["Thomas", "Yvonne", "Lidija"].includes(name) ? "QAInspector" : "Craftperson";
      return { id: `${siteId}-profile-${name}`, siteId, personName: name, fullName: name,
        primaryRole: superAdmin ? "SuperAdmin" : siteAdmin ? "SiteAdministrator" : preset === "QAInspector" ? "QAInspector" : preset === "TeamLeader" ? "TeamLeader" : "Craftperson",
        isSuperAdmin: superAdmin, managedSiteIds: superAdmin ? [...ALL_SITES] : siteAdmin ? [siteId] : [],
        ...(siteAdmin ? { siteAdminGovernance: { ...DEFAULT_SITE_ADMIN_GOVERNANCE } } : {}),
        isTeamLeader: preset === "TeamLeader" || preset === "FullAdmin", isCraftperson: preset === "Craftperson",
        isQAInspector: preset === "QAInspector" || preset === "FullAdmin", isSiteAdmin: preset === "FullAdmin",
        vpaTrades: [...CLASSICAL_TRADES], vpaBuildingIds: [], permissions: permissionsForPreset(preset) };
    });
    return [...profiles, ...craftProfiles].map((item) => ({ ...item, assignedRoleIds: [item.isSuperAdmin ? "super-admin" : item.isSiteAdmin ? "site-admin" : item.isTeamLeader ? "team-leader" : item.isQAInspector ? "qa-inspector" : "craftperson"] }));
  });
}
