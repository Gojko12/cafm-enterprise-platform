import React, { useState } from "react";
import type { LocationFreeze } from "@cafm/shared-schema";
import { FREEZE_ACK_STATEMENTS, formatFreezePeriodWindow, freezeLocationLabel } from "../../../web-portal/lib/location-freezes";

const SnowflakeIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 2v20M4.2 7l15.6 10M4.2 17L19.8 7M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5" /></svg>;

export function FreezeBadge({ freezes, compact = false }: { freezes: LocationFreeze[]; compact?: boolean }) {
  if (!freezes.length) return null;
  const first = freezes[0];
  const window = formatFreezePeriodWindow(first.startDateTime, first.endDateTime);
  if (compact) return <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800"><SnowflakeIcon />Freeze</span>;
  return <div role="status" className="rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950">
    <p className="flex items-center gap-1.5 font-semibold text-sky-800"><SnowflakeIcon />Freeze Period</p>
    <p className="mt-0.5">{first.title}</p>
    <p className="text-xs text-sky-800">{window}</p>
    {freezes.length > 1 && <p className="text-xs text-sky-700">+{freezes.length - 1} more freeze period{freezes.length > 2 ? "s" : ""}</p>}
  </div>;
}

export function FreezeAckPanel({ freezes, onConfirm, onBack, confirmLabel, backLabel, busy = false }: {
  freezes: LocationFreeze[]; onConfirm: () => void; onBack: () => void; confirmLabel: string; backLabel: string; busy?: boolean;
}) {
  const [checked, setChecked] = useState<boolean[]>(FREEZE_ACK_STATEMENTS.map(() => false));
  const complete = checked.every(Boolean);
  return <div className="space-y-3 rounded-2xl border border-sky-300 bg-white p-4 shadow-sm" role="group" aria-label="Freeze Period Safety Confirmation">
    <h2 className="flex items-center gap-1.5 text-base font-bold text-sky-900"><SnowflakeIcon />Freeze Period Safety Confirmation</h2>
    {freezes.map((item) => <div key={item.id} className="space-y-0.5 rounded-xl bg-sky-50 p-3 text-sm text-sky-950">
      <p className="font-semibold">{item.title}</p>
      <p className="text-xs">Coordinator: {item.responsiblePerson}</p>
      <p className="text-xs">Location: {freezeLocationLabel(item)}</p>
      <p className="text-xs">Freeze window: {formatFreezePeriodWindow(item.startDateTime, item.endDateTime)}</p>
    </div>)}
    <div className="space-y-2">
      {FREEZE_ACK_STATEMENTS.map((text, index) => <label key={text} className="flex items-start gap-2.5 text-sm text-slate-800">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-sky-700" checked={checked[index]} onChange={(event) => setChecked((current) => current.map((value, i) => i === index ? event.target.checked : value))} />
        <span>{text}</span>
      </label>)}
    </div>
    <div className="flex flex-col gap-2">
      <button type="button" disabled={!complete || busy} onClick={onConfirm} className="rounded-xl bg-sky-700 p-3 font-semibold text-white disabled:opacity-40">{confirmLabel}</button>
      <button type="button" disabled={busy} onClick={onBack} className="rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-700">{backLabel}</button>
    </div>
  </div>;
}

// The unlocked flag lives in mount state on purpose: leaving the checklist unmounts this gate, so each entry must be re-confirmed.
export function FreezeChecklistGate({ freezes, acknowledge, onBack, children }: {
  freezes: LocationFreeze[]; acknowledge: () => Promise<void>; onBack: () => void; children: React.ReactNode;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!freezes.length || unlocked) return <>{children}</>;
  return <div className="space-y-3 p-4 pb-28">
    {error && <p role="alert" className="rounded bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
    <FreezeAckPanel freezes={freezes} busy={busy} confirmLabel="Unlock & Proceed to Checklist" backLabel="← Back to WR" onBack={onBack}
      onConfirm={() => { setBusy(true); setError(""); acknowledge().then(() => setUnlocked(true)).catch((problem: unknown) => setError(problem instanceof Error ? problem.message : "Could not record the acknowledgment.")).finally(() => setBusy(false)); }} />
  </div>;
}
