"use client";
import React, { useMemo, useState } from "react";
import type { BaseWorkRequest, PM_ChecklistStandard } from "@cafm/shared-schema";
import { FrequencyPill } from "@/components/common/PmFrequency";
import { checklistChangeTier, hasIssuedStatusConfig } from "./checklist-standard-change";

interface Props {
  workRequest: BaseWorkRequest;
  blueprints: PM_ChecklistStandard[];
  currentBlueprint: PM_ChecklistStandard | undefined;
  currentTitle: string;
  currentStepCount: number;
  answeredCount: number;
  onClose: () => void;
  onConfirm: (selected: PM_ChecklistStandard, reason: string) => void;
}

/**
 * Section 82 governance modal: replacing the Checklist Standard on an issued WR requires a
 * written reason and a 2-step reconfirmation, with escalating 78% / 100% safeguards.
 */
export function ChangeChecklistStandardModal({ workRequest, blueprints, currentBlueprint, currentTitle, currentStepCount, answeredCount, onClose, onConfirm }: Props) {
  const tier = checklistChangeTier(workRequest);
  const [selectedCode, setSelectedCode] = useState("");
  const [reason, setReason] = useState("");
  const [phase, setPhase] = useState<"select" | "review">("select");
  const [reopenConfirmed, setReopenConfirmed] = useState(false);
  const [sealWord, setSealWord] = useState("");
  const options = useMemo(() => blueprints.filter((item) =>
    (!item.SiteId || item.SiteId === workRequest.SiteId) && item.ChecklistCode !== currentBlueprint?.ChecklistCode),
  [blueprints, workRequest.SiteId, currentBlueprint?.ChecklistCode]);
  const selected = options.find((item) => item.ChecklistCode === selectedCode);
  if (!tier) return null;
  const closed = tier === "closed";
  const statusConfigMissing = tier !== "issued" && !hasIssuedStatusConfig(workRequest);
  const frequencyMismatch = !!selected?.frequencyCode && !!workRequest.pmFrequency && selected.frequencyCode !== workRequest.pmFrequency;
  const reasonValid = reason.trim().length >= 5;
  const gatesValid = reasonValid && !!selected && !statusConfigMissing &&
    (tier !== "technicallyCompleted" || reopenConfirmed) && (!closed || sealWord.trim() === "REOPEN");
  const confirmLabel = closed ? "Confirm & Reopen Closed WR" : tier === "technicallyCompleted" ? "Confirm & Reopen to 50%" : "Confirm & Replace Standard";
  const heading = closed ? "⛔ Override 100% Closed Checklist" : tier === "technicallyCompleted" ? "⚠️ Replace Checklist on a 78% Technically Completed WR" : "Change Checklist Standard";
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3" role="presentation">
    <section role="dialog" aria-modal="true" aria-label="Change Checklist Standard" className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <header className={`border-b px-4 py-3 ${closed ? "bg-rose-50" : tier === "technicallyCompleted" ? "bg-amber-50" : "bg-slate-50"}`}>
        <h2 className={`text-base font-bold ${closed ? "text-rose-900" : tier === "technicallyCompleted" ? "text-amber-900" : "text-slate-900"}`}>{heading}</h2>
        <p className="text-xs text-slate-600">{workRequest.WR_ID} · {workRequest.Percentage}% {workRequest.WorkRequestStatus} · Current: {currentTitle}</p>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {tier === "technicallyCompleted" && <div role="alert" className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-amber-900">
          <strong>78% Technically Completed Warning:</strong> technical completion was already signed off with <strong>{answeredCount}/{currentStepCount}</strong> checklist steps recorded.
          Replacing the checklist <strong>invalidates the 78% completion</strong>: the WR will be reopened to 50% (PM WRs to be corrected) and the new checklist must be executed.
        </div>}
        {closed && <div role="alert" className="rounded-lg border-2 border-rose-600 bg-rose-50 p-3 text-rose-900">
          <strong>CRITICAL AUDIT WARNING:</strong> this Work Request is <strong>100% Closed</strong>{workRequest.ClosedAt ? ` (ClosedAt stamped ${workRequest.ClosedAt.slice(0, 10)})` : ""}.
          Replacing its checklist <strong>revokes closure</strong>, archives the signed-off 100% record ({answeredCount}/{currentStepCount} steps) in the AuditLog and ChecklistHistory,
          clears ClosedAt, and reopens the WR to 50% for re-execution.
        </div>}
        {statusConfigMissing && <p role="alert" className="rounded bg-rose-100 p-2 text-rose-900">No 50% WR_Statuses configuration exists for {workRequest.ESAWorkType}; the WR cannot be reopened.</p>}
        {phase === "select" ? <>
          <label className="block font-medium">New Checklist Standard
            <select aria-label="New checklist standard" value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)} className="mt-1 block w-full rounded border px-3 py-2">
              <option value="">Select the replacement standard…</option>
              {options.map((item) => <option key={item.ChecklistCode} value={item.ChecklistCode}>{item.ChecklistCode} · {item.Title} · {item.frequencyCode ?? "—"} · {item.Steps.length} steps</option>)}
            </select>
          </label>
          <label className="block font-medium">Reason for the change (mandatory, min 5 characters)
            <textarea aria-label="Reason for checklist change" value={reason} onChange={(event) => setReason(event.target.value)} rows={3}
              placeholder="Why must this issued Work Request switch to a different checklist standard?" className="mt-1 block w-full rounded border p-2 font-normal" />
          </label>
        </> : <>
          <div className="rounded-lg border bg-slate-50 p-3">
            <p className="font-semibold">Impact Summary</p>
            <p className="mt-1">Old Standard: <strong>{currentTitle}</strong> ({currentStepCount} steps) → New Standard: <strong>{selected!.Title}</strong> ({selected!.Steps.length} steps)</p>
            <p className="mt-1 text-xs text-slate-600">Reason: {reason.trim()}</p>
          </div>
          {answeredCount > 0 && <p className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
            ⚠️ {answeredCount} answered checklist step{answeredCount === 1 ? "" : "s"} will be archived to ChecklistHistory and cleared; the new checklist starts fresh and unanswered.</p>}
        </>}
        {frequencyMismatch && <p role="alert" className="rounded border border-amber-400 bg-amber-50 p-2 text-amber-900">
          ⚠️ <strong>Frequency Mismatch Warning:</strong> the chosen standard is locked to <FrequencyPill code={selected!.frequencyCode} /> while this WR cycle runs at <FrequencyPill code={workRequest.pmFrequency} />.
          Make sure the replacement really belongs to this maintenance cycle.</p>}
        {phase === "review" && tier === "technicallyCompleted" && <label className="flex items-start gap-2 rounded border border-amber-400 bg-amber-50 p-2 text-amber-900">
          <input type="checkbox" className="mt-0.5" checked={reopenConfirmed} onChange={(event) => setReopenConfirmed(event.target.checked)} />
          <span>I confirm reopening this 78% Work Request back to 50% (PM WRs to be corrected) so the new checklist must be executed.</span>
        </label>}
        {phase === "review" && closed && <label className="block font-medium text-rose-900">Type <strong>REOPEN</strong> to unlock the confirmation
          <input aria-label="Type REOPEN to confirm" value={sealWord} onChange={(event) => setSealWord(event.target.value)}
            placeholder="REOPEN" className="mt-1 block w-full rounded border border-rose-300 p-2 font-mono" />
        </label>}
      </div>
      <footer className="flex gap-2 border-t px-4 py-3">
        <button type="button" className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700"
          onClick={() => phase === "review" ? setPhase("select") : onClose()}>{phase === "review" ? "← Back" : "Cancel"}</button>
        {phase === "select"
          ? <button type="button" disabled={!selected || !reasonValid || statusConfigMissing} onClick={() => setPhase("review")}
            className="flex-[2] rounded-lg bg-blue-700 px-3 py-2 font-semibold text-white disabled:opacity-40">Review Impact →</button>
          : <button type="button" disabled={!gatesValid} onClick={() => onConfirm(selected!, reason.trim())}
            className={`flex-[2] rounded-lg px-3 py-2 font-semibold text-white disabled:opacity-40 ${closed ? "bg-rose-700" : tier === "technicallyCompleted" ? "bg-amber-700" : "bg-blue-700"}`}>{confirmLabel}</button>}
      </footer>
    </section>
  </div>;
}
