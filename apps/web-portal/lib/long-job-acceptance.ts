import type { BaseWorkRequest, LJAcceptanceGate } from "@cafm/shared-schema";

export const ACCEPTANCE_GATES = [
  { type: "SAT", field: "RequiresSAT", title: "SAT", approvers: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
  { type: "DrawingEngineering", field: "RequiresDrawingUpdate", title: "Draftsman Drawing Update", approvers: ["ESA_DO", "ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
  { type: "CIFMInventory", field: "RequiresInventoryUpdate", title: "CIFM Inventory Update", approvers: ["ESA_IM", "ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
] as const;

export function updateAcceptanceGate(wr: BaseWorkRequest, type: LJAcceptanceGate["GateType"],
  status: LJAcceptanceGate["Status"], actor: string, timestamp: string): { percentage: number; updates: Partial<BaseWorkRequest> } {
  const definition = ACCEPTANCE_GATES.find((gate) => gate.type === type);
  if (!definition || !wr[definition.field] || wr.Percentage < 78 || wr.Percentage >= 94) {
    throw new Error("This acceptance gate is not active.");
  }
  if (type === "SAT" && !wr.PreSATApproved) throw new Error("Pre-SAT must be approved first.");
  const existing = (wr.AcceptanceGates ?? []).find((gate) => gate.GateType === type);
  if (existing?.Status === "Approved") throw new Error("This acceptance gate is already approved.");
  const updated: LJAcceptanceGate[] = [...(wr.AcceptanceGates ?? []).filter((gate) => gate.GateType !== type), {
    GateType: type, IsRequired: true, Status: status,
    ...(status === "Approved" ? { ApprovedBy: actor, ApprovedAt: timestamp } : {}),
  }];
  const allApproved = ACCEPTANCE_GATES.every((gate) => !wr[gate.field] ||
    updated.some((item) => item.GateType === gate.type && item.Status === "Approved"));
  let percentage = wr.Percentage;
  if (status === "Approved" && allApproved) percentage = 94;
  else if (type === "SAT" && status === "InvitationSent") percentage = 80;
  else if (type === "SAT" && status === "Approved") percentage = 81;
  return { percentage, updates: { AcceptanceGates: updated,
    WorkRequestSubstatus: percentage === 94 ? "All Acceptances Completed" :
      percentage === 80 ? "Work Request Ready for SAT Approval (Invite)" :
      percentage === 81 ? "SAT Approved" : wr.WorkRequestSubstatus,
    WorkRequestStatus: "Technically Completed" } };
}
