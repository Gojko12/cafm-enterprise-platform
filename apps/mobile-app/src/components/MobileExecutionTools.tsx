import React, { useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";

type Step = NonNullable<BaseWorkRequest["todoSteps"]>[number];
type Session = NonNullable<BaseWorkRequest["timeSessions"]>[number];

export function laborFor(current: BaseWorkRequest, sessions: Session[], technician: string, modifiedAt: string, person?: { Name: string; LastName: string; Trade: string; HourlyRate: number }) {
  const existing = current.laborEntries?.find((entry) => entry.craftpersonId === technician);
  const legacy = current.CraftpersonLabor?.find((entry) => entry.craftpersonId === technician);
  const assignment = current.CraftpersonAssignments?.find((entry) => entry.craftpersonId === technician);
  const ownSessions = sessions.filter((session) => session.craftpersonId === technician && session.endedAt);
  const older = (current.MobileWorkSessions ?? []).filter((session) => session.TechnicianId === technician && !sessions.some((item) => item.id === session.SessionId));
  const sessionMinutes = ownSessions.reduce((sum, session) => sum + session.durationMinutes, 0) + older.reduce((sum, session) => sum + session.TotalTimeMinutes, 0);
  const recorded = Math.max(sessionMinutes, existing?.recordedTimerMinutes ?? legacy?.recordedTimerMinutes ?? assignment?.recordedTimerMinutes ?? legacy?.workingTimeMinutes ?? 0);
  const opinion = existing?.technicianOpinionMinutes ?? legacy?.technicianOpinionMinutes ?? assignment?.technicianOpinionMinutes;
  const override = existing?.teamLeaderOverrideMinutes ?? legacy?.teamLeaderOverrideMinutes ?? assignment?.teamLeaderOverrideMinutes;
  return { ...existing, craftpersonId: technician, name: existing?.name ?? legacy?.name ?? assignment?.name ?? person?.Name ?? technician, lastName: existing?.lastName ?? legacy?.lastName ?? assignment?.lastName ?? person?.LastName ?? "", trade: existing?.trade ?? legacy?.trade ?? assignment?.trade ?? person?.Trade, hourlyRate: existing?.hourlyRate ?? legacy?.hourlyRate ?? assignment?.hourlyRate ?? person?.HourlyRate ?? 0, recordedTimerMinutes: recorded, technicianOpinionMinutes: opinion, teamLeaderOverrideMinutes: override, effectiveMinutes: override ?? opinion ?? recorded, lastModifiedBy: technician, lastModifiedAt: modifiedAt };
}

export function stopTechnicianTimer(current: BaseWorkRequest, technician: string, person?: { Name: string; LastName: string; Trade: string; HourlyRate: number }): BaseWorkRequest {
  const running = (current.timeSessions ?? []).find((session) => session.craftpersonId === technician && !session.endedAt);
  if (!running) return current;
  const end = Date.now(), startTime = Date.parse(running.startedAt);
  if (!Number.isFinite(startTime) || end < startTime) throw new Error("The timer timestamps are invalid; the session was not stopped.");
  const minutes = Math.max(1, Math.round(Math.floor((end - startTime) / 1000) / 60));
  const sessions = (current.timeSessions ?? []).map((session) => session.id === running.id ? { ...session, endedAt: new Date(end).toISOString(), durationMinutes: minutes } : session);
  const previous = laborFor(current, current.timeSessions ?? [], technician, new Date(end).toISOString(), person);
  const entry = { ...laborFor(current, sessions, technician, new Date(end).toISOString(), person), recordedTimerMinutes: previous.recordedTimerMinutes + minutes };
  entry.effectiveMinutes = entry.teamLeaderOverrideMinutes ?? entry.technicianOpinionMinutes ?? entry.recordedTimerMinutes;
  return { ...current, timeSessions: sessions, laborEntries: [...(current.laborEntries ?? []).filter((item) => item.craftpersonId !== technician), entry], TotalTimeMinutes: current.TotalTimeMinutes + minutes };
}

export function startTechnicianTimer(current: BaseWorkRequest, technician: string, technicianName: string): BaseWorkRequest {
  if ((current.timeSessions ?? []).some((session) => session.craftpersonId === technician && !session.endedAt)) throw new Error("A timer is already running on this work request.");
  return { ...current, timeSessions: [...(current.timeSessions ?? []), { id: crypto.randomUUID(), craftpersonId: technician, craftpersonName: technicianName, startedAt: new Date().toISOString(), durationMinutes: 0 }] };
}

export function MobileExecutionTools({ wr, technician, technicianName, person, mode = "timer", save, now }: {
  wr: BaseWorkRequest;
  technician: string;
  technicianName: string;
  person?: { Name: string; LastName: string; Trade: string; HourlyRate: number };
  mode?: "timer" | "todo";
  now: number;
  save: (change: (current: BaseWorkRequest) => BaseWorkRequest, message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opinion, setOpinion] = useState(() => {
    const value = wr.laborEntries?.find((entry) => entry.craftpersonId === technician)?.technicianOpinionMinutes;
    return value === undefined ? "" : String(value);
  });
  const active = (wr.timeSessions ?? []).find((session) => session.craftpersonId === technician && !session.endedAt);
  const execute = async (change: (current: BaseWorkRequest) => BaseWorkRequest, message: string) => {
    setBusy(true); setError("");
    try { await save(change, message); return true; }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Could not save your changes."); return false; }
    finally { setBusy(false); }
  };
  const start = () => void execute((current) => startTechnicianTimer(current, technician, technicianName), "Started work timer.");
  const stop = () => void execute((current) => {
    const running = (current.timeSessions ?? []).find((session) => session.craftpersonId === technician && !session.endedAt);
    if (!running) throw new Error("The running session is no longer available.");
    return stopTechnicianTimer(current, technician, person);
  }, "Stopped work timer.");
  const elapsed = active ? Math.max(0, Math.floor((now - Date.parse(active.startedAt)) / 1000)) : 0;
  const completedSessions = (wr.timeSessions ?? []).filter((item) => item.craftpersonId === technician && item.endedAt);
  const total = completedSessions.reduce((sum, item) => sum + item.durationMinutes, 0);
  const clock = [Math.floor(elapsed / 3600), Math.floor(elapsed / 60) % 60, elapsed % 60].map((n) => String(n).padStart(2, "0")).join(":");
  return <section id="work-timer" tabIndex={-1} className="space-y-3 rounded border bg-white p-4 focus:ring-4 focus:ring-emerald-400">
    {mode === "timer" && <>
    <h2 className="font-bold">Work timer</h2>
    <p className="font-mono text-3xl font-semibold">{clock}</p>
    <div className="flex gap-2"><button disabled={busy || !!active} className="rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50" onClick={start}>▶ Start Timing</button><button disabled={busy || !active} className="rounded bg-rose-700 px-3 py-2 text-sm text-white disabled:opacity-50" onClick={stop}>⏹ Stop Timing</button></div>
    <p className="rounded bg-blue-50 p-2 text-sm">Total Recorded: {Math.floor(total / 60)}h {total % 60}m across {completedSessions.length} sessions</p>
    {completedSessions.map((session) => <p key={session.id} className="text-xs text-slate-600">{new Date(session.startedAt).toLocaleString()} – {new Date(session.endedAt!).toLocaleString()} · {session.durationMinutes} min</p>)}
    {wr.Percentage === 78 && <div><label className="block">Technician opinion time (minutes)<input className="ml-2 w-24 rounded border p-1" type="number" min="0" step="1" value={opinion} onChange={(e) => setOpinion(e.target.value)} /></label><button disabled={busy} className="mt-2 rounded border px-3 py-1" onClick={() => {
      const value = Number(opinion);
      if (!opinion.trim() || !Number.isInteger(value) || value < 0) { setError("Enter non-negative whole minutes."); return; }
      void execute((current) => {
        if (current.Percentage !== 78) throw new Error("The work request is no longer at 78%.");
        const entry = laborFor(current, current.timeSessions ?? [], technician, new Date().toISOString(), person);
        return { ...current, laborEntries: [...(current.laborEntries ?? []).filter((item) => item.craftpersonId !== technician), { ...entry, technicianOpinionMinutes: value, effectiveMinutes: entry.teamLeaderOverrideMinutes ?? value }] };
      }, `Technician opinion time recorded: ${value} minutes.`);
    }}>Save opinion time</button></div>}
    </>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {mode === "todo" && wr.WR_Type !== "PM" && <><h2 className="font-bold">Technician To-Do</h2>{!(wr.todoSteps ?? []).length && <p>No steps have been assigned yet.</p>}{[...(wr.todoSteps ?? [])].sort((a, b) => a.order - b.order).map((step) => <TodoStep key={step.id} step={step} disabled={busy} save={(changes) => execute((current) => {
      const currentStep = (current.todoSteps ?? []).find((item) => item.id === step.id);
      if (!currentStep) throw new Error("This step no longer exists.");
      if (JSON.stringify(currentStep) !== JSON.stringify(step)) throw new Error("This step changed while you were editing it. Reopen the work request and try again.");
      return { ...current, todoSteps: (current.todoSteps ?? []).map((item) => item.id === step.id ? { ...item, ...changes } : item) };
    }, `Updated technician step: ${step.title}.`)} technician={technicianName} />)}</>}
  </section>;
}

function TodoStep({ step, disabled, save, technician }: { step: Step; disabled: boolean; save: (changes: Partial<Step>) => Promise<boolean>; technician: string }) {
  const [comment, setComment] = useState(step.technicianComment ?? "");
  const [favourable, setFavourable] = useState(step.isFavourable === undefined ? "" : step.isFavourable ? "yes" : "no");
  const [photo, setPhoto] = useState<string>();
  const [error, setError] = useState("");
  const readPhoto = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) { setError("Choose an image no larger than 2 MB."); return; }
    const reader = new FileReader();
    reader.onerror = () => setError("Could not read the photo.");
    reader.onload = () => { if (typeof reader.result === "string") { setPhoto(reader.result); setError(""); } else setError("Could not read the photo."); };
    reader.readAsDataURL(file);
  };
  return <div className="space-y-2 rounded border p-3"><strong>{step.order}. {step.title}</strong>{step.instruction && <p>{step.instruction}</p>}<p>{step.completed ? `Completed by ${step.completedBy ?? "technician"}` : "Pending"}</p>
    <label className="block">Finding <select className="rounded border" value={favourable} onChange={(e) => setFavourable(e.target.value)}><option value="">Not specified</option><option value="yes">Favourable</option><option value="no">Unfavourable</option></select></label>
    <label className="block">Comment<textarea className="block w-full rounded border p-2" value={comment} onChange={(e) => setComment(e.target.value)} /></label>
    <label className="inline-block cursor-pointer rounded border px-2 py-1">📷 Add photo<input className="hidden" type="file" accept="image/*" onChange={(e) => { readPhoto(e.target.files?.[0]); e.target.value = ""; }} /></label>
    {photo && <p>Photo ready to save.</p>}{step.photoUrls?.map((url, i) => <a className="mr-2 text-blue-700 underline" key={i} href={url} target="_blank" rel="noreferrer">Photo {i + 1}</a>)}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button disabled={disabled} className="block rounded bg-slate-800 px-3 py-2 text-white disabled:opacity-50" onClick={() => void save({ completed: true, completedBy: technician, completedAt: new Date().toISOString(), technicianComment: comment.trim() || undefined, isFavourable: favourable === "" ? undefined : favourable === "yes", ...(photo ? { photoUrls: [...(step.photoUrls ?? []), photo] } : {}) }).then((saved) => { if (saved) setPhoto(undefined); })}>Save completed step</button>
  </div>;
}
