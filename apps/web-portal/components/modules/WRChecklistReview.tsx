"use client";

import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { getChecklistFinding, getChecklistSteps } from "@/lib/wr-signals";

export function WRChecklistReview({ wr }: { wr: BaseWorkRequest }) {
  const { data } = useCafmStore();
  const steps = getChecklistSteps(wr, data);
  const rows = new Map(steps.map((step) => [step.StepId, step.Title]));
  for (const step of wr.todoSteps ?? []) rows.set(step.id, step.title);
  for (const result of wr.ChecklistResults ?? []) if (!rows.has(result.stepId)) rows.set(result.stepId, result.stepId);
  return <section className="space-y-3 rounded border bg-white p-4"><h3 className="font-semibold">Checklist - Smart PM</h3>
    {[...rows].map(([id, title]) => {
      const finding = getChecklistFinding(wr, id);
      const result = wr.ChecklistResults?.find((item) => item.stepId === id);
      const todo = wr.todoSteps?.find((item) => item.id === id);
      return <article key={id} className="space-y-1 rounded border p-3"><strong>{title}</strong>
        {(result?.lastCorrectedBy || todo?.lastCorrectedBy) && <p className="text-xs text-amber-800" title={`${result?.lastCorrectedAt ?? todo?.lastCorrectedAt}; previous value: ${String(result?.previousValue ?? todo?.previousValue)}`}>✎ Corrected by {result?.lastCorrectedBy ?? todo?.lastCorrectedBy}</p>}
        <p>{result ? String(result.value) : todo?.completed ? "Completed" : "Not answered"}</p>
        {finding && <span className={`inline-block rounded px-2 py-1 text-xs font-semibold ${finding === "Unfavourable" ? "bg-rose-100 text-rose-900" : "bg-emerald-100 text-emerald-900"}`}>{finding}</span>}
        <p>{result?.comment ?? todo?.technicianComment}</p>
        {(result?.photoPaths ?? todo?.photoUrls)?.map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt={`Evidence for ${title}`} className="max-h-32 rounded" /></a>)}
      </article>;
    })}
    {!rows.size && <p>No checklist recorded.</p>}
  </section>;
}
