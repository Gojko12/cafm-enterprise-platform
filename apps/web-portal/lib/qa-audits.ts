import { WR_Statuses } from "@cafm/shared-schema";
import type { BaseWorkRequest, QAInspectorAssignment, UserRole } from "@cafm/shared-schema";
import { gridStatusChange } from "./wr-grid";
import { canInspectWR } from "./qa-settings";

export type QAMode = "ManualInspectorPick" | "QRScanOnSite" | "ComputerRandom5Percent";
export type QAOptions = { dateFrom?: string; dateTo?: string; wrTypes?: Array<BaseWorkRequest["WR_Type"]>; buildingIds?: string[]; trades?: string[]; targetCount?: number };
type Actor = { name: string; role: UserRole };
export const isQACompleted = (wr: BaseWorkRequest) => wr.Percentage === 78 || wr.Percentage === 100;
export const isQAQuotaCompleted = (wr: BaseWorkRequest) => isQACompleted(wr) || (!!wr.QA_CompletionDate && ["QA_Failed_ActionRequired", "QA_Corrected", "QA_Verified"].includes(wr.QA_AuditStatus ?? ""));
export const qaStatus = (wr: BaseWorkRequest) => wr.QA_AuditStatus ?? "None";
export function qaDate(wr: BaseWorkRequest) { return (wr.QA_CompletionDate || wr.UpdatedAt || wr.CreatedDate).slice(0, 10); }
export function qaMatches(wr: BaseWorkRequest, options: QAOptions) {
  const date = qaDate(wr);
  return isQAQuotaCompleted(wr) && (!options.dateFrom || date >= options.dateFrom) && (!options.dateTo || date <= options.dateTo) &&
    (!options.wrTypes || options.wrTypes.includes(wr.WR_Type)) && (!options.buildingIds || options.buildingIds.includes(wr.bl_id)) &&
    (!options.trades || options.trades.includes(wr.TradeName ?? ""));
}
function log(wr: BaseWorkRequest, text: string, actor: Actor): BaseWorkRequest {
  const now = new Date().toISOString();
  return { ...wr, UpdatedAt: now, Activity: [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now, text }] };
}
export function selectAudit(wr: BaseWorkRequest, mode: QAMode, actor: Actor): BaseWorkRequest {
  if ((wr.Percentage !== 78 && wr.Percentage !== 100) || qaStatus(wr) !== "None") throw new Error(`${wr.WR_ID}: only 78% or 100% completed, unselected work requests can be selected.`);
  return log({ ...wr, QA_CompletionDate: qaDate(wr), QA_AuditStatus: "SelectedForAudit", QA_SelectionMode: mode }, `Selected for QA audit (${mode}).`, actor);
}
export function selectRandomAudits(requests: BaseWorkRequest[], options: QAOptions, actor: Actor, assignments: QAInspectorAssignment[]): BaseWorkRequest[] {
  if (options.dateFrom && options.dateTo && options.dateFrom > options.dateTo) throw new Error("Invalid audit date range.");
  if (options.targetCount !== undefined && (!Number.isInteger(options.targetCount) || options.targetCount < 0)) throw new Error("Target count must be a non-negative integer.");
  const eligible = requests.filter((wr) => qaMatches(wr, options));
  const chosen = new Map<string, BaseWorkRequest>();
  const selected = eligible.filter((wr) => qaStatus(wr) !== "None");
  const needed = Math.max(0, (options.targetCount ?? Math.ceil(eligible.length * 0.05)) - selected.length);
  const pool = eligible.filter((wr) => qaStatus(wr) === "None" && (wr.Percentage === 78 || wr.Percentage === 100) && canInspectWR(actor.name, wr, assignments)).map((wr) => ({ wr, random: Math.random() }));
  const ratio = (wr: BaseWorkRequest, by: "trade" | "type") => {
    const matches = (item: BaseWorkRequest) => by === "trade" ? item.TradeName === wr.TradeName : item.WR_Type === wr.WR_Type;
    return selected.filter(matches).length / eligible.filter(matches).length;
  };
  for (let i = 0; i < needed && pool.length; i++) {
    pool.sort((a, b) => Math.max(ratio(a.wr, "trade"), ratio(a.wr, "type")) - Math.max(ratio(b.wr, "trade"), ratio(b.wr, "type")) || (ratio(a.wr, "trade") + ratio(a.wr, "type")) - (ratio(b.wr, "trade") + ratio(b.wr, "type")) || a.random - b.random);
    const wr = pool.shift()!.wr;
    selected.push(wr);
    chosen.set(wr.WR_ID, selectAudit(wr, "ComputerRandom5Percent", actor));
  }
  if (chosen.size < needed) throw new Error(`Only ${chosen.size} eligible requests are available for the ${needed} needed; adjust permissions or filters.`);
  return requests.map((wr) => chosen.get(wr.WR_ID) ?? wr);
}
export function transitionAudit(wr: BaseWorkRequest, action: "confirm" | "unselect" | "direct", actor: Actor): BaseWorkRequest {
  const status = qaStatus(wr);
  if (action === "direct") {
    const selected = selectAudit(wr, "ManualInspectorPick", actor);
    return log({ ...selected, QA_AuditStatus: "ToBeInspected" }, `Confirmed for QA inspection by ${actor.name}.`, actor);
  }
  if (status !== "SelectedForAudit") throw new Error(`${wr.WR_ID}: only staged selections can be ${action === "confirm" ? "confirmed" : "unselected"}.`);
  return action === "confirm" ? log({ ...wr, QA_AuditStatus: "ToBeInspected" }, `Confirmed for QA inspection by ${actor.name}.`, actor) :
    log({ ...wr, QA_AuditStatus: "None", QA_SelectionMode: undefined }, `Unselected from QA audit by ${actor.name}.`, actor);
}
export function swapAudit(requests: BaseWorkRequest[], id: string, actor: Actor): BaseWorkRequest[] {
  const wr = requests.find((item) => item.WR_ID === id);
  if (!wr || qaStatus(wr) !== "SelectedForAudit" || wr.QA_SelectionMode !== "ComputerRandom5Percent") throw new Error("Only a pending random audit can be swapped.");
  const candidates = requests.filter((item) => item.WR_ID !== id && item.WR_Type === wr.WR_Type && isQACompleted(item) && qaStatus(item) === "None").map((item) => ({ item, score: Number(item.RoomCode !== wr.RoomCode) + Number(!item.AssignedCraftpersonIds.some((person) => wr.AssignedCraftpersonIds.includes(person))), random: Math.random() })).sort((a, b) => b.score - a.score || a.random - b.random);
  if (!candidates.length) throw new Error("No replacement completed work request is available.");
  const replacement = selectAudit(candidates[0].item, "ComputerRandom5Percent", actor);
  return requests.map((item) => item.WR_ID === id ? log({ ...item, QA_AuditStatus: "None", QA_SelectionMode: undefined }, `Random audit swapped for ${replacement.WR_ID}.`, actor) : item.WR_ID === replacement.WR_ID ? replacement : item);
}
export function qaVerdict(wr: BaseWorkRequest, verdict: "Pass" | "Fail" | "SubmitCorrection" | "VerifyClose", actor: Actor, payload: { issue?: string; correction?: string; photos?: NonNullable<BaseWorkRequest["QA_AuditPhotos"]>; reopen?: boolean }): BaseWorkRequest {
  const status = qaStatus(wr), now = new Date().toISOString();
  if ((verdict === "Pass" || verdict === "Fail") && status !== "ToBeInspected") throw new Error("Confirm the work request for inspection before recording a verdict.");
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
  } else if (verdict === "Fail") {
    const issued = WR_Statuses.find((item) => item.ESAWorkType === wr.ESAWorkType && item.Percentage === 50);
    if (payload.reopen !== false && !issued) throw new Error("A 50% status is not configured for this work type.");
    if (payload.reopen !== false && wr.IsFrozen) throw new Error("Resolve the existing hold before reopening this work request, or use the inspector override.");
    next = { ...next, QA_CompletionDate: qaDate(wr), QA_AuditStatus: "QA_Failed_ActionRequired", QA_InspectedBy: actor.name, QA_InspectedDate: now, QA_IssueDescription: payload.issue!.trim(), QA_CorrectionComment: undefined, QA_CorrectedDate: undefined, QA_AuditPhotos: payload.photos ?? [], QA_InspectionStatus: "ToBeCorrected", AuditInspectionStatus: "PM WRs to be corrected",
      ...(payload.reopen !== false && issued ? { ...issued, WorkRequestSubstatus: "Re-opened (50% - QA Failed)" } : {}) };
    return log(next, `QA Inspection FAILED by ${actor.name}${payload.reopen === false ? " (Inspector Override: WR NOT re-opened to 50%)" : ""}. Reason: ${payload.issue!.trim()}.${payload.reopen === false ? "" : " WR automatically Re-opened and set to 50%."}`, actor);
  }
  else if (verdict === "SubmitCorrection") next = { ...next, QA_AuditStatus: "QA_Corrected", QA_CorrectionComment: payload.correction!.trim(), QA_CorrectedDate: now };
  else next = { ...next, QA_AuditStatus: "QA_Verified", QA_InspectionStatus: "Passed", AuditInspectionStatus: "Passed Inspected" };
  return log(next, `QA ${verdict}${verdict === "SubmitCorrection" ? `: ${payload.correction!.trim()}` : ""}.`, actor);
}
