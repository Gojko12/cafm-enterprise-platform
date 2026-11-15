import React, { useState } from "react";
import type { BaseWorkRequest, PM_ChecklistStandard, PM_ScheduleStep } from "@cafm/shared-schema";
import { FrequencyPill } from "@/components/common/PmFrequency";
import { getChecklistFinding } from "@/lib/wr-signals";
import { ChangeChecklistStandardModal } from "./ChangeChecklistStandardModal";
import { answeredChecklistCount, applyChecklistStandardChange, checklistChangeLogText, checklistChangeTier } from "./checklist-standard-change";

interface Props {
  canChangeIssuedWRChecklist: boolean | undefined;
  isSiteAdmin: boolean;
  actorName: string;
  checklistStandard: string;
  updateWorkRequest: (change: (current: BaseWorkRequest) => BaseWorkRequest, logText?: string) => void;
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

export function PMSmartChecklistPanel({ canChangeIssuedWRChecklist, isSiteAdmin, actorName, checklistStandard, updateWorkRequest, blueprints, workRequest, blueprint, checklistSteps, setExecutorOpen, stepFilter, setStepFilter, stepCompletionFilter, setStepCompletionFilter }: Props) {
  const [changeOpen, setChangeOpen] = useState(false);
  const cancelled = workRequest.Percentage === 27 || workRequest.Percentage === 29;
  const closed = workRequest.Percentage === 100;
  const tier = checklistChangeTier(workRequest);
  const currentTitle = blueprint ? `${blueprint.ChecklistCode} · ${blueprint.Title}` : checklistStandard || "No standard selected";
  const changeDisabledReason = cancelled ? "Cancelled Work Requests cannot be modified"
    : !canChangeIssuedWRChecklist ? "Only a Site Administrator or Team Leader can change the checklist standard on an issued Work Request"
      : closed && !isSiteAdmin ? "100% Closed Work Requests are sealed. Only a Site Administrator can override and reopen a 100% Closed checklist."
        : !tier ? `A ${workRequest.Percentage}% Work Request does not support checklist standard changes.` : "";
  const executeDisabledReason = closed || cancelled ? "Cannot execute checklist on a Closed or Cancelled Work Request." : "";
  const answered = answeredChecklistCount(workRequest);
  const confirmChange = (selected: PM_ChecklistStandard, reason: string) => {
    if (!tier) return;
    updateWorkRequest((current) => applyChecklistStandardChange(current, selected, {
      tier, reason, actorName, previousTitle: currentTitle, answered, total: checklistSteps.length,
    }), checklistChangeLogText(tier, currentTitle, selected, reason, answered, checklistSteps.length));
    setChangeOpen(false);
  };
  return (
<section className="space-y-4 rounded border bg-white p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-64 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Checklist Standard</p>
                <p className="text-sm font-semibold text-slate-900">{currentTitle}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-600">
                  {blueprint?.frequencyCode && <FrequencyPill code={blueprint.frequencyCode} />}{checklistSteps.length} steps
                </p>
                <button type="button" disabled={!!changeDisabledReason} title={changeDisabledReason || undefined}
                  aria-label={closed && isSiteAdmin ? "Override Closed Checklist" : "Change Standard"}
                  onClick={() => setChangeOpen(true)}
                  className={`mt-2 rounded border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${closed && isSiteAdmin && !changeDisabledReason ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}>
                  {closed && isSiteAdmin ? "Override Closed Checklist..." : "Change Standard..."}
                </button>
              </div>
              <button type="button" disabled={!checklistSteps.length || !!executeDisabledReason}
                title={executeDisabledReason || undefined}
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
            {changeOpen && <ChangeChecklistStandardModal workRequest={workRequest} blueprints={blueprints}
              currentBlueprint={blueprint} currentTitle={currentTitle} currentStepCount={checklistSteps.length}
              answeredCount={answered} onClose={() => setChangeOpen(false)} onConfirm={confirmChange} />}
          </section>
  );
}
