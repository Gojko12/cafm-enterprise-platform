"use client";

import React, { useMemo, useState } from "react";
import { forecastPmCycle, getNextUnsuppressedOccurrence, PM_FREQUENCY_RANKS, formatDateDDMMYYYY } from "@cafm/shared-schema";
import type { PM_Schedule } from "@cafm/shared-schema";
import { DateInputDDMMYYYY } from "@/components/common/DateInputDDMMYYYY";
import { FrequencyPill } from "@/components/common/PmFrequency";

const button = "rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40";
export function PmCycleCalculator({ order, group, busy, error, openCount, onClose, onApply }: {
  order: PM_Schedule; group: PM_Schedule[]; busy: boolean; error: string; onClose: () => void;
  openCount: number;
  onApply: (date: string, peak: number, action: "move" | "keep") => Promise<void>;
}) {
  const original = useMemo(() => forecastPmCycle(order, group), [order, group]);
  const [date, setDate] = useState(original.cycleDate), [peak, setPeak] = useState(original.peakSlotIndex);
  const [action, setAction] = useState<"move" | "keep">("move"), [filter, setFilter] = useState("All");
  const [failure, setFailure] = useState("");
  const previewOrders = useMemo(() => group.map((item) => ({ ...item, cycleDate: date, anchorDate: date, sharedAnchorDate: date, peakSlotIndex: peak })), [group, date, peak]);
  const preview = useMemo(() => forecastPmCycle(previewOrders.find((item) => item.ScheduleId === order.ScheduleId)!, previewOrders), [order.ScheduleId, previewOrders]);
  const perYear = Math.max(1, Math.min(preview.visits, Math.round(preview.visitsPerYear)));
  const years = Math.max(1, Math.ceil(preview.years));
  const peakYear = Math.floor((peak - 1) / perYear) + 1, annualSlot = (peak - 1) % perYear + 1;
  const highest = [...group].sort((a, b) => PM_FREQUENCY_RANKS[b.frequencyCode!] - PM_FREQUENCY_RANKS[a.frequencyCode!])[0].frequencyCode!;
  const today = new Date().toISOString().slice(0, 10);
  const visible = preview.timeline.filter((item) => filter === "All" || (filter === "03M+" ? PM_FREQUENCY_RANKS[item.winner.frequencyCode!] >= 5 :
    filter === "01Y+" ? PM_FREQUENCY_RANKS[item.winner.frequencyCode!] >= 7 : PM_FREQUENCY_RANKS[item.winner.frequencyCode!] >= 8));
  const yearOf = (visit: number) => preview.unit === "months" ? Math.floor((visit - 1) * preview.interval / 12) + 1 : 1;
  const apply = async () => {
    setFailure("");
    try { await onApply(date, peak, action); onClose(); }
    catch (problem) { setFailure(problem instanceof Error ? problem.message : "Could not apply cycle changes."); }
  };
  return <div role="dialog" aria-modal="true" aria-label="Change Schedule Date / Day" className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-2">
    <form className="flex max-h-[90vh] w-[95vw] max-w-5xl flex-col rounded-2xl bg-white shadow-2xl" onSubmit={(event) => { event.preventDefault(); void apply(); }}>
      <header className="shrink-0 space-y-3 border-b p-4">
        <h2 className="text-xl font-bold">Change Schedule Date / Day · Live Full-Cycle Forecast</h2>
        {(error || failure) && <p role="alert" className="rounded bg-rose-50 p-2 text-rose-800">{failure || error}</p>}
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Cycle Date (Visit #1 — {preview.shortest})<DateInputDDMMYYYY required className="block rounded border p-2" value={date} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></label>
          <label className="text-sm">{highest} / Peak Position in Cycle<select className="block rounded border p-2" value={annualSlot} onChange={(event) => setPeak(Math.min(preview.visits, (peakYear - 1) * perYear + Number(event.target.value)))}>
            {Array.from({ length: perYear }, (_, i) => <option key={i} value={i + 1}>Visit #{i + 1} in row</option>)}
          </select></label>
          {years > 1 && <label className="text-sm">Multi-Year Peak Year<select className="block rounded border p-2" value={peakYear} onChange={(event) => setPeak(Math.min(preview.visits, (Number(event.target.value) - 1) * perYear + annualSlot))}>
            {Array.from({ length: years }, (_, i) => <option key={i} value={i + 1}>Year {i + 1}</option>)}
          </select></label>}
        </div>
        <p className="rounded-lg bg-blue-50 p-3 font-semibold">{preview.unit === "months" ? `${preview.years >= 1 ? preview.years : preview.length / 12}-Year` : `${preview.length}-Day`} Complete Cycle ({preview.visits} visits · {preview.annualAverage.toFixed(1)} WRs/yr — prevents {preview.prevented} duplicates)</p>
        <div className="flex flex-wrap gap-2">{preview.group.map((item) => {
          const next = getNextUnsuppressedOccurrence(item, previewOrders, today);
          return <article key={item.ScheduleId} className="rounded-lg border bg-slate-50 p-2 text-xs"><FrequencyPill code={item.frequencyCode} /><strong className="block">{next ? formatDateDDMMYYYY(next.date) : "No winning visits"}</strong><span>{next?.countPerCycle ?? 0}× per complete cycle · PMS #{item.ScheduleId}</span></article>;
        })}</div>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        <nav className="flex flex-wrap gap-2" aria-label="Forecast frequency filters">{["All", "03M+", "01Y+", "Multi-Year"].map((value) => <button key={value} type="button" className={`${button} ${filter === value ? "border-blue-600 bg-blue-50" : ""}`} onClick={() => setFilter(value)}>{value === "All" ? `All Visits (${preview.visits})` : value === "Multi-Year" ? "Multi-Year (02Y/05Y/10Y)" : `${value} only`}</button>)}</nav>
        {Array.from({ length: years }, (_, i) => i + 1).map((year) => <details key={year} open className="rounded-xl border p-3">
          <summary className="cursor-pointer font-bold">Year {year}</summary><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{visible.filter((item) => yearOf(item.visit) === year).map((item) => <article key={item.visit} className={`space-y-1 rounded-lg border p-3 text-sm ${item.visit === peak ? "border-amber-500 bg-amber-50" : "bg-white"}`}>
            <strong>#{item.visit} · {formatDateDDMMYYYY(item.dueDate)}</strong><p>PMS #{item.winner.ScheduleId} <FrequencyPill code={item.winner.frequencyCode} /></p>
            {item.suppressed.map((lower) => <p className="text-xs text-amber-800" key={lower.ScheduleId}>Suppressed PMS #{lower.ScheduleId} · {lower.frequencyCode}</p>)}
            <button type="button" className={button} onClick={() => setPeak(item.visit)}>{item.visit === peak ? "Peak visit selected" : `Set ${highest} / Peak here`}</button>
          </article>)}</div>{!visible.some((item) => yearOf(item.visit) === year) && <p className="text-xs">No visits match this filter in Year {year}.</p>}
        </details>)}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t bg-slate-50 p-4">
        <label className="text-sm"><select className="max-w-full rounded border p-2" value={action} onChange={(event) => setAction(event.target.value === "keep" ? "keep" : "move")}><option value="move">Move open 50% WR(s) to new schedule dates</option><option value="keep">Keep existing open WR as-is and apply from next cycle</option></select></label>
        <p className="text-xs">{openCount} unstarted 50% WR(s). Started/completed work stays unchanged. Changes apply from today or the future cycle date.</p>
        <button type="button" className={`${button} ml-auto`} disabled={busy} onClick={onClose}>Cancel</button><button className={`${button} border-blue-600 text-blue-800`} disabled={busy || (date === original.cycleDate && peak === original.peakSlotIndex)}>Apply Schedule &amp; Cycle Position</button>
      </footer>
    </form>
  </div>;
}
