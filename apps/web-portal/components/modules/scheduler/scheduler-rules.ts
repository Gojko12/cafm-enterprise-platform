import type { BaseWorkRequest } from "@cafm/shared-schema";

export function isWrTerminal(wr: Pick<BaseWorkRequest, "Percentage">) {
  return wr.Percentage === 27 || wr.Percentage === 29 || wr.Percentage >= 78;
}

export function schedulabilityReason(wr: Pick<BaseWorkRequest, "WR_ID" | "WR_Type" | "Percentage" | "WorkRequestStatus">) {
  const allowed = wr.WR_Type === "LJ" ? "only active 40%–55% Long Jobs can be scheduled"
    : "only active 50% or 55% work requests can be scheduled";
  if (wr.Percentage === 27 || wr.Percentage === 29) {
    return `Work Request is ${wr.Percentage}% ${wr.WorkRequestStatus || "Cancelled"}.`;
  }
  if (wr.Percentage >= 78) {
    return `Work Request is already ${wr.Percentage}% ${wr.WorkRequestStatus || "completed"}.`;
  }
  if (wr.WR_Type === "LJ" && (wr.Percentage < 40 || wr.Percentage > 55)) {
    return `Long Job is at ${wr.Percentage}% ${wr.WorkRequestStatus}; ${allowed}.`;
  }
  if ((wr.WR_Type === "PM" || wr.WR_Type === "FJ") && wr.Percentage !== 50 && wr.Percentage !== 55) {
    return `Work Request is at ${wr.Percentage}% ${wr.WorkRequestStatus}; ${allowed}.`;
  }
  return wr.WR_Type === "LJ" || wr.WR_Type === "PM" || wr.WR_Type === "FJ"
    ? null
    : `Unsupported work request type ${wr.WR_Type}.`;
}

export function isWrSchedulable(wr: Pick<BaseWorkRequest, "WR_ID" | "WR_Type" | "Percentage" | "WorkRequestStatus">) {
  return schedulabilityReason(wr) === null;
}

export function cannotScheduleMessage(wr: Pick<BaseWorkRequest, "WR_ID" | "WR_Type" | "Percentage" | "WorkRequestStatus">) {
  const reason = schedulabilityReason(wr);
  return reason ? `Cannot schedule WR ${wr.WR_ID}: ${reason}` : "";
}
