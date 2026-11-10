import type { BaseWorkRequest } from "./work-requests.js";

type Answer = NonNullable<BaseWorkRequest["ChecklistResults"]>[number];
export const checklistAnswerFingerprint = (answer: Answer | undefined) => JSON.stringify(answer ? [answer.value, answer.passed, answer.comment ?? "", answer.photoPaths ?? []] : null);
const answered = (answer: Answer) => Array.isArray(answer.value) ? answer.value.length > 0 : String(answer.value).trim() !== "";
const answers = (wr: BaseWorkRequest): Answer[] => wr.WR_Type === "PM" || !wr.todoSteps?.length ? wr.ChecklistResults ?? [] :
  wr.todoSteps.map((step) => ({ stepId: step.id, value: step.completed ? "true" : "", passed: step.isFavourable ?? true,
    completedAt: step.completedAt ?? wr.CreatedDate, comment: step.technicianComment, photoPaths: step.photoUrls }));
export function logChecklistCorrections(before: BaseWorkRequest, after: BaseWorkRequest, actor: string, timestamp: string): BaseWorkRequest {
  if (after.ChecklistResults) after = { ...after, ChecklistResults: after.ChecklistResults.map((result) => {
    const old = before.ChecklistResults?.find((item) => item.stepId === result.stepId);
    return old?.lastCorrectedBy ? { ...result, lastCorrectedBy: old.lastCorrectedBy, lastCorrectedAt: old.lastCorrectedAt, previousValue: old.previousValue } : result;
  }) };
  const corrections = answers(before).filter((old) => answered(old) && checklistAnswerFingerprint(old) !== checklistAnswerFingerprint(answers(after).find((item) => item.stepId === old.stepId)));
  if (!corrections.length) return after;
  const details = corrections.map((old) => {
    const next = answers(after).find((item) => item.stepId === old.stepId);
    const step = (after.ChecklistSteps ?? after.ChecklistInstances)?.find((item) => item.StepId === old.stepId) ??
      (before.ChecklistSteps ?? before.ChecklistInstances)?.find((item) => item.StepId === old.stepId);
    const todo = after.todoSteps?.find((item) => item.id === old.stepId) ?? before.todoSteps?.find((item) => item.id === old.stepId);
    const text = `[Checklist Correction] Step #${step?.SortOrder ?? todo?.order ?? old.stepId} '${step?.Title ?? todo?.title ?? old.stepId}': changed from '${String(old.value)}' (${old.passed ? "Favourable" : "Unfavourable"}) → '${next ? String(next.value) : "Cleared"}' (${next ? next.passed ? "Favourable" : "Unfavourable" : "Not answered"}) by ${actor}; comment: ${JSON.stringify(old.comment ?? "")} → ${JSON.stringify(next?.comment ?? "")}; photos: ${old.photoPaths?.length ?? 0} → ${next?.photoPaths?.length ?? 0}`;
    return { old, next, text };
  });
  const metadata = (id: string) => {
    const entry = details.find(({ old }) => old.stepId === id);
    return entry ? { lastCorrectedBy: actor, lastCorrectedAt: timestamp, previousValue: entry.old.value } : {};
  };
  return { ...after, UpdatedAt: timestamp, updatedAt: timestamp,
    ChecklistResults: after.ChecklistResults?.map((result) => ({ ...result, ...metadata(result.stepId) })),
    ChecklistInstances: after.ChecklistInstances?.map((step) => ({ ...step, ...metadata(step.StepId) })),
    ChecklistSteps: after.ChecklistSteps?.map((step) => ({ ...step, ...metadata(step.StepId) })),
    todoSteps: after.todoSteps?.map((step) => ({ ...step, ...metadata(step.id) })),
    Activity: [...(after.Activity ?? []), ...details.map(({ text }) => ({ id: crypto.randomUUID(), kind: "log" as const, actorId: actor, actorName: actor, actorRole: "ChecklistEditor", createdAt: timestamp, text }))],
    ChecklistHistory: [...(after.ChecklistHistory ?? []), ...details.map(({ old, text }) => ({ id: crypto.randomUUID(), timestamp, performedBy: actor, actionType: "Checklist Correction", stepReference: old.stepId, details: text }))],
    StepAuditLogs: [...(after.StepAuditLogs ?? []), ...details.map(({ old, next }) => ({ AuditLogId: crypto.randomUUID(), WR_ID: after.WR_ID, StepInstanceId: `${after.WR_ID}:${old.stepId}`, ActorId: actor, Action: "modified" as const, PreviousValue: old, NewValue: next ?? null, OccurredAt: timestamp }))],
  };
}
