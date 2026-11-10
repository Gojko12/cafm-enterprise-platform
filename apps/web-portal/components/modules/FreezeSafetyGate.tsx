"use client";

import { useState } from "react";
import type { LocationFreeze } from "@cafm/shared-schema";
import { FREEZE_ACK_STATEMENTS, formatFreezePeriodWindow, freezeLocationLabel } from "@/lib/location-freezes";

export function FreezeBadge({ freezes }: { freezes: LocationFreeze[] }) {
  if (!freezes.length) return null;
  return <div role="status" className="rounded border border-sky-400 bg-sky-50 p-2 text-sm text-sky-950">
    <strong>❄ Freeze Period</strong>
    {freezes.map((item) => <p key={item.id}>{item.title}: {formatFreezePeriodWindow(item.startDateTime, item.endDateTime)}</p>)}
  </div>;
}

export function FreezeSafetyGate({ freezes, onUnlock, onBack, unlockLabel = "Unlock & Proceed to Checklist", backLabel = "← Back to WR" }: {
  freezes: LocationFreeze[]; onUnlock: () => void; onBack: () => void; unlockLabel?: string; backLabel?: string;
}) {
  const [checked, setChecked] = useState<boolean[]>(FREEZE_ACK_STATEMENTS.map(() => false));
  const complete = checked.every(Boolean);
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-label="Freeze Period Safety Confirmation">
    <div className="w-full max-w-lg space-y-3 rounded-lg bg-white p-5 shadow-2xl">
      <h2 className="text-lg font-bold text-sky-900">❄ Freeze Period Safety Confirmation</h2>
      {freezes.map((item) => <div key={item.id} className="rounded border border-sky-300 bg-sky-50 p-3 text-sm">
        <p className="font-semibold">{item.title}</p>
        <p>Coordinator: {item.responsiblePerson}</p>
        <p>Location: {freezeLocationLabel(item)}</p>
        <p>Freeze window: {formatFreezePeriodWindow(item.startDateTime, item.endDateTime)}</p>
      </div>)}
      <div className="space-y-2">
        {FREEZE_ACK_STATEMENTS.map((text, index) => <label key={text} className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={checked[index]} onChange={(event) => setChecked((current) => current.map((value, i) => i === index ? event.target.checked : value))} />
          <span>{text}</span>
        </label>)}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onBack} className="rounded border px-4 py-2">{backLabel}</button>
        <button type="button" disabled={!complete} onClick={onUnlock} className="rounded bg-sky-700 px-4 py-2 font-semibold text-white disabled:opacity-40">{unlockLabel}</button>
      </div>
    </div>
  </div>;
}
