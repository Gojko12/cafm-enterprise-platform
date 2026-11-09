"use client";
import React, { useEffect, useRef, useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useQAActions } from "@/lib/use-qa-actions";
import { isQACompleted, isQAEligibleType, qaStatus } from "@/lib/qa-audits";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";

const button = "inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50";
const secondary = "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50";
const statuses = {
  None: "Not selected",
  SelectedForAudit: "Selected for Audit",
  ToBeInspected: "To Be Inspected",
  QA_Staged_Pass: "⏳ Staged: PASS (Pending Commit in Tab 4)",
  QA_Staged_Fail: "⏳ Staged: FAIL — Correction (Pending Commit in Tab 4)",
  QA_Passed: "QA Passed",
  QA_Failed_ActionRequired: "QA Failed - Action Required",
  QA_Corrected: "QA Corrected",
  QA_Verified: "QA Verified",
} as const;

export function QAAuditPanel({ wr, onReviewBatch }: { wr: BaseWorkRequest; onReviewBatch?: () => void }) {
  const actions = useQAActions();
  const { data } = useCafmStore();
  const { activePerson } = useSiteContext();
  const { profile, permissions } = useActiveUserPermissions();
  const scoped = !!profile && !!permissions && (wr.WR_Type === "PM" || wr.WR_Type === "FJ") && permissions.auditWRTypes.includes(wr.WR_Type) && permissions.auditTrades.some((trade) => trade === wr.TradeName || trade === wr.TradeId) && (!profile.vpaBuildingIds.length || profile.vpaBuildingIds.includes(wr.bl_id));
  const allowed = scoped && !!permissions?.canAuditDoInspection;
  const canChoose = scoped && !!permissions?.canAuditChooseWRs;
  const status = qaStatus(wr);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState(false);
  const [selectedVerdict, setSelectedVerdict] = useState<"Pass" | "Fail">("Pass");
  const [reopen, setReopen] = useState(!!permissions?.canAuditReopenWR);
  const [spawn, setSpawn] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setEditing(false); setReason(""); setNotes(""); setReopen(!!permissions?.canAuditReopenWR); setSpawn(false); setError(""); setNotice(""); }, [wr.WR_ID, permissions?.canAuditReopenWR]);
  const run = async (operation: () => Promise<void>, message?: string) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); if (message) setNotice(message); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Could not save QA operation."); }
    finally { setBusy(false); }
  };
  if (!isQAEligibleType(wr) || (status === "None" && (!isQACompleted(wr) || !canChoose))) return null;
  const issue = [reason, notes.trim()].filter(Boolean).join(" — ");
  const verdict = (value: "Pass" | "Fail") => {
    if (value === "Fail" && !issue) {
      setError("Please select a Predefined Failure Reason or enter Inspector Notes before failing the inspection.");
      reasonRef.current?.focus();
      return;
    }
    void run(async () => { await actions.submitQAVerdict(wr.WR_ID, value, { issue, reopen: reopen && !!permissions?.canAuditReopenWR, photos: wr.QA_AuditPhotos, spawnFollowUp: value === "Fail" && spawn && !!permissions?.canOpenFollowUpFJ, failureReason: reason, additionalNotes: notes }); setEditing(false); }, "Finding staged; finalize it in Tab 4.");
  };
  const badgeColor = status === "QA_Failed_ActionRequired" || status === "QA_Staged_Fail" ? "bg-rose-100 text-rose-800" : status === "QA_Passed" || status === "QA_Verified" || status === "QA_Staged_Pass" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800";
  return <section className="my-4 overflow-hidden rounded-xl border-2 border-indigo-600 bg-indigo-50/40 text-sm shadow-md">
    <header className="flex flex-wrap items-center justify-between gap-2 bg-indigo-900 px-4 py-2.5 text-white"><div><h3 className="font-bold">🛡️ QA INSPECTOR VERDICT &amp; AUDIT CARD</h3><p className="text-xs">Inspector: {wr.qaStagedVerdict?.inspector || wr.QA_InspectedBy || "—"} · {wr.qaStagedVerdict?.stagedAt || wr.QA_InspectedDate || "—"}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeColor}`}>{statuses[status]}</span>{allowed && !["None", "SelectedForAudit", "ToBeInspected"].includes(status) && <button className={secondary} onClick={() => { setReason(wr.qaStagedVerdict?.failureReason ?? ""); setNotes(wr.qaStagedVerdict?.additionalNotes ?? wr.QA_IssueDescription ?? ""); setReopen(wr.qaStagedVerdict?.reopenTo50 ?? (wr.Percentage === 50)); setSpawn(wr.qaStagedVerdict?.spawnFollowUpFJ ?? false); setSelectedVerdict(wr.qaStagedVerdict?.verdict ?? (["QA_Failed_ActionRequired", "QA_Corrected"].includes(status) ? "Fail" : "Pass")); setEditing(true); }}>✎ Edit QA Inspection / Verdict</button>}</header>
    <div className="space-y-3 p-4">
    {wr.QA_IssueDescription && <p>Issue: {wr.QA_IssueDescription}</p>}{wr.QA_CorrectionComment && <p>Correction: {wr.QA_CorrectionComment}</p>}
    {error && <p role="alert" className="rounded bg-rose-50 p-2 text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded bg-emerald-50 p-2 text-emerald-800">{notice}</p>}
    {wr.qaStagedVerdict && <div className="space-y-2 rounded bg-blue-50 p-3">
      <p>Finding staged! Go to Tab 4 (Review, Report &amp; Commit) to finalize and notify Team Leaders →</p>
      {onReviewBatch ? <button className={secondary} onClick={onReviewBatch}>Go to Tab 4 →</button> : <a className="underline" href="/technical-audits?tab=report">Go to Tab 4 →</a>}
      {allowed && <button className={secondary} disabled={busy} onClick={() => {
        setReason(wr.qaStagedVerdict?.failureReason ?? ""); setNotes(wr.qaStagedVerdict?.additionalNotes ?? "");
        setReopen(!!wr.qaStagedVerdict?.reopenTo50); setSpawn(!!wr.qaStagedVerdict?.spawnFollowUpFJ);
        void run(async () => { await actions.unstageVerdict(wr.WR_ID); setSelectedVerdict(wr.qaStagedVerdict?.verdict ?? "Pass"); setEditing(true); }, "Verdict unstaged; edit and stage it again.");
      }}>Undo / Edit Staged Verdict</button>}
    </div>}
    {status === "None" && canChoose && <button className={`${button} bg-blue-600 hover:bg-blue-700`} disabled={busy} onClick={() => void run(() => actions.transitionAudits([wr.WR_ID], "direct"))}>🔍 Mark as &quot;To Be Inspected&quot;</button>}
    {status === "SelectedForAudit" && canChoose && <div className="flex gap-2"><button className={`${button} bg-blue-600 hover:bg-blue-700`} disabled={busy} onClick={() => void run(() => actions.transitionAudits([wr.WR_ID], "confirm"))}>✓ Confirm &quot;To Be Inspected&quot;</button><button className={secondary} disabled={busy} onClick={() => void run(() => actions.transitionAudits([wr.WR_ID], "unselect"))}>✕ Unselect from QA Audit</button></div>}
    {(status === "ToBeInspected" || editing) && allowed && <>
      <label className="block font-medium">Predefined Failure Reason <select ref={reasonRef} className="mt-1 block w-full rounded border border-slate-300 p-2 font-normal" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Select a reason</option>{(data.qaFailureReasons ?? []).map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="block font-medium">Additional Inspector Notes / Details<textarea className="mt-1 block w-full rounded border border-slate-300 p-2 font-normal" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <label className="block"><input type="checkbox" disabled={!permissions?.canAuditReopenWR} checked={reopen && !!permissions?.canAuditReopenWR} onChange={(e) => setReopen(e.target.checked)} /> Automatically Re-open WR and set status to 50% (Issued / Re-opened for Correction)</label>
      <label className="block"><input type="checkbox" disabled={!permissions?.canOpenFollowUpFJ} checked={spawn && !!permissions?.canOpenFollowUpFJ} onChange={(e) => setSpawn(e.target.checked)} /> Spawn Corrective Follow-Up FJ</label>
      {editing ? <div className="flex flex-wrap gap-2"><label>Verdict <select value={selectedVerdict} onChange={(e) => setSelectedVerdict(e.target.value === "Fail" ? "Fail" : "Pass")}><option value="Pass">Pass</option><option value="Fail">Fail</option></select></label><button className={`${button} bg-indigo-700`} disabled={busy} onClick={() => verdict(selectedVerdict)}>💾 Save Inspection Changes</button><button className={secondary} onClick={() => setEditing(false)}>Cancel</button><p className="text-xs">Changes are staged for batch commit; requests must be at 78% or 100% before committing.</p></div> : <div className="flex flex-wrap gap-2"><button className={`${button} bg-emerald-600 hover:bg-emerald-700`} disabled={busy} onClick={() => verdict("Pass")}>✓ Mark Passed Inspection</button><button className={`${button} bg-rose-600 hover:bg-rose-700`} disabled={busy} onClick={() => verdict("Fail")}>⚠ Send to Correction / Fail Inspection</button></div>}
    </>}
    {!!wr.QA_AuditPhotos?.length && <div className="flex flex-wrap gap-2">{wr.QA_AuditPhotos.map((photo) => <div key={photo.id} className="flex items-center gap-2 rounded border border-slate-200 p-2"><a href={photo.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">{photo.name}</a><span className="text-xs text-slate-500">{photo.uploadedBy} · {new Date(photo.uploadedAt).toLocaleString()}</span>{allowed && <button className="text-rose-700" disabled={busy} aria-label={`Remove ${photo.name}`} onClick={() => void run(() => actions.removeAuditPhoto(wr.WR_ID, photo.id))}>✕</button>}</div>)}</div>}
    {status !== "None" && allowed && <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">📷 + Add QA Photo<input className="hidden" type="file" accept="image/*" disabled={busy} onChange={(event) => {
      const file = event.target.files?.[0]; event.target.value = "";
      if (!file) return;
      if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) { setError("Choose an image no larger than 2 MB."); return; }
      const reader = new FileReader(); setBusy(true); setError(""); setNotice("");
      reader.onerror = () => { setBusy(false); setError("Could not read the selected photo."); };
      reader.onload = () => { const url = reader.result; if (typeof url !== "string") { setBusy(false); setError("Could not read the selected photo."); return; } void actions.addAuditPhoto(wr.WR_ID, { id: crypto.randomUUID(), name: file.name, url, uploadedBy: activePerson, uploadedAt: new Date().toISOString() }).catch((problem: unknown) => setError(problem instanceof Error ? problem.message : "Could not save QA photo.")).finally(() => setBusy(false)); };
      reader.readAsDataURL(file);
    }} /></label>}
    </div></section>;
}
