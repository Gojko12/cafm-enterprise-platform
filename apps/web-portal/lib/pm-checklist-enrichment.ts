import type { BaseWorkRequest, PM_ChecklistStandard, PM_ScheduleStep } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";

const MIN_STEPS = 4;

const NUMERIC_BY_TRADE: Record<string, { Unit: string; MinThreshold: number; MaxThreshold: number }> = {
  Mechanical: { Unit: "bar", MinThreshold: 1, MaxThreshold: 6 },
  Electrical: { Unit: "V", MinThreshold: 207, MaxThreshold: 253 },
};
const NUMERIC_DEFAULT = { Unit: "°C", MinThreshold: 10, MaxThreshold: 35 };

const STANDARD: Array<{ title: string; instructions: string; numeric?: boolean }> = [
  { title: "Check operating indications and alarms", instructions: "Confirm there are no active alarms and indications are normal." },
  { title: "Inspect mechanical/electrical connections, seals, and visible wear", instructions: "Confirm there is no damage, leakage or visible wear." },
  { title: "Measure operating parameter & verify within normal threshold", instructions: "Record the reading and confirm it is within the stated range.", numeric: true },
  { title: "Verify safety interlocks, emergency stops, and labelling", instructions: "Test interlocks and emergency stops and confirm labels are legible." },
  { title: "Clean equipment housing & confirm normal automatic operation", instructions: "Clean the housing and confirm the unit returns to normal automatic operation." },
];

function extraSteps(existing: PM_ScheduleStep[], code: string, trade: string | undefined, frequency: string | undefined): PM_ScheduleStep[] {
  if (existing.length >= MIN_STEPS) return existing;
  const taken = new Set(existing.map((step) => step.StepId));
  const added: PM_ScheduleStep[] = [];
  for (let n = existing.length; n < STANDARD.length; n++) {
    const item = STANDARD[n];
    const StepId = `${code}-E${n + 1}`;
    if (taken.has(StepId)) continue;
    added.push({
      StepId, Title: item.title, SortOrder: n + 1, Options: [], IsRequired: true,
      RequiresPhotoOnFailure: true, RequiresCommentOnFailure: true, Instructions: item.instructions,
      ...(item.numeric
        ? { InputType: "Numeric" as const, ...(NUMERIC_BY_TRADE[trade ?? ""] ?? NUMERIC_DEFAULT) }
        : { InputType: "Boolean" as const, favourableBoolean: true }),
      ...(frequency ? { originFrequency: frequency, isInherited: false } : {}),
    } as PM_ScheduleStep);
  }
  return [...existing, ...added];
}

// Idempotent: only blueprints and open PM work requests with fewer than four steps are extended; existing steps and results are untouched.
export function withPmChecklistEnrichment(data: DemoData): DemoData {
  let changed = false;
  const blueprints = data.blueprints.map((bp: PM_ChecklistStandard) => {
    if (bp.Steps.length >= MIN_STEPS) return bp;
    changed = true;
    return { ...bp, Steps: extraSteps(bp.Steps, bp.ChecklistCode, bp.TradeId, bp.frequencyCode) };
  });
  const workRequests = data.workRequests.map((wr: BaseWorkRequest) => {
    const steps = wr.ChecklistSteps;
    if (wr.WR_Type !== "PM" || !steps || steps.length === 0 || steps.length >= MIN_STEPS || (wr.Percentage !== 50 && wr.Percentage !== 55)) return wr;
    changed = true;
    const code = wr.ChecklistStandardCode ?? wr.WR_ID;
    const next = extraSteps(steps, code, wr.TradeId, wr.pmFrequency);
    const added = next.slice(steps.length);
    const instances = [...(wr.ChecklistInstances ?? []), ...added.map((step) => ({
      ...step, StepInstanceId: `${wr.WR_ID}:${step.StepId}`, WR_ID: wr.WR_ID, ScheduleId: wr.ScheduleId ?? "",
      ChecklistCode: code, PhotoIds: [], IsFailed: false, IsCompleted: false,
    }))];
    return { ...wr, ChecklistSteps: next, ChecklistInstances: instances as BaseWorkRequest["ChecklistInstances"] };
  });
  return changed ? { ...data, blueprints, workRequests } : data;
}
