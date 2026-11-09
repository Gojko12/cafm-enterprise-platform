"use client";

import React, { useState } from "react";
import type { CraftpersonAbsence } from "@cafm/shared-schema";
import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { DemoData } from "@/lib/cafm-data";
import type { CraftpersonDispute } from "@/lib/craftperson-disputes";
import type { DisputeViewMode } from "@/lib/disputes";
import { getEffectiveCraftpersonShift, shiftSegments } from "@/lib/craftperson-shifts";
import { activeAbsences, addDays, wallMinutes } from "@/lib/dispatch";

type Person = DemoData["craftspeople"][number];
export type Brush = "Early" | "Standard" | "Late" | "Night" | "Custom" | "Vacation" | "Training" | "SickLeave";
export const brushes: Brush[] = ["Early", "Standard", "Late", "Night", "Custom", "Vacation", "Training", "SickLeave"];
export const labels: Record<Brush, string> = { Early: "☀️ Early", Standard: "🔧 Standard", Late: "🌆 Late", Night: "🌙 Night", Custom: "⏱ Custom", Vacation: "🏖 Vacation", Training: "🎓 Training", SickLeave: "🤒 Sick Leave" };
export const colors: Record<Brush, string> = { Early: "bg-amber-500 text-white ring-amber-600", Standard: "bg-blue-600 text-white ring-blue-700", Late: "bg-purple-600 text-white ring-purple-700", Night: "bg-slate-800 text-white ring-indigo-500", Custom: "bg-teal-600 text-white ring-teal-700", Vacation: "bg-orange-500 text-white ring-orange-600", Training: "bg-violet-600 text-white ring-violet-700", SickLeave: "bg-rose-600 text-white ring-rose-700" };

export function MultiFilter({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (values: string[]) => void }) {
  return <details className="relative"><summary className="cursor-pointer rounded border bg-white p-1">{label}{selected.length ? ` (${selected.length})` : ""}</summary><div className="absolute left-0 z-40 max-h-64 min-w-44 overflow-auto rounded border bg-white p-2 shadow-lg">
    {options.map((option) => <label key={option} className="block whitespace-nowrap"><input type="checkbox" checked={selected.includes(option)} onChange={(e) => onChange(e.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} /> {option}</label>)}
    <button type="button" className="mt-1 underline" onClick={() => onChange([])}>Clear</button>
  </div></details>;
}

export function ShiftPlanner({ people, absences, today, selected, setSelected, brush, setBrush, customStart, customEnd, setCustomStart, setCustomEnd, paint, paintCustom, editDay, disputes, disputeMode, period, setPeriod, anchor, setAnchor, onDispute, readOnly = false }: {
  people: Person[]; absences: CraftpersonAbsence[]; today: string; selected: string[]; setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  brush: Brush; setBrush: (value: Brush) => void; customStart: string; customEnd: string; setCustomStart: (value: string) => void; setCustomEnd: (value: string) => void;
  paint: (ids: string[], dates: string[], brush: Brush) => void; paintCustom: (id: string, day: string, start: string, end: string) => void; editDay: (person: Person, day: string) => void;
  disputes: Record<string, CraftpersonDispute[]>; disputeMode: DisputeViewMode; period: "week" | "two" | "month"; setPeriod: (value: "week" | "two" | "month") => void; anchor: string; setAnchor: (value: string) => void;
  onDispute: (issue: CraftpersonDispute, person: Person) => void;
  readOnly?: boolean;
}) {
  const [filter, setFilter] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; day: string; start: string; end: string } | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const date = new Date(`${anchor}T12:00:00`);
  const first = period === "month" ? `${anchor.slice(0, 7)}-01` : addDays(anchor, -((date.getDay() + 6) % 7));
  const count = period === "month" ? new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() : period === "week" ? 7 : 14;
  const days = Array.from({ length: count }, (_, i) => addDays(first, i));
  const dayValues = (p: Person, day: string) => { const leaves = activeAbsences(absences, p.SiteId, p.id, day); return [getEffectiveCraftpersonShift(p, day).shiftType, ...(leaves.length ? leaves.map((a) => a.absenceType) : ["Available"])]; };
  const visible = people.filter((p) => (disputeMode !== "only" || (disputes[p.id] ?? []).some((issue) => issue.type !== "Overlap" && days.includes(issue.date))) && (!filter.length || days.some((day) => dayValues(p, day).some((value) => filter.includes(value)))));
  const move = (offset: number) => {
    if (period !== "month") setAnchor(addDays(anchor, offset * count));
    else { const moved = new Date(date.getFullYear(), date.getMonth() + offset, 1, 12); setAnchor(`${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, "0")}-01`); }
  };
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">{brushes.map((key) => <button key={key} type="button" aria-pressed={brush === key} onClick={() => setBrush(key)} className={`rounded border-b-4 px-2 py-1 ${brush === key ? `${colors[key]} border-current font-bold ring-2` : "border-transparent bg-slate-100"}`}>{brush === key && "✓ "}{labels[key]}</button>)}
      <span className="rounded bg-slate-100 p-1">Active Brush: <strong className={`rounded px-1 ${colors[brush]}`}>{labels[brush]}</strong> — Click any cell (or row header for whole period) to assign</span>
      {brush === "Custom" && <><input type="time" aria-label="Custom from" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /><input type="time" aria-label="Custom to" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></>}
    </div>
    <div className="flex flex-wrap items-center gap-2">{([["week", "Weekly (7 Days)"], ["two", "2-Week (14 Days)"], ["month", "Monthly (Full Month)"]] as const).map(([key, title]) => <button key={key} className={`rounded border px-2 py-1 ${period === key ? "bg-blue-700 text-white" : "bg-white"}`} aria-pressed={period === key} onClick={() => setPeriod(key)}>{title}</button>)}
      <button onClick={() => move(-1)}>‹ Prev</button><button onClick={() => setAnchor(today)}>Today</button><button onClick={() => move(1)}>Next ›</button><strong>{first} – {days[days.length - 1]}</strong>
      <MultiFilter label="Shift & Availability" options={[...brushes, "Available"]} selected={filter} onChange={setFilter} />
      <span className="rounded bg-blue-100 px-2 py-1">{visible.length} craftspeople {filter.length ? `matching ${filter.join(", ")}` : "in this period"}</span>
    </div>
    <div className="relative max-h-[calc(100vh-250px)] overflow-auto rounded-lg border border-slate-200"><table className="border-separate border-spacing-0"><thead><tr><th className="sticky left-0 top-0 z-30 border-b border-r border-slate-300 bg-slate-100 p-1">Craftsperson</th>{days.map((day) => <th key={day} className="sticky top-0 z-20 min-w-36 border bg-slate-100 p-1 shadow-sm">{day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" })}</th>)}</tr></thead><tbody>
      {[...new Set([...CLASSICAL_TRADES, ...visible.map((p) => p.Trade)])].filter((trade) => visible.some((p) => p.Trade === trade)).map((trade) => <React.Fragment key={trade}><tr className="bg-slate-50"><th className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 p-2 text-left font-semibold"><button aria-expanded={!collapsed.includes(trade)} onClick={() => setCollapsed((old) => old.includes(trade) ? old.filter((item) => item !== trade) : [...old, trade])}>{collapsed.includes(trade) ? "▶" : "▼"} 📁 {trade || "Unspecified"}</button></th><td colSpan={days.length} /></tr>
      {!collapsed.includes(trade) && visible.filter((p) => p.Trade === trade).map((p) => <tr key={p.id}><th className="sticky left-0 z-10 border-r border-slate-200 bg-white p-1 text-left"><input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected((old) => e.target.checked ? [...old, p.id] : old.filter((id) => id !== p.id))} /> <button disabled={readOnly} title="Apply brush to whole visible period" onClick={() => { if (window.confirm(`Apply ${labels[brush]} to ${p.Name} for all ${days.length} days?`)) paint([p.id], days, brush); }}>{p.Name} {p.LastName}</button></th>
        {days.map((day) => { const shift = getEffectiveCraftpersonShift(p, day); const leaves = activeAbsences(absences, p.SiteId, p.id, day); const key = (leaves[0]?.absenceType && brushes.includes(leaves[0].absenceType as Brush) ? leaves[0].absenceType : shift.shiftType) as Brush; const issues = (disputes[p.id] ?? []).filter((item) => item.date === day); const midnight = wallMinutes(`${day}T00:00`); const matches = filter.length && dayValues(p, day).some((value) => filter.includes(value));
          return <td key={day} className={`border p-1 align-top ${disputeMode === "highlight" ? issues.some((issue) => issue.type !== "Overlap") ? "relative z-10 bg-rose-100 font-bold text-rose-950 shadow-lg ring-4 ring-rose-500" : "opacity-40" : matches ? "ring-2 ring-inset ring-amber-400" : ""}`}><button disabled={readOnly} className="w-full text-left" onClick={() => paint([p.id], [day], brush)}><span className={`block rounded px-1 ${colors[key]}`}>{leaves.length ? leaves.map((leave) => leave.absenceType).join(", ") : `${labels[shift.shiftType]} ${shift.shiftStart}–${shift.shiftEnd}`}</span><span className="relative mt-1 block h-2.5 w-full overflow-hidden rounded bg-slate-200" aria-label={`Working time ${shift.shiftStart} to ${shift.shiftEnd}`}>{shiftSegments(p, day).map((part, index) => <span key={index} className="absolute inset-y-0 border border-emerald-500 bg-white" style={{ left: `${(part.start - midnight) / 1440 * 100}%`, width: `${(part.end - part.start) / 1440 * 100}%` }} />)}</span></button>
            <button disabled={readOnly} className="text-blue-700" aria-label={`Edit inline custom hours for ${p.Name} ${day}`} onClick={() => setEditing({ id: p.id, day, start: shift.shiftStart, end: shift.shiftEnd })}>⏱</button> <button className="text-blue-700" aria-label={`Open schedule for ${p.Name} ${day}`} onClick={() => editDay(p, day)}>⚙</button>
            {editing?.id === p.id && editing.day === day && <div className="space-y-1"><input aria-label="Cell start time" type="time" value={editing.start} onChange={(e) => setEditing({ ...editing, start: e.target.value })} /><input aria-label="Cell end time" type="time" value={editing.end} onChange={(e) => setEditing({ ...editing, end: e.target.value })} /><button disabled={readOnly || !editing.start || !editing.end || editing.start === editing.end} onClick={() => { paintCustom(p.id, day, editing.start, editing.end); setEditing(null); }}>Save</button> <button onClick={() => setEditing(null)}>Cancel</button></div>}
            <div className="max-h-28 space-y-1 overflow-y-auto">{issues.map((issue, index) => <button type="button" key={`${issue.type}-${issue.wr.WR_ID}-${index}`} title={issue.message} className="block max-w-full truncate rounded bg-rose-100 px-1 text-left text-red-800 underline" onClick={(event) => { event.stopPropagation(); onDispute(issue, p); }}>⚠ {issue.wr.WR_ID} • {issue.type} 📍</button>)}</div></td>;
        })}
      </tr>)}</React.Fragment>)}
    </tbody></table></div>
    {selected.length > 0 && <button disabled={readOnly} className="rounded border px-2 py-1" onClick={() => { if (window.confirm(`Apply ${labels[brush]} to ${selected.length} craftspeople for ${days.length} days?`)) paint(selected, days, brush); }}>Apply brush to selected for visible period</button>}
  </div>;
}
