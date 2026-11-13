import type { BaseWorkRequest, PM_ChecklistStandard, PM_ScheduleStep } from "@cafm/shared-schema";

interface Props {
  workRequest: BaseWorkRequest;
  blueprint: PM_ChecklistStandard | undefined;
  checklistStandard: string;
  checklistSteps: PM_ScheduleStep[];
}

export function PMChecklistSummaryPanel({ workRequest, blueprint, checklistStandard, checklistSteps }: Props) {
  return (
<section className="space-y-3 rounded border bg-white p-4">
            <h3 className="font-semibold">Checklist summary</h3>
            <p className="text-sm text-slate-600">Standard: {blueprint?.Title ?? checklistStandard ?? "Not selected"}</p>
            {checklistSteps.map((step, index) => {
              const answer = workRequest.ChecklistResults?.find((item) => item.stepId === step.StepId);
              const measured = answer
                ? Array.isArray(answer.value) ? answer.value.join(", ") : String(answer.value)
                : "";
              const completed = !!answer && measured.trim() !== "";
              return <article key={step.StepId} className="rounded border p-3">
                <p className="font-medium">{index + 1}. {step.Title}</p>
                {(answer?.lastCorrectedBy || step.lastCorrectedBy) && <p className="text-xs text-amber-800" title={answer?.lastCorrectedAt ?? step.lastCorrectedAt}>✎ Corrected by {answer?.lastCorrectedBy ?? step.lastCorrectedBy}</p>}
                <p className="text-sm text-slate-600"><strong>Measured value:</strong> {measured || "Not answered"}</p>
                <p className="text-sm text-slate-600"><strong>Is completed:</strong> {completed ? "Yes" : "No"}</p>
                <p className="text-sm text-slate-600"><strong>Craftperson comment:</strong> {answer?.comment || "—"}</p>
                {answer && <span className={`mt-2 inline-block rounded px-2 py-1 text-xs font-semibold ${answer.passed
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"}`}>Result: {answer.passed ? "Favourable" : "Unfavourable"}</span>}
              </article>;
            })}
            {!checklistSteps.length && <p className="text-sm text-slate-500">No checklist standard is linked to this work request.</p>}
          </section>
  );
}
