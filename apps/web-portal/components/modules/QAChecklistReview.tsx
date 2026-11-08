"use client";

import React, { useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useQAActions } from "@/lib/use-qa-actions";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { canInspectWR } from "@/lib/qa-settings";
import { isQACompleted, qaStatus } from "@/lib/qa-audits";

export function QAChecklistReview({ wr }: { wr: BaseWorkRequest }) {
  const { annotateStep } = useQAActions();
  const { data } = useCafmStore();
  const { activePerson } = useSiteContext();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (wr.WR_Type !== "PM" || (!isQACompleted(wr) && qaStatus(wr) === "None")) return null;
  const allowed = canInspectWR(activePerson, wr, data.qaInspectorAssignments) && qaStatus(wr) === "ToBeInspected";
  const steps = [...(wr.ChecklistSteps ?? []), ...(wr.ChecklistInstances ?? []).filter((instance) => !(wr.ChecklistSteps ?? []).some((step) => step.StepId === instance.StepId))];
  return <section className="space-y-2 rounded border bg-white p-3">
    <h3 className="font-bold">Execution review · Checklist</h3>
    {!steps.length && <p>No checklist steps recorded.</p>}
    {steps.map((step) => {
      const result = wr.ChecklistResults?.find((item) => item.stepId === step.StepId);
      const instance = wr.ChecklistInstances?.find((item) => item.StepId === step.StepId);
      const value = result?.value ?? instance?.ValueNumeric ?? instance?.ValueBoolean ?? instance?.ValueText ?? instance?.SelectedOptionIds?.join(", ") ?? "—";
      const finding = [...(wr.ChecklistHistory ?? [])].reverse().find((entry) => entry.actionType === "QA inspector finding" && entry.stepReference === step.StepId);
      const photos = result?.photoPaths ?? (instance?.PhotoIds ?? []).map((id) => wr.Attachments?.find((item) => item.id === id)?.dataUrl).filter((url): url is string => !!url);
      return <div key={step.StepId} className="space-y-1 border-t py-2">
        <strong>{step.Title}</strong><p>Technician answer / measurement: {String(value)} {instance?.Unit ?? step.Unit ?? ""} · {result ? (result.passed ? "Favourable" : "Unfavourable") : instance?.IsCompleted ? (instance.IsFailed ? "Unfavourable" : "Favourable") : "Not answered"}</p>
        {(result?.comment || instance?.TechnicianComment) && <p>Technician comment: {result?.comment ?? instance?.TechnicianComment}</p>}
        {photos.map((photo, index) => <a key={index} className="mr-2 underline" href={photo} target="_blank" rel="noreferrer">Step photo {index + 1}</a>)}
        {finding && <p>Latest finding ({finding.performedBy}, {finding.timestamp}): {finding.details}</p>}
        {allowed && <><label className="block">Inspector finding <textarea className="block w-full border p-1" value={drafts[step.StepId] ?? ""} onChange={(e) => setDrafts((old) => ({ ...old, [step.StepId]: e.target.value }))} /></label>
        <button disabled={busy || !drafts[step.StepId]?.trim()} onClick={() => { setBusy(true); setError(""); void annotateStep(wr.WR_ID, step.StepId, drafts[step.StepId]).then(() => setDrafts((old) => ({ ...old, [step.StepId]: "" }))).catch((problem: unknown) => setError(problem instanceof Error ? problem.message : "Could not save finding.")).finally(() => setBusy(false)); }}>Save finding</button></>}
      </div>;
    })}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </section>;
}
