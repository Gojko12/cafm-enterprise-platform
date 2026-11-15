import React, { useState } from "react";
import { formatDateDDMMYYYY, pmTargetLabel } from "@cafm/shared-schema";
import type { BaseWorkRequest, Equipment, LocationFreeze, PmGateResult } from "@cafm/shared-schema";
import { FrequencyPill } from "../../../web-portal/components/common/PmFrequency";
import { formatFreezePeriodWindow } from "../../../web-portal/lib/location-freezes";

interface WrExecutionHeroProps {
  wr: BaseWorkRequest;
  equipment: Equipment[];
  planned: string;
  pmGate?: PmGateResult;
  freezes: LocationFreeze[];
  now: number;
  busy: boolean;
  running: boolean;
  clock: string;
  idle: boolean;
  completed: boolean;
  stepsTotal: number;
  sessionCount: number;
  recordedMinutes: number;
  onBack: () => void;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
}

const chipButton = "flex w-full items-center justify-between rounded-xl border px-2.5 py-1.5 text-left text-xs font-semibold";

/**
 * Section 82 — compact 1-screen WR hero: single header card with one schedule line,
 * a tap-to-expand details drawer, slim Freeze / Clearance chips and a sticky mini
 * timer bar with progressive Start / Pause / Stop controls.
 */
export const WrExecutionHero: React.FC<WrExecutionHeroProps> = ({ wr, equipment, planned, pmGate, freezes, now, busy, running, clock, idle, completed, stepsTotal, sessionCount, recordedMinutes, onBack, onStart, onPause, onStop }) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const uncleared = !!pmGate && pmGate.state !== "Cleared";
  const equipmentNames = wr.EquipmentCodes.map((code) => equipment.find((item) => item.EquipmentCode === code)?.EquipmentName ?? code).join(", ");
  const location = [wr.bl_id, wr.LevelName, wr.RoomCode].filter(Boolean).join(" / ");
  const details: Array<[string, string]> = [
    ["Due", wr.DueDate ? formatDateDDMMYYYY(wr.DueDate) : "—"],
    ["Margin", wr.MarginDate ? formatDateDDMMYYYY(wr.MarginDate) : "—"],
    ["PMS #", wr.pmsId ?? wr.ScheduleId ?? "—"],
    ["Trade", wr.TradeName ?? wr.TradeId ?? "—"],
    ["Priority", wr.Urgency ?? "—"],
    ["Sessions", `${sessionCount} · ${recordedMinutes}m recorded`],
  ];
  return <div className="space-y-2">
    <div className="sticky top-0 z-30 space-y-1.5 rounded-xl border bg-white p-2 shadow-sm">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5">
        <button type="button" disabled={busy} onClick={onBack} className="shrink-0 text-sm text-blue-700">← Back</button>
        <strong className="text-sm">{wr.WR_ID}</strong>
        <FrequencyPill code={wr.pmFrequency} />
        <span className="rounded bg-blue-100 px-1.5 text-xs">{wr.WR_Type}</span>
        <span className="rounded bg-slate-100 px-1.5 text-xs font-semibold">{wr.Percentage}%</span>
      </div>
      {running && <div role="status" className="flex items-center gap-2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-white">
        <span className="font-mono text-base font-semibold" aria-label="Running work timer">⏱ {clock}</span>
        <span className="ml-auto flex gap-1.5">
          <button type="button" disabled={busy} onClick={onPause} className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-bold text-slate-900 disabled:opacity-50">⏸ Pause</button>
          <button type="button" disabled={busy} onClick={onStop} className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-bold disabled:opacity-50">⏹ Stop</button>
        </span>
      </div>}
    </div>
    <section className="rounded-2xl border bg-white p-3">
      <h1 className="text-base font-bold leading-snug">{wr.Description}</h1>
      <p className="mt-1 truncate text-xs text-slate-700">⚙️ {pmTargetLabel(wr)}{equipmentNames ? ` ${equipmentNames}` : ""} · 📍 {location || "—"}</p>
      <p className="mt-1 text-xs font-medium text-blue-900">🗓 {planned}</p>
      <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}
        className="mt-1.5 w-full rounded-lg bg-slate-50 px-2 py-1 text-left text-xs font-semibold text-slate-600">
        Details {detailsOpen ? "▴" : "▾"}
      </button>
      {detailsOpen && <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {details.map(([label, value]) => <div key={label} className="flex justify-between gap-2 border-b border-slate-100 py-0.5">
          <dt className="text-slate-500">{label}</dt><dd className="font-medium text-slate-900">{value}</dd>
        </div>)}
      </dl>}
    </section>
    {pmGate && <div>
      <button type="button" aria-expanded={gateOpen} onClick={() => setGateOpen((open) => !open)}
        className={`${chipButton} ${uncleared ? "border-amber-400 bg-amber-50 text-amber-900" : "border-emerald-400 bg-emerald-50 text-emerald-900"}`}>
        <span>{uncleared ? "⚠️ Hold / Pending Clearance" : "✅ Cleared"}</span><span>{gateOpen ? "▴" : "▾"}</span>
      </button>
      {gateOpen && <div className={`mt-1 rounded-xl border p-2.5 text-xs ${uncleared ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
        {uncleared
          ? <p><strong>Pending: {pmGate.blockers.join(", ")}</strong></p>
          : <><p><strong>Cleared ({pmGate.cleared.join(", ")}{pmGate.cleared.length ? " · " : ""}Newsflash Sent)</strong></p>
            {pmGate.windows.map((item) => <p key={item.code} className="font-bold">{item.code}: {item.window}</p>)}</>}
      </div>}
    </div>}
    {(freezes.length > 0 || wr.IsFrozen) && <div>
      <button type="button" aria-expanded={freezeOpen} onClick={() => setFreezeOpen((open) => !open)}
        className={`${chipButton} border-sky-300 bg-sky-50 text-sky-900`}>
        <span>❄ Freeze Period{freezes.length > 1 ? ` (${freezes.length})` : ""}</span><span>{freezeOpen ? "▴" : "▾"}</span>
      </button>
      {freezeOpen && <div className="mt-1 space-y-1.5 rounded-xl border border-sky-300 bg-sky-50 p-2.5 text-xs text-sky-900">
        {freezes.map((freeze) => <p key={freeze.id}><strong>{freeze.title}</strong> · {freeze.responsiblePerson} · {formatFreezePeriodWindow(freeze.startDateTime, freeze.endDateTime, new Date(now))}</p>)}
        {!freezes.length && <p>{wr.FreezeReason || wr.ActiveFreezeName}</p>}
      </div>}
    </div>}
    {!completed && !running && <button type="button" disabled={busy} onClick={onStart}
      className="w-full rounded-2xl bg-emerald-700 p-3.5 text-base font-bold text-white shadow-sm disabled:opacity-50">
      {idle ? `▶ Start Work & Unlock Checklist (${stepsTotal} step${stepsTotal === 1 ? "" : "s"})` : `▶ Resume Work (${recordedMinutes}m recorded)`}
    </button>}
  </div>;
};
