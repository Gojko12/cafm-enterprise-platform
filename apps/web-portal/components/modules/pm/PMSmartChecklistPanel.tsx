import React from "react";
import type { BaseWorkRequest, PM_ChecklistStandard, PM_ScheduleStep } from "@cafm/shared-schema";
import { FrequencyPill } from "@/components/common/PmFrequency";
import { getChecklistFinding } from "@/lib/wr-signals";

interface Props {
  canDefineChecklistPM: boolean | undefined;
  checklistStandard: string;
  chooseChecklist: (code: string) => void;
  blueprints: PM_ChecklistStandard[];
  workRequest: BaseWorkRequest;
  blueprint: PM_ChecklistStandard | undefined;
  checklistSteps: PM_ScheduleStep[];
  setExecutorOpen: (open: boolean) => void;
  stepFilter: string;
  setStepFilter: (value: string) => void;
  stepCompletionFilter: string;
  setStepCompletionFilter: (value: string) => void;
}

export function PMSmartChecklistPanel({ canDefineChecklistPM, checklistStandard, chooseChecklist, blueprints, workRequest, blueprint, checklistSteps, setExecutorOpen, stepFilter, setStepFilter, stepCompletionFilter, setStepCompletionFilter }: Props) {
  return (
<section className="space-y-4 rounded border bg-white p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              {canDefineChecklistPM ? <label className="block text-sm font-medium">Checklist Standard
                <select aria-label="Checklist Standard" value={checklistStandard}
                  onChange={(event) => chooseChecklist(event.target.value)}
                  className="mt-1 block min-w-64 rounded border px-3 py-2">
                  <option value="">Select checklist standard</option>
                  {blueprints.filter((item) => !item.SiteId || item.SiteId === workRequest.SiteId)
                    .map((item) => <option key={item.ChecklistCode} value={item.ChecklistCode}>{item.Title}</option>)}
                </select>
              </label> : <p className="text-sm">Checklist Standard: {blueprint?.Title ?? checklistStandard ?? "Not selected"}</p>}
              <button type="button" disabled={!checklistSteps.length}
                onClick={() => setExecutorOpen(true)}
                className="rounded bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Execute Checklist</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <input aria-label="Filter checklist steps" value={stepFilter}
                onChange={(event) => setStepFilter(event.target.value)} placeholder="Filter checklist steps..."
                className="rounded border px-3 py-2" />
              <select aria-label="Filter completed checklist steps" value={stepCompletionFilter}
                onChange={(event) => setStepCompletionFilter(event.target.value)} className="rounded border px-3 py-2">
                <option value="all">All completion states</option><option value="yes">Is completed: Yes</option><option value="no">Is completed: No</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-slate-50"><tr>
                  {["Sequence", "Checklist step", "Expected value Unit", "Measured value", "Is completed", "Craftperson comment", "Result"].map((title) => <th key={title} className="p-3">{title}</th>)}
                </tr></thead>
                <tbody>{checklistSteps.filter((step) => {
                  const answer = workRequest.ChecklistResults?.find((item) => item.stepId === step.StepId);
                  const isComplete = !!getChecklistFinding(workRequest, step.StepId);
                  return `${step.Title} ${step.StepId}`.toLowerCase().includes(stepFilter.toLowerCase()) &&
                    (stepCompletionFilter === "all" || (stepCompletionFilter === "yes") === isComplete);
                }).map((step, index) => {
                  const answer = workRequest.ChecklistResults?.find((item) => item.stepId === step.StepId);
                  const finding = getChecklistFinding(workRequest, step.StepId);
                  const shownValue = answer
                    ? Array.isArray(answer.value) ? answer.value.join(", ") : String(answer.value)
                    : "—";
                  const originSteps = checklistSteps.filter((item) => item.originFrequency === step.originFrequency);
                  const sectionStart = originSteps[0]?.StepId === step.StepId;
                  return <React.Fragment key={step.StepId}>{sectionStart && step.originFrequency && <tr className="bg-slate-100"><th colSpan={7} className="p-3"><FrequencyPill code={step.originFrequency} /> {step.isInherited ? "Included routine checks (inherited)" : "Additional maintenance checks"} · {originSteps.length} steps</th></tr>}<tr className="border-t">
                    <td className="p-3">{index + 1}</td><td className="p-3"><FrequencyPill code={step.originFrequency} inherited={step.isInherited} /> {step.Title}{step.replacesStepLabel && <p className="text-xs text-amber-800">{step.replacesStepLabel}</p>}{(answer?.lastCorrectedBy || step.lastCorrectedBy) && <p className="text-xs text-amber-800" title={answer?.lastCorrectedAt ?? step.lastCorrectedAt}>✎ Corrected by {answer?.lastCorrectedBy ?? step.lastCorrectedBy}</p>}</td>
                    <td className="p-3">{step.Unit ? `${step.MinThreshold ?? "—"}–${step.MaxThreshold ?? "—"} ${step.Unit}` : step.Unit ?? "—"}</td>
                    <td className="p-3">{shownValue}</td><td className="p-3">{finding ? "Yes" : "No"}</td>
                    <td className="p-3">{answer?.comment ?? "—"}</td>
                    <td className="p-3">
                      {finding && <span className={`rounded px-2 py-1 text-xs font-semibold ${finding === "Favourable" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        {finding}
                      </span>}
                      {answer?.photoPaths?.map((photo) => <img key={photo} src={photo} alt={`Failure evidence for ${step.Title}`} className="mt-2 max-h-20 max-w-32 rounded object-cover" />)}
                    </td>
                  </tr></React.Fragment>;
                })}
                {!checklistSteps.length && <tr><td colSpan={7} className="p-5 text-center text-slate-500">No checklist steps are available.</td></tr>}
              </tbody></table>
            </div>
          </section>
  );
}
