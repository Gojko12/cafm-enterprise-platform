"use client";

import React, { useState } from "react";
import { compileBlueprintChecklist, pmTargetKey, pmTargetType } from "@cafm/shared-schema";
import type { PM_ChecklistStandard, PM_Schedule, BaseWorkRequest } from "@cafm/shared-schema";
import type { PMPlanTarget } from "@/lib/pm-plan-targets";
import { frequencyOf, occurrenceKey, previewCycles, isUnstarted } from "@/lib/pm-suppression";
import { FrequencyPill } from "@/components/common/PmFrequency";

const button = "rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40";
export function PmTargetPlans({ targets, orders, blueprints, requests, selected, onSelect, onAssign, onRemove, onShift, busy, canEdit, error }: {
  targets: PMPlanTarget[]; orders: PM_Schedule[]; blueprints: PM_ChecklistStandard[]; requests: BaseWorkRequest[];
  selected: string; onSelect: (id: string) => void; onAssign: (id: string) => void; onRemove: (order: PM_Schedule) => void;
  onShift: (order: PM_Schedule, cycle: string, date: string, action: "move" | "keep") => Promise<void>;
  busy: boolean; canEdit: boolean; error: string;
}) {
  const [locations, setLocations] = useState(() => pmTargetType(targets.find((target) => target.id === selected) ?? { targetType: "equipment" }) !== "equipment"), [query, setQuery] = useState("");
  const [shift, setShift] = useState<{ order: PM_Schedule; cycle: string; date: string; action: "move" | "keep" }>();
  const list = targets.filter((target) => (pmTargetType(target) !== "equipment") === locations && target.label.toLowerCase().includes(query.trim().toLowerCase()));
  const target = list.find((item) => item.id === selected) ?? list[0];
  const assigned = orders.filter((order) => target && pmTargetKey(order) === target.id);
  const groupKey = (order: PM_Schedule) => order.suppressionMode === "independent" ? `standalone:${order.ScheduleId}` : order.suppressionGroupKey!;
  const startShift = (order: PM_Schedule) => {
    const due = requests.filter((wr) => wr.SiteId === order.SiteId && wr.ScheduleId === order.ScheduleId && isUnstarted(wr) && wr.DueDate && wr.DueDate.slice(0, 10) >= new Date().toISOString().slice(0, 10)).map((wr) => wr.DueDate!.slice(0, 10)).sort()[0] ?? order.NextDueDate.slice(0, 10);
    setShift({ order, cycle: due, date: due, action: "move" });
  };
  return <div className="flex flex-col items-start gap-4 md:flex-row">
    <aside className="w-full shrink-0 space-y-2 rounded-xl border bg-white p-3 md:w-80"><div className="flex gap-1"><button className={`${button} ${!locations ? "border-blue-600" : ""}`} onClick={() => setLocations(false)}>Equipment</button><button className={`${button} ${locations ? "border-blue-600" : ""}`} onClick={() => setLocations(true)}>Locations</button></div><p className="text-xs">Buildings / Floors / Rooms</p>
      <input aria-label="Search PM targets" className="w-full rounded border p-2" placeholder="Search equipment or locations" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="max-h-[70vh] space-y-2 overflow-auto">{list.map((item) => {
        const rules = orders.filter((order) => pmTargetKey(order) === item.id);
        const count = rules.length ? previewCycles(rules, item.id, rules[0].anchorDate!, 12).winners.length : 0;
        return <button key={item.id} className={`${button} w-full text-left ${item.id === target?.id ? "border-blue-600 bg-blue-50" : ""}`} onClick={() => onSelect(item.id)}>{item.label}<small className="block">{rules.length} active PMS · {count} WRs/year</small></button>;
      })}</div>
    </aside>
    <section className="min-w-0 flex-1 space-y-4">{target && <><header className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4"><div><h2 className="text-xl font-bold">{target.label}</h2><p>{[target.bl_id, target.LevelName, target.RoomCode].filter(Boolean).join(" / ")}</p></div><button className={button} disabled={!canEdit || busy} onClick={() => onAssign(target.id)}>+ Assign Blueprint (New PMS)</button></header>
      {[...new Set(assigned.map(groupKey))].map((id) => {
        const group = assigned.filter((order) => groupKey(order) === id);
        const preview = previewCycles(group, target.id, group[0].anchorDate!, 12);
        return <section key={id} className="space-y-3 rounded-xl border bg-white p-4"><h3 className="font-bold">{group[0].suppressionGroupName}</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm"><span>Shared Target Anchor: {group[0].anchorDate}</span><button className={button} disabled={!canEdit || busy} onClick={() => startShift(group[0])}>Change Schedule Date / Day</button></div>
          <p className="text-xs text-slate-500">The family shares one phase on this target only. Started and completed work is never rewritten.</p>
          <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["PMS #", "Blueprint Name", "Locked Freq", "Compiled Steps", "Remove"].map((text) => <th key={text} className="p-2">{text}</th>)}</tr></thead><tbody>{group.map((order) => {
            const steps = compileBlueprintChecklist(order.ChecklistCode, blueprints);
            return <tr className="border-t" key={order.ScheduleId}><td className="p-2 font-mono">{order.ScheduleId}</td><td>{blueprints.find((bp) => bp.ChecklistCode === order.ChecklistCode)?.Title}</td><td><FrequencyPill code={order.frequencyCode} /></td>
              <td><details><summary className="cursor-pointer text-blue-700">{steps.length} steps · preview</summary>{steps.map((step) => <p key={step.StepId} className="max-w-sm text-xs"><FrequencyPill code={step.originFrequency} inherited={step.isInherited} /> {step.Title} {step.replacesStepLabel}</p>)}</details></td>
              <td><button className={button} disabled={!canEdit || busy} onClick={() => onRemove(order)}>Remove</button></td></tr>;
          })}</tbody></table></div>
          <p className="rounded bg-emerald-50 p-2 text-sm font-semibold">Result: {preview.winners.length} WRs/year instead of {preview.winners.length + preview.suppressed.length} — {preview.suppressed.length} duplicates prevented</p>
          <div className="flex max-h-56 flex-wrap gap-2 overflow-auto">{preview.winners.map((item) => <article key={occurrenceKey(item)} className="rounded border p-2 text-xs"><strong>{item.dueDate} · PMS #{item.schedule.ScheduleId}</strong><FrequencyPill code={frequencyOf(item.schedule)} />{preview.suppressed.filter((entry) => occurrenceKey(entry.coveredBy) === occurrenceKey(item)).map((entry) => <p key={occurrenceKey(entry.occurrence)} className="text-amber-800">Suppresses PMS #{entry.occurrence.schedule.ScheduleId}</p>)}</article>)}</div>
          {group.some((order) => order.scheduleChangeLog?.length) && <details><summary>Schedule Change History</summary>{group.flatMap((order) => (order.scheduleChangeLog ?? []).map((entry, i) => <p key={`${order.ScheduleId}-${i}`} className="text-xs">PMS #{order.ScheduleId}: {entry.oldAnchor} → {entry.newAnchor}; effective {entry.effectiveFrom}; {entry.openWrAction}; {entry.changedBy} · {entry.changedAt}</p>))}</details>}
        </section>;
      })}
      {!assigned.length && <p>No blueprints assigned to this target.</p>}
    </>}</section>
    {shift && <div role="dialog" aria-modal="true" aria-label="Change Schedule Date / Day" className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"><form className="w-full max-w-xl space-y-4 rounded-xl bg-white p-5" onSubmit={(e) => { e.preventDefault(); void onShift(shift.order, shift.cycle, shift.date, shift.action).then(() => setShift(undefined)).catch(() => undefined); }}>
      <h2 className="text-lg font-bold">Change Schedule Date / Day</h2>{error && <p role="alert" className="text-rose-700">{error}</p>}
      <label className="block">Current Cycle Date <input required className="rounded border p-2" type="date" value={shift.cycle} onChange={(e) => setShift({ ...shift, cycle: e.target.value })} /></label>
      <label className="block">New Target Date <input required min={new Date().toISOString().slice(0, 10)} className="rounded border p-2" type="date" value={shift.date} onChange={(e) => setShift({ ...shift, date: e.target.value })} /></label>
      <p className="text-sm">Shifts the original family anchor by the exact day offset. Annual and multi-year phases are retained; only future cycles change.</p>
      <p className="text-sm">{requests.filter((wr) => wr.SiteId === shift.order.SiteId && isUnstarted(wr) && wr.DueDate && wr.DueDate.slice(0, 10) >= shift.cycle && orders.some((order) => order.ScheduleId === wr.ScheduleId && pmTargetKey(order) === pmTargetKey(shift.order) && groupKey(order) === groupKey(shift.order))).length} unstarted 50% WR(s) in this plan at/after cutover</p>
      <label className="block text-sm"><input type="radio" name="shift-action" checked={shift.action === "move"} onChange={() => setShift({ ...shift, action: "move" })} /> Move open 50% WR(s) to the new date (updates dates and auto-slots)</label>
      <label className="block text-sm"><input type="radio" name="shift-action" checked={shift.action === "keep"} onChange={() => setShift({ ...shift, action: "keep" })} /> Keep existing open WR as-is and apply new date from the following cycle</label>
      <div className="flex gap-2"><button disabled={busy} className={button}>Apply Schedule Shift</button><button type="button" disabled={busy} className={button} onClick={() => setShift(undefined)}>Cancel</button></div>
    </form></div>}
  </div>;
}
