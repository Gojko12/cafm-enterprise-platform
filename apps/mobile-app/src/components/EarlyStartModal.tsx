import React, { useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { EARLY_START_REASONS } from "../../../web-portal/lib/pm-early-start";

interface EarlyStartModalProps {
  wr: BaseWorkRequest;
  daysEarly: number;
  leadDays: number;
  /** Zone 2 (inside the lead window) offers 1-tap reasons; Zone 3 requires a supervisor override. */
  mode: "lead-window" | "override";
  plannedLabel: string;
  busy: boolean;
  onConfirm: (reason: string, override: boolean) => void;
  onClose: () => void;
}

/**
 * Section 82 — mobile early-start gate. Zone 2: 1-tap opportunistic reason.
 * Zone 3: supervising-role override with a mandatory written reason.
 */
export const EarlyStartModal: React.FC<EarlyStartModalProps> = ({ wr, daysEarly, leadDays, mode, plannedLabel, busy, onConfirm, onClose }) => {
  const [customReason, setCustomReason] = useState("");
  const override = mode === "override";
  return <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/50 sm:items-center" onClick={() => { if (!busy) onClose(); }} role="presentation">
    <section role="dialog" aria-modal="true" aria-label="Early start confirmation" onClick={(event) => event.stopPropagation()}
      className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
      <header className={`border-b px-4 py-3 ${override ? "bg-rose-50" : "bg-emerald-50"}`}>
        <h2 className={`text-base font-bold ${override ? "text-rose-900" : "text-emerald-900"}`}>
          {override ? "⛔ Outside the Early-Start Window" : "⚡ Starting Ahead of Schedule"}
        </h2>
        <p className="mt-0.5 text-xs text-slate-600">{wr.WR_ID} · planned {plannedLabel} · {daysEarly} day{daysEarly === 1 ? "" : "s"} early</p>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {override ? <>
          <p className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-rose-900">
            This {wr.pmFrequency ? `${wr.pmFrequency} ` : ""}Work Request is {daysEarly} day(s) ahead of its planned start — beyond the {leadDays}-day opportunistic
            window. Starting now squeezes the maintenance cycle spacing. A supervising-role override with a written reason is required.
          </p>
          <label className="block font-medium">Mandatory override reason
            <textarea aria-label="Override reason" rows={3} value={customReason} onChange={(event) => setCustomReason(event.target.value)}
              placeholder="Why must this Work Request start this far ahead of schedule?" className="mt-1 block w-full rounded-lg border border-slate-300 p-2 font-normal" />
          </label>
        </> : <>
          <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-emerald-900">
            You are inside the {leadDays}-day opportunistic lead window for this {wr.pmFrequency ? `${wr.pmFrequency} ` : ""}cycle. Pick the reason — it is logged to the Work Request activity.
          </p>
          <div className="space-y-2">
            {EARLY_START_REASONS.map((reason) => <button type="button" key={reason} disabled={busy}
              onClick={() => onConfirm(reason, false)}
              className="w-full rounded-xl border-2 border-emerald-300 bg-white px-4 py-3 text-left font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-50">
              {reason === EARLY_START_REASONS[0] ? "📍 " : reason === EARLY_START_REASONS[1] ? "🔁 " : "🧑‍🏭 "}{reason}
            </button>)}
          </div>
        </>}
      </div>
      <footer className="flex gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button type="button" disabled={busy} className="flex-1 rounded-xl border border-slate-300 bg-white p-2.5 font-medium text-slate-700" onClick={onClose}>Cancel</button>
        {override && <button type="button" disabled={busy || customReason.trim().length < 5}
          onClick={() => onConfirm(customReason.trim(), true)}
          className="flex-[2] rounded-xl bg-rose-700 p-2.5 font-semibold text-white disabled:opacity-40">Override & Start Now</button>}
      </footer>
    </section>
  </div>;
};
