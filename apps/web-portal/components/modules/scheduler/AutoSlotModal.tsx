"use client";
import React, { useState } from "react";
import type { AutoSlotProposal, AutoSlotResult } from "./auto-slot-engine";
import { autoSlotDurationLabel, autoSlotWindowLabel } from "./auto-slot-engine";

interface Props {
  result: AutoSlotResult;
  onApply: (selected: AutoSlotProposal[]) => void;
  onClose: () => void;
}

/**
 * Section 82 — ✨ Propose Schedule modal: review the engine's conflict-free proposals
 * (Trade + Shift + zero Freeze/Leave/Overlap + Same-Building clustering) and batch-confirm.
 */
export function AutoSlotModal({ result, onApply, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(result.proposals.map((item) => item.wrId)));
  const toggle = (wrId: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(wrId)) next.delete(wrId); else next.add(wrId);
    return next;
  });
  const chosen = result.proposals.filter((item) => selected.has(item.wrId));
  const clustered = result.proposals.filter((item) => item.clusteredWithWrId).length;
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3" role="presentation">
    <section role="dialog" aria-modal="true" aria-label="Propose Schedule" className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white text-sm shadow-2xl">
      <header className="border-b bg-slate-50 px-4 py-3">
        <h2 className="text-base font-bold">✨ Propose Schedule — Unscheduled Work Requests</h2>
        <p className="text-xs text-slate-600">
          {result.proposals.length} conflict-free proposal{result.proposals.length === 1 ? "" : "s"} within {result.horizonDays} days ·
          matched on Trade + Shift with zero Freeze / Leave / Overlap conflicts · {clustered} same-building cluster{clustered === 1 ? "" : "s"}
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!result.proposals.length && <p className="rounded bg-slate-50 p-3 text-slate-600">No unscheduled work request could be slotted automatically.</p>}
        {result.proposals.length > 0 && <table className="w-full text-left text-xs">
          <thead className="bg-slate-50"><tr>
            <th className="p-2"><input type="checkbox" aria-label="Select all proposals" checked={chosen.length === result.proposals.length}
              onChange={(event) => setSelected(event.target.checked ? new Set(result.proposals.map((item) => item.wrId)) : new Set())} /></th>
            {["WR", "Description", "Trade", "Building", "Craftperson", "Proposed Slot", "Duration", "Clustering"].map((title) => <th key={title} className="p-2">{title}</th>)}
          </tr></thead>
          <tbody>{result.proposals.map((proposal) => <tr key={proposal.wrId} className="border-t align-top">
            <td className="p-2"><input type="checkbox" aria-label={`Select proposal for ${proposal.wrId}`} checked={selected.has(proposal.wrId)} onChange={() => toggle(proposal.wrId)} /></td>
            <td className="p-2 font-semibold">{proposal.wrId}</td>
            <td className="max-w-48 truncate p-2" title={proposal.description}>{proposal.description}</td>
            <td className="p-2">{proposal.tradeName}</td>
            <td className="p-2">{proposal.bl_id}</td>
            <td className="p-2">{proposal.craftpersonName}</td>
            <td className="whitespace-nowrap p-2">{autoSlotWindowLabel(proposal)}</td>
            <td className="p-2">{autoSlotDurationLabel(proposal)}</td>
            <td className="p-2">{proposal.clusteredWithWrId
              ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800" title={`Same building (${proposal.bl_id}) as ${proposal.clusteredWithWrId}`}>📍 With {proposal.clusteredWithWrId}</span>
              : <span className="text-slate-400">—</span>}</td>
          </tr>)}</tbody>
        </table>}
        {result.unplaced.length > 0 && <details className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <summary className="cursor-pointer font-semibold">⚠️ {result.unplaced.length} work request{result.unplaced.length === 1 ? "" : "s"} could not be slotted</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {result.unplaced.map((item) => <li key={item.wrId}><strong>{item.wrId}</strong> · {item.description}: {item.reason}</li>)}
          </ul>
        </details>}
      </div>
      <footer className="flex gap-2 border-t px-4 py-3">
        <button type="button" className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700" onClick={onClose}>Cancel</button>
        <button type="button" disabled={!chosen.length} onClick={() => onApply(chosen)}
          className="flex-[2] rounded bg-blue-700 px-3 py-2 font-semibold text-white disabled:opacity-40">
          ✓ Confirm {chosen.length} Proposed Slot{chosen.length === 1 ? "" : "s"}
        </button>
      </footer>
    </section>
  </div>;
}
