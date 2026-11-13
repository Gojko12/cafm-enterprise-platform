import { CLASSICAL_TRADES, EquipmentStatusSchema, LocationFreezeSchema, migrateLegacySiteIds, normalizeEquipmentStatus, normalizeSiteId } from "@cafm/shared-schema";
import type { SiteId, SiteRoleAssignment, SiteRoleAssignmentTrade, LJRole, UserAccess } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { section20Seed } from "./section20-seed";
import { expandSeededWorkRequests } from "./expanded-seed";
import { seedNestedPM } from "./nested-pm-seed";
import { migratePmState } from "./pm-orders";
import { addDays, calendarDate } from "./dispatch";
import { resolveAbsencePerson } from "./absence-identity";
import { DEFAULT_QA_FAILURE_REASONS } from "./qa-settings";
import { seedAccessProfiles, defaultRoleDefinitions, migrateRoles } from "./access-profiles";
import { seedAssurance, seedAuditTemplates } from "./audit-assurance-seed";
import { withSnowdonShowcase } from "./snowdon-seed";
import { ensureAnalyticsHistorySeeded } from "./analytics-history-seed";
import { withCoordinationShowcase } from "./pm-coordination-seed";
import { withPeopleDirectory } from "./people-seed";
import { withCifmDirectory } from "./cifm-people";
import { withOnboardingSeed } from "./onboarding";
import { withEquipmentRegistryMigration } from "./equipment-migration";
import { withManufacturerSeed } from "./manufacturer-seed";
import { withPmChecklistEnrichment } from "./pm-checklist-enrichment";
import { usernameForRole } from "./people-directory";
import { ahuTemplate, calculateEquipmentInspectionSummary, completeEquipmentInspection, defaultKmisConfig, withStandardCheckpointTemplates, type CheckpointResult, type EquipmentInspectionSheet } from "./equipment-inspection";

export const ASSIGNMENT_ROLES = ["ESA_TM", "ESA_CCM", "TRADE_TM", "TRADE_CM", "ESA_TO", "ESA_LJM", "ESA_DO", "ESA_IM"] as const;
export type AssignmentRole = typeof ASSIGNMENT_ROLES[number];
export const TRADE_ASSIGNMENT_ROLES = ["ESA_TM", "ESA_CCM", "TRADE_TM", "TRADE_CM"] as const;
export const SITE_ASSIGNMENT_ROLES = ["ESA_TO", "ESA_LJM", "ESA_DO", "ESA_IM"] as const;
export const ROLE_LABELS: Record<AssignmentRole, string> = {
  ESA_TM: "ESA Trade Manager", ESA_CCM: "ESA Cost Centre Manager", TRADE_TM: "Trade Manager",
  TRADE_CM: "Trade Contract Manager", ESA_TO: "ESA Technical Officer", ESA_LJM: "ESA Long Job Manager",
  ESA_DO: "Draftsman", ESA_IM: "CIFM Inventory Admin",
};
export function scopeData(data: DemoData, requestedSite: SiteId): DemoData {
  const site = normalizeSiteId(requestedSite) ?? requestedSite;
  // The Snowdon Towers showcase + 2026 analytics history migrations are idempotent and
  // run on every scope pass, so existing saved states are enriched without a reset.
  data = withManufacturerSeed(withOnboardingSeed(withCifmDirectory(withPeopleDirectory(withCoordinationShowcase(ensureAnalyticsHistorySeeded(withSnowdonShowcase(withEquipmentRegistryMigration(withPmChecklistEnrichment(migratePmState(migrateLegacySiteIds(data)))))))))));
  return {
    ...data,
    onboardingRequests: (data.onboardingRequests ?? []).filter((item) => item.stationedSiteId === site),
    siteSlaConfig: data.siteSlaConfig?.siteId === site ? data.siteSlaConfig : undefined,
    fjNotifications: (data.fjNotifications ?? []).filter((item) => data.workRequests.some((wr) => wr.WR_ID === item.wrId && wr.SiteId === site)),
    stakeholderTeams: (data.stakeholderTeams ?? []).filter((item) => item.siteId === site),
    coordinationRequirements: (data.coordinationRequirements ?? []).filter((item) => item.siteId === site),
    pmCoordination: (data.pmCoordination ?? []).filter((item) => item.siteId === site),
    sites: [site],
    pmsOrderHighWatermark: Math.max(data.pmsOrderHighWatermark ?? 0, 0, ...data.schedules.map((order) => Number(order.ScheduleId))),
    blueprintHighWatermark: Math.max(data.blueprintHighWatermark ?? 0, 0, ...data.blueprints.map((bp) => Number(/^CB-(\d{4})-/.exec(bp.ChecklistCode)?.[1] ?? 0))),
    buildings: data.buildings.filter((item) => item.SiteId === site),
    floors: data.floors.filter((item) => item.SiteId === site),
    rooms: data.rooms.filter((item) => item.SiteId === site),
    desks: data.desks.filter((item) => item.SiteId === site),
    equipment: data.equipment.filter((item) => item.SiteId === site).map((item) => ({ ...item, Status: EquipmentStatusSchema.default("In Service").parse(normalizeEquipmentStatus(item.Status)) })),
    blueprints: data.blueprints.filter((item) => !item.SiteId || item.SiteId === site),
    schedules: data.schedules.filter((item) => item.SiteId === site),
    suppressedPmOccurrences: (data.suppressedPmOccurrences ?? []).filter((item) => item.siteId === site),
    blueprintAuditLog: (data.blueprintAuditLog ?? []).filter((item) => item.siteId === site),
    workRequests: data.workRequests.filter((item) => item.SiteId === site).map((item) => {
      if (item.QA_AuditStatus === "SelectedForAudit") return { ...item, QA_AuditStatus: "ToBeInspected" as const };
      if (["QA_Staged_Pass", "QA_Staged_Fail"].includes(item.QA_AuditStatus ?? "") &&
          item.qaStagedVerdict?.previousStatus && ["QA_Passed", "QA_Failed_ActionRequired", "QA_Corrected", "QA_Verified"].includes(item.qaStagedVerdict.previousStatus))
        return { ...item, QA_AuditStatus: item.qaStagedVerdict.previousStatus };
      return item;
    }),
    deletedWorkRequests: (data.deletedWorkRequests ?? []).filter((item) => item.SiteId === site),
    users: data.users.filter((item) => item.AssignedSiteIds.includes(site))
      .map((item) => ({ ...item, AssignedSiteIds: [site] })),
    craftspeople: data.craftspeople.filter((item) => item.SiteId === site),
    userAccessProfiles: data.userAccessProfiles.filter((item) => item.siteId === site),
    craftpersonAbsences: (data.craftpersonAbsences ?? []).filter((item) => item.siteId === site).map((item) => {
      const person = resolveAbsencePerson(item, data.craftspeople);
      return person ? { ...item, craftpersonId: person.id } : item;
    }),
    locationFreezes: (data.locationFreezes ?? []).map((item) => LocationFreezeSchema.parse(item)).filter((item) => item.siteId === site),
    tradeRoleMappings: data.tradeRoleMappings.filter((item) => item.SiteId === site),
    siteRoleMappings: data.siteRoleMappings.filter((item) => item.SiteId === site),
    siteRoleAssignments: data.siteRoleAssignments.filter((item) => item.SiteId === site),
    qaInspectorAssignments: (data.qaInspectorAssignments ?? []).filter((item) => item.siteId === site),
    qaAuditReports: (data.qaAuditReports ?? []).filter((item) => item.siteId === site),
    auditCampaigns: (data.auditCampaigns ?? []).filter((item) => item.siteId === site),
    auditFindings: (data.auditFindings ?? []).filter((item) => item.siteId === site),
    auditInspections: (data.auditInspections ?? []).filter((item) => item.siteId === site),
    auditTemplates: (data.auditTemplates ?? []).filter((item) => item.siteId === site),
    auditImports: (data.auditImports ?? []).filter((item) => item.siteId === site),
    auditAssurance: { ...data.auditAssurance, checkpointTemplates: withStandardCheckpointTemplates(data.auditAssurance?.checkpointTemplates ?? []), equipmentInspections: (data.auditAssurance?.equipmentInspections ?? []).filter((item) => item.siteId === site), kmisConfig: data.auditAssurance?.kmisConfig ?? defaultKmisConfig },
  };
}

export function withAccessProfileDefaults(data: DemoData, site: SiteId): DemoData {
  const { roles, profiles } = migrateRoles(data.userAccessProfiles ?? seedAccessProfiles([normalizeSiteId(site) ?? site], data.craftspeople, data.users), data.roleDefinitions);
  return {
    ...data,
    roleDefinitions: roles,
    userAccessProfiles: profiles,
  };
}

export function seedData(): DemoData {
  const sites: SiteId[] = ["SITE-01", "SITE-02", "SITE-03", "SITE-04", "SITE-05"];
  const trades: SiteRoleAssignmentTrade[] = [...CLASSICAL_TRADES, "All"];
  const stageRoles: LJRole[] = ["ESA_TM", "TRADE_TM", "ESA_CCM", "TRADE_CM", "ESA_TO", "ESA_LJM", "ESA_DO", "ESA_IM", "ESA_LONG_JOB", "TRADE_LONG_JOB"];
  const peopleByRole: Record<LJRole, { main: string; deputy: string }> = {
    ESA_TM: { main: "Yvonne", deputy: "Bastian" },
    TRADE_TM: { main: "Claudia", deputy: "Bastian" },
    ESA_CCM: { main: "Gregor", deputy: "Lidija" },
    TRADE_CM: { main: "Stefan", deputy: "Gregor" },
    ESA_TO: { main: "Thomas", deputy: "Lidija" },
    ESA_LJM: { main: "Gregor", deputy: "Stefan" },
    ESA_DO: { main: "Petra Lang", deputy: "Stefan" },
    ESA_IM: { main: "Ivan Horvat", deputy: "Lidija" },
    ESA_LONG_JOB: { main: "Thomas", deputy: "Yvonne" },
    TRADE_LONG_JOB: { main: "Claudia", deputy: "Bastian" },
  };
  const siteRoleAssignments: SiteRoleAssignment[] = [];
  for (const site of sites) {
    for (const role of stageRoles) {
      const roleTrades: SiteRoleAssignmentTrade[] = ["ESA_TO", "ESA_LJM", "ESA_DO", "ESA_IM"].includes(role)
        ? ["All"]
        : trades.filter((trade) => trade !== "All");
      for (const trade of roleTrades) {
        for (const level of ["Main", "Deputy"] as const) {
          const names = peopleByRole[role];
          siteRoleAssignments.push({
            AssignmentId: `${site}-${role}-${trade}-${level}`,
            SiteId: site,
            PersonName: names[level === "Main" ? "main" : "deputy"],
            RoleCode: role,
            Trade: trade,
            AssignmentLevel: level,
            ReceiveNotifications: level === "Main",
          });
        }
      }
    }
  }
  const setSeed = (person: string, role: LJRole, trade: SiteRoleAssignmentTrade, level: "Main" | "Deputy", notify: boolean) => {
    const assignment = siteRoleAssignments.find((item) =>
      item.SiteId === "SITE-01" && item.RoleCode === role && item.Trade === trade && item.AssignmentLevel === level);
    if (assignment) {
      assignment.PersonName = person;
      assignment.ReceiveNotifications = notify;
    }
  };
  setSeed("Mark", "ESA_TM", "Mechanical", "Main", true);
  setSeed("Mark", "ESA_TM", "Electrical", "Deputy", false);
  setSeed("Yvonne", "ESA_TM", "Electrical", "Main", true);
  setSeed("Claudia", "TRADE_TM", "Mechanical", "Main", true);
  setSeed("Bastian", "TRADE_TM", "Mechanical", "Deputy", false);
  const users: UserAccess[] = [];
  const seeded = seedNestedPM(expandSeededWorkRequests(section20Seed(sites), sites), sites);
  const freezeToday = calendarDate(new Date());
  const result: DemoData = {
    sites,
    mobileMutationIds: [],
    deletedWorkRequests: [],
    desks: [],
    locationFreezes: sites.flatMap((site) => [1, 2].map((number) => ({
      id: `${site}-freeze-${number}`, siteId: site, buildingId: `S${site.slice(-2)}-BL-${number}`,
      ...(number === 2 ? { floorId: "Level 0", roomId: `S${site.slice(-2)}-B2-L0-R1` } : {}),
      title: number === 1 ? "Mission Operations Freeze" : "Technical Plant Shutdown",
      description: number === 1 ? "Operational activities are restricted during mission preparations." : "Isolated plant equipment is undergoing safety certification.",
      responsiblePerson: number === 1 ? "Thomas" : "Yvonne",
      startDateTime: `${addDays(freezeToday, -4)}T08:00`, endDateTime: `${addDays(freezeToday, 2)}T18:00`,
      allowPM: number === 2, allowFJ: false, allowLJ: false,
    }))),
    craftpersonAbsences: sites.flatMap((site) => [
      { id: `${site}-leave-1`, siteId: site, craftpersonId: `S${site.slice(-2)}-C1`, absenceType: "Vacation" as const, startDate: "2026-11-09", endDate: "2026-11-10", isFullDay: true, unavailableHoursPerDay: 8, status: "Approved" as const, notes: "Annual leave" },
      { id: `${site}-leave-2`, siteId: site, craftpersonId: `S${site.slice(-2)}-C2`, absenceType: "SickLeave" as const, startDate: "2026-11-11", endDate: "2026-11-11", isFullDay: true, unavailableHoursPerDay: 8, status: "Approved" as const, notes: "" },
      { id: `${site}-leave-3`, siteId: site, craftpersonId: `S${site.slice(-2)}-C3`, absenceType: "Training" as const, startDate: "2026-11-11", endDate: "2026-11-11", isFullDay: false, startTime: "09:00", endTime: "13:00", unavailableHoursPerDay: 4, status: "Approved" as const, notes: "Safety training" },
    ]),
    ...seeded,
    auditCampaigns: sites.flatMap((site) => seedAssurance(site, seeded.equipment, seeded.workRequests).auditCampaigns),
    auditFindings: sites.flatMap((site) => seedAssurance(site, seeded.equipment, seeded.workRequests).auditFindings),
    auditInspections: sites.flatMap((site) => seedAssurance(site, seeded.equipment, seeded.workRequests).auditInspections),
    auditTemplates: seedAuditTemplates(sites),
    auditAssurance: { checkpointTemplates: withStandardCheckpointTemplates(), equipmentInspections: [], kmisConfig: defaultKmisConfig },
    users,
    userAccessProfiles: seedAccessProfiles(sites, seeded.craftspeople, users),
    roleDefinitions: defaultRoleDefinitions(),
    tradeRoleMappings: sites.flatMap((site) => CLASSICAL_TRADES.map((trade) => ({
      SiteId: site, Trade: trade,
      assignments: Object.fromEntries(TRADE_ASSIGNMENT_ROLES.map((role) => [role, usernameForRole(role)])),
    }))),
    siteRoleMappings: sites.map((site) => ({
      SiteId: site, assignments: Object.fromEntries(SITE_ASSIGNMENT_ROLES.map((role) => [role, usernameForRole(role)])),
    })),
    siteRoleAssignments,
    qaInspectorAssignments: sites.flatMap((siteId) => ["Mark", "Thomas", "Yvonne"].map((personName) => ({ id: `${siteId}-qa-${personName}`, siteId, personName, trades: [...CLASSICAL_TRADES], wrTypes: ["PM", "FJ"] }))),
    qaFailureReasons: [...DEFAULT_QA_FAILURE_REASONS],
  };
  const room = result.rooms.find((item) => item.SiteId === "SITE-01");
  const campaign = result.auditCampaigns?.find((item) => item.id === "SITE-01-audit-2026");
  if (!room || !campaign) throw new Error("Cannot seed the Rosetta inspection without a site room and campaign.");
  const asset = { EquipmentCode: "AHU-ROSETTA", EquipmentName: "ZULUFTGERÄT ANLAGE ROSETTA", SiteId: "SITE-01" as const, bl_id: room.bl_id, LevelName: room.LevelName, RoomCode: room.RoomCode, Category: "A" as const, HierarchyLevel: "Installation" as const, IsInstallation: true, Status: "In Service" as const, PrimaryTradeId: "Mechanical", TechnicalSpecifications: {} };
  const routeId = "SITE-01-rosetta-2026";
  result.equipment.push(asset);
  result.auditCampaigns = result.auditCampaigns?.map((c) => c.id === campaign.id ? { ...c, buildingIds: [...new Set([...c.buildingIds, asset.bl_id])], selectedEquipmentIds: [...c.selectedEquipmentIds, asset.EquipmentCode], plannedInspectionsCount: c.plannedInspectionsCount + 1 } : c);
  result.auditInspections = [...(result.auditInspections ?? []), { id: routeId, siteId: "SITE-01", campaignId: campaign.id, equipmentId: asset.EquipmentCode, buildingId: asset.bl_id, systemName: "HVAC & Cooling", checkpointName: "Sophia AHU inspection", inspector: "Thomas", plannedDate: "2026-03-15", routeOrder: campaign.plannedInspectionsCount + 1, accessibility: "Accessible", status: "Planned" }];
  const results: CheckpointResult[] = ahuTemplate.checkpoints.map((c) => {
    const na = ["Antifreeze", "Pump"].includes(c.name);
    const minor = ["Airduct network", "Casing", "Condensate evacuation", "Wiring"].includes(c.name);
    return { checkpointId: c.id, checkpointName: c.name, weight: 1, classification: na ? "NA" : minor ? "N1" : c.name === "Steam humidifier" ? "N2" : "N0", comment: minor ? "Minor deterioration" : c.name === "Steam humidifier" ? "Corrective action required" : "", photoUrls: [] };
  });
  const sheet: EquipmentInspectionSheet = { id: "rosetta-2026-sheet", campaignId: campaign.id, siteId: asset.SiteId, buildingId: asset.bl_id, roomId: asset.RoomCode, systemName: "HVAC & Cooling", equipmentId: asset.EquipmentCode, equipmentName: asset.EquipmentName, equipmentCategory: ahuTemplate.equipmentCategory, inspectorName: "Thomas", inspectedAt: "2026-03-15T12:00:00Z", status: "Completed", operationalStatus: "Operational", routeId, checkpointResults: results, scoringConfig: defaultKmisConfig, ...calculateEquipmentInspectionSummary(results, defaultKmisConfig) };
  return migrateLegacySiteIds(completeEquipmentInspection(result, sheet));
}

export function seedSiteData(site: SiteId): DemoData {
  return scopeData(withAccessProfileDefaults(seedData(), site), site);
}
