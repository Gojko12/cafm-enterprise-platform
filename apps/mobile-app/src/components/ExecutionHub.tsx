import React, { useEffect, useRef, useState } from "react";
import { WR_Statuses } from "@cafm/shared-schema";
import type { BaseWorkRequest, Equipment, LocationFreeze } from "@cafm/shared-schema";
import { laborFor, MobileExecutionTools, startTechnicianTimer, stopTechnicianTimer } from "./MobileExecutionTools";
import { buildFreezeAcknowledgment, getWorkRequestFreezes, localNowIso } from "../../../web-portal/lib/location-freezes";
import { FreezeAckPanel, FreezeBadge } from "./FreezeSafetyGate";
import { completeChecklistInstances } from "../../../web-portal/lib/checklist-completion";
import { localDateTime, scheduledSlot } from "../../../web-portal/lib/field-updates";
import { formatHumanDateTimeRange, formatPlannedRange } from "../lib/human-time";
import { getFollowUpFJsForPM, getUnfavourableStepCount } from "../../../web-portal/lib/wr-signals";

type Save = (change: (wr: BaseWorkRequest) => BaseWorkRequest, message: string) => Promise<void>;
const timeFingerprint = (wr: BaseWorkRequest, technician: string) => JSON.stringify([
  (wr.timeSessions ?? []).filter((item) => item.craftpersonId === technician),
  (wr.MobileWorkSessions ?? []).filter((item) => item.TechnicianId === technician),
  wr.laborEntries?.find((item) => item.craftpersonId === technician),
  wr.CraftpersonLabor?.find((item) => item.craftpersonId === technician),
  wr.CraftpersonAssignments?.find((item) => item.craftpersonId === technician),
]);
export function ExecutionHub({ wr, technician, technicianName, person, people, equipment, freezes, save, back, checklist, followUp, sync, openCompletion, canComplete, now, navigationRef, report, allWorkRequests }: {
  wr: BaseWorkRequest; technician: string; technicianName: string; equipment: Equipment[]; freezes: LocationFreeze[];
  allWorkRequests: BaseWorkRequest[];
  person?: { Name: string; LastName: string; Trade: string; HourlyRate: number };
  people: Array<{ id: string; Name: string; LastName: string; Trade: string; HourlyRate: number }>;
  openCompletion?: boolean;
  now: number;
  navigationRef: React.MutableRefObject<(() => boolean) | null>;
  report: () => void;
  save: Save; back: () => void; checklist: (step?: number) => void; followUp?: () => void; sync: () => Promise<void>; canComplete: boolean;
}) {
  const [dialog, setDialog] = useState<"comments" | "completion" | null>(null);
  const [note, setNote] = useState("");
  const [opinion, setOpinion] = useState("");
  const [timeMode, setTimeMode] = useState<"measured" | "adjust">("measured");
  const [precheck, setPrecheck] = useState<number[] | null>(null);
  const [coworkers, setCoworkers] = useState<Array<{ id: string; minutes: string }>>([]);
  const [summary, setSummary] = useState("");
  const [correction, setCorrection] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockedNotice, setLockedNotice] = useState(false);
  const [freezeGate, setFreezeGate] = useState(false);
  useEffect(() => {
    navigationRef.current = () => {
      if (busy) { setError("Wait for the current operation to finish before navigating."); return false; }
      if (dialog || correction.trim()) { setError("Close the editor or clear the unsaved correction before navigating."); return false; }
      return true;
    };
    return () => { navigationRef.current = null; };
  }, [navigationRef, busy, dialog, correction]);
  const execute = async (fn: () => Promise<void>, success?: string) => { setBusy(true); setError(""); setNotice(""); try { await fn(); if (success) setNotice(success); return true; } catch (problem) { setError(problem instanceof Error ? problem.message : "Could not save changes."); return false; } finally { setBusy(false); } };
  const completionOpened = useRef(false);
  const beginCompletion = async (skipFreezeGate = false) => {
    if (wr.Percentage >= 78) { setError("This work request is already technically completed."); return; }
    if (!canComplete) { setError("You do not have permission to complete this work request."); return; }
    const missing = incompleteStepIndexes();
    if (missing.length) { setPrecheck(missing); return; }
    setPrecheck(null);
    if (!skipFreezeGate && activeFreezes.length > 0 && !wr.freezeAcknowledged) { setFreezeGate(true); return; }
    await execute(async () => {
      await save((current) => stopTechnicianTimer(current, technician, person), "Prepared completion time confirmation; any active personal timer was stopped.");
      setTimeMode("measured");
      setOpinion("");
      setDialog("completion");
    });
  };
  useEffect(() => {
    if (openCompletion && !completionOpened.current) {
      completionOpened.current = true;
      void beginCompletion();
    }
  }, [openCompletion]);
  const activeFreezes = getWorkRequestFreezes(wr, freezes, localNowIso());
  const activeTimer = (wr.timeSessions ?? []).some((session) => session.craftpersonId === technician && !session.endedAt);
  const steps = wr.WR_Type === "PM" ? (wr.ChecklistSteps?.length ? wr.ChecklistSteps : wr.ChecklistInstances ?? []) : wr.todoSteps ?? [];
  const done = wr.WR_Type === "PM" ? steps.filter((step) => {
    if (!("StepId" in step)) return false;
    const result = wr.ChecklistResults?.find((item) => item.stepId === step.StepId);
    return result ? !(typeof result.value === "string" && !result.value.trim()) && !(Array.isArray(result.value) && !result.value.length) :
      !!wr.ChecklistInstances?.find((item) => item.StepId === step.StepId)?.IsCompleted;
  }).length : (wr.todoSteps ?? []).filter((item) => item.completed).length;
  const slot = scheduledSlot(wr, technician);
  const incompleteStepIndexes = (): number[] => {
    if (wr.WR_Type !== "PM") return (wr.todoSteps ?? []).flatMap((item, index) => item.completed ? [] : [index]);
    type PmStep = { StepId: string; SortOrder: number; IsRequired?: boolean; RequiresCommentOnFailure?: boolean; RequiresPhotoOnFailure?: boolean };
    const list = [...((wr.ChecklistSteps?.length ? wr.ChecklistSteps : wr.ChecklistInstances ?? []) as unknown as PmStep[])].sort((a, b) => a.SortOrder - b.SortOrder);
    return list.flatMap((step, index) => {
      const result = wr.ChecklistResults?.find((item) => item.stepId === step.StepId);
      const answered = !!result && !(typeof result.value === "string" && !result.value.trim()) && !(Array.isArray(result.value) && !result.value.length);
      if (!answered) return step.IsRequired === false ? [] : [index];
      return !result.passed && ((step.RequiresCommentOnFailure !== false && !result.comment?.trim()) || (step.RequiresPhotoOnFailure !== false && !result.photoPaths?.length)) ? [index] : [];
    });
  };
  const planned = slot ? formatPlannedRange(slot.assignedStartDateTime, slot.assignedEndDateTime) : wr.StartDate_DateToPerform ? `${new Date(`${wr.StartDate_DateToPerform}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })} (time not specified)` : "Unscheduled";
  const ahead = slot ? localDateTime(new Date(now)) < slot.assignedStartDateTime : !!wr.StartDate_DateToPerform && localDateTime(new Date(now)).slice(0, 10) < wr.StartDate_DateToPerform;
  const complete = () => void execute(async () => {
    if (!canComplete) throw new Error("You do not have permission to complete this work request.");
    if (timeMode === "adjust" && !opinion.trim()) throw new Error("Enter the minutes you worked, or choose the measured timer.");
    const enteredMinutes = timeMode === "adjust" && opinion.trim() ? Number(opinion) : undefined;
    if (enteredMinutes !== undefined && (!Number.isInteger(enteredMinutes) || enteredMinutes < 0)) throw new Error("Enter non-negative whole minutes.");
    if (coworkers.some((item) => !item.id || !item.minutes.trim() || !Number.isInteger(Number(item.minutes)) || Number(item.minutes) < 0)) throw new Error("Select each co-worker and enter non-negative whole minutes.");
    if (new Set(coworkers.map((item) => item.id)).size !== coworkers.length || coworkers.some((item) => item.id === technician || !people.some((p) => p.id === item.id))) throw new Error("Choose a different valid craftsperson for each co-worker.");
    await save((current) => {
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
      const now = new Date().toISOString();
      const primary = laborFor(current, current.timeSessions ?? [], technician, now, person);
      if (timeFingerprint(current, technician) !== fingerprint) throw new Error("Time or assignment details changed. Review and confirm the updated time again.");
      const minutes = enteredMinutes ?? primary.recordedTimerMinutes;
      const entry = { ...primary, technicianOpinionMinutes: minutes, effectiveMinutes: primary.teamLeaderOverrideMinutes ?? minutes, lastModifiedBy: technicianName };
      const others = coworkers.map((item) => {
        const coworker = people.find((p) => p.id === item.id)!;
        const existing = laborFor(current, current.timeSessions ?? [], item.id, now, coworker);
        const opinionMinutes = Number(item.minutes);
        return { ...existing, technicianOpinionMinutes: opinionMinutes, effectiveMinutes: existing.teamLeaderOverrideMinutes ?? opinionMinutes, addedByCoWorker: technicianName, lastModifiedBy: technicianName };
      });
      const trace = `WR set to 78% by ${technicianName}. Recorded Timer: ${primary.recordedTimerMinutes}m, Technician Opinion: ${minutes}m${enteredMinutes === undefined ? " (measured-time fallback)" : ""}.${coworkers.map((item) => { const p = people.find((person) => person.id === item.id)!; return ` Co-worker ${p.Name} ${p.LastName} added with ${item.minutes}m.`; }).join("")}${summary.trim() ? ` Note: ${summary.trim()}` : ""}`;
      return { ...current, ...configured, AssignedCraftpersonIds: [...new Set([...current.AssignedCraftpersonIds, technician, ...coworkers.map((item) => item.id)])], Activity: [...(current.Activity ?? []), { id: crypto.randomUUID(), kind: "log" as const, actorId: technician, actorName: technicianName, actorRole: "MobileTechnician", createdAt: now, text: trace }], ...(current.WR_Type === "PM" ? { ChecklistCompleted: true, ChecklistInstances: completedInstances, StepAuditLogs: [...(current.StepAuditLogs ?? []), ...(completedInstances ?? []).filter((step) => step.IsCompleted && !current.ChecklistInstances?.find((previous) => previous.StepInstanceId === step.StepInstanceId)?.IsCompleted).map((step) => ({ AuditLogId: crypto.randomUUID(), StepInstanceId: step.StepInstanceId, WR_ID: current.WR_ID, ActorId: technician, Action: "completed" as const, OccurredAt: now }))] } : {}), laborEntries: [...(current.laborEntries ?? []).filter((item) => item.craftpersonId !== technician && !coworkers.some((coworker) => coworker.id === item.craftpersonId)), entry, ...others] };
    }, "Technically completed at 78%; time and team confirmed.");
    setDialog(null);
    try { await sync(); setNotice("Work completed and synchronized."); }
    catch (problem) { setError(`Work completed and saved offline, but synchronization failed: ${problem instanceof Error ? problem.message : "Retry Sync Now."}`); }
  });
  const recorded = laborFor(wr, wr.timeSessions ?? [], technician, new Date().toISOString(), person).recordedTimerMinutes;
  const fingerprint = timeFingerprint(wr, technician);
  const shortName = person ? `${person.Name} ${person.LastName.slice(0, 1)}.` : technicianName;
  const myMinutes = timeMode === "adjust" && opinion.trim() ? opinion.trim() : String(recorded);
  const measuredRanges = [
    ...(wr.timeSessions ?? []).filter((item) => item.craftpersonId === technician && item.endedAt).map((item) => formatHumanDateTimeRange(item.startedAt, item.endedAt!)),
    ...(wr.MobileWorkSessions ?? []).filter((item) => item.TechnicianId === technician && !(wr.timeSessions ?? []).some((session) => session.id === item.SessionId)).map((item) => `${formatHumanDateTimeRange(item.StartedAt, item.StoppedAt)}${item.PausedDurationMs ? ` (${item.TotalTimeMinutes}m recorded after pauses)` : ""}`),
  ];
  const sessionCount = (wr.timeSessions ?? []).filter((item) => item.craftpersonId === technician && item.endedAt).length + (wr.MobileWorkSessions ?? []).filter((item) => item.TechnicianId === technician && !(wr.timeSessions ?? []).some((session) => session.id === item.SessionId)).length;
  const completed = wr.Percentage >= 78;
  const unfavourableCount = getUnfavourableStepCount(wr, { schedules: [], blueprints: [] });
  const followUpCount = wr.WR_Type === "PM" ? getFollowUpFJsForPM(wr.WR_ID, allWorkRequests).length : 0;
  return <div className="space-y-3 p-4 pb-24">
    <div className="sticky top-0 z-30 mb-4 flex min-h-12 shrink-0 flex-wrap items-center gap-2 rounded border bg-white p-2 shadow-sm"><button disabled={busy} onClick={back} className="text-blue-700">← Back to WRs</button><strong>{wr.WR_ID}</strong><span className="rounded bg-blue-100 px-2">{wr.WR_Type}</span><span className="rounded bg-slate-100 px-2">{wr.Percentage}%</span></div>
    {completed && <section className="space-y-2 rounded-2xl border-2 border-emerald-500/40 bg-emerald-50 p-4"><h1 className="flex items-center gap-2 text-lg font-bold text-emerald-900"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="m7 12 3 3 7-7" /></svg>{wr.Percentage === 100 ? "Closed" : "Technically Completed"} · {wr.Percentage}%</h1><p className="text-sm text-emerald-900">Work completed and submitted for Team Leader / QA review</p><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white px-2 py-1">Recorded Time: {recorded}m across {sessionCount} sessions</span><span className="rounded-full bg-white px-2 py-1">Checklist: {done}/{steps.length} steps · {unfavourableCount} Unfavourable</span>{followUpCount > 0 && <span className="rounded-full bg-white px-2 py-1">Follow-Up FJs: {followUpCount} opened</span>}</div></section>}
    {error && <p role="alert" className="rounded bg-rose-50 p-2 text-rose-700">{error}</p>}{notice && <p role="status" className="rounded bg-emerald-50 p-2 text-emerald-700">{notice}</p>}
    {wr.QA_AuditStatus === "QA_Failed_ActionRequired" && <div className="space-y-2 rounded bg-rose-50 p-3"><strong>⚠ QA REWORK REQUIRED</strong><p>{wr.QA_IssueDescription}</p><textarea className="w-full rounded border p-2" placeholder="Correction performed" value={correction} onChange={(e) => setCorrection(e.target.value)} /><button className="rounded bg-rose-700 px-3 py-1 text-white" disabled={busy || !correction.trim()} onClick={() => void execute(async () => { await save((current) => { if (current.QA_AuditStatus !== "QA_Failed_ActionRequired") throw new Error("This audit no longer requires correction."); return { ...current, QA_AuditStatus: "QA_Corrected", QA_CorrectionComment: correction.trim(), QA_CorrectedDate: new Date().toISOString() }; }, `QA correction submitted: ${correction.trim()}`); setCorrection(""); }, "Correction submitted for verification.")}>Submit correction</button></div>}
    {activeFreezes.length > 0 ? <FreezeBadge freezes={activeFreezes} /> : wr.IsFrozen && <div className="rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900"><strong>❄ Freeze Period</strong><p>{wr.FreezeReason || wr.ActiveFreezeName}</p></div>}
    {freezeGate && <FreezeAckPanel freezes={activeFreezes} busy={busy} confirmLabel="Confirm & Continue to 78%" backLabel="Cancel" onBack={() => setFreezeGate(false)} onConfirm={() => void execute(async () => { await save((current) => ({ ...current, freezeAcknowledged: buildFreezeAcknowledgment(activeFreezes, technicianName) }), `Freeze period safety acknowledgment confirmed by ${technicianName}`); setFreezeGate(false); await beginCompletion(true); })} />}
    <section className="space-y-1 rounded border bg-white p-4"><h1 className="text-lg font-bold">{wr.Description}</h1><p>{wr.bl_id} / {wr.LevelName ?? "—"} / {wr.RoomCode ?? "—"}</p><p>Equipment: {wr.EquipmentCodes.map((code) => `${code} ${equipment.find((item) => item.EquipmentCode === code)?.EquipmentName ?? ""}`).join(", ") || "—"}</p><p>Trade: {wr.TradeName ?? wr.TradeId ?? "—"} · Priority: {wr.Urgency ?? "—"}</p><p>Due: {wr.DueDate ?? "—"} · Margin: {wr.MarginDate ?? "—"}</p><p>Schedule: {planned}</p></section>
    {!completed && <div className="rounded bg-blue-50 p-3 text-sm"><p>Planned Schedule: {planned}</p><p>Recorded Timer: {recorded}m · Technician Opinion: {wr.laborEntries?.find((item) => item.craftpersonId === technician)?.technicianOpinionMinutes === undefined ? "Not provided" : `${wr.laborEntries.find((item) => item.craftpersonId === technician)!.technicianOpinionMinutes}m`}</p>{ahead && <p className="font-semibold text-emerald-700">⚡ Starting ahead of scheduled slot: {planned}</p>}</div>}
    {(wr.technicianFieldUpdates ?? []).filter((item) => item.craftpersonId === technician && item.teamLeaderReply).map((item) => <p key={item.id} className="rounded bg-blue-50 p-2">💬 Team Leader ({item.status}): {item.teamLeaderReply}</p>)}
    {!completed && <button disabled={busy} className="rounded border border-amber-400 bg-amber-50 p-2" onClick={report}>🚩 Report Delay / Ask Team Leader</button>}
    <MobileExecutionTools wr={wr} technician={technician} technicianName={technicianName} person={person} save={save} now={now} />
    {completed ? <div className="grid gap-2"><button type="button" disabled={busy} className="rounded-xl border border-emerald-400 bg-white p-3 font-semibold text-emerald-900" onClick={() => checklist()}>📋 Review Completed Checklist ({done} / {steps.length} steps)</button><button type="button" className="rounded-xl border bg-white p-3" onClick={() => setDialog("comments")}>💬 Comments &amp; Photos</button></div> : <div className="grid gap-2"><button disabled={busy} aria-disabled={!activeTimer} className={`rounded p-3 ${activeTimer ? "bg-blue-700 text-white" : "bg-amber-100 text-amber-900"}`} onClick={() => { if (!activeTimer) { setLockedNotice(true); return; } checklist(); }}>{activeTimer ? `📋 Open Checklist / To-Do Steps (${done} / ${steps.length} completed)` : `🔒 Start Timing First to Open Checklist (${done} / ${steps.length} steps)`}</button>{lockedNotice && !activeTimer && <div role="status" className="rounded bg-amber-50 p-3"><p>You must start timing on this Work Request before opening the checklist.</p><button disabled={busy} className="mt-2 rounded bg-emerald-700 p-2 text-white" onClick={() => void execute(async () => { await save((current) => startTechnicianTimer(current, technician, technicianName), "Started work timer."); checklist(); })}>▶ Start Timing &amp; Open Checklist</button></div>}<button disabled={busy} className="rounded border bg-white p-3" onClick={() => setDialog("comments")}>💬 Comments &amp; Photos</button>{canComplete && <button disabled={busy} className="rounded bg-blue-800 p-3 text-white" onClick={() => void beginCompletion()}>✓ Complete Work — Set to 78% Technically Completed</button>}</div>}
    {precheck && precheck.length > 0 && <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">Checklist incomplete: {precheck.length} of {steps.length} steps still need an answer (Step {precheck.map((index) => index + 1).join(", ")}).</p><button type="button" className="w-full rounded-lg bg-amber-600 p-2 font-semibold text-white" onClick={() => checklist(precheck[0])}>→ Open First Incomplete Step (Step {precheck[0] + 1})</button></div>}
    {followUp && <div className="text-center"><button type="button" disabled={busy} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50" onClick={followUp}>+ Report Follow-Up Fast Job</button></div>}
    {dialog && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" onClick={() => { if (!busy) setDialog(null); }}><div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3"><div><h2 className="text-base font-bold">{dialog === "completion" ? "Complete Work Request (78%)" : "Comments & Photos"}</h2>{dialog === "completion" && <p className="text-xs text-slate-500">Time &amp; Team Confirmation</p>}</div><button type="button" disabled={busy} aria-label="Close" className="text-lg leading-none text-slate-500" onClick={() => setDialog(null)}>✕</button></div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
      {dialog === "completion" ? <>
        {activeFreezes.length > 0 && <p className="rounded-lg bg-blue-50 p-2 text-xs text-blue-800">Completing under confirmed Freeze Period responsibility</p>}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5 text-sm">
          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Planned</p><p className="font-medium">{planned}</p></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Timer Recorded</p><p className="font-medium">{recorded} min · {sessionCount} session{sessionCount === 1 ? "" : "s"}</p></div>
          {measuredRanges.length > 0 && <details className="col-span-2 text-xs text-slate-600"><summary className="cursor-pointer font-medium text-blue-700">View session log</summary><ul className="mt-1 list-disc space-y-0.5 pl-4">{measuredRanges.map((range) => <li key={range}>{range}</li>)}</ul></details>}
        </div>
        <div className="space-y-2 rounded-xl border border-slate-200 p-2.5">
          <p className="text-sm font-semibold">My Time · {shortName}</p>
          {(["measured", "adjust"] as const).map((mode) => <button type="button" key={mode} role="radio" aria-checked={timeMode === mode} onClick={() => setTimeMode(mode)} className={`flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left text-sm ${timeMode === mode ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"}`}><span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${timeMode === mode ? "border-blue-600" : "border-slate-300"}`}>{timeMode === mode && <span className="h-2 w-2 rounded-full bg-blue-600" />}</span><span>{mode === "measured" ? `Use measured timer (${recorded} min)` : "Adjust my actual time"}</span></button>)}
          {timeMode === "adjust" && <div className="space-y-2"><input aria-label="Actual minutes worked" type="number" inputMode="numeric" min="0" step="1" placeholder="Enter minutes worked, e.g. 45" className="block w-full rounded-lg border border-slate-300 p-2.5 text-sm" value={opinion} onChange={(e) => setOpinion(e.target.value)} /><div className="flex flex-wrap gap-1.5">{[15, 30, 45, 60, 90, 120].map((minutes) => <button type="button" key={minutes} onClick={() => setOpinion(String(minutes))} className={`rounded-full border px-2.5 py-1 text-xs ${opinion === String(minutes) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{minutes}m</button>)}</div></div>}
          <p className="text-[11px] text-slate-400">Existing Team Leader overrides take precedence.</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Co-Workers</p>
          {coworkers.map((item, index) => <div key={index} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <div className="flex items-center gap-2"><select aria-label={`Co-worker ${index + 1}`} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white p-2 text-sm" value={item.id} onChange={(e) => setCoworkers((rows) => rows.map((row, i) => i === index ? { ...row, id: e.target.value } : row))}><option value="">Select craftperson...</option>{people.filter((p) => p.id !== technician && (p.id === item.id || !coworkers.some((row) => row.id === p.id))).map((p) => <option key={p.id} value={p.id}>{p.Name} {p.LastName} · {p.Trade}</option>)}</select><button type="button" aria-label={`Remove co-worker ${index + 1}`} className="h-8 w-8 shrink-0 rounded-full text-slate-500 hover:bg-slate-200" onClick={() => setCoworkers((rows) => rows.filter((_, i) => i !== index))}>✕</button></div>
            <div className="flex items-center gap-2"><input aria-label={`Co-worker ${index + 1} minutes`} type="number" inputMode="numeric" min="0" step="1" placeholder="Minutes worked" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white p-2 text-sm" value={item.minutes} onChange={(e) => setCoworkers((rows) => rows.map((row, i) => i === index ? { ...row, minutes: e.target.value } : row))} /><button type="button" className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600" onClick={() => setCoworkers((rows) => rows.map((row, i) => i === index ? { ...row, minutes: myMinutes } : row))}>Same time as me</button></div>
          </div>)}
          <button type="button" className="w-full rounded-xl border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-600" onClick={() => setCoworkers((rows) => [...rows, { id: "", minutes: "" }])}>+ Add Craftperson</button>
        </div>
        <label className="block text-sm font-semibold">Completion summary note<textarea className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm font-normal" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
      </> : <><div className="max-h-48 overflow-auto">{(wr.Activity ?? []).map((entry) => <p key={entry.id} className="border-b py-1 text-sm">{entry.actorName} · {entry.createdAt}: {entry.text}</p>)}{(wr.Attachments ?? []).map((item) => <a key={item.id} className="block text-blue-700 underline" href={item.dataUrl} target="_blank" rel="noreferrer">{item.name}</a>)}</div><textarea className="w-full rounded border p-2" placeholder="Technician comment" value={note} onChange={(e) => setNote(e.target.value)} /><button disabled={busy || !note.trim()} onClick={() => void execute(async () => { const text = note.trim(); await save((current) => ({ ...current, Activity: [...(current.Activity ?? []), { id: crypto.randomUUID(), kind: "comment", actorId: technician, actorName: technicianName, actorRole: "MobileTechnician", createdAt: new Date().toISOString(), text }] }), "Technician posted a comment."); setNote(""); })}>Post comment</button><label className="block cursor-pointer text-blue-700">📷 Add photo<input className="hidden" type="file" accept="image/*" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) { setError("Choose an image no larger than 2 MB."); return; } setBusy(true); const reader = new FileReader(); reader.onerror = () => { setError("Could not read photo."); setBusy(false); }; reader.onload = () => { const url = reader.result; if (typeof url !== "string") { setError("Could not read photo."); setBusy(false); return; } void execute(() => save((current) => ({ ...current, Attachments: [...(current.Attachments ?? []), { id: crypto.randomUUID(), name: file.name,  type: file.type, dataUrl: url }] }), `Added photo ${file.name}.`)); }; reader.readAsDataURL(file); }} /></label></>}
      {error && <p role="alert" className="text-rose-700">{error}</p>}
      </div>
      <div className="flex gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{dialog === "completion" ? <><button type="button" disabled={busy} className="flex-1 rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-medium text-slate-700" onClick={() => setDialog(null)}>Cancel</button><button type="button" disabled={busy} className="flex-[2] rounded-xl bg-blue-700 p-2.5 text-sm font-semibold text-white disabled:opacity-50" onClick={complete}>✓ Confirm &amp; Set to 78%</button></> : <button type="button" disabled={busy} className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-medium text-slate-700" onClick={() => setDialog(null)}>Close</button>}</div>
    </div></div>}
  </div>;
}
