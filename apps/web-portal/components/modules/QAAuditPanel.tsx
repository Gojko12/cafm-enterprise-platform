"use client";
import React, { useEffect, useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useQAActions } from "@/lib/use-qa-actions";
import { isQACompleted, qaStatus } from "@/lib/qa-audits";
import { canInspectWR } from "@/lib/qa-settings";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { QAFailureReasonSettings } from "./QASettings";

export function QAAuditPanel({ wr }: { wr: BaseWorkRequest }) {
  const actions = useQAActions();
  const { data } = useCafmStore();
  const { activePerson } = useSiteContext();
  const allowed = canInspectWR(activePerson, wr, data.qaInspectorAssignments);
  const status = qaStatus(wr);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [correction, setCorrection] = useState(wr.QA_CorrectionComment ?? "");
  const [reopen, setReopen] = useState(true);
  const [spawn, setSpawn] = useState(false);
  const [followUpType, setFollowUpType] = useState<"FJ" | "LJ">("FJ");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCorrection(wr.QA_CorrectionComment ?? ""); setReason(""); setNotes(""); setReopen(true); setSpawn(false); }, [wr.WR_ID, wr.QA_CorrectionComment]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await operation(); } catch (problem) { setError(problem instanceof Error ? problem.message : "Could not save QA operation."); } finally { setBusy(false); }
  };
  if (status === "None" && (!isQACompleted(wr) || !allowed)) return null;
  const issue = reason ? `${reason}${notes.trim() ? ` — ${notes.trim()}` : ""}` : "";
  const verdict = (value: "Pass" | "Fail" | "SubmitCorrection" | "VerifyClose") => void run(() => actions.submitQAVerdict(wr.WR_ID, value, { issue, correction, reopen, photos: wr.QA_AuditPhotos, followUpType: value === "Fail" && spawn ? followUpType : undefined }));
  return <section className="space-y-2 rounded border bg-white p-3 text-sm">
    {status !== "None" && <><h3 className="font-bold">QA Audit: {status}{status === "QA_Failed_ActionRequired" ? " ⚠ QA REWORK REQUIRED" : ""}</h3><p>Inspector: {wr.QA_InspectedBy || "—"} · {wr.QA_InspectedDate || "—"}</p>{wr.QA_IssueDescription && <p>Issue: {wr.QA_IssueDescription}</p>}{wr.QA_CorrectionComment && <p>Correction: {wr.QA_CorrectionComment}</p>}</>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {status === "None" && allowed && <button disabled={busy} onClick={() => void run(() => actions.transitionAudits([wr.WR_ID], "direct"))}>🔍 Mark as &quot;To Be Inspected&quot;</button>}
    {status === "SelectedForAudit" && allowed && <div className="flex gap-2"><button disabled={busy} onClick={() => void run(() => actions.transitionAudits([wr.WR_ID], "confirm"))}>✓ Confirm &quot;To Be Inspected&quot;</button><button disabled={busy} onClick={() => void run(() => actions.transitionAudits([wr.WR_ID], "unselect"))}>✕ Unselect from QA Audit</button></div>}
    {status === "ToBeInspected" && allowed && <>
      <label className="block">Predefined Failure Reason <select className="block w-full border p-1" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Select a reason</option>{(data.qaFailureReasons ?? []).map((item) => <option key={item}>{item}</option>)}</select></label>
      <QAFailureReasonSettings />
      <label className="block">Additional Inspector Notes / Details<textarea className="block w-full border p-1" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <label className="block"><input type="checkbox" checked={reopen} onChange={(e) => setReopen(e.target.checked)} /> Automatically Re-open WR and set status to 50% (Issued / Re-opened for Correction)</label>
      <div><label><input type="checkbox" checked={spawn} onChange={(e) => setSpawn(e.target.checked)} /> Spawn Corrective Follow-Up FJ / LJ</label>{spawn && <select aria-label="Corrective follow-up type" value={followUpType} onChange={(e) => setFollowUpType(e.target.value === "LJ" ? "LJ" : "FJ")}><option value="FJ">FJ (&lt; 750 EUR)</option><option value="LJ">LJ (≥ 750 EUR)</option></select>}</div>
      <button disabled={busy} onClick={() => verdict("Pass")}>✓ Mark Passed Inspection</button>{" "}<button disabled={busy || !reason} onClick={() => verdict("Fail")}>⚠ Send to Correction / Fail Inspection</button>
    </>}
    {status === "QA_Failed_ActionRequired" && <><label className="block">Correction<textarea className="block w-full border p-1" value={correction} onChange={(e) => setCorrection(e.target.value)} /></label><button disabled={busy || !correction.trim()} onClick={() => verdict("SubmitCorrection")}>Submit Correction</button></>}
    {status === "QA_Corrected" && allowed && <button disabled={busy} onClick={() => verdict("VerifyClose")}>✓ Verify &amp; Close Audit</button>}
    <div>{(wr.QA_AuditPhotos ?? []).map((photo) => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="mr-2 underline">{photo.name}</a>)}</div>
    {status !== "None" && allowed && <label>+ Add QA Photo<input type="file" accept="image/*" disabled={busy} onChange={(event) => {
      const file = event.target.files?.[0]; event.target.value = "";
      if (!file) return;
      if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) { setError("Choose an image no larger than 2 MB."); return; }
      const reader = new FileReader(); setBusy(true); setError("");
      reader.onerror = () => { setBusy(false); setError("Could not read the selected photo."); };
      reader.onload = () => { const url = reader.result; if (typeof url !== "string") { setBusy(false); setError("Could not read the selected photo."); return; } void actions.addAuditPhoto(wr.WR_ID, { id: crypto.randomUUID(), name: file.name, url, uploadedBy: activePerson, uploadedAt: new Date().toISOString() }).catch((problem: unknown) => setError(problem instanceof Error ? problem.message : "Could not save QA photo.")).finally(() => setBusy(false)); };
      reader.readAsDataURL(file);
    }} /></label>}
  </section>;
}
