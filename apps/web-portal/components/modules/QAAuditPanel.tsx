"use client";
import React, { useEffect, useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useQAActions } from "@/lib/use-qa-actions";
import { qaStatus } from "@/lib/qa-audits";
import { useSiteContext } from "@/lib/contexts/SiteContext";

export function QAAuditPanel({ wr }: { wr: BaseWorkRequest }) {
  const actions = useQAActions();
  const { activePerson } = useSiteContext();
  const [issue, setIssue] = useState(wr.QA_IssueDescription ?? "");
  const [correction, setCorrection] = useState(wr.QA_CorrectionComment ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [spawn, setSpawn] = useState(false);
  const [followUpType, setFollowUpType] = useState<"FJ" | "LJ">("FJ");
  useEffect(() => { setIssue(wr.QA_IssueDescription ?? ""); setCorrection(wr.QA_CorrectionComment ?? ""); }, [wr.WR_ID, wr.QA_IssueDescription, wr.QA_CorrectionComment]);
  const submit = async (verdict: "Pass" | "Fail" | "SubmitCorrection" | "VerifyClose") => {
    setBusy(true); setError("");
    try { await actions.submitQAVerdict(wr.WR_ID, verdict, { issue, correction, photos: wr.QA_AuditPhotos, followUpType: verdict === "Fail" && spawn ? followUpType : undefined }); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Could not save QA verdict."); }
    finally { setBusy(false); }
  };
  const status = qaStatus(wr);
  return <section className="space-y-2 rounded border bg-amber-50 p-3 text-xs"><h3 className="font-bold">QA Audit: {status}{status === "QA_Failed_ActionRequired" ? " ⚠ QA REWORK REQUIRED" : ""}</h3>
    <p>Inspector: {wr.QA_InspectedBy || "—"} · {wr.QA_InspectedDate || "—"}</p>
    {(status === "QA_Passed" || status === "QA_Verified") && wr.Percentage !== 100 && <p>QA is complete; closing the work request still requires its authorized status workflow.</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <label className="block">Issue<textarea className="block w-full border p-1" value={issue} onChange={(e) => setIssue(e.target.value)} /></label>
    <label className="block">Correction<textarea className="block w-full border p-1" value={correction} onChange={(e) => setCorrection(e.target.value)} /></label>
    <div>{(wr.QA_AuditPhotos ?? []).map((photo) => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="mr-2 underline">{photo.name}</a>)}</div>
    {status !== "None" && <label>+ Add QA Photo<input type="file" accept="image/*" disabled={busy} onChange={(event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) { setError("Choose an image no larger than 2 MB."); return; }
      const reader = new FileReader();
      setBusy(true); setError("");
      reader.onerror = () => { setBusy(false); setError("Could not read the selected photo."); };
      reader.onload = () => { const url = reader.result; if (typeof url !== "string") { setBusy(false); setError("Could not read the selected photo."); return; } void actions.addAuditPhoto(wr.WR_ID, { id: crypto.randomUUID(), name: file.name, url, uploadedBy: activePerson, uploadedAt: new Date().toISOString() }).catch((problem: unknown) => setError(problem instanceof Error ? problem.message : "Could not save QA photo.")).finally(() => setBusy(false)); };
      reader.readAsDataURL(file);
      event.target.value = "";
    }} /></label>}
    {status === "SelectedForAudit" && <div><label><input type="checkbox" checked={spawn} onChange={(e) => setSpawn(e.target.checked)} /> Spawn Corrective Follow-Up FJ / LJ</label>{spawn && <select aria-label="Corrective follow-up type" value={followUpType} onChange={(e) => setFollowUpType(e.target.value === "LJ" ? "LJ" : "FJ")}><option value="FJ">FJ (&lt; 750 EUR)</option><option value="LJ">LJ (≥ 750 EUR)</option></select>}</div>}
    <div className="flex flex-wrap gap-2">{status === "SelectedForAudit" && <><button disabled={busy} onClick={() => void submit("Pass")}>✓ Pass QA Inspection</button><button disabled={busy} onClick={() => void submit("Fail")}>⚠ Log QA Issue / Fail</button></>}{status === "QA_Failed_ActionRequired" && <button disabled={busy} onClick={() => void submit("SubmitCorrection")}>Submit Correction</button>}{status === "QA_Corrected" && <button disabled={busy} onClick={() => void submit("VerifyClose")}>✓ Verify &amp; Close Audit</button>}</div>
  </section>;
}
