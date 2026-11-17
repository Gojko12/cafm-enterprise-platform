import { FEATURE_ROLES, HARD_LOCKED_FEATURES, featureKey } from "./rbac-matrix";

interface FeatureState {
  featureMatrixVersion?: number;
  featurePermissionOverrides?: Record<string, boolean>;
}

export function migrateFeatureMatrix<T extends FeatureState>(state: T): T {
  if ((state.featureMatrixVersion ?? 0) >= 36) return state;
  const overrides = { ...state.featurePermissionOverrides };
  const corrections: Array<[string, string[]]> = [
    ["longJobs.approveAcceptanceGates", ["ESA_LJM"]],
    ["technicalAudits.read", ["TRADE_TM", "TeamLeader", "MobileTechnician"]],
    ["technicalAudits.write", ["ESA_TO", "ESA_TM"]],
    ["deskReservations.manageOwn", FEATURE_ROLES],
    ["workSessions.manageOwn", ["SiteAdministrator", "TRADE_CM", "TRADE_TM", "QA_Inspector", "TeamLeader", "MobileTechnician", "PM_Planner"]],
    ["checklists.execute", ["TRADE_CM", "QA_Inspector"]],
    ["workRequests.readAll", ["TRADE_CM", "TRADE_TM"]],
    ["workRequests.assign", ["TRADE_CM", "TRADE_TM"]],
    ["workRequests.readAssigned", ["SiteAdministrator", "TeamLeader"]],
    ["workRequests.updateAssigned", ["SiteAdministrator", "TeamLeader"]],
    ["locations.read", ["HR_ADMIN"]],
    ["pmWorkRequests.complete", FEATURE_ROLES],
    ["pmWorkRequests.cancel", FEATURE_ROLES],
  ];
  for (const [permission, roles] of corrections) {
    for (const role of roles) delete overrides[featureKey(role, permission)];
  }
  for (const key of Object.keys(overrides)) {
    const [, permission] = key.split("|");
    if (permission === "longJobs.manageSiteContext" || (HARD_LOCKED_FEATURES as readonly string[]).includes(permission)) delete overrides[key];
  }
  return { ...state, featureMatrixVersion: 36, featurePermissionOverrides: overrides };
}
