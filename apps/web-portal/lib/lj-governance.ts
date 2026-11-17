import type { UserRole } from "@cafm/shared-schema";

export const LJ_OVERRIDE_STAGES = [
  [0, "New Request"], [10, "Requested"], [20, "Quotation Preparation Offer by Contractor"],
  [21, "Quotation Preparation Offer by Trade"], [23, "Request Review"], [25, "Submitted for Acceptance"],
  [26, "Submitted to User for Acceptance"], [27, "Cancelled"], [28, "Quotation Accepted"],
  [29, "Quotation Rejected"], [30, "Request for Work"], [31, "On Hold for Budget"], [32, "Approved and Ordered"],
  [40, "Committed"], [50, "Work In Progress"], [55, "On Hold for Access / Labor / Parts"],
  [78, "Technically Completed"], [79, "Pre-SAT Approved"], [80, "Acceptance Invitation Sent"],
  [81, "SAT Approved"], [94, "All Acceptances Completed"], [95, "Completed"], [96, "Yellow Page Signed"],
  [97, "Costs Approved"], [98, "Final Approval"], [99, "Invoice Information Confirmed"], [100, "Payment Confirmed"],
] as const;

type Rule = { from: number[]; to: number[]; roles: UserRole[]; tracks?: string[] };
const rules: Rule[] = [
  { from: [0, 10], to: [20, 25], roles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"], tracks: ["RFQ"] },
  { from: [20, 23], to: [21, 25], roles: ["TRADE_TM", "TRADE_LONG_JOB"], tracks: ["RFQ"] },
  { from: [20, 23], to: [25], roles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"], tracks: ["RFQ"] },
  { from: [21], to: [25], roles: ["TRADE_TM", "TRADE_LONG_JOB"], tracks: ["RFQ"] },
  { from: [25, 26], to: [23, 28, 29], roles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"], tracks: ["RFQ"] },
  { from: [25], to: [26], roles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"], tracks: ["RFQ"] },
  { from: [30, 31], to: [23, 29, 31, 32], roles: ["ESA_TO"], tracks: ["RFW"] },
  { from: [0, 10, 20, 21, 23], to: [27], roles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"], tracks: ["RFQ"] },
  { from: [0, 10], to: [27, 30], roles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"], tracks: ["RFW"] },
  { from: [25, 28], to: [30], roles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"], tracks: ["RFQ"] },
  { from: [32], to: [40], roles: ["TRADE_TM", "TRADE_LONG_JOB", "ESA_TO", "ESA_TM"], tracks: ["RFW"] },
  { from: [40, 55], to: [50], roles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"], tracks: ["RFW"] },
  { from: [40, 50], to: [55], roles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"], tracks: ["RFW"] },
  { from: [50, 55], to: [78, 94], roles: ["TRADE_TM", "TRADE_LONG_JOB", "ESA_IM"], tracks: ["RFW"] },
  { from: [78], to: [79], roles: ["TRADE_TM", "TRADE_LONG_JOB"], tracks: ["RFW"] },
  { from: [78, 79, 81], to: [80], roles: ["TRADE_TM", "TRADE_LONG_JOB"], tracks: ["RFW"] },
  { from: [79, 80], to: [81, 94], roles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"], tracks: ["RFW"] },
  { from: [78, 79, 80, 81], to: [79, 80, 81, 94], roles: ["ESA_DO", "ESA_IM", "ESA_TO", "ESA_TM", "ESA_LONG_JOB"], tracks: ["RFW"] },
  { from: [78, 79, 80, 81], to: [78], roles: ["ESA_TO", "ESA_TM", "ESA_DO", "ESA_IM", "ESA_LONG_JOB"], tracks: ["RFW"] },
  { from: [94], to: [95], roles: ["TRADE_TM", "TRADE_LONG_JOB"], tracks: ["RFW"] },
  { from: [95], to: [96], roles: ["TRADE_CM", "TRADE_LONG_JOB"], tracks: ["RFW"] },
  { from: [96], to: [97], roles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"], tracks: ["RFW"] },
  { from: [97], to: [98], roles: ["ESA_TO"], tracks: ["RFW"] },
  { from: [98], to: [99], roles: ["ESA_TO", "ESA_CCM", "ESA_LONG_JOB"], tracks: ["RFW"] },
  { from: [99], to: [100], roles: ["TRADE_CM", "TRADE_TM", "TRADE_LONG_JOB"], tracks: ["RFW"] },
];

export function isNormalLjTransition(from: number, to: number, track: string, roles: readonly UserRole[], isAdmin: boolean): boolean {
  return rules.some((rule) => rule.from.includes(from) && rule.to.includes(to) &&
    (!rule.tracks || rule.tracks.includes(track)) && (isAdmin || rule.roles.some((role) => roles.includes(role))));
}

export function isNormalLjShortcut(from: number, to: number, track: string, description: string, roles: readonly UserRole[], isAdmin: boolean): boolean {
  const shortcutRoles: readonly UserRole[] = ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_CCM", "TRADE_TM", "TRADE_CM"];
  return from === 0 && to === 10 && (track === "RFQ" || track === "RFW") &&
    description === `${track} stage 10%` && (isAdmin || shortcutRoles.some((role) => roles.includes(role)));
}

export function ljStatus(percentage: number): string {
  return percentage === 100 ? "Closed" : percentage === 27 || percentage === 29 ? "Cancelled" :
    percentage >= 78 ? "Technically Completed" : percentage === 55 || percentage === 31 ? "On Hold" : "In Progress";
}

const normalDescriptions: Record<number, readonly string[]> = {
  20: ["Quotation Preparation Offer by Contractor", "RFQ stage 20%"],
  21: ["Quotation Preparation Offer by Trade", "RFQ stage 21%"],
  23: ["Quotation Not Accepted by ESA-TM. Review by Contractor", "Request for Work Review", "RFQ stage 23%"],
  25: ["Submitted for Acceptance", "RFQ stage 25%"],
  26: ["Submitted to User for Acceptance", "RFQ stage 26%"],
  27: ["Cancelled"], 28: ["Quotation Accepted", "RFQ stage 28%"],
  29: ["Quotation Rejected", "Request for Work Rejected"],
  30: ["Request for Work", "Converted RFQ to RFW", "RFW stage 30%"],
  31: ["On Hold for Budget"], 32: ["Approved and Ordered", "RFW stage 32%"],
  40: ["Committed", "Commit"], 50: ["Work In Progress", "Work Execution / Resume Work"],
  55: ["On Hold for Access / Labor / Parts", "On Hold for Access", "On Hold for Labor", "On Hold for Parts"],
  78: ["Technically Completed"], 79: ["Pre-SAT Approved"],
  94: ["All Acceptances Completed", "All acceptance gates waived"],
  95: ["Completed", "95% Completed - Cost Info + Customer Feedback by TRADE_TM"],
  96: ["Yellow Page Signed", "96% Sign Yellow Page by TRADE_CM"],
  97: ["Costs Approved", "97% Approve Costs by ESA_TO/ESA_TM"],
  98: ["Final Approval", "98% Final Approval by ESA_TO"],
  99: ["Invoice Information Confirmed", "99% Confirm Invoice Information by ESA_TO/ESA_CCM"],
  100: ["Payment Confirmed", "100% Confirm Payment by TRADE_CM/TRADE_TM"],
};

export function isNormalLjStageDetails(old: Record<string, unknown>, next: Record<string, unknown>, roles: readonly UserRole[], isAdmin: boolean): boolean {
  const from = Number(old.Percentage);
  const to = Number(next.Percentage);
  const description = String(next.WorkRequestSubstatus ?? "");
  const expectedStatus = to === 100 ? "Closed" : to >= 78 ? "Technically Completed" : to === 27 ? "Cancelled" : "In Progress";
  if (next.WorkRequestStatus !== expectedStatus) return false;
  const allowed = (required: readonly UserRole[]) => isAdmin || required.some((role) => roles.includes(role));
  if (from === 100 && to === 100 && description === "100% archived")
    return !old.ArchivedAt && typeof next.ArchivedAt === "string" && allowed(["ESA_TO", "ESA_LJM", "ESA_LONG_JOB"]);
  const track = typeof old.ProcessTrack === "string" ? old.ProcessTrack : from >= 30 ? "RFW" : "RFQ";
  if (isNormalLjShortcut(from, to, track, description, roles, isAdmin)) return true;
  if (description === "Pre-SAT Approved")
    return from >= 78 && from <= 81 && to === Math.max(79, from) && old.RequiresSAT === true &&
      old.PreSATApproved !== true && next.PreSATApproved === true && allowed(["TRADE_TM", "TRADE_LONG_JOB"]);
  const required = [["RequiresSAT", "SAT"], ["RequiresDrawingUpdate", "DrawingEngineering"], ["RequiresInventoryUpdate", "CIFMInventory"]] as const;
  const asGate = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
  const before = (Array.isArray(old.AcceptanceGates) ? old.AcceptanceGates : []).map(asGate);
  const after = (Array.isArray(next.AcceptanceGates) ? next.AcceptanceGates : []).map(asGate);
  const gate = description.match(/^(SAT|DrawingEngineering|CIFMInventory)( approved|: (ReviewRequested|InvitationSent))$/);
  const approvedType = description === "All Acceptances Completed"
    ? required.find(([, type]) => before.find((item) => item.GateType === type)?.Status !== "Approved" &&
      after.find((item) => item.GateType === type)?.Status === "Approved")?.[1]
    : gate?.[2] === " approved" ? gate[1] : undefined;
  if (description === "All Acceptances Completed" && !approvedType) return false;
  const changedType = approvedType ?? gate?.[1];
  if (changedType) {
    if (from < 78 || from > 81) return false;
    const item = required.find(([, type]) => type === changedType);
    if (!item || old[item[0]] !== true) return false;
    const previous = before.find((entry) => entry.GateType === changedType);
    const current = after.find((entry) => entry.GateType === changedType);
    if (!current || previous?.Status === "Approved" ||
      JSON.stringify(before.filter((entry) => entry.GateType !== changedType)) !== JSON.stringify(after.filter((entry) => entry.GateType !== changedType))) return false;
    if (changedType === "SAT" && old.PreSATApproved !== true) return false;
    if (approvedType) {
      const approvers: UserRole[] = ["ESA_TO", "ESA_TM", "ESA_LONG_JOB", ...(changedType === "DrawingEngineering" ? ["ESA_DO" as const] : changedType === "CIFMInventory" ? ["ESA_IM" as const] : [])];
      if (!allowed(approvers) || current.Status !== "Approved" || (changedType === "SAT" && previous?.Status !== "InvitationSent")) return false;
      const complete = required.every(([flag, type]) => old[flag] !== true || after.some((entry) => entry.GateType === type && entry.Status === "Approved"));
      return complete ? to === 94 && description === "All Acceptances Completed" :
        to === (changedType === "SAT" ? 81 : Math.max(79, from)) && description === `${changedType} approved`;
    }
    const status = gate?.[3];
    if (previous?.Status === status || current.Status !== status) return false;
    return status === "InvitationSent"
      ? to === 80 && allowed(["TRADE_TM", "TRADE_LONG_JOB"])
      : status === "ReviewRequested" && to === Math.max(78, from) && allowed(["ESA_TO", "ESA_TM", "ESA_DO", "ESA_IM", "ESA_LONG_JOB"]);
  }
  if (description === "All acceptance gates waived")
    return from >= 50 && from <= 55 && to === 94 && required.every(([flag]) => old[flag] !== true);
  if (from === to) return false;
  return (normalDescriptions[to] ?? []).includes(description);
}
