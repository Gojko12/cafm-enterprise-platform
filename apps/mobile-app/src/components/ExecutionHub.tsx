import React, { useState } from "react";
import { WR_Statuses } from "@cafm/shared-schema";
import type { BaseWorkRequest, Equipment, LocationFreeze } from "@cafm/shared-schema";
import { MobileExecutionTools } from "./MobileExecutionTools";
import { getCurrentLocationFreezes } from "../../../web-portal/lib/location-freezes";
import { fromWallMinutes } from "../../../web-portal/lib/dispatch";
import { completeChecklistInstances } from "../../../web-portal/lib/checklist-completion";

type Save = (change: (wr: BaseWorkRequest) => BaseWorkRequest, message: string) => Promise<void>;
export function ExecutionHub({ wr, technician, technicianName, person, equipment, freezes, save, back, checklist, followUp, sync }: {
  wr: BaseWorkRequest; technician: string; technicianName: string; equipment: Equipment[]; freezes: LocationFreeze[];
  person?: { Name: string; LastName: string; Trade: string; HourlyRate: number };
  save: Save; back: () => void; checklist: () => void; followUp: () => void; sync: () => Promise<void>;
}) {
  const [dialog, setDialog] = useState<"comments" | "completion" | null>(null);
  const [note, setNote] = useState("");
  const [opinion, setOpinion] = useState("");
  const [correction, setCorrection] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const execute = async (fn: () => Promise<void>, success?: string) => { setBusy(true); setError(""); setNotice(""); try { await fn(); if (success) setNotice(success); return true; } catch (problem) { setError(problem instanceof Error ? problem.message : "Could not save changes."); return false; } finally { setBusy(false); } };
  const activeFreezes = getCurrentLocationFreezes(wr, freezes, fromWallMinutes(Math.floor(Date.now() / 60000) - new Date().getTimezoneOffset()));
  const steps = wr.WR_Type === "PM" ? wr.ChecklistSteps ?? wr.ChecklistInstances ?? [] : wr.todoSteps ?? [];
  const done = wr.WR_Type === "PM" ? (wr.ChecklistResults ?? []).filter((item) => steps.some((step) => "StepId" in step && step.StepId === item.stepId) && !(typeof item.value === "string" && !item.value.trim()) && !(Array.isArray(item.value) && !item.value.length)).length : (wr.todoSteps ?? []).filter((item) => item.completed).length;
  const assignment = wr.CraftpersonAssignments?.find((item) => item.craftpersonId === technician);
  const complete = () => void execute(async () => {
    const minutes = Number(opinion);
    if (!opinion.trim() || !Number.isInteger(minutes) || minutes < 0) throw new Error("Enter non-negative whole minutes.");
    await save((current) => {
      if (current.IsFrozen || activeFreezes.some((freeze) => !({ PM: freeze.allowPM, FJ: freeze.allowFJ, LJ: freeze.allowLJ })[current.WR_Type])) throw new Error("Resolve the active work or location freeze before completion.");
      if ((current.timeSessions ?? []).some((session) => session.craftpersonId === technician && !session.endedAt)) throw new Error("Stop your running timer before completion.");
      if (current.Percentage !== 50 && current.Percentage !== 55) throw new Error("Only work in execution at 50% or 55% can be completed.");
      if (current.WR_Type === "LJ" && current.ProcessTrack === "RFQ") throw new Error("The long job must be on the RFW execution track before completion.");
      let completedInstances = current.ChecklistInstances;
      if (current.WR_Type === "PM") {
        const required = current.ChecklistSteps?.length ? current.ChecklistSteps : current.ChecklistInstances ?? [];
        if (!required.length || required.some((step) => {
          const result = current.ChecklistResults?.find((item) => item.stepId === step.StepId);
          const answered = !!result && !(typeof result.value === "string" && !result.value.trim()) && !(Array.isArray(result.value) && !result.value.length);
          if (!answered) return !("IsRequired" in step) || step.IsRequired;
          return !!result && !result.passed && ((step.RequiresCommentOnFailure !== false && !result.comment?.trim()) || (step.RequiresPhotoOnFailure !== false && !result.photoPaths?.length));
        })) throw new Error("Complete all required PM checklist answers and failure evidence first.");
        completedInstances = completeChecklistInstances(current.ChecklistInstances ?? [], current.ChecklistResults ?? [], technician, new Date().toISOString());
      }
      if (current.WR_Type !== "PM" && current.todoSteps?.some((step) => !step.completed)) throw new Error("Complete the assigned technician steps first.");
      const configured = WR_Statuses.find((status) => status.ESAWorkType === current.ESAWorkType && status.Percentage === 78);
      if (!configured) throw new Error("No 78% status is configured for this work type.");
      const old = current.laborEntries?.find((item) => item.craftpersonId === technician);
      const legacy = current.CraftpersonLabor?.find((item) => item.craftpersonId === technician);
      const recorded = old?.recordedTimerMinutes ?? legacy?.recordedTimerMinutes ?? legacy?.workingTimeMinutes ?? 0;
      const override = old?.teamLeaderOverrideMinutes ?? legacy?.teamLeaderOverrideMinutes;
      const now = new Date().toISOString();
      const entry = { ...old, craftpersonId: technician, name: old?.name ?? legacy?.name ?? person?.Name ?? technicianName, lastName: old?.lastName ?? legacy?.lastName ?? person?.LastName ?? "", trade: old?.trade ?? legacy?.trade ?? person?.Trade, hourlyRate: old?.hourlyRate ?? legacy?.hourlyRate ?? person?.HourlyRate ?? 0, recordedTimerMinutes: recorded, technicianOpinionMinutes: minutes, teamLeaderOverrideMinutes: override, effectiveMinutes: override ?? minutes, lastModifiedBy: technicianName, lastModifiedAt: now };
      return { ...current, ...configured, ...(current.WR_Type === "PM" ? { ChecklistCompleted: true, ChecklistInstances: completedInstances, StepAuditLogs: [...(current.StepAuditLogs ?? []), ...(completedInstances ?? []).filter((step) => step.IsCompleted && !current.ChecklistInstances?.find((previous) => previous.StepInstanceId === step.StepInstanceId)?.IsCompleted).map((step) => ({ AuditLogId: crypto.randomUUID(), StepInstanceId: step.StepInstanceId, WR_ID: current.WR_ID, ActorId: technician, Action: "completed" as const, OccurredAt: now }))] } : {}), laborEntries: [...(current.laborEntries ?? []).filter((item) => item.craftpersonId !== technician), entry] };
    }, `Technically completed at 78%; technician opinion: ${minutes} min.`);
    setDialog(null);
  }, "Work marked technically completed.");
  return <div className="space-y-3 p-4 pt-48 pb-24">
    <div className="sticky top-36 z-30 flex flex-wrap items-center gap-2 rounded border bg-white p-2"><button disabled={busy} onClick={back} className="text-blue-700">← Back to WRs</button><strong>{wr.WR_ID}</strong><span className="rounded bg-blue-100 px-2">{wr.WR_Type}</span><span className="rounded bg-slate-100 px-2">{wr.Percentage}%</span><button disabled={busy} className="ml-auto rounded bg-blue-600 px-2 py-1 text-white" onClick={() => void execute(sync, "Synchronization complete.")}>Sync Now</button></div>
    {error && <p role="alert" className="rounded bg-rose-50 p-2 text-rose-700">{error}</p>}{notice && <p role="status" className="rounded bg-emerald-50 p-2 text-emerald-700">{notice}</p>}
    {wr.QA_AuditStatus === "QA_Failed_ActionRequired" && <div className="space-y-2 rounded bg-rose-50 p-3"><strong>⚠ QA REWORK REQUIRED</strong><p>{wr.QA_IssueDescription}</p><textarea className="w-full rounded border p-2" placeholder="Correction performed" value={correction} onChange={(e) => setCorrection(e.target.value)} /><button className="rounded bg-rose-700 px-3 py-1 text-white" disabled={busy || !correction.trim()} onClick={() => void execute(async () => { await save((current) => { if (current.QA_AuditStatus !== "QA_Failed_ActionRequired") throw new Error("This audit no longer requires correction."); return { ...current, QA_AuditStatus: "QA_Corrected", QA_CorrectionComment: correction.trim(), QA_CorrectedDate: new Date().toISOString() }; }, `QA correction submitted: ${correction.trim()}`); setCorrection(""); }, "Correction submitted for verification.")}>Submit correction</button></div>}
    {(wr.IsFrozen || activeFreezes.length > 0) && <div className="rounded bg-cyan-50 p-3"><strong>❄ Location Freeze Warning</strong><p>{wr.FreezeReason || wr.ActiveFreezeName || activeFreezes.map((item) => item.title).join(", ")}</p></div>}
    <section className="space-y-1 rounded border bg-white p-4"><h1 className="text-lg font-bold">{wr.Description}</h1><p>{wr.bl_id} / {wr.LevelName ?? "—"} / {wr.RoomCode ?? "—"}</p><p>Equipment: {wr.EquipmentCodes.map((code) => `${code} ${equipment.find((item) => item.EquipmentCode === code)?.EquipmentName ?? ""}`).join(", ") || "—"}</p><p>Trade: {wr.TradeName ?? wr.TradeId ?? "—"} · Priority: {wr.Urgency ?? "—"}</p><p>Due: {wr.DueDate ?? "—"} · Margin: {wr.MarginDate ?? "—"}</p><p>Schedule: {assignment ? `${assignment.assignedStartDateTime} – ${assignment.assignedEndDateTime}` : wr.StartDate_DateToPerform ?? "Not scheduled"}</p></section>
    <MobileExecutionTools wr={wr} technician={technician} technicianName={technicianName} person={person} save={save} />
    <div className="grid gap-2"><button className="rounded bg-blue-700 p-3 text-white" onClick={checklist}>📋 Open Checklist / To-Do Steps ({done} / {steps.length} completed)</button><button className="rounded bg-emerald-700 p-3 text-white" onClick={followUp}>➕ Open Follow-Up FJ</button><button className="rounded border bg-white p-3" onClick={() => setDialog("comments")}>💬 Comments &amp; Photos</button><button className="rounded bg-blue-800 p-3 text-white" onClick={() => setDialog("completion")}>✓ Complete Work — Set to 78% Technically Completed</button></div>
    {dialog && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"><div className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-auto rounded bg-white p-4"><h2 className="font-bold">{dialog === "completion" ? "Completion & Time Confirmation" : "Comments & Photos"}</h2>
      {dialog === "completion" ? <><label>Technician opinion time (minutes)<input type="number" min="0" step="1" className="block rounded border p-2" value={opinion} onChange={(e) => setOpinion(e.target.value)} /></label><p className="text-xs">Existing Team Leader overrides take precedence.</p><button disabled={busy} className="rounded bg-blue-700 p-2 text-white" onClick={complete}>Confirm completion</button></> : <><div className="max-h-48 overflow-auto">{(wr.Activity ?? []).map((entry) => <p key={entry.id} className="border-b py-1 text-sm">{entry.actorName} · {entry.createdAt}: {entry.text}</p>)}{(wr.Attachments ?? []).map((item) => <a key={item.id} className="block text-blue-700 underline" href={item.dataUrl} target="_blank" rel="noreferrer">{item.name}</a>)}</div><textarea className="w-full rounded border p-2" placeholder="Technician comment" value={note} onChange={(e) => setNote(e.target.value)} /><button disabled={busy || !note.trim()} onClick={() => void execute(async () => { const text = note.trim(); await save((current) => ({ ...current, Activity: [...(current.Activity ?? []), { id: crypto.randomUUID(), kind: "comment", actorId: technician, actorName: technicianName, actorRole: "MobileTechnician", createdAt: new Date().toISOString(), text }] }), "Technician posted a comment."); setNote(""); })}>Post comment</button><label className="block cursor-pointer text-blue-700">📷 Add photo<input className="hidden" type="file" accept="image/*" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) { setError("Choose an image no larger than 2 MB."); return; } setBusy(true); const reader = new FileReader(); reader.onerror = () => { setError("Could not read photo."); setBusy(false); }; reader.onload = () => { const url = reader.result; if (typeof url !== "string") { setError("Could not read photo."); setBusy(false); return; } void execute(() => save((current) => ({ ...current, Attachments: [...(current.Attachments ?? []), { id: crypto.randomUUID(), name: file.name, type: file.type, dataUrl: url }] }), `Added photo ${file.name}.`)); }; reader.readAsDataURL(file); }} /></label></>}
      {error && <p role="alert" className="text-rose-700">{error}</p>}<button disabled={busy} className="block rounded border p-2" onClick={() => setDialog(null)}>Close</button></div></div>}
  </div>;
}
