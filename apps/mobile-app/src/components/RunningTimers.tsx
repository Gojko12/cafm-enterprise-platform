import React from "react";
import type { BaseWorkRequest, Equipment } from "@cafm/shared-schema";
import { laborFor } from "./MobileExecutionTools";

type Session = NonNullable<BaseWorkRequest["timeSessions"]>[number];
export type RunningTimer = { wr: BaseWorkRequest; session: Session };

export function timerClock(startedAt: string, now: number): string {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return "Invalid time";
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((value) => String(value).padStart(2, "0")).join(":");
}

function progress(wr: BaseWorkRequest): string {
  if (wr.WR_Type !== "PM") return `${(wr.todoSteps ?? []).filter((step) => step.completed).length} / ${(wr.todoSteps ?? []).length}`;
  const steps = wr.ChecklistSteps?.length ? wr.ChecklistSteps : wr.ChecklistInstances ?? [];
  const done = steps.filter((step) => {
    const result = wr.ChecklistResults?.find((item) => item.stepId === step.StepId);
    return result && !(typeof result.value === "string" && !result.value.trim()) && !(Array.isArray(result.value) && !result.value.length);
  }).length;
  return `${done} / ${steps.length}`;
}

export function TimerCard({ timer, equipment, now, open, compact = false }: {
  timer: RunningTimer; equipment: Equipment[]; now: number; open: (id: string) => void; compact?: boolean;
}) {
  const { wr, session } = timer;
  const prior = laborFor(wr, wr.timeSessions ?? [], session.craftpersonId, new Date(now).toISOString()).recordedTimerMinutes;
  const equipmentLabel = wr.EquipmentCodes.map((code) => `${code} ${equipment.find((item) => item.EquipmentCode === code)?.EquipmentName ?? ""}`).join(", ") || "—";
  return <button onClick={() => open(wr.WR_ID)} className={`${compact ? "w-64 shrink-0" : "w-full"} rounded border border-emerald-500 bg-slate-800 p-3 text-left text-white`}>
    <div className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /><strong className="font-mono">{timerClock(session.startedAt, now)}</strong><span className="text-xs text-emerald-300">+ {prior}m prior</span></div>
    <p className="font-semibold">{wr.WR_ID} <span className="rounded bg-blue-600 px-1 text-xs">{wr.WR_Type}</span> · {wr.Description}</p>
    <p className="text-xs text-slate-200">{wr.bl_id} / {wr.RoomCode ?? "—"} · {equipmentLabel}</p>
    <p className="text-xs text-slate-200">Checklist: {progress(wr)} steps · Started {new Date(session.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
  </button>;
}

export function TimersPage({ timers, requests, technician, equipment, now, open }: {
  timers: RunningTimer[]; requests: BaseWorkRequest[]; technician: string; equipment: Equipment[]; now: number; open: (id: string) => void;
}) {
  const today = new Date(now).toDateString();
  const completed = requests.flatMap((wr) => (wr.timeSessions ?? []).filter((session) => session.craftpersonId === technician && session.endedAt && new Date(session.endedAt).toDateString() === today).map((session) => ({ wr, session }))).sort((a, b) => (b.session.endedAt ?? "").localeCompare(a.session.endedAt ?? ""));
  return <div className="space-y-3 p-4 pb-24"><h1 className="text-xl font-bold">⏱ Running Timers ({timers.length})</h1>
    {!timers.length && <p>No active timers running.</p>}
    {timers.map((timer) => <TimerCard key={timer.session.id} timer={timer} equipment={equipment} now={now} open={open} />)}
    <h2 className="font-bold">Completed today</h2>
    {!completed.length && <p className="text-sm text-slate-500">No completed sessions today.</p>}
    {completed.map(({ wr, session }) => <button key={session.id} className="block w-full rounded border bg-white p-3 text-left" onClick={() => open(wr.WR_ID)}><strong>{wr.WR_ID} · {wr.WR_Type}</strong><p>{wr.Description}</p><p className="text-sm">{session.durationMinutes} min · Finished {new Date(session.endedAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></button>)}
  </div>;
}
