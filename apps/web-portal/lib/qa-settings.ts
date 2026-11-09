import type { BaseWorkRequest, QAInspectorAssignment } from "@cafm/shared-schema";

export const DEFAULT_QA_FAILURE_REASONS = [
  "Checklist step marked completed but not physically performed",
  "Substandard workmanship / technical quality defect",
  "Safety, lock-out, or housekeeping non-compliance",
  "Missing mandatory measurement or photo documentation",
  "Incorrect spare part or material installed",
  "Equipment still exhibiting fault, vibration, or leak",
];

export function canInspectWR(person: string, wr: BaseWorkRequest, assignments: QAInspectorAssignment[] = []) {
  return wr.WR_Type !== "LJ" && assignments.some((entry) => entry.siteId === wr.SiteId && entry.personName === person &&
    !!wr.TradeName && entry.trades.includes(wr.TradeName) && entry.wrTypes.includes(wr.WR_Type));
}
export function hasOpenQARework(wr: BaseWorkRequest) {
  return wr.WR_Type !== "LJ" && (wr.QA_AuditStatus === "QA_Failed_ActionRequired" || wr.QA_AuditStatus === "QA_Corrected" ||
    (["QA_Staged_Pass", "QA_Staged_Fail"].includes(wr.QA_AuditStatus ?? "") && ["QA_Failed_ActionRequired", "QA_Corrected"].includes(wr.qaStagedVerdict?.previousStatus ?? "")));
}
