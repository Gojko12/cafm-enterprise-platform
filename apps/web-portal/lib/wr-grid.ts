import { WR_Statuses } from "@cafm/shared-schema";
import type { BaseWorkRequest, UserRole } from "@cafm/shared-schema";
import { hasOpenQARework } from "./qa-settings";

export function gridStatusChange(wr: BaseWorkRequest, percentage: number, role: UserRole): BaseWorkRequest {
  if (wr.Percentage === percentage) return wr;
  if (percentage === 100 && hasOpenQARework(wr)) throw new Error(`${wr.WR_ID}: QA rework must be verified before closing.`);
  if (wr.WR_Type === "LJ") throw new Error(`${wr.WR_ID}: use the LJ Actions panel so role and acceptance gates are checked.`);
  const configured = WR_Statuses.find((status) => status.ESAWorkType === wr.ESAWorkType && status.Percentage === percentage);
  if (!configured) throw new Error(`${wr.WR_ID}: ${percentage}% is not configured in WR_Statuses; use the full popup.`);
  if (wr.IsFrozen || wr.Percentage === 55) throw new Error(`${wr.WR_ID}: use the popup to resolve the hold before changing status.`);
  if (percentage === 100 && role !== "TeamLeader" && role !== "SiteAdministrator") {
    throw new Error(`${wr.WR_ID}: completion requires the Team Leader or SiteAdministrator.`);
  }
  if (wr.WR_Type === "PM" && percentage === 100 && wr.QA_InspectionStatus !== "Passed" && wr.AuditInspectionStatus !== "Passed Inspected") {
    throw new Error(`${wr.WR_ID}: QA inspection must pass before PM completion.`);
  }
  if ((percentage === 78 && wr.Percentage !== 50) || (percentage === 100 && wr.Percentage !== 78) || percentage === 50) {
    throw new Error(`${wr.WR_ID}: this status transition is not permitted from ${wr.Percentage}%.`);
  }
  return { ...wr, ...configured, Percentage: percentage, IsFrozen: false,
    ...(wr.WR_Type === "PM" && percentage === 100 ? { QA_InspectionStatus: "Passed" as const } : {}) };
}
