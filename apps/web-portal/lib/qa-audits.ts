import { WR_Statuses } from "@cafm/shared-schema";
import type { BaseWorkRequest, UserRole } from "@cafm/shared-schema";
import { gridStatusChange } from "./wr-grid";

export type QAMode = "ManualInspectorPick" | "QRScanOnSite" | "ComputerRandom5Percent";
export type QAOptions = { dateFrom?: string; dateTo?: string; wrTypes?: Array<BaseWorkRequest["WR_Type"]>; buildingIds?: string[]; trades?: string[] };
type Actor = { name: string; role: UserRole };
export const isQACompleted = (wr: BaseWorkRequest) => wr.Percentage === 78 || wr.Percentage === 100 || /completed|closed/i.test(wr.WorkRequestStatus);
export const qaStatus = (wr: BaseWorkRequest) => wr.QA_AuditStatus ?? "None";
export function qaDate(wr: BaseWorkRequest) { return (wr.QA_CompletionDate || wr.UpdatedAt || wr.CreatedDate).slice(0, 10); }
export function qaMatches(wr: BaseWorkRequest, options: QAOptions) {
  const date = qaDate(wr);
  return isQACompleted(wr) && (!options.dateFrom || date >= options.dateFrom) && (!options.dateTo || date <= options.dateTo) &&
    (!options.wrTypes || options.wrTypes.includes(wr.WR_Type)) && (!options.buildingIds || options.buildingIds.includes(wr.bl_id)) &&
    (!options.trades || options.trades.includes(wr.TradeName ?? ""));
}
function log(wr: BaseWorkRequest, text: string, actor: Actor): BaseWorkRequest {
  const now = new Date().toISOString();
  return { ...wr, UpdatedAt: now, Activity: [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now, text }] };
}
export function selectAudit(wr: BaseWorkRequest, mode: QAMode, actor: Actor): BaseWorkRequest {
  if (!isQACompleted(wr) || qaStatus(wr) !== "None") throw new Error(`${wr.WR_ID}: only completed, unselected work requests can be selected.`);
  return log({ ...wr, QA_CompletionDate: qaDate(wr), QA_AuditStatus: "SelectedForAudit", QA_SelectionMode: mode }, `Selected for QA audit (${mode}).`, actor);
}
export function selectRandomAudits(requests: BaseWorkRequest[], options: QAOptions, actor: Actor): BaseWorkRequest[] {
  if (options.dateFrom && options.dateTo && options.dateFrom > options.dateTo) throw new Error("Invalid audit date range.");
  const eligible = requests.filter((wr) => qaMatches(wr, options));
  const chosen = new Map<string, BaseWorkRequest>();
  for (const type of options.wrTypes ?? ["PM", "FJ", "LJ"]) {
    const group = eligible.filter((wr) => wr.WR_Type === type);
    if (!group.length) continue;
    const needed = Math.max(0, Math.ceil(group.length * 0.05) - group.filter((wr) => qaStatus(wr) !== "None").length);
    const pool = group.filter((wr) => qaStatus(wr) === "None").map((wr) => ({ wr, random: Math.random() }));
    const selected = group.filter((wr) => qaStatus(wr) !== "None");
    const count = (wr: BaseWorkRequest) => selected.reduce((sum, item) => sum + Number(item.bl_id === wr.bl_id) + Number(item.TradeName === wr.TradeName) + Number(item.AssignedCraftpersonIds.some((id) => wr.AssignedCraftpersonIds.includes(id))), 0);
    for (let i = 0; i < needed && pool.length; i++) {
      pool.sort((a, b) => count(a.wr) - count(b.wr) || a.random - b.random);
      const wr = pool.shift()!.wr;
      selected.push(wr);
      chosen.set(wr.WR_ID, selectAudit(wr, "ComputerRandom5Percent", actor));
    }
  }
  return requests.map((wr) => chosen.get(wr.WR_ID) ?? wr);
}
export function swapAudit(requests: BaseWorkRequest[], id: string, actor: Actor): BaseWorkRequest[] {
  const wr = requests.find((item) => item.WR_ID === id);
  if (!wr || qaStatus(wr) !== "SelectedForAudit" || wr.QA_SelectionMode !== "ComputerRandom5Percent") throw new Error("Only a pending random audit can be swapped.");
  const candidates = requests.filter((item) => item.WR_ID !== id && item.WR_Type === wr.WR_Type && isQACompleted(item) && qaStatus(item) === "None").map((item) => ({ item, score: Number(item.RoomCode !== wr.RoomCode) + Number(!item.AssignedCraftpersonIds.some((person) => wr.AssignedCraftpersonIds.includes(person))), random: Math.random() })).sort((a, b) => b.score - a.score || a.random - b.random);
  if (!candidates.length) throw new Error("No replacement completed work request is available.");
  const replacement = selectAudit(candidates[0].item, "ComputerRandom5Percent", actor);
  return requests.map((item) => item.WR_ID === id ? log({ ...item, QA_AuditStatus: "None", QA_SelectionMode: undefined }, `Random audit swapped for ${replacement.WR_ID}.`, actor) : item.WR_ID === replacement.WR_ID ? replacement : item);
}
export function qaVerdict(wr: BaseWorkRequest, verdict: "Pass" | "Fail" | "SubmitCorrection" | "VerifyClose", actor: Actor, payload: { issue?: string; correction?: string; photos?: NonNullable<BaseWorkRequest["QA_AuditPhotos"]> }): BaseWorkRequest {
  const status = qaStatus(wr), now = new Date().toISOString();
  if ((verdict === "Pass" || verdict === "Fail") && status !== "SelectedForAudit") throw new Error("Select the work request for audit before recording a verdict.");
  if (verdict === "Fail" && !payload.issue?.trim()) throw new Error("An issue description is required.");
  if (verdict === "SubmitCorrection" && (status !== "QA_Failed_ActionRequired" || !payload.correction?.trim())) throw new Error("A failed audit and correction comment are required.");
  if (verdict === "VerifyClose" && status !== "QA_Corrected") throw new Error("A correction must be submitted before verification.");
  let next: BaseWorkRequest = { ...wr };
  if (verdict === "Pass") {
    next = { ...next, QA_AuditStatus: "QA_Passed", QA_InspectedBy: actor.name, QA_InspectedDate: now, QA_InspectionStatus: "Passed", AuditInspectionStatus: "Passed Inspected", QA_AuditPhotos: payload.photos ?? next.QA_AuditPhotos };
    if (next.Percentage === 78 && next.WR_Type !== "LJ" && !next.IsFrozen &&
        (actor.role === "TeamLeader" || actor.role === "SiteAdministrator") &&
        WR_Statuses.some((status) => status.ESAWorkType === next.ESAWorkType && status.Percentage === 100)) {
      next = gridStatusChange(next, 100, actor.role);
    }
  } else if (verdict === "Fail") next = { ...next, QA_AuditStatus: "QA_Failed_ActionRequired", QA_InspectedBy: actor.name, QA_InspectedDate: now, QA_IssueDescription: payload.issue!.trim(), QA_CorrectionComment: undefined, QA_CorrectedDate: undefined, QA_AuditPhotos: payload.photos ?? [], QA_InspectionStatus: "ToBeCorrected", AuditInspectionStatus: "PM WRs to be corrected" };
  else if (verdict === "SubmitCorrection") next = { ...next, QA_AuditStatus: "QA_Corrected", QA_CorrectionComment: payload.correction!.trim(), QA_CorrectedDate: now };
  else next = { ...next, QA_AuditStatus: "QA_Verified", QA_InspectionStatus: "Passed", AuditInspectionStatus: "Passed Inspected" };
  return log(next, `QA ${verdict}${verdict === "Fail" ? `: ${payload.issue!.trim()}` : verdict === "SubmitCorrection" ? `: ${payload.correction!.trim()}` : ""}.`, actor);
}
