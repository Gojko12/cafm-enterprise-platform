import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { UserAccessProfile, UserGranularPermissions, SiteId } from "@cafm/shared-schema";

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

export function seedAccessProfiles(sites: SiteId[], people: Array<{ id: string; Name: string; LastName: string; Trade: string; SiteId: SiteId }>, users: Array<{ DisplayName: string; AssignedSiteIds: SiteId[] }>): UserAccessProfile[] {
  return sites.flatMap((siteId) => {
    const craftProfiles: UserAccessProfile[] = people.filter((p) => p.SiteId === siteId).map((person) => ({
      id: `${siteId}-profile-${person.id}`, siteId, personName: `${person.Name} ${person.LastName}`,
      fullName: `${person.Name} ${person.LastName}`, linkedCraftpersonId: person.id, primaryRole: person.Name === "Gregor" ? "SuperAdmin" : "Craftperson",
      isSuperAdmin: person.Name === "Gregor", managedSiteIds: person.Name === "Gregor" ? [...ALL_SITES] : [],
      isCraftperson: true, isTeamLeader: person.Name === "Gregor", isQAInspector: person.Name === "Gregor", isSiteAdmin: person.Name === "Gregor",
      vpaTrades: [...CLASSICAL_TRADES], vpaBuildingIds: [], permissions: permissionsForPreset(person.Name === "Gregor" ? "FullAdmin" : "Craftperson"),
    }));
    const names = new Set(["Mark", "Yvonne", "Claudia", "Bastian", "Thomas", "Lidija", "Stefan", "Gregor", "Draftsman", "Inventory Admin", "TeamLeader", "SiteAdmin", ...(siteId === "SITE-02" ? ["Jan de Vries (ESTEC Admin)"] : siteId === "SITE-03" ? ["Marco Rossi (ESRIN Admin)"] : []), ...users.filter((user) => user.AssignedSiteIds.includes(siteId)).map((user) => user.DisplayName)]);
    const profiles: UserAccessProfile[] = [...names].map((name) => {
      const superAdmin = name === "Mark" || name === "Gregor";
      const siteAdmin = (siteId === "SITE-01" && (name === "Bastian" || name === "SiteAdmin")) || (siteId === "SITE-02" && name === "Jan de Vries (ESTEC Admin)") || (siteId === "SITE-03" && name === "Marco Rossi (ESRIN Admin)");
      const preset: AccessPreset = superAdmin || siteAdmin ? "FullAdmin" : ["TeamLeader", "Claudia", "Bastian"].includes(name) ? "TeamLeader" : ["Thomas", "Yvonne", "Lidija"].includes(name) ? "QAInspector" : "Craftperson";
      return { id: `${siteId}-profile-${name}`, siteId, personName: name, fullName: name,
        primaryRole: superAdmin ? "SuperAdmin" : siteAdmin ? "SiteAdministrator" : preset === "QAInspector" ? "QAInspector" : preset === "TeamLeader" ? "TeamLeader" : "Craftperson",
        isSuperAdmin: superAdmin, managedSiteIds: superAdmin ? [...ALL_SITES] : siteAdmin ? [siteId] : [],
        ...(siteAdmin ? { siteAdminGovernance: { ...DEFAULT_SITE_ADMIN_GOVERNANCE } } : {}),
        isTeamLeader: preset === "TeamLeader" || preset === "FullAdmin", isCraftperson: preset === "Craftperson",
        isQAInspector: preset === "QAInspector" || preset === "FullAdmin", isSiteAdmin: preset === "FullAdmin",
        vpaTrades: [...CLASSICAL_TRADES], vpaBuildingIds: [], permissions: permissionsForPreset(preset) };
    });
    return [...profiles, ...craftProfiles];
  });
}
