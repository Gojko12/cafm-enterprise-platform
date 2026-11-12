import { CLASSICAL_TRADES, PLATFORM_SITE_IDS, normalizeSiteId } from "@cafm/shared-schema";
import { PEOPLE_DIRECTORY } from "./people-directory";
import type { UserAccessProfile, UserGranularPermissions, SiteId, RoleDefinition } from "@cafm/shared-schema";

export type AccessPreset = "Craftperson" | "TeamLeader" | "QAInspector" | "PMEngineer" | "FullAdmin" | "Helpdesk" | "HRAdmin";
export const ALL_SITES: SiteId[] = [...PLATFORM_SITE_IDS];
export const DEFAULT_SITE_ADMIN_GOVERNANCE = {
  canManageUsersAndVPA: true, canManageRoleAssignments: true, canManageAuditQuotas: true,
  canManageFreezesAndShifts: true, canResetOrExportSiteData: true,
};
export function permissionsForPreset(preset: AccessPreset): UserGranularPermissions {
  const craft = preset === "Craftperson" || preset === "TeamLeader" || preset === "FullAdmin";
  const manager = preset === "TeamLeader" || preset === "FullAdmin";
  const engineer = manager || preset === "PMEngineer";
  const inspector = preset === "FullAdmin" || preset === "QAInspector";
  const helpdesk = preset === "Helpdesk";
  return {
    canGeneratePM_WR: engineer, canOpenFollowUpFJ: craft || inspector || helpdesk, canCreateFJ: craft || helpdesk, canCreateLJ: manager,
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
  const roles: RoleDefinition[] = [
    { id: "super-admin", name: "Super Admin", description: "Global governance.", badgeColor: "amber", baseRoleType: "SuperAdmin", permissions: permissionsForPreset("FullAdmin") },
    { id: "site-admin", name: "Site Administrator", description: "Site administration.", badgeColor: "purple", baseRoleType: "SiteAdministrator", permissions: permissionsForPreset("FullAdmin") },
    { id: "team-leader", name: "Team Leader", description: "Supervision and dispatch.", badgeColor: "blue", baseRoleType: "TeamLeader", permissions: permissionsForPreset("TeamLeader") },
    { id: "qa-inspector", name: "QA Inspector", description: "Technical inspection.", badgeColor: "emerald", baseRoleType: "QAInspector", permissions: permissionsForPreset("QAInspector") },
    { id: "pm-engineer", name: "PM & Asset Engineer", description: "Preventive maintenance engineering.", badgeColor: "cyan", baseRoleType: "TechnicalOfficer", permissions: permissionsForPreset("PMEngineer") },
    { id: "senior-craft", name: "Senior Craftperson", description: "Experienced field execution.", badgeColor: "rose", baseRoleType: "Craftperson", permissions: permissionsForPreset("Craftperson") },
    { id: "craftperson", name: "Craftperson", description: "Field execution.", badgeColor: "slate", baseRoleType: "Craftperson", permissions: permissionsForPreset("Craftperson") },
    { id: "helpdesk", name: "Helpdesk", description: "Opens Fast Jobs on behalf of requestors; read-only elsewhere.", badgeColor: "cyan", baseRoleType: "Helpdesk", permissions: permissionsForPreset("Helpdesk") },
    { id: "hr-admin", name: "HR Administrator", description: "Onboards and maintains Non-FM employees, rooms and departments.", badgeColor: "rose", baseRoleType: "HRAdmin", permissions: permissionsForPreset("HRAdmin") },
  ];
  return roles.map(normalizeChecklistRole);
}
const permissionFlags: Array<Exclude<keyof UserGranularPermissions, "auditTrades" | "auditWRTypes">> = [
  "canGeneratePM_WR", "canOpenFollowUpFJ", "canCreateFJ", "canCreateLJ", "canClaimUnassignedWR", "canCompleteWR78", "canCloseWR100",
  "canDefineChecklistPM", "canDefineChecklistFJ", "canDefineChecklistLJ", "canDefinePMSchedule", "canAssignPMPToEQ", "canManageEquipment",
  "canAuditChooseWRs", "canAuditDoInspection", "canAuditReopenWR", "canManageFailureReasons", "canScheduleCraftperson",
  "canOverwriteLaborTime", "canManageShiftsAndLeaves", "canManageLocationFreezes",
];
export const checklistDefinitionFlags = ["canDefineChecklistPM", "canDefineChecklistFJ", "canDefineChecklistLJ"] as const;
export const auditPermissionFlags = ["canAuditChooseWRs", "canAuditDoInspection", "canAuditReopenWR", "canManageFailureReasons"] as const;
export function canRoleInspect(role: RoleDefinition): boolean {
  return role.baseRoleType === "QAInspector" || role.baseRoleType === "SuperAdmin";
}
export function canRoleDefineChecklists(role: RoleDefinition): boolean {
  return ["TeamLeader", "TechnicalOfficer", "SiteAdministrator", "SuperAdmin"].includes(role.baseRoleType);
}
export function normalizeChecklistRole(role: RoleDefinition): RoleDefinition {
  const permissions = { ...role.permissions };
  if (!canRoleDefineChecklists(role)) {
    permissions.canDefineChecklistPM = false; permissions.canDefineChecklistFJ = false; permissions.canDefineChecklistLJ = false;
  }
  if (!canRoleInspect(role)) {
    permissions.canAuditChooseWRs = false; permissions.canAuditDoInspection = false; permissions.canAuditReopenWR = false;
    permissions.canManageFailureReasons = false; permissions.auditTrades = []; permissions.auditWRTypes = [];
  }
  return { ...role, permissions };
}
export function resolveEffectivePermissions(profile: UserAccessProfile, definitions: RoleDefinition[]): UserGranularPermissions {
  const result = permissionsForPreset("Craftperson");
  for (const key of permissionFlags) result[key] = false;
  result.auditTrades = []; result.auditWRTypes = [];
  const selected = definitions.filter((item) => profile.assignedRoleIds?.includes(item.id));
  const authorizedQA = selected.some(canRoleInspect);
  for (const original of selected) {
    const role = normalizeChecklistRole(original);
    for (const key of permissionFlags) {
      if (!auditPermissionFlags.some((flag) => flag === key) || canRoleInspect(role)) result[key] ||= role.permissions[key];
    }
    if (canRoleInspect(role)) {
      result.auditTrades = [...new Set([...result.auditTrades, ...role.permissions.auditTrades])];
      result.auditWRTypes = [...new Set([...result.auditWRTypes, ...role.permissions.auditWRTypes])];
    }
  }
  if (!authorizedQA) {
    result.canAuditChooseWRs = false; result.canAuditDoInspection = false; result.canAuditReopenWR = false;
    result.canManageFailureReasons = false; result.auditTrades = []; result.auditWRTypes = [];
  }
  return result;
}

export function migrateRoles(profiles: UserAccessProfile[], existing?: RoleDefinition[]) {
  const roles = (existing ?? defaultRoleDefinitions()).map(normalizeChecklistRole);
  if (!roles.some((role) => role.id === "hr-admin")) roles.push(...defaultRoleDefinitions().filter((role) => role.id === "hr-admin"));
  const next = profiles.filter(isPersonProfile).map((original) => {
    const cleanName = (value: string) => value.replace(/\s*\((?:ESTEC|ESRIN) Admin\)$/i, "");
    const profile = { ...original, personName: cleanName(original.personName), fullName: cleanName(original.fullName) };
    if (profile.assignedRoleIds) return { ...profile, isQAInspector: roles.some((role) => profile.assignedRoleIds?.includes(role.id) && role.baseRoleType === "QAInspector"), permissions: resolveEffectivePermissions(profile, roles) };
    const same = roles.find((role) => role.baseRoleType === profile.primaryRole && JSON.stringify(role.permissions) === JSON.stringify(profile.permissions));
    const id = same?.id ?? `legacy-${profile.id}`;
    if (!same) roles.push(normalizeChecklistRole({ id, name: `${profile.fullName} — Existing permissions`, description: "Preserved from the previous access profile.", badgeColor: "slate", baseRoleType: profile.primaryRole, isCustomVariant: true, permissions: profile.permissions }));
    const updated = { ...profile, assignedRoleIds: [id] };
    return { ...updated, isQAInspector: roles.some((role) => updated.assignedRoleIds.includes(role.id) && role.baseRoleType === "QAInspector"), permissions: resolveEffectivePermissions(updated, roles) };
  });
  return { roles, profiles: next };
}
export function assignRoles(profile: UserAccessProfile, ids: string[], roles: RoleDefinition[]): UserAccessProfile {
  const selected = roles.filter((role) => ids.includes(role.id));
  const priority: RoleDefinition["baseRoleType"][] = ["SuperAdmin", "SiteAdministrator", "TeamLeader", "QAInspector", "TechnicalOfficer", "Helpdesk", "HRAdmin", "Craftperson"];
  const primaryRole = priority.find((role) => selected.some((item) => item.baseRoleType === role)) ?? "Craftperson";
  const updated: UserAccessProfile = { ...profile, assignedRoleIds: ids, primaryRole,
    isSuperAdmin: primaryRole === "SuperAdmin", isSiteAdmin: primaryRole === "SuperAdmin" || primaryRole === "SiteAdministrator",
    isTeamLeader: selected.some((item) => item.baseRoleType === "TeamLeader"),
    isQAInspector: selected.some((item) => item.baseRoleType === "QAInspector"),
    isCraftperson: selected.some((item) => item.baseRoleType === "Craftperson"),
    isHelpdesk: selected.some((item) => item.baseRoleType === "Helpdesk"),
    isHrAdmin: selected.some((item) => item.baseRoleType === "HRAdmin"),
    managedSiteIds: primaryRole === "SuperAdmin" ? [...ALL_SITES] : primaryRole === "SiteAdministrator" ? [profile.siteId] : [],
    siteAdminGovernance: primaryRole === "SiteAdministrator" ? profile.siteAdminGovernance ?? { ...DEFAULT_SITE_ADMIN_GOVERNANCE } : undefined,
  };
  return { ...updated, permissions: resolveEffectivePermissions(updated, roles) };
}

export function directoryProfile(entry: (typeof PEOPLE_DIRECTORY)[number], siteId: SiteId): UserAccessProfile {
  const siteAdmin = entry.siteAdminOf.includes(siteId);
  const superAdmin = !!entry.superAdmin;
  const helpdesk = entry.preset === "Helpdesk";
  const hrAdmin = entry.preset === "HRAdmin";
  const preset: AccessPreset = superAdmin || siteAdmin ? "FullAdmin" : entry.preset;
  return { id: `${siteId}-profile-${entry.personName}`, siteId, personName: entry.personName, fullName: entry.fullName,
    username: entry.username, email: entry.email, phone: entry.phone, department: entry.department, siteAccess: [...entry.sites],
    primaryRole: superAdmin ? "SuperAdmin" : siteAdmin ? "SiteAdministrator" : helpdesk ? "Helpdesk" : hrAdmin ? "HRAdmin" : preset === "QAInspector" ? "QAInspector" : preset === "TeamLeader" ? "TeamLeader" : "TechnicalOfficer",
    isSuperAdmin: superAdmin, managedSiteIds: superAdmin ? [...ALL_SITES] : siteAdmin ? [siteId] : [],
    ...(siteAdmin ? { siteAdminGovernance: { ...DEFAULT_SITE_ADMIN_GOVERNANCE } } : {}),
    isHelpdesk: helpdesk, isHrAdmin: hrAdmin, isTeamLeader: preset === "TeamLeader" || preset === "FullAdmin", isCraftperson: false,
    isQAInspector: preset === "QAInspector", isSiteAdmin: preset === "FullAdmin",
    vpaTrades: [...CLASSICAL_TRADES], vpaBuildingIds: [], permissions: permissionsForPreset(preset) };
}
function withRoleIds(item: UserAccessProfile): UserAccessProfile {
  const assigned = { ...item, assignedRoleIds: [item.isSuperAdmin ? "super-admin" : item.isSiteAdmin ? "site-admin" : item.isHelpdesk ? "helpdesk" : item.isHrAdmin ? "hr-admin" : item.isTeamLeader ? "team-leader" : item.isQAInspector ? "qa-inspector" : "craftperson"] };
  return { ...assigned, permissions: resolveEffectivePermissions(assigned, defaultRoleDefinitions()) };
}
export function ensureDirectoryProfiles(profiles: UserAccessProfile[], sites: SiteId[]): UserAccessProfile[] {
  const result = [...profiles];
  for (const entry of PEOPLE_DIRECTORY) {
    for (const siteId of sites) {
      if (!entry.sites.includes(siteId)) continue;
      const index = result.findIndex((item) => item.siteId === siteId && (item.personName === entry.personName || item.fullName === entry.fullName));
      const fresh = directoryProfile(entry, siteId);
      if (index < 0) { result.push(withRoleIds(fresh)); continue; }
      const existing = result[index];
      result[index] = { ...existing, fullName: existing.linkedCraftpersonId ? existing.fullName : entry.fullName, username: existing.username ?? entry.username, email: existing.email ?? entry.email,
        phone: existing.phone ?? entry.phone, department: existing.department ?? entry.department, siteAccess: existing.siteAccess ?? [...entry.sites],
        ...(existing.primaryRole === "Craftperson" && !existing.linkedCraftpersonId ? withRoleIds(fresh) : {}) };
    }
  }
  return result;
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
    const siteKey = normalizeSiteId(siteId) ?? siteId;
    const profiles: UserAccessProfile[] = PEOPLE_DIRECTORY.filter((entry) => entry.sites.includes(siteKey)).map((entry) => directoryProfile(entry, siteId));
    return [...profiles, ...craftProfiles].map(withRoleIds);
  });
}
