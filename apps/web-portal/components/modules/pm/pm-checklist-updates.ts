import type { BaseWorkRequest, PM_ScheduleStep } from "@cafm/shared-schema";

export type ChecklistResult = NonNullable<BaseWorkRequest["ChecklistResults"]>[number];
export interface ChecklistActor { actorId: string; actorName: string; actorRole: string }

export const checklistHistoryEntry = (performedBy: string, actionType: string, details: string, stepReference?: string, timestamp = new Date().toISOString()) => ({
  id: crypto.randomUUID(),
  timestamp,
  performedBy,
  actionType,
  ...(stepReference ? { stepReference } : {}),
  details,
});

/** Records a single checklist step answer (or clears it) with audit, history and activity logs. */
export function applyChecklistResult(current: BaseWorkRequest, result: ChecklistResult | null, stepId: string, checklistSteps: PM_ScheduleStep[], actor: ChecklistActor, now: string): BaseWorkRequest {
  const previous = current.ChecklistResults?.find((item) => item.stepId === stepId);
  if (result && previous && JSON.stringify(previous) === JSON.stringify(result)) return current;
  const step = checklistSteps.find((item) => item.StepId === stepId);
  const action = result ? "Step answer updated" : "Step answer cleared";
  const detail = result
    ? `${step?.Title ?? stepId} answered (${result.passed ? "favourable" : "unfavourable"})`
    : `${step?.Title ?? stepId} answer cleared`;
  const auditValue = (value: ChecklistResult | undefined) => value && ({
    ...value,
    photoPaths: value.photoPaths?.map(() => "Photo attached"),
  });
  const audit = result ? [{
    AuditLogId: crypto.randomUUID(),
    StepInstanceId: `${current.WR_ID}:${stepId}`,
    WR_ID: current.WR_ID,
    ActorId: actor.actorId,
    Action: "modified" as const,
    ...(previous ? { PreviousValue: auditValue(previous) } : {}),
    NewValue: auditValue(result),
    OccurredAt: now,
  }] : [{
    AuditLogId: crypto.randomUUID(),
    StepInstanceId: `${current.WR_ID}:${stepId}`,
    WR_ID: current.WR_ID,
    ActorId: actor.actorId,
    Action: "reopened" as const,
    ...(previous ? { PreviousValue: auditValue(previous) } : {}),
    OccurredAt: now,
  }];
  return {
    ...current,
    ChecklistCompleted: false,
    ChecklistResults: [
      ...(current.ChecklistResults ?? []).filter((item) => item.stepId !== stepId),
      ...(result ? [result] : []),
    ],
    StepAuditLogs: [...(current.StepAuditLogs ?? []), ...audit],
    ChecklistHistory: [
      ...(current.ChecklistHistory ?? []),
      checklistHistoryEntry(actor.actorName, action, detail, stepId, now),
    ],
    Activity: [...(current.Activity ?? []), {
      id: crypto.randomUUID(),
      kind: "log" as const,
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorRole: actor.actorRole,
      createdAt: now,
      text: `${detail} by ${actor.actorName}`,
    }],
  };
}

/** Marks the checklist finished, stamping completed-step audit logs and history. */
export function applyChecklistFinish(current: BaseWorkRequest, results: ChecklistResult[], completedInstances: BaseWorkRequest["ChecklistInstances"], totalSteps: number, actor: ChecklistActor, now: string): BaseWorkRequest {
  return {
    ...current,
    ChecklistCompleted: true,
    ChecklistResults: results,
    ChecklistInstances: completedInstances,
    StepAuditLogs: [
      ...(current.StepAuditLogs ?? []),
      ...(completedInstances ?? []).filter((step) => step.IsCompleted).map((step) => ({
        AuditLogId: crypto.randomUUID(),
        StepInstanceId: step.StepInstanceId,
        WR_ID: current.WR_ID,
        ActorId: actor.actorId,
        Action: "completed" as const,
        OccurredAt: now,
      })),
    ],
    ChecklistHistory: [
      ...(current.ChecklistHistory ?? []),
      checklistHistoryEntry(actor.actorName, "Checklist completed", `${results.length} of ${totalSteps} steps answered`, undefined, now),
    ],
  };
}
