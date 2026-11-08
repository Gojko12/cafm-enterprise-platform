"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BaseWorkRequest, CraftpersonAbsence, LocationFreeze } from "@cafm/shared-schema";
import type { DemoData } from "../../lib/cafm-data";
import { OverviewTable } from "../common/TableColumns";
import { assignmentAbsences, intervalFor, unassignPerson, wallMinutes } from "../../lib/dispatch";
import { getActiveFreezeConflictsForWR } from "../../lib/location-freezes";
import { tradeColor } from "../../lib/trade-colors";

type Person = DemoData["craftspeople"][number];
const formatMinutes = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, "0")}m (${minutes} min)`;

function OverrideInput({ value, disabled, onSave }: { value?: number; disabled: boolean; onSave: (value: number | undefined) => void }) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const [error, setError] = useState("");
  useEffect(() => { setDraft(value === undefined ? "" : String(value)); }, [value]);
  return <div><input aria-label="Team leader override minutes" type="number" min="0" step="1" disabled={disabled} className="w-24 rounded border p-1 disabled:bg-slate-100" value={draft} placeholder="None" onChange={(e) => setDraft(e.target.value)} onBlur={() => {
    if (draft.trim() === "") { setError(""); if (value !== undefined) onSave(undefined); return; }
    const number = Number(draft);
    if (!Number.isInteger(number) || number < 0) { setError("Enter non-negative whole minutes."); return; }
    setError(""); if (number !== value) onSave(number);
  }} />{error && <p role="alert" className="text-xs text-rose-700">{error}</p>}</div>;
}

function RateInput({ value, onSave }: { value: number; onSave: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState("");
  useEffect(() => { setDraft(String(value)); }, [value]);
  return <div><input aria-label="Hourly rate in EUR" type="number" min="0" step="0.01" className="w-24 rounded border p-1" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => {
    const number = Number(draft);
    if (!draft.trim() || !Number.isFinite(number) || number < 0) { setError("Enter a non-negative hourly rate."); return; }
    setError(""); if (number !== value) onSave(number);
  }} />{error && <p role="alert" className="text-xs text-rose-700">{error}</p>}</div>;
}

export function laborRows(wr: BaseWorkRequest, people: Person[]) {
  const entries = wr.laborEntries ?? [];
  const ids = [...new Set([...wr.AssignedCraftpersonIds, ...(wr.CraftpersonLabor ?? []).map((item) => item.craftpersonId), ...entries.flatMap((item) => item.craftpersonId ? [item.craftpersonId] : []), ...(wr.timeSessions ?? []).map((item) => item.craftpersonId), ...(wr.MobileWorkSessions ?? []).flatMap((item) => item.TechnicianId ? [item.TechnicianId] : [])])];
  return [
    ...ids.map((id) => ({ id, entryIndex: entries.findIndex((entry) => entry.craftpersonId === id) })),
    ...entries.flatMap((entry, index) => entry.craftpersonId ? [] : [{ id: `unidentified-${index}`, entryIndex: index }]),
  ].map(({ id, entryIndex }) => {
    const entry = entries[entryIndex];
    const person = people.find((item) => item.id === id);
    const legacy = wr.CraftpersonLabor?.find((item) => item.craftpersonId === id);
    const interval = intervalFor(wr, id);
    const sessions = (wr.timeSessions ?? []).filter((item) => item.craftpersonId === id);
    const sessionIds = new Set(sessions.map((item) => item.id));
    const olderSessions = (wr.MobileWorkSessions ?? []).filter((item) => item.TechnicianId === id && !sessionIds.has(item.SessionId)).map((item) => ({ id: item.SessionId, startedAt: item.StartedAt, endedAt: item.StoppedAt, durationMinutes: item.TotalTimeMinutes }));
    const allSessions = [...sessions, ...olderSessions];
    const stopped = allSessions.filter((item) => item.endedAt);
    const recorded = stopped.length ? stopped.reduce((sum, item) => sum + item.durationMinutes, 0) : entry?.recordedTimerMinutes ?? legacy?.recordedTimerMinutes ?? interval?.recordedTimerMinutes ?? legacy?.workingTimeMinutes ?? 0;
    const opinion = entry?.technicianOpinionMinutes ?? legacy?.technicianOpinionMinutes ?? interval?.technicianOpinionMinutes;
    const override = entry?.teamLeaderOverrideMinutes ?? legacy?.teamLeaderOverrideMinutes ?? interval?.teamLeaderOverrideMinutes;
    const effective = override ?? opinion ?? recorded;
    return { id, entryIndex, entry, person, legacy, interval, sessions: allSessions, recorded, opinion, override, effective,
      name: entry?.name ?? legacy?.name ?? interval?.name ?? person?.Name ?? sessions[0]?.craftpersonName ?? id,
      lastName: entry?.lastName ?? legacy?.lastName ?? interval?.lastName ?? person?.LastName ?? "",
      trade: entry?.trade ?? legacy?.trade ?? interval?.trade ?? person?.Trade,
      rate: entry?.hourlyRate ?? legacy?.hourlyRate ?? interval?.hourlyRate ?? person?.HourlyRate ?? 0 };
  });
}

export function WorkRequestLabor({ wr, people, absences, freezes, update, onClose, activePerson = "Current user", actorRole = "StandardEmployee", canOverride = false }: {
  wr: BaseWorkRequest; people: Person[]; absences: CraftpersonAbsence[]; freezes: LocationFreeze[];
  update: (change: (wr: BaseWorkRequest) => BaseWorkRequest, log?: string) => void; onClose: () => void;
  activePerson?: string; actorRole?: string; canOverride?: boolean;
}) {
  const router = useRouter();
  const rows = laborRows(wr, people);
  const setOverride = (row: typeof rows[number], value: number | undefined) => {
    if (!canOverride) return;
    const effective = value ?? row.opinion ?? row.recorded;
    const now = new Date().toISOString();
    const name = `${row.name} ${row.lastName}`.trim();
    update((current) => {
      const currentEntries = [...(current.laborEntries ?? [])];
      const index = row.entry?.craftpersonId ? currentEntries.findIndex((item) => item.craftpersonId === row.entry?.craftpersonId) : row.entryIndex;
      const previous = index >= 0 ? currentEntries[index] : undefined;
      const next = { ...previous, ...(row.entryIndex < 0 ? { craftpersonId: row.id } : {}), name: row.name, lastName: row.lastName, trade: row.trade, hourlyRate: row.rate, recordedTimerMinutes: row.recorded, technicianOpinionMinutes: row.opinion, teamLeaderOverrideMinutes: value, effectiveMinutes: effective, lastModifiedBy: activePerson, lastModifiedAt: now };
      if (index >= 0) currentEntries[index] = next; else currentEntries.push(next);
      return { ...current, laborEntries: currentEntries,
        CraftpersonLabor: current.CraftpersonLabor?.map((item) => item.craftpersonId === row.id ? { ...item, workingTimeMinutes: effective, teamLeaderOverrideMinutes: value, effectiveMinutes: effective, lastModifiedBy: activePerson, lastModifiedAt: now } : item),
        CraftpersonAssignments: current.CraftpersonAssignments?.map((item) => item.craftpersonId === row.id ? { ...item, name: row.name, lastName: row.lastName, trade: row.trade, hourlyRate: row.rate, recordedTimerMinutes: row.recorded, technicianOpinionMinutes: row.opinion, teamLeaderOverrideMinutes: value, effectiveMinutes: effective, lastModifiedBy: activePerson, lastModifiedAt: now } : item) };
    }, `${actorRole === "TeamLeader" ? "Team Leader" : "Site Administrator"} ${activePerson} ${value === undefined ? "cleared the working time override" : "overwrote working time"} for ${name}: Recorded Timer = ${row.recorded} min, Technician Opinion = ${row.opinion === undefined ? "not provided" : `${row.opinion} min`} -> Team Leader Override = ${value === undefined ? "cleared" : `${value} min`}.`);
  };
  const setRate = (row: typeof rows[number], rate: number) => {
    const now = new Date().toISOString();
    update((current) => {
      const currentEntries = [...(current.laborEntries ?? [])];
      const index = row.entry?.craftpersonId ? currentEntries.findIndex((item) => item.craftpersonId === row.entry?.craftpersonId) : row.entryIndex;
      const previous = index >= 0 ? currentEntries[index] : undefined;
      const next = { ...previous, ...(row.entryIndex < 0 ? { craftpersonId: row.id } : {}), name: row.name, lastName: row.lastName, trade: row.trade, hourlyRate: rate, recordedTimerMinutes: row.recorded, technicianOpinionMinutes: row.opinion, teamLeaderOverrideMinutes: row.override, effectiveMinutes: row.effective, lastModifiedBy: activePerson, lastModifiedAt: now };
      if (index >= 0) currentEntries[index] = next; else currentEntries.push(next);
      return { ...current, laborEntries: currentEntries, CraftpersonLabor: current.CraftpersonLabor?.map((item) => item.craftpersonId === row.id ? { ...item, hourlyRate: rate, lastModifiedBy: activePerson, lastModifiedAt: now } : item), CraftpersonAssignments: current.CraftpersonAssignments?.map((item) => item.craftpersonId === row.id ? { ...item, hourlyRate: rate, lastModifiedBy: activePerson, lastModifiedAt: now } : item) };
    }, `${actorRole} ${activePerson} changed hourly rate for ${row.name} ${row.lastName} from ${row.rate} to ${rate} EUR/h.`);
  };
  const columns = [
    { id: "name", label: "Craftperson / Trade", value: (row: typeof rows[number]) => `${row.name} ${row.lastName} ${row.trade ?? ""}`, render: (row: typeof rows[number]) => <span>{row.name} {row.lastName} <span className={`rounded border px-1 ${tradeColor(row.trade)}`}>{row.trade ?? "—"}</span>{row.entry?.addedByCoWorker && <small className="block">Added by {row.entry.addedByCoWorker}</small>}</span> },
    { id: "shift", label: "Shift", value: (row: typeof rows[number]) => row.person?.shiftStart ? `${row.person.shiftStart}–${row.person.shiftEnd}` : "Standard" },
    { id: "start", label: "Planned Start", value: (row: typeof rows[number]) => row.interval?.assignedStartDateTime },
    { id: "end", label: "Planned End", value: (row: typeof rows[number]) => row.interval?.assignedEndDateTime },
    { id: "hours", label: "Planned Duration (h)", value: (row: typeof rows[number]) => row.interval ? (wallMinutes(row.interval.assignedEndDateTime) - wallMinutes(row.interval.assignedStartDateTime)) / 60 : undefined },
    { id: "recorded", label: "Stopwatch Recorded Time", value: (row: typeof rows[number]) => row.recorded, render: (row: typeof rows[number]) => <details><summary className="cursor-pointer">{formatMinutes(row.recorded)} · {row.sessions.length} session(s)</summary>{row.sessions.map((session) => <p key={session.id} className="whitespace-nowrap text-xs">{session.startedAt} – {session.endedAt ?? "Running"} · {session.durationMinutes} min</p>)}</details> },
    { id: "opinion", label: "Technician Opinion Time", value: (row: typeof rows[number]) => row.opinion, render: (row: typeof rows[number]) => row.opinion === undefined ? "—" : formatMinutes(row.opinion) },
    { id: "override", label: "Team Leader Override Time (min)", value: (row: typeof rows[number]) => row.override, render: (row: typeof rows[number]) => <OverrideInput value={row.override} disabled={!canOverride} onSave={(value) => setOverride(row, value)} /> },
    { id: "rate", label: "Hourly Rate EUR/h", value: (row: typeof rows[number]) => row.rate, render: (row: typeof rows[number]) => <RateInput value={row.rate} onSave={(value) => setRate(row, value)} /> },
    { id: "effective", label: "Final Effective Time & Cost", value: (row: typeof rows[number]) => row.effective, render: (row: typeof rows[number]) => <span>{formatMinutes(row.effective)} · €{(row.effective * row.rate / 60).toFixed(2)}<small className="block">€{row.rate.toFixed(2)}/h</small></span> },
    { id: "warnings", label: "Status / Warnings", value: (row: typeof rows[number]) => !wr.AssignedCraftpersonIds.includes(row.id) ? "Unassigned (labor retained)" : !row.interval ? "Unscheduled" : [getActiveFreezeConflictsForWR({ ...wr, AssignedCraftpersonIds: [row.id], CraftpersonAssignments: [row.interval], StartDate_DateToPerform: undefined }, freezes).length ? "❄ Freeze" : "", assignmentAbsences(absences, wr.SiteId, row.interval).length ? "🏖 Leave Conflict" : "", "Scheduled"].filter(Boolean).join(" · ") },
    { id: "actions", label: "Actions", value: () => "", render: (row: typeof rows[number]) => <span className="flex flex-col items-start whitespace-normal"><button disabled={!row.interval} onClick={() => { if (!row.interval) return; const query = new URLSearchParams({ focusWrId: wr.WR_ID, focusCraftpersonId: row.id, focusStart: row.interval.assignedStartDateTime, isolateWr: "true" }); onClose(); router.push(`/scheduler?${query}`); }}>📍 Show in Calendar</button>{wr.AssignedCraftpersonIds.includes(row.id) && <button onClick={() => { if (window.confirm(`Unassign ${row.name} ${row.lastName}? Labor history will be retained.`)) update((current) => unassignPerson(current, row.id), `${actorRole} ${activePerson} unassigned ${row.name} ${row.lastName}; recorded labor retained.`); }}>✕ Unassign</button>}</span> },
  ];
  return <OverviewTable preferenceKey="wr-labor" columns={columns} rows={rows} rowKey={(row) => row.id} />;
}
