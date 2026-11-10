import React, { useMemo, useState } from "react";
import { formatDateDDMMYYYY, formatDateRangeDDMMYYYY, pmTargetLabel } from "@cafm/shared-schema";
import type { BaseWorkRequest, LocationFreeze } from "@cafm/shared-schema";
import { addDays, calendarDate } from "../../../web-portal/lib/dispatch";
import { isOverdue } from "../../../web-portal/lib/field-updates";
import { scheduledDateOf, startDateOf } from "../lib/store";

export type DateBasis = "scheduled" | "start" | "due" | "margin";
const BASES: Array<{ id: DateBasis; label: string }> = [{ id: "scheduled", label: "Scheduled" }, { id: "start", label: "Start" }, { id: "due", label: "Due" }, { id: "margin", label: "Margin" }];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOT: Record<string, string> = { PM: "bg-blue-500", FJ: "bg-amber-500", LJ: "bg-indigo-500" };

export function wrDateFor(wr: BaseWorkRequest, basis: DateBasis): string | undefined {
  if (basis === "scheduled") return scheduledDateOf(wr);
  if (basis === "start") return startDateOf(wr);
  return (basis === "due" ? wr.DueDate : wr.MarginDate)?.slice(0, 10) || undefined;
}

const mondayOffset = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const shiftMonth = (date: string, delta: number) => {
  const d = new Date(`${monthStart(date)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
};
const hoursLabel = (start: string, end: string) => `${start.slice(11, 16)} – ${end.slice(11, 16)} (${(Math.max(0, (Date.parse(`${end}:00Z`) - Date.parse(`${start}:00Z`)) / 3600000)).toFixed(1)}h)`;

interface Props {
  wrs: BaseWorkRequest[];
  technician: string;
  now: number;
  freezes?: LocationFreeze[];
  onOpenWR?: (wrId: string) => void;
  onResetFilters?: () => void;
}

export const TechnicianCalendarView: React.FC<Props> = ({ wrs, technician, now, freezes = [], onOpenWR, onResetFilters }) => {
  const today = calendarDate(new Date(now));
  const [basis, setBasis] = useState<DateBasis>("scheduled");
  const [density, setDensity] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [trayOpen, setTrayOpen] = useState(false);

  const byDay = useMemo(() => {
    const map = new Map<string, BaseWorkRequest[]>();
    for (const wr of wrs) {
      const day = wrDateFor(wr, basis);
      if (day) map.set(day, [...(map.get(day) ?? []), wr]);
    }
    return map;
  }, [wrs, basis]);
  const undated = useMemo(() => wrs.filter((wr) => !wrDateFor(wr, basis)), [wrs, basis]);
  const late = (wr: BaseWorkRequest) => isOverdue(wr, new Date(now), technician);
  const frozenDay = (day: string) => freezes.some((item) => item.startDateTime.slice(0, 10) <= day && item.endDateTime.slice(0, 10) >= day);

  const days = useMemo(() => {
    if (density === "week") {
      const first = addDays(cursor, -mondayOffset(cursor));
      return Array.from({ length: 7 }, (_, i) => addDays(first, i));
    }
    const first = monthStart(cursor);
    const gridStart = addDays(first, -mondayOffset(first));
    const monthEnd = addDays(shiftMonth(cursor, 1), -1);
    const total = Math.ceil((mondayOffset(first) + Number(monthEnd.slice(8, 10))) / 7) * 7;
    return Array.from({ length: total }, (_, i) => addDays(gridStart, i));
  }, [cursor, density]);

  const move = (direction: -1 | 1) => setCursor(density === "week" ? addDays(cursor, direction * 7) : shiftMonth(cursor, direction));
  const goToday = () => { setCursor(today); setSelected(today); };
  const title = density === "week" ? formatDateRangeDDMMYYYY(days[0], days[6]) : `${MONTHS[Number(cursor.slice(5, 7)) - 1]} ${cursor.slice(0, 4)}`;
  const seg = (active: boolean) => `px-2 py-1 text-xs font-semibold ${active ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`;

  const agenda = (byDay.get(selected) ?? []).slice().sort((a, b) => {
    const left = basis === "scheduled" ? a.CraftpersonAssignments?.[0]?.assignedStartDateTime ?? "" : "";
    const right = basis === "scheduled" ? b.CraftpersonAssignments?.[0]?.assignedStartDateTime ?? "" : "";
    return left.localeCompare(right) || a.WR_ID.localeCompare(b.WR_ID);
  });

  const row = (wr: BaseWorkRequest) => {
    const slot = wr.CraftpersonAssignments?.[0];
    const overdue = late(wr);
    return <button key={wr.WR_ID} type="button" onClick={() => onOpenWR?.(wr.WR_ID)} className={`mb-1.5 block w-full rounded-xl border bg-white px-3 py-2 text-left shadow-2xs ${overdue ? "border-rose-300" : "border-slate-200"}`}>
      <span className="flex items-center gap-1.5 text-xs">
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white ${DOT[wr.WR_Type] ?? "bg-slate-700"}`}>{wr.WR_Type}</span>
        <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">{wr.Percentage}%</span>
        <strong>{wr.WR_ID}</strong>
        {slot?.autoScheduledFromPmsId && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">🔁 Auto-PMS</span>}
        {overdue && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">Overdue</span>}
        {basis === "scheduled" && slot && <span className="ml-auto font-medium text-slate-700">{hoursLabel(slot.assignedStartDateTime, slot.assignedEndDateTime)}</span>}
      </span>
      <span className="mt-0.5 block truncate text-xs text-slate-700">{wr.Description}</span>
      <span className="block truncate text-[11px] text-slate-500">{[[wr.bl_id, wr.RoomCode].filter(Boolean).join(" / "), pmTargetLabel(wr), wr.TradeName].filter(Boolean).join(" · ")}</span>
    </button>;
  };

  return <div className="space-y-2" data-testid="technician-calendar">
    {!wrs.length && <div className="rounded-lg border p-3 text-center text-sm">No matching work requests. <button type="button" onClick={onResetFilters} className="text-blue-700 underline">Reset Filters</button></div>}
    <div role="group" aria-label="Calendar date basis" className="grid grid-cols-4 overflow-hidden rounded-lg border border-slate-300">
      {BASES.map((item) => <button key={item.id} type="button" aria-pressed={basis === item.id} className={seg(basis === item.id)} onClick={() => setBasis(item.id)}>{item.label}</button>)}
    </div>
    <div className="flex items-center gap-1 text-xs">
      <button type="button" aria-label="Previous" className="rounded border bg-white px-2 py-1" onClick={() => move(-1)}>&lt; Prev</button>
      <strong className="flex-1 text-center text-sm">{title}</strong>
      <button type="button" className="rounded border bg-white px-2 py-1" onClick={goToday}>Today</button>
      <button type="button" aria-label="Next" className="rounded border bg-white px-2 py-1" onClick={() => move(1)}>Next &gt;</button>
    </div>
    <div role="group" aria-label="Calendar density" className="ml-auto grid w-40 grid-cols-2 overflow-hidden rounded-lg border border-slate-300">
      <button type="button" aria-pressed={density === "month"} className={seg(density === "month")} onClick={() => setDensity("month")}>Month</button>
      <button type="button" aria-pressed={density === "week"} className={seg(density === "week")} onClick={() => setDensity("week")}>Week</button>
    </div>
    <div className="grid grid-cols-7 gap-px rounded-lg bg-slate-200 p-px text-center text-[11px]">
      {WEEKDAYS.map((day) => <div key={day} className="bg-slate-50 py-1 font-semibold text-slate-600">{day}</div>)}
      {days.map((day) => {
        const items = byDay.get(day) ?? [];
        const types = ["PM", "FJ", "LJ"].filter((type) => items.some((wr) => wr.WR_Type === type));
        const hasLate = items.some(late);
        const outside = density === "month" && day.slice(0, 7) !== cursor.slice(0, 7);
        const frozen = frozenDay(day);
        return <button key={day} type="button" aria-label={`${formatDateDDMMYYYY(day)}, ${items.length} work requests${frozen ? ", freeze period" : ""}`} aria-pressed={selected === day} onClick={() => setSelected(day)}
          className={`flex ${density === "week" ? "h-20" : "h-14"} flex-col items-center gap-0.5 p-1 ${frozen ? "bg-sky-50" : "bg-white"} ${outside ? "opacity-40" : ""} ${selected === day ? "ring-2 ring-inset ring-blue-600" : ""}`}>
          <span className={`text-xs ${day === today ? "rounded-full bg-blue-600 px-1.5 font-bold text-white" : "font-medium"}`}>{Number(day.slice(8, 10))}{frozen ? "❄" : ""}</span>
          {items.length > 0 && <span className="rounded-full bg-slate-800 px-1.5 text-[10px] font-semibold text-white">{items.length}</span>}
          <span className="flex gap-0.5">{types.map((type) => <i key={type} className={`h-1.5 w-1.5 rounded-full ${DOT[type]}`} />)}{hasLate && <i className="h-1.5 w-1.5 rounded-full bg-rose-600" />}</span>
        </button>;
      })}
    </div>
    <p className="flex flex-wrap gap-2 text-[10px] text-slate-500"><span>● PM</span><span>● FJ</span><span>● LJ</span><span>● Overdue</span><span>❄ Freeze Period</span></p>
    <section>
      <h3 className="mb-1 text-sm font-bold">{formatDateDDMMYYYY(selected)}{selected === today ? " (Today)" : ""} · {agenda.length} WR{agenda.length === 1 ? "" : "s"}{frozenDay(selected) ? " · ❄ Freeze Period" : ""}</h3>
      {agenda.length === 0 ? <p className="rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-500">No work requests on this day for the selected date type.</p> : agenda.map(row)}
    </section>
    <details open={trayOpen} onToggle={(event) => setTrayOpen((event.currentTarget as HTMLDetailsElement).open)} className="rounded-lg border border-slate-200 bg-white p-2">
      <summary className="cursor-pointer text-sm font-semibold">{basis === "scheduled" ? "Unscheduled WRs" : `No ${BASES.find((item) => item.id === basis)!.label} date`} ({undated.length})</summary>
      <div className="mt-2">{undated.length === 0 ? <p className="text-xs text-slate-500">Nothing here.</p> : undated.map(row)}</div>
    </details>
  </div>;
};
