"use client";

import React from "react";
import type { PM_Schedule } from "@cafm/shared-schema";
import { formatDateDDMMYYYY } from "@cafm/shared-schema";
import { FrequencyPill } from "@/components/common/PmFrequency";
import type { PmsRemovalImpact } from "@/lib/pm-orders";

/**
 * PMS `Remove` confirmation modal: previews the exact WR impact of the lockstep
 * recalculation (downgrades, deletions, retained history) before applying it.
 */
export function PmsRemoveConfirmModal({ order, impact, busy, error, onConfirm, onClose }: {
  order: PM_Schedule;
  impact: PmsRemovalImpact;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const section = (title: string, tone: string, children: React.ReactNode) =>
    <section className={`rounded-lg border p-3 ${tone}`}><h3 className="text-sm font-bold">{title}</h3>{children}</section>;
  return <div role="dialog" aria-modal="true" aria-label="Remove PMS confirmation" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
    <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
      <header className="shrink-0 border-b p-4">
        <h2 className="text-lg font-bold">Remove PMS #{order.ScheduleId} <FrequencyPill code={order.frequencyCode} /></h2>
        <p className="mt-1 text-sm text-slate-600">{order.suppressionGroupName ?? order.Title} · the impact below is applied exactly as previewed. Started and completed work is never rewritten.</p>
        {error && <p role="alert" className="mt-2 rounded bg-rose-100 p-2 text-sm text-rose-900">{error}</p>}
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {section(`Lockstep downgrades (${impact.downgraded.length})`, "border-blue-200 bg-blue-50", impact.downgraded.length
          ? <ul className="mt-1 space-y-1 text-sm">{impact.downgraded.map((item) => <li key={item.wrId}>
              WR {item.wrId} · {item.dueDate ? formatDateDDMMYYYY(item.dueDate) : "no due date"}: <FrequencyPill code={item.fromFrequency} /> → <FrequencyPill code={item.toFrequency} /> (PMS #{item.toScheduleId})
            </li>)}</ul>
          : <p className="mt-1 text-sm text-slate-600">No unstarted WRs are covered by a lower family frequency on the same visit.</p>)}
        {section(`Deleted unstarted WRs (${impact.deleted.length})`, "border-rose-200 bg-rose-50", impact.deleted.length
          ? <ul className="mt-1 space-y-1 text-sm">{impact.deleted.map((item) => <li key={item.wrId}>
              WR {item.wrId} · {item.dueDate ? formatDateDDMMYYYY(item.dueDate) : "no due date"} — no other frequency falls on this visit (history is archived).
            </li>)}</ul>
          : <p className="mt-1 text-sm text-slate-600">No unstarted WRs need to be deleted.</p>)}
        {section(`Started / completed WRs kept untouched (${impact.retained.length})`, "border-emerald-200 bg-emerald-50", impact.retained.length
          ? <p className="mt-1 text-sm">{impact.retained.map((item) => `${item.wrId} (${item.percentage}%)`).join(", ")}</p>
          : <p className="mt-1 text-sm text-slate-600">No started or completed WRs reference this PMS.</p>)}
        {impact.absorbedUpdated.length > 0 && section(`absorbedFrequencies refreshed (${impact.absorbedUpdated.length})`, "border-violet-200 bg-violet-50",
          <p className="mt-1 text-sm">Remaining higher-frequency WRs updated: {impact.absorbedUpdated.join(", ")}</p>)}
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t bg-slate-50 p-4">
        <button type="button" className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={busy} onClick={onClose}>Keep PMS</button>
        <button type="button" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={busy} onClick={onConfirm}>
          Remove PMS &amp; Apply Lockstep Recalculation
        </button>
      </footer>
    </div>
  </div>;
}
