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
  QA_Passed: "QA Passed",
  QA_Failed_ActionRequired: "QA Failed - Action Required",
  QA_Corrected: "QA Corrected",
  QA_Verified: "QA Verified",
} as const;

export function QAAuditPanel({ wr }: { wr: BaseWorkRequest }) {
  const actions = useQAActions();
  const { data } = useCafmStore();
  const { activePerson } = useSiteContext();
  const { profile, permissions } = useActiveUserPermissions();
  const scoped = !!profile && (wr.WR_Type === "PM" || wr.WR_Type === "FJ") && profile.permissions.auditWRTypes.includes(wr.WR_Type) && profile.permissions.auditTrades.some((trade) => trade === wr.TradeName || trade === wr.TradeId) && (!profile.vpaBuildingIds.length || profile.vpaBuildingIds.includes(wr.bl_id));
  const allowed = scoped && !!permissions?.canAuditDoInspection;
  const canChoose = scoped && !!permissions?.canAuditChooseWRs;
  const status = qaStatus(wr);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [correction, setCorrection] = useState(wr.QA_CorrectionComment ?? "");
  const [reopen, setReopen] = useState(!!permissions?.canAuditReopenWR);
  const [spawn, setSpawn] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCorrection(wr.QA_CorrectionComment ?? ""); setReason(""); setNotes(""); setReopen(!!permissions?.canAuditReopenWR); setSpawn(false); setError(""); setNotice(""); }, [wr.WR_ID, permissions?.canAuditReopenWR]);
  const run = async (operation: () => Promise<void>, message?: string) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); if (message) setNotice(message); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Could not save QA operation."); }
    finally { setBusy(false); }
  };
  if (!isQAEligibleType(wr) || (status === "None" && (!isQACompleted(wr) || !canChoose))) return null;
  const issue = [reason, notes.trim()].filter(Boolean).join(" — ");
  const verdict = (value: "Pass" | "Fail" | "SubmitCorrection" | "VerifyClose") => {
    if (value === "Fail" && !issue) {
      setError("Please select a Predefined Failure Reason or enter Inspector Notes before failing the inspection.");
      reasonRef.current?.focus();
      return;
    }
    const message = value === "Fail" ? `Inspection marked as FAILED — WR sent to correction${reopen ? " (50%)" : " (status unchanged)"}.` : undefined;
    void run(() => actions.submitQAVerdict(wr.WR_ID, value, { issue, correction, reopen: reopen && !!permissions?.canAuditReopenWR, photos: wr.QA_AuditPhotos, spawnFollowUp: value === "Fail" && spawn && !!permissions?.canOpenFollowUpFJ }), message);
  };
  const badgeColor = status === "QA_Failed_ActionRequired" ? "bg-rose-100 text-rose-800" : status === "QA_Passed" || status === "QA_Verified" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800";
  return <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
    {status !== "None" && <div className="space-y-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">QA Inspection</h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeColor}`}>{statuses[status]}</span></div><p className="text-xs text-slate-600">Inspector: {wr.QA_InspectedBy || "—"} · {wr.QA_InspectedDate ? new Date(wr.QA_InspectedDate).toLocaleString() : "—"}</p>{wr.QA_IssueDescription && <p>Issue: {wr.QA_IssueDescription}</p>}{wr.QA_CorrectionComment && <p>Correction: {wr.QA_CorrectionComment}</p>}</div>}
    {error && <p role="alert" className="rounded bg-rose-50 p-2 text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded bg-emerald-50 p-2 text-emerald-800">{notice}</p>}
    {status === "None" && canChoose && <button className={`${button} bg-blue-600 hover:bg-blue-700`} disabled={busy} onClick={() => void run(() => actions.transitionAudits([wr.WR_ID], "direct"))}>🔍 Mark as &quot;To Be Inspected&quot;</button>}
    {status === "SelectedForAudit" && canChoose && <div className="flex gap-2"><button className={`${button} bg-blue-600 hover:bg-blue-700`} disabled={busy} onClick={() => void run(() => actions.transitionAudits([wr.WR_ID], "confirm"))}>✓ Confirm &quot;To Be Inspected&quot;</button><button className={secondary} disabled={busy} onClick={() => void run(() => actions.transitionAudits([wr.WR_ID], "unselect"))}>✕ Unselect from QA Audit</button></div>}
    {status === "ToBeInspected" && allowed && <>
      <label className="block font-medium">Predefined Failure Reason <select ref={reasonRef} className="mt-1 block w-full rounded border border-slate-300 p-2 font-normal" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Select a reason</option>{(data.qaFailureReasons ?? []).map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="block font-medium">Additional Inspector Notes / Details<textarea className="mt-1 block w-full rounded border border-slate-300 p-2 font-normal" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <label className="block"><input type="checkbox" disabled={!permissions?.canAuditReopenWR} checked={reopen && !!permissions?.canAuditReopenWR} onChange={(e) => setReopen(e.target.checked)} /> Automatically Re-open WR and set status to 50% (Issued / Re-opened for Correction)</label>
      <label className="block"><input type="checkbox" disabled={!permissions?.canOpenFollowUpFJ} checked={spawn && !!permissions?.canOpenFollowUpFJ} onChange={(e) => setSpawn(e.target.checked)} /> Spawn Corrective Follow-Up FJ</label>
      <div className="flex flex-wrap gap-2"><button className={`${button} bg-emerald-600 hover:bg-emerald-700`} disabled={busy} onClick={() => verdict("Pass")}>✓ Mark Passed Inspection</button><button className={`${button} bg-rose-600 hover:bg-rose-700`} disabled={busy} onClick={() => verdict("Fail")}>⚠ Send to Correction / Fail Inspection</button></div>
    </>}
    {status === "QA_Failed_ActionRequired" && <><label className="block">Correction<textarea className="mt-1 block w-full rounded border border-slate-300 p-2" value={correction} onChange={(e) => setCorrection(e.target.value)} /></label><div className="flex flex-wrap gap-2"><button className={`${button} bg-blue-600 hover:bg-blue-700`} disabled={busy || !correction.trim()} onClick={() => verdict("SubmitCorrection")}>Submit Correction</button>{allowed && <button className={`${button} bg-blue-600`} disabled title="Submit a correction before verification.">✓ Verify &amp; Close Audit</button>}</div>{allowed && <p className="text-xs text-slate-600">Submit a correction before verification.</p>}</>}
    {status === "QA_Corrected" && allowed && <button className={`${button} bg-blue-600 hover:bg-blue-700`} disabled={busy} onClick={() => verdict("VerifyClose")}>✓ Verify &amp; Close Audit</button>}
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
  </section>;
}
