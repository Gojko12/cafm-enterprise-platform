"use client";

import React, { useState } from "react";
import type { BaseWorkRequest, UserGranularPermissions } from "@cafm/shared-schema";

export type PmHoldReason = "Access" | "Labor" | "Parts";

interface Props {
  workRequest: BaseWorkRequest;
  permissions: UserGranularPermissions | undefined;
  terminalReadOnly: boolean;
  /** Applies a validated status transition (50/55/78/100/27). */
  onApply: (percentage: 50 | 55 | 78 | 100, holdReason?: PmHoldReason) => void;
  /** Cancels the WR at 27% with a mandatory reason. */
  onCancel: (reason: string) => void;
  /** Restores a cancelled (27%) WR back to 50% Issued. */
  onRestore: () => void;
}

const primary = "rounded bg-slate-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40";

/**
 * FJ-style status button bar for the PM WR Details Popup: every unavailable
 * transition stays visible but grayed out with a `title` tooltip explaining why.
 */
export function PMStatusActionBar({ workRequest, permissions, terminalReadOnly, onApply, onCancel, onRestore }: Props) {
  const [holdOpen, setHoldOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const pct = workRequest.Percentage;
  const cancelled = pct === 27;

  const reason = (conditions: Array<[boolean, string]>): string | undefined =>
    conditions.find(([failed]) => failed)?.[1];

  const holdDisabled = reason([
    [terminalReadOnly, "Closed or cancelled work requests are read-only."],
    [pct !== 50 && pct !== 55, `On Hold (55%) is available only from 50% Issued (currently ${pct}%).`],
  ]);
  const completed78Disabled = reason([
    [terminalReadOnly, "Closed or cancelled work requests are read-only."],
    [!permissions?.canCompleteWR78, "Your role does not include the Complete 78% permission."],
    [pct !== 50 && pct !== 55, `Technically Completed (78%) is available only from 50% Issued or 55% On Hold (currently ${pct}%).`],
  ]);
  const completed100Disabled = reason([
    [!permissions?.canCloseWR100, "Your role does not include the Close 100% permission (Craftpersons cannot close WRs)."],
    [pct !== 78, `Complete (100%) is available only after Technically Completed (78%) — currently ${pct}%.`],
  ]);
  const cancelDisabled = reason([
    [cancelled, "This work request is already cancelled."],
    [pct === 100, "Closed work requests cannot be cancelled."],
  ]);
  const restoreDisabled = reason([
    [!permissions?.canReopenCancelledWR, "Your role does not include the Reopen Cancelled WR permission."],
  ]);

  return <div className="rounded border bg-white p-4">
    <p className="mb-2 text-xs font-semibold text-slate-500">WR Status · currently {pct}% {workRequest.WorkRequestSubstatus}</p>
    <div className="flex flex-wrap items-center gap-2">
      <span className="relative inline-flex">
        <button type="button" title={holdDisabled} disabled={!!holdDisabled} aria-expanded={holdOpen}
          onClick={() => setHoldOpen((open) => !open)} className={primary}>On Hold (55%) ▾</button>
        {holdOpen && !holdDisabled && <span className="absolute top-full left-0 z-30 mt-1 flex w-48 flex-col rounded border bg-white p-1 shadow-xl">
          {(["Access", "Labor", "Parts"] as const).map((hold) => <button key={hold} type="button" className="rounded px-2 py-1.5 text-left text-sm hover:bg-amber-50"
            onClick={() => { setHoldOpen(false); onApply(55, hold); }}>55% On Hold for {hold}</button>)}
        </span>}
      </span>
      <button type="button" title={completed78Disabled} disabled={!!completed78Disabled}
        onClick={() => onApply(78)} className={primary}>Technically Completed (78%)</button>
      <button type="button" title={completed100Disabled} disabled={!!completed100Disabled}
        onClick={() => onApply(100)} className={primary}>Complete (100%)</button>
      <button type="button" title={cancelDisabled ?? "Cancelling requires a mandatory reason."} disabled={!!cancelDisabled}
        onClick={() => { setCancelReason(""); setCancelOpen(true); }}
        className="rounded border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">Cancel WR (27%)</button>
      {cancelled && <button type="button" title={restoreDisabled ?? "Restore this cancelled PM back to 50% Issued."} disabled={!!restoreDisabled}
        onClick={onRestore}
        className="rounded border border-blue-600 bg-white px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40">↺ Restore to 50% Issued</button>}
    </div>

    {cancelOpen && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4">
      <section role="dialog" aria-modal="true" aria-label="Cancel work request" className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white p-5 shadow-2xl">
        <h3 className="font-semibold text-slate-900">Cancel WR {workRequest.WR_ID} (27%)</h3>
        <p className="mt-1 text-sm text-slate-600">A cancellation reason is mandatory and is logged to the work request history.</p>
        <label className="mt-3 block min-h-0 flex-1 overflow-auto text-sm font-medium">Cancellation reason *
          <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={3}
            className="mt-1 block w-full rounded border p-2" placeholder="Why is this PM work request being cancelled?" />
        </label>
        <div className="mt-4 flex shrink-0 justify-end gap-2">
          <button type="button" onClick={() => setCancelOpen(false)} className="rounded border px-4 py-2 text-sm">Keep WR</button>
          <button type="button" disabled={!cancelReason.trim()}
            onClick={() => { setCancelOpen(false); onCancel(cancelReason.trim()); }}
            className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Cancel WR (27%)</button>
        </div>
      </section>
    </div>}
  </div>;
}
