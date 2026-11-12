import { ROLE_PERMISSIONS } from "@cafm/shared-schema";
import type { LJRole, Permission, UserRole } from "@cafm/shared-schema";

export type StageAccess = "act" | "notify" | "none";
export type StageMatrix = Record<string, StageAccess>;
export type FeatureOverrides = Record<string, boolean>;

// Only the eight real workflow roles get a column; ESA_LONG_JOB / TRADE_LONG_JOB are aliases of ESA_LJM / TRADE_TM.
export const LJ_STAGE_ROLES: Exclude<LJRole, "ESA_LONG_JOB" | "TRADE_LONG_JOB">[] = ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_CCM", "ESA_DO", "ESA_IM", "TRADE_CM", "TRADE_TM"];

export const LJ_ROLE_DISPLAY: Record<string, string> = {
  ESA_TO: "ESA Tech Officer", ESA_TM: "ESA Trade Mgr", ESA_LJM: "ESA Long Job Mgr", ESA_CCM: "ESA Cost Centre",
  ESA_DO: "Draftsman", ESA_IM: "Inventory Admin", TRADE_CM: "Contractor CM", TRADE_TM: "Contractor TM",
  SiteAdministrator: "Site Administrator", PM_Planner: "PM Planner", QA_Inspector: "QA Inspector",
  MobileTechnician: "Mobile Technician", TeamLeader: "Team Leader", StandardEmployee: "Standard Employee", HR_ADMIN: "HR Administrator",
};

export const LJ_STAGES = [
  { percentage: 0, name: "New Request", track: "RFQ" },
  { percentage: 10, name: "From Fast Job", track: "RFQ" },
  { percentage: 20, name: "Quotation Prep", track: "RFQ" },
  { percentage: 25, name: "Pending Acceptance", track: "RFQ" },
  { percentage: 30, name: "Pending Approval", track: "RFW" },
  { percentage: 32, name: "Issued", track: "RFW" },
  { percentage: 40, name: "Commitment", track: "RFW" },
  { percentage: 50, name: "Execution", track: "RFW" },
  { percentage: 78, name: "Work Ready", track: "Acceptance" },
  { percentage: 79, name: "Pre-SAT", track: "Acceptance" },
  { percentage: 80, name: "SAT Invite", track: "Acceptance" },
  { percentage: 94, name: "All Acceptances", track: "Acceptance" },
  { percentage: 100, name: "Closed", track: "Closed" },
] as const;

type StageRule = { act: string[]; notify: string[] };
const intake: StageRule = { act: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM"], notify: ["ESA_CCM", "TRADE_CM"] };
const approval: StageRule = { act: ["ESA_TM", "ESA_CCM", "ESA_LJM"], notify: ["ESA_TO", "TRADE_CM", "TRADE_TM"] };
const commitment: StageRule = { act: ["ESA_LJM", "TRADE_CM", "TRADE_TM"], notify: ["ESA_TO", "ESA_TM"] };
const sat: StageRule = { act: ["ESA_TO", "ESA_TM", "TRADE_TM"], notify: ["ESA_LJM", "TRADE_CM"] };
const STAGE_RULES: Record<number, StageRule> = {
  0: intake, 10: intake,
  20: { act: ["TRADE_CM", "TRADE_TM"], notify: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_CCM"] },
  25: approval, 30: approval, 32: commitment, 40: commitment,
  50: { act: ["TRADE_TM", "TRADE_CM", "ESA_TO"], notify: ["ESA_TM", "ESA_LJM"] },
  78: { act: ["TRADE_TM", "ESA_TO"], notify: ["ESA_TM", "ESA_LJM", "TRADE_CM"] },
  79: sat, 80: sat,
  94: { act: ["ESA_TO", "ESA_TM", "ESA_CCM", "ESA_DO", "ESA_IM"], notify: ["ESA_LJM", "TRADE_CM", "TRADE_TM"] },
  100: { act: ["ESA_TO", "ESA_TM"], notify: ["ESA_LJM", "ESA_CCM", "TRADE_CM", "TRADE_TM"] },
};

export const stageKey = (percentage: number, role: string) => `${percentage}:${role}`;

export function defaultStageMatrix(): StageMatrix {
  const matrix: StageMatrix = {};
  for (const stage of LJ_STAGES) {
    const rule = STAGE_RULES[stage.percentage];
    for (const role of LJ_STAGE_ROLES) matrix[stageKey(stage.percentage, role)] = rule.act.includes(role) ? "act" : rule.notify.includes(role) ? "notify" : "none";
  }
  return matrix;
}

// Legacy saved cells used "P" (primary) / "O" (optional). A matrix where every cell is "act" is the old uniform placeholder and is replaced by the realistic defaults.
export function resolveStageMatrix(saved: Record<string, string> | undefined): StageMatrix {
  const defaults = defaultStageMatrix();
  if (!saved) return defaults;
  const values = Object.values(saved);
  if (!values.length || values.every((value) => value === "act" || value === "P")) return defaults;
  const normalize = (value: string | undefined): StageAccess | undefined => value === "act" || value === "P" ? "act" : value === "notify" || value === "O" ? "notify" : value === "none" ? "none" : undefined;
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, normalize(saved[key]) ?? fallback]));
}

export const nextStageAccess = (value: StageAccess): StageAccess => value === "act" ? "notify" : value === "notify" ? "none" : "act";

// ESA_LongJobManager duplicates ESA_LJM; the *_LONG_JOB roles duplicate ESA_LJM / TRADE_TM.
export const HIDDEN_FEATURE_ROLES: UserRole[] = ["ESA_LongJobManager", "ESA_LONG_JOB", "TRADE_LONG_JOB"];
export const FEATURE_ROLES = (Object.keys(ROLE_PERMISSIONS) as UserRole[]).filter((role) => !HIDDEN_FEATURE_ROLES.includes(role));

export const FEATURE_GROUPS: Array<{ title: string; items: Array<[Permission, string]> }> = [
  { title: "Site & Users", items: [
    ["system.configure", "Configure Site Settings"], ["users.manageRoles", "Manage Users & Roles"], ["data.importExport", "Import / Export Data"],
    ["locations.read", "View Buildings, Floors & Rooms"], ["locations.write", "Edit Buildings, Floors & Rooms"],
    ["equipment.read", "View Equipment"], ["equipment.write", "Create & Edit Equipment"], ["trades.write", "Manage Trades"],
    ["people.onboardNonFm", "Onboard & Edit Non-FM Employees (HR)"],
  ] },
  { title: "Work Requests", items: [
    ["workRequests.readAll", "View All Work Requests"], ["workRequests.readAssigned", "View Own Assigned Work Requests"],
    ["workRequests.create", "Create Work Requests"], ["workRequests.update", "Edit Any Work Request"],
    ["workRequests.updateAssigned", "Update Own Assigned Work Requests"], ["workRequests.assign", "Assign Craftspeople"],
    ["workRequests.manageFreezes", "Configure Location Freezes"], ["workRequests.approve", "Approve & Close Work Requests"],
  ] },
  { title: "SmartPM & Checklists", items: [
    ["pmSchedules.read", "View PM Schedules"], ["pmSchedules.write", "Define & Edit PM Schedules"], ["pmSchedules.generate", "Generate PM Work Requests"],
    ["pmSchedules.updateRequirementsFromWr", "Update SmartPM Teams & Notices on PM Closure"],
    ["checklists.execute", "Execute Checklists"], ["checklists.manage", "Manage Checklist Blueprints"], ["workSessions.manageOwn", "Record Own Work Time"],
  ] },
  { title: "Audits, Desks & Analytics", items: [
    ["technicalAudits.read", "View Technical Audits"], ["technicalAudits.write", "Perform Technical Audits"],
    ["deskReservations.manageOwn", "Reserve Own Desk"], ["deskReservations.manageAll", "Manage All Desk Reservations"], ["analytics.read", "View Analytics"],
  ] },
  { title: "Long Jobs", items: [
    ["longJobs.manageRFQ", "Create & Manage RFQ Quotes (0%–25%)"], ["longJobs.manageRFW", "Manage RFW Execution (30%–50%)"],
    ["longJobs.approveAcceptanceGates", "Approve SAT & Final Acceptance Gates (78%–94%)"], ["longJobs.manageSiteContext", "Configure Site Settings & Freezes"],
  ] },
];

export const featureKey = (role: string, permission: string) => `${role}|${permission}`;
export function roleHasPermission(role: UserRole, permission: string, overrides?: FeatureOverrides): boolean {
  const override = overrides?.[featureKey(role, permission)];
  return override ?? (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
}
