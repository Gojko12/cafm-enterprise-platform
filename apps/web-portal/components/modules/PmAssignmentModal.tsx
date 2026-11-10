"use client";

import React, { useState } from "react";
import { pmTargetType } from "@cafm/shared-schema";
import type { PM_ChecklistStandard, PM_Schedule, PMTargetType } from "@cafm/shared-schema";
import type { PMPlanTarget } from "@/lib/pm-plan-targets";
import { sharedFamilyAnchor } from "@/lib/pm-orders";
import { FrequencyPill } from "@/components/common/PmFrequency";
import { DateInputDDMMYYYY } from "@/components/common/DateInputDDMMYYYY";

export type PMAssignment = { blueprintIds: string[]; targetIds: string[]; anchor: string };
const button = "rounded-lg border bg-white px-2 py-1.5 text-sm disabled:opacity-40";
const input = "min-w-0 rounded-lg border p-2 text-sm";
export function PmAssignmentModal({ initial, blueprints, targets, schedules, busy, error, onClose, onCreate }: {
  initial: PMAssignment; blueprints: PM_ChecklistStandard[]; targets: PMPlanTarget[]; schedules: PM_Schedule[];
  busy: boolean; error: string; onClose: () => void; onCreate: (assignment: PMAssignment) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [query, setQuery] = useState(""), [targetQuery, setTargetQuery] = useState("");
  const [kind, setKind] = useState("All"), [trade, setTrade] = useState(""), [frequency, setFrequency] = useState("");
  const [type, setType] = useState<PMTargetType>(() => pmTargetType(targets.find((target) => initial.targetIds.includes(target.id)) ?? { targetType: "equipment" }));
  const [building, setBuilding] = useState(""), [floor, setFloor] = useState("");
  const matching = (value: string, search: string) => value.toLowerCase().includes(search.trim().toLowerCase());
  const visible = blueprints.filter((bp) => (kind === "All" || (kind === "Families" ? bp.blueprintMode === "family_ladder" : bp.blueprintMode === "standalone")) &&
    (!trade || bp.TradeId === trade) && (!frequency || bp.frequencyCode === frequency) && matching(`${bp.ChecklistCode} ${bp.Title} ${bp.familyId} ${bp.familyName} ${bp.TradeName}`, query));
  const groups = [...new Set(visible.map((bp) => bp.blueprintMode === "family_ladder" ? bp.familyId! : `standalone:${bp.ChecklistCode}`))];
  const filteredTargets = targets.filter((target) => pmTargetType(target) === type && (!building || target.bl_id === building) && (!floor || target.LevelName === floor) && matching(`${target.label} ${target.bl_id} ${target.LevelName} ${target.RoomCode}`, targetQuery));
  const toggle = (ids: string[], checked: boolean) => setDraft({ ...draft, blueprintIds: checked ? [...new Set([...draft.blueprintIds, ...ids])] : draft.blueprintIds.filter((id) => !ids.includes(id)) });
  const count = draft.targetIds.reduce((sum, id) => sum + draft.blueprintIds.filter((code) => !schedules.some((order) => order.IsActive && order.targetKey === id && order.ChecklistCode === code)).length, 0);
  const locked = draft.targetIds.length === 1 && draft.blueprintIds.length === 1 ?
    sharedFamilyAnchor(schedules, blueprints, draft.targetIds[0], blueprints.find((bp) => bp.ChecklistCode === draft.blueprintIds[0])!) : undefined;
  return <div role="dialog" aria-modal="true" aria-label="Assign Family / Blueprint to Equipment or Location" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2">
    <div className="flex h-[85vh] w-[95vw] max-w-5xl flex-col rounded-2xl bg-white shadow-2xl">
      <header className="shrink-0 border-b p-4"><h2 className="text-xl font-bold">Assign Family / Blueprint to Equipment or Location</h2><p className="text-xs text-slate-500">Existing target-family anchors are retained. Frequency is always supplied by the blueprint.</p>
        {error && <p role="alert" className="mt-2 rounded bg-rose-100 p-2 text-rose-900">{error}</p>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4 md:flex-row md:overflow-hidden">
        <section className="flex min-h-0 flex-1 flex-col gap-2"><h3 className="font-bold">Checklist Blueprints &amp; Families</h3>
          <input aria-label="Search blueprints to assign" className={input} placeholder="Search CB code, title, family, or trade..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="flex flex-wrap gap-1">{["All", "Families", "Standalone"].map((item) => <button className={`${button} ${kind === item ? "border-blue-600 bg-blue-50" : ""}`} key={item} onClick={() => setKind(item)}>{item}</button>)}
            <select aria-label="Assignment trade filter" className={input} value={trade} onChange={(e) => setTrade(e.target.value)}><option value="">All Trades</option>{[...new Set(blueprints.map((bp) => bp.TradeId))].map((id) => <option key={id}>{id}</option>)}</select>
            <select aria-label="Assignment frequency filter" className={input} value={frequency} onChange={(e) => setFrequency(e.target.value)}><option value="">All Frequencies</option>{[...new Set(blueprints.map((bp) => bp.frequencyCode!))].map((code) => <option key={code}>{code}</option>)}</select>
          </div>
          <div className="min-h-32 flex-1 space-y-3 overflow-auto">{groups.map((id) => {
            const items = visible.filter((bp) => (bp.blueprintMode === "family_ladder" ? bp.familyId : `standalone:${bp.ChecklistCode}`) === id);
            const fullFamily = blueprints.filter((bp) => bp.blueprintMode === "family_ladder" && bp.familyId === id);
            return <fieldset key={id} className="space-y-2 rounded-xl border p-3"><legend className="text-sm font-bold">{items[0].familyName ?? "Standalone"}</legend>
              {!!fullFamily.length && <label className="block text-xs font-semibold"><input type="checkbox" checked={fullFamily.every((bp) => draft.blueprintIds.includes(bp.ChecklistCode))} onChange={(e) => toggle(fullFamily.map((bp) => bp.ChecklistCode), e.target.checked)} /> Select Entire Family ({fullFamily.length})</label>}
              {items.map((bp) => <label key={bp.ChecklistCode} className="flex items-start gap-2 rounded border p-2 text-sm"><input type="checkbox" checked={draft.blueprintIds.includes(bp.ChecklistCode)} onChange={(e) => toggle([bp.ChecklistCode], e.target.checked)} /><span><strong>{bp.ChecklistCode}</strong> <FrequencyPill code={bp.frequencyCode} /><span className="block">{bp.Title}</span><small>{bp.TradeName}</small></span></label>)}
            </fieldset>;
          })}</div>
        </section>
        <section className="flex min-h-0 flex-1 flex-col gap-2"><h3 className="font-bold">Target Equipment or Locations</h3>
          <div className="flex flex-wrap gap-1">{(["equipment", "room", "floor", "building"] as const).map((item) => <button key={item} className={`${button} ${type === item ? "border-blue-600 bg-blue-50" : ""}`} onClick={() => { setType(item); setFloor(""); }}>{item === "equipment" ? "Equipment" : `${item[0].toUpperCase()}${item.slice(1)}s`}</button>)}</div>
          <input aria-label="Search assignment targets" className={input} placeholder="Search target code or name..." value={targetQuery} onChange={(e) => setTargetQuery(e.target.value)} />
          <div className="flex flex-wrap gap-1"><select aria-label="Assignment building filter" className={input} value={building} onChange={(e) => { setBuilding(e.target.value); setFloor(""); }}><option value="">All Buildings</option>{[...new Set(targets.map((target) => target.bl_id!))].map((id) => <option key={id}>{id}</option>)}</select>
            <select aria-label="Assignment floor filter" className={input} value={floor} onChange={(e) => setFloor(e.target.value)}><option value="">All Floors</option>{[...new Set(targets.filter((target) => !building || target.bl_id === building).flatMap((target) => target.LevelName ? [target.LevelName] : []))].map((id) => <option key={id}>{id}</option>)}</select></div>
          <div className="flex flex-wrap items-center gap-2 text-xs"><button className={button} onClick={() => setDraft({ ...draft, targetIds: [...new Set([...draft.targetIds, ...filteredTargets.map((target) => target.id)])] })}>Select All Filtered</button><button className={button} onClick={() => setDraft({ ...draft, targetIds: [] })}>Clear</button><strong>{draft.targetIds.length} targets selected</strong></div>
          <div className="min-h-32 flex-1 space-y-2 overflow-auto">{filteredTargets.map((target) => <label key={target.id} className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={draft.targetIds.includes(target.id)} onChange={(e) => setDraft({ ...draft, targetIds: e.target.checked ? [...draft.targetIds, target.id] : draft.targetIds.filter((id) => id !== target.id) })} /><span>{target.label}<small className="block text-slate-500">{[target.bl_id, target.LevelName, target.RoomCode].filter(Boolean).join(" / ")}</small></span></label>)}</div>
        </section>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center gap-3 rounded-b-2xl border-t bg-slate-50 p-4"><label className="text-sm">Cycle Date (Visit #1) <DateInputDDMMYYYY className={input} required disabled={!!locked} value={locked ?? draft.anchor} onChange={(e) => setDraft({ ...draft, anchor: e.target.value })} /></label>{locked && <small>Existing family cycle date locked</small>}
        <strong className="text-sm">Creating {count} PMS orders</strong><button className={`${button} ml-auto`} disabled={busy} onClick={onClose}>Cancel</button><button className={`${button} border-blue-600 text-blue-800`} disabled={busy || !count || !draft.anchor} onClick={() => onCreate(draft)}>Create PMS Orders</button>
      </footer>
    </div>
  </div>;
}
