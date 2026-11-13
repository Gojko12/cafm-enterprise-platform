import type { BaseWorkRequest, PM_ScheduleStep } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";

type ChecklistState = Pick<DemoData, "schedules" | "blueprints">;

export function getChecklistSteps(wr: BaseWorkRequest, state: ChecklistState): PM_ScheduleStep[] {
  if (wr.ChecklistSteps?.length) return wr.ChecklistSteps;
  if (wr.ChecklistInstances?.length) return wr.ChecklistInstances.map((step) => ({ ...step, IsRequired: true }));
  const schedule = state.schedules.find((item) => item.ScheduleId === wr.ScheduleId && item.SiteId === wr.SiteId);
  return state.blueprints.find((item) => item.ChecklistCode === (wr.ChecklistStandardCode ?? schedule?.ChecklistCode) &&
    (!item.SiteId || item.SiteId === wr.SiteId))?.Steps ?? [];
}

export function getChecklistFinding(wr: BaseWorkRequest, stepId: string): "Favourable" | "Unfavourable" | undefined {
  const result = wr.ChecklistResults?.find((item) => item.stepId === stepId);
  if (result) return result.passed ? "Favourable" : "Unfavourable";
  const instance = wr.ChecklistInstances?.find((item) => item.StepId === stepId);
  if (instance?.IsCompleted) return instance.IsFailed ? "Unfavourable" : "Favourable";
  const todo = wr.todoSteps?.find((item) => item.id === stepId);
  if (todo?.completed && todo.isFavourable !== undefined) return todo.isFavourable ? "Favourable" : "Unfavourable";
}

export function getUnfavourableStepCount(wr: BaseWorkRequest, state: ChecklistState): number {
  const ids = new Set([
    ...getChecklistSteps(wr, state).map((step) => step.StepId),
    ...(wr.ChecklistResults ?? []).map((item) => item.stepId),
    ...(wr.todoSteps ?? []).map((item) => item.id),
  ]);
  return [...ids].filter((id) => getChecklistFinding(wr, id) === "Unfavourable").length;
}

export function getChecklistProgress(wr: BaseWorkRequest, state: ChecklistState) {
  const requiredSteps = getChecklistSteps(wr, state).filter((step) => step.IsRequired !== false);
  const todoSteps = wr.todoSteps ?? [];
  const steps = requiredSteps.length ? requiredSteps : todoSteps;
  const incomplete = steps.filter((step) => {
    if ("StepId" in step) {
      const result = wr.ChecklistResults?.find((item) => item.stepId === step.StepId);
      if (!result) return !wr.ChecklistInstances?.find((item) => item.StepId === step.StepId)?.IsCompleted;
      const empty = typeof result.value === "string" ? !result.value.trim() :
        Array.isArray(result.value) ? result.value.length === 0 : false;
      return empty || !result.passed && (
        step.RequiresCommentOnFailure !== false && !result.comment?.trim() ||
        step.RequiresPhotoOnFailure !== false && !result.photoPaths?.length
      );
    }
    return !step.completed;
  });
  return { total: steps.length, completed: steps.length - incomplete.length, incomplete };
}

export function getFollowUpFJsForPM(pmWrId: string, allWorkRequests: BaseWorkRequest[]): BaseWorkRequest[] {
  const pm = allWorkRequests.find((wr) => wr.WR_ID === pmWrId && wr.WR_Type === "PM");
  return allWorkRequests.filter((wr) => wr.WR_Type === "FJ" && (!pm || wr.SiteId === pm.SiteId) &&
    ([wr.ParentPM_WR_ID, wr.ParentWR_ID, wr.parentWrId, wr.sourcePmWrId, wr.OriginWR_ID, wr.OriginatingWR_ID].includes(pmWrId) ||
      pm?.FollowUpFJIds?.includes(wr.WR_ID)));
}

export function getParentPM(wr: BaseWorkRequest, allWorkRequests: BaseWorkRequest[]): BaseWorkRequest | undefined {
  if (wr.WR_Type !== "FJ") return undefined;
  const ids = [wr.ParentPM_WR_ID, wr.ParentWR_ID, wr.parentWrId, wr.sourcePmWrId, wr.OriginWR_ID, wr.OriginatingWR_ID];
  return allWorkRequests.find((pm) => pm.WR_Type === "PM" && pm.SiteId === wr.SiteId &&
    (ids.includes(pm.WR_ID) || pm.FollowUpFJIds?.includes(wr.WR_ID)));
}

export type SignalTab = "Checklist - Smart PM" | "PM Follow-up";
