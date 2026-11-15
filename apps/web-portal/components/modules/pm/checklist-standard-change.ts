import { WR_Statuses } from "@cafm/shared-schema";
import type { BaseWorkRequest, PM_ChecklistStandard } from "@cafm/shared-schema";

/** Severity tier of an issued-WR checklist standard replacement (Section 82). */
export type ChecklistChangeTier = "issued" | "technicallyCompleted" | "closed";

export function checklistChangeTier(wr: Pick<BaseWorkRequest, "Percentage">): ChecklistChangeTier | null {
  if (wr.Percentage === 50 || wr.Percentage === 55) return "issued";
  if (wr.Percentage === 78) return "technicallyCompleted";
  if (wr.Percentage === 100) return "closed";
  return null;
}

/** Checklist answers that actually carry a value (empty strings / empty arrays do not count). */
export function answeredChecklistCount(wr: BaseWorkRequest): number {
  return (wr.ChecklistResults ?? []).filter((item) =>
    !(typeof item.value === "string" && !item.value.trim()) && !(Array.isArray(item.value) && !item.value.length)).length;
}

export function hasIssuedStatusConfig(wr: Pick<BaseWorkRequest, "ESAWorkType">): boolean {
  return WR_Statuses.some((item) => item.Percentage === 50 && item.ESAWorkType === wr.ESAWorkType);
}

export interface ChecklistChangeOptions {
  tier: ChecklistChangeTier;
  reason: string;
  actorName: string;
  previousTitle: string;
  answered: number;
  total: number;
}

/**
 * Replace the checklist standard on a WR: archive the prior results summary into
 * ChecklistHistory, install the new blueprint with fresh unanswered results, and —
 * for 78% / 100% WRs — reopen the WR to 50% Issued routed to PM rework.
 */
export function applyChecklistStandardChange(
  current: BaseWorkRequest, selected: PM_ChecklistStandard, options: ChecklistChangeOptions,
): BaseWorkRequest {
  const { tier, reason, actorName, previousTitle, answered, total } = options;
  const now = new Date().toISOString();
  const actionType = tier === "issued" ? "Checklist standard replaced"
    : tier === "technicallyCompleted" ? "78% completion invalidated: checklist standard replaced"
      : "100% closure revoked: checklist standard replaced";
  const next: BaseWorkRequest = {
    ...current,
    ChecklistStandardCode: selected.ChecklistCode,
    ChecklistSteps: selected.Steps,
    ChecklistResults: [],
    ChecklistCompleted: false,
    ChecklistIncompleteOverride: undefined,
    ChecklistHistory: [...(current.ChecklistHistory ?? []), {
      id: crypto.randomUUID(), timestamp: now, performedBy: actorName, actionType,
      details: `${previousTitle} (${answered}/${total} steps answered, archived) -> ${selected.Title} (${selected.Steps.length} steps). Reason: ${reason}`,
    }],
  };
  if (tier === "issued") return next;
  const issued = WR_Statuses.find((item) => item.Percentage === 50 && item.ESAWorkType === current.ESAWorkType);
  if (!issued) throw new Error(`No 50% WR_Statuses configuration exists for ${current.ESAWorkType}.`);
  return {
    ...next,
    Percentage: 50,
    WorkRequestStatus: issued.WorkRequestStatus,
    WorkRequestSubstatus: issued.WorkRequestSubstatus,
    IsFrozen: false,
    QA_InspectionStatus: "ToBeCorrected",
    AuditInspectionStatus: "PM WRs to be corrected",
    ...(tier === "closed" ? { ClosedAt: undefined } : {}),
    ReopenCount: (current.ReopenCount ?? 0) + 1,
    ReopenedHistory: [...(current.ReopenedHistory ?? []), {
      reopenedAt: now, fromPercentage: current.Percentage, toPercentage: 50, reason, actor: actorName,
    }],
  };
}

/** Activity / AuditLog text for a checklist standard replacement. */
export function checklistChangeLogText(
  tier: ChecklistChangeTier, previousTitle: string, selected: PM_ChecklistStandard, reason: string, answered: number, total: number,
): string {
  const prefix = tier === "issued" ? "Checklist standard replaced"
    : tier === "technicallyCompleted"
      ? `78% Technically Completed sign-off (${answered}/${total} steps) invalidated and WR reopened to 50% (PM WRs to be corrected); checklist standard replaced`
      : `100% Closed record revoked (ClosedAt cleared, signed-off ${answered}/${total} steps archived to AuditLog & ChecklistHistory) and WR reopened to 50% for re-execution; checklist standard replaced`;
  return `${prefix}: ${previousTitle} -> ${selected.Title} (${selected.Steps.length} steps). Reason: ${reason}`;
}
