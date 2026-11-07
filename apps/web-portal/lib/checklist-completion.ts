import { PM_WorkRequestStepSchema } from "@cafm/shared-schema";
import type { BaseWorkRequest, PM_WorkRequestStep } from "@cafm/shared-schema";

type Result = NonNullable<BaseWorkRequest["ChecklistResults"]>[number];

export function completeChecklistInstances(instances: PM_WorkRequestStep[], results: Result[],
  actorId: string, timestamp: string): PM_WorkRequestStep[] {
  return instances.map((instance) => {
    const result = results.find((entry) => entry.stepId === instance.StepId);
    if (!result || (typeof result.value === "string" && !result.value.trim()) ||
        (Array.isArray(result.value) && !result.value.length)) return instance;
    const values = Array.isArray(result.value) ? result.value : [result.value];
    const candidate: PM_WorkRequestStep = {
      ...instance,
      ValueBoolean: instance.InputType === "Boolean" ? result.value === "true" : undefined,
      ValueNumeric: instance.InputType === "Numeric" && typeof result.value === "number" ? result.value : undefined,
      ValueText: instance.InputType === "FreeText" && typeof result.value === "string" ? result.value : undefined,
      SelectedOptionIds: instance.InputType === "SingleSelect" || instance.InputType === "MultiSelect"
        ? values.map((value) => {
          const option = instance.Options.find((item) => item.Value === value);
          if (!option) throw new Error(`Unknown option in step ${instance.Title}.`);
          return option.OptionId;
        }) : undefined,
      PhotoIds: (result.photoPaths ?? []).map((_, index) => `ChecklistResults/${instance.StepId}/photoPaths/${index}`),
      TechnicianComment: result.comment, IsFailed: !result.passed, IsCompleted: true,
      CompletedBy: actorId, CompletedAt: timestamp,
    };
    const parsed = PM_WorkRequestStepSchema.safeParse(candidate);
    if (!parsed.success) throw new Error(`Invalid answer for ${instance.Title}: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
    return parsed.data;
  });
}
