"use client";

import React, { useState } from "react";
import { compileBlueprintChecklist, pmTargetKey, pmTargetType, forecastPmCycle, getNextUnsuppressedOccurrence, formatDateDDMMYYYY, formatDateTimeDDMMYYYY, PM_FREQUENCY_RANKS } from "@cafm/shared-schema";
import type { PM_ChecklistStandard, PM_Schedule, BaseWorkRequest } from "@cafm/shared-schema";
import type { PMPlanTarget } from "@/lib/pm-plan-targets";
import { FrequencyPill } from "@/components/common/PmFrequency";
import { PmCycleCalculator } from "./PmCycleCalculator";
import { isUnstarted } from "@/lib/pm-suppression";
import { ScheduleBadges, StakeholderTagEditor } from "./PmStakeholderTagging";

const button = "rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40";
export function PmTargetPlans({ targets, orders, blueprints, requests, selected, onSelect, onAssign, onRemove, onShift, busy, canEdit, error }: {
  targets: PMPlanTarget[]; orders: PM_Schedule[]; blueprints: PM_ChecklistStandard[]; requests: BaseWorkRequest[];
  selected: string; onSelect: (id: string) => void; onAssign: (id: string) => void; onRemove: (order: PM_Schedule) => void;
  onShift: (order: PM_Schedule, cycle: string, date: string, action: "move" | "keep", peak: number) => Promise<void>;
  busy: boolean; canEdit: boolean; error: string;
}) {
  const [locations, setLocations] = useState(() => pmTargetType(targets.find((target) => target.id === selected) ?? { targetType: "equipment" }) !== "equipment"), [query, setQuery] = useState("");
  const [shift, setShift] = useState<PM_Schedule>();
  const [tagging, setTagging] = useState<PM_Schedule>();
  const list = targets.filter((target) => (pmTargetType(target) !== "equipment") === locations && target.label.toLowerCase().includes(query.trim().toLowerCase()));
  const target = list.find((item) => item.id === selected) ?? list[0];
  const assigned = orders.filter((order) => target && pmTargetKey(order) === target.id);
  const groupKey = (order: PM_Schedule) => order.suppressionMode === "independent" ? `standalone:${order.ScheduleId}` : order.suppressionGroupKey!;
  const startShift = (order: PM_Schedule) => setShift(order);
  const annualCount = (rules: PM_Schedule[]) => [...new Set(rules.map(groupKey))].reduce((total, id) => {
    const group = rules.filter((item) => groupKey(item) === id);
    return total + forecastPmCycle(group[0], group).annualAverage;
  }, 0);
  return <div className="flex flex-col items-start gap-4 md:flex-row">
    <aside className="w-full shrink-0 space-y-2 rounded-xl border bg-white p-3 md:w-80"><div className="flex gap-1"><button className={`${button} ${!locations ? "border-blue-600" : ""}`} onClick={() => setLocations(false)}>Equipment</button><button className={`${button} ${locations ? "border-blue-600" : ""}`} onClick={() => setLocations(true)}>Locations</button></div><p className="text-xs">Buildings / Floors / Rooms</p>
      <input aria-label="Search PM targets" className="w-full rounded border p-2" placeholder="Search equipment or locations" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="max-h-[70vh] space-y-2 overflow-auto">{list.map((item) => {
        const rules = orders.filter((order) => pmTargetKey(order) === item.id);
        const count = rules.length ? annualCount(rules) : 0;
        return <button key={item.id} className={`${button} w-full text-left ${item.id === target?.id ? "border-blue-600 bg-blue-50" : ""}`} onClick={() => onSelect(item.id)}>{item.label}<small className="block">{rules.length} active PMS · {count.toFixed(1)} WRs/year</small></button>;
      })}</div>
    </aside>
    <section className="min-w-0 flex-1 space-y-4">{target && <><header className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4"><div><h2 className="text-xl font-bold">{target.label}</h2><p>{[target.bl_id, target.LevelName, target.RoomCode].filter(Boolean).join(" / ")}</p></div><button className={button} disabled={!canEdit || busy} onClick={() => onAssign(target.id)}>+ Assign Blueprint (New PMS)</button></header>
      {[...new Set(assigned.map(groupKey))].map((id) => {
        const group = assigned.filter((order) => groupKey(order) === id);
        const preview = forecastPmCycle(group[0], group);
        const highest = [...group].sort((a, b) => PM_FREQUENCY_RANKS[b.frequencyCode!] - PM_FREQUENCY_RANKS[a.frequencyCode!])[0];
        return <section key={id} className="space-y-3 rounded-xl border bg-white p-4"><h3 className="font-bold">{group[0].suppressionGroupName}</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm"><span>Cycle Start Date (Visit #1): {formatDateDDMMYYYY(preview.cycleDate)}</span><span className="rounded-full bg-amber-50 px-2 py-1">{highest.frequencyCode} at Visit #{preview.peakSlotIndex} of {preview.visits}</span><button className={button} disabled={!canEdit || busy} onClick={() => startShift(group[0])}>Change Schedule Date / Day</button></div>
          <p className="text-xs text-slate-500">The family shares one phase on this target only. Started and completed work is never rewritten.</p>
          <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["PMS #", "Blueprint Name", "Locked Freq", "Next Occurrence", "Alignment & Notices", "Compiled Steps", "Remove"].map((text) => <th key={text} className="p-2">{text}</th>)}</tr></thead><tbody>{group.map((order) => {
            const steps = compileBlueprintChecklist(order.ChecklistCode, blueprints);
            const next = getNextUnsuppressedOccurrence(order, group, new Date().toISOString().slice(0, 10));
            return <tr className="border-t" key={order.ScheduleId}><td className="p-2 font-mono">{order.ScheduleId}</td><td>{blueprints.find((bp) => bp.ChecklistCode === order.ChecklistCode)?.Title}</td><td><FrequencyPill code={order.frequencyCode} /></td>
              <td className="whitespace-nowrap font-semibold text-blue-800">{next ? formatDateDDMMYYYY(next.date) : "No winning visits"}</td><td className="p-2"><div className="space-y-1"><ScheduleBadges order={order} /><button type="button" className="text-xs text-blue-700 underline" onClick={() => setTagging(order)}>Teams &amp; Notices…</button></div></td><td><details><summary className="cursor-pointer text-blue-700">{steps.length} steps · preview</summary>{steps.map((step) => <p key={step.StepId} className="max-w-sm text-xs"><FrequencyPill code={step.originFrequency} inherited={step.isInherited} /> {step.Title} {step.replacesStepLabel}</p>)}</details></td>
              <td><button className={button} disabled={!canEdit || busy} onClick={() => onRemove(order)}>Remove</button></td></tr>;
          })}</tbody></table></div>
          <p className="rounded bg-emerald-50 p-2 text-sm font-semibold">Result: {preview.annualAverage.toFixed(1)} WRs/year · {preview.visits} visits per full cycle — {preview.prevented} duplicates prevented</p>
          <div className="flex max-h-56 flex-wrap gap-2 overflow-auto">{preview.timeline.map((item) => <article key={item.visit} className="rounded border p-2 text-xs"><strong>#{item.visit} · {formatDateDDMMYYYY(item.dueDate)} · PMS #{item.winner.ScheduleId}</strong><FrequencyPill code={item.winner.frequencyCode} />{item.suppressed.map((entry) => <p key={entry.ScheduleId} className="text-amber-800">Suppresses PMS #{entry.ScheduleId} · {entry.frequencyCode}</p>)}</article>)}</div>
          {group.some((order) => order.scheduleChangeLog?.length) && <details><summary>Schedule Change History</summary>{group.flatMap((order) => (order.scheduleChangeLog ?? []).map((entry, i) => <p key={`${order.ScheduleId}-${i}`} className="text-xs">PMS #{order.ScheduleId}: {formatDateDDMMYYYY(entry.oldAnchor)} → {formatDateDDMMYYYY(entry.newAnchor)}; effective {formatDateDDMMYYYY(entry.effectiveFrom)}; {entry.openWrAction}; {entry.changedBy} · {formatDateTimeDDMMYYYY(entry.changedAt)}</p>))}</details>}
        </section>;
      })}
      {!assigned.length && <p>No blueprints assigned to this target.</p>}
    </>}</section>
    {tagging && <StakeholderTagEditor order={tagging} canEdit={canEdit} onClose={() => setTagging(undefined)} />}
    {shift && <PmCycleCalculator order={shift} group={orders.filter((item) => pmTargetKey(item) === pmTargetKey(shift) && groupKey(item) === groupKey(shift))}
      openCount={requests.filter((wr) => isUnstarted(wr) && orders.some((item) => item.ScheduleId === wr.ScheduleId && item.SiteId === wr.SiteId && pmTargetKey(item) === pmTargetKey(shift) && groupKey(item) === groupKey(shift))).length}
      busy={busy} error={error} onClose={() => setShift(undefined)} onApply={(date, peak, action) => onShift(shift, shift.cycleDate ?? shift.anchorDate!, date, action, peak)} />}
  </div>;
}
