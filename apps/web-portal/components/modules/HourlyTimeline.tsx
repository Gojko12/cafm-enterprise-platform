"use client";

import React, { useEffect, useRef, useState } from "react";
import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { BaseWorkRequest, CraftpersonAbsence, LocationFreeze } from "@cafm/shared-schema";
import type { DemoData } from "../../lib/cafm-data";
import { absenceInterval, dailyCapacity, fromWallMinutes, intervalFor, wallMinutes } from "../../lib/dispatch";
import { describeLocationFreeze, freezeLocationLabel, getActiveFreezeConflictsForWR } from "../../lib/location-freezes";
import { tradeColor } from "../../lib/trade-colors";
import { startRequestDrag } from "../../lib/drag-preview";
import { getEffectiveCraftpersonShift, shiftSegments } from "../../lib/craftperson-shifts";
import type { DisputeViewMode, WRDispute } from "../../lib/disputes";
import { fieldReasonLabels, isOverdue, urgencyOrder } from "../../lib/field-updates";

type Person = DemoData["craftspeople"][number];
type Preview = { wr: BaseWorkRequest; person: string; start: string; end: string };
const HOUR_WIDTH = 36;

function weekLabel(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const first = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - first.getTime()) / 86400000 + 1) / 7);
  return `w.${week} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export type TimelineSpotlight = { id: string; person: string; day: string; trade: string; token: number };

export function HourlyTimeline({ dates, people, requests, absences, freezes, site, firstHour, lastHour, visible, onMove, onOpen, onEdit, onRemove, spotlight, disputeMap, disputeMode }: {
  dates: string[]; people: Person[]; requests: BaseWorkRequest[]; absences: CraftpersonAbsence[]; freezes: LocationFreeze[];
  site: string; firstHour: number; lastHour: number;
  visible: (wr: BaseWorkRequest) => boolean;
  onMove: (id: string, person: string, start: string, end: string, from?: string) => void;
  onOpen: (id: string) => void;
  onEdit: (wr: BaseWorkRequest, person: string) => void;
  onRemove: (id: string, person: string) => void;
  spotlight?: TimelineSpotlight | null;
  disputeMap: Map<string, WRDispute[]>; disputeMode: DisputeViewMode;
}) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [hoverFreeze, setHoverFreeze] = useState<string | null>(null);
  const [selectedFreeze, setSelectedFreeze] = useState<string | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const target = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  useEffect(() => { if (spotlight) setCollapsed((old) => old.filter((trade) => trade !== spotlight.trade)); }, [spotlight]);
  useEffect(() => {
    if (spotlight && target.current && typeof target.current.scrollIntoView === "function") target.current.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [spotlight, collapsed, dates, firstHour, lastHour]);
  const width = (lastHour - firstHour) * HOUR_WIDTH;
  const visibleFreezes = freezes.filter((freeze) => freeze.siteId === site && dates.some((day) => {
    const start = wallMinutes(`${day}T00:00`) + firstHour * 60;
    return wallMinutes(freeze.startDateTime) < start + (lastHour - firstHour) * 60 && wallMinutes(freeze.endDateTime) > start;
  }));
  const focusFreeze = visibleFreezes.find((freeze) => freeze.id === (hoverFreeze ?? selectedFreeze));
  const weeks: Array<{ label: string; count: number }> = [];
  for (const day of dates) {
    const label = weekLabel(day), last = weeks[weeks.length - 1];
    if (last?.label === label) last.count++;
    else weeks.push({ label, count: 1 });
  }
  const displayed = requests.map((wr) => preview?.wr.WR_ID === wr.WR_ID ? {
    ...wr,
    CraftpersonAssignments: [...(wr.CraftpersonAssignments ?? []).filter((entry) => entry.craftpersonId !== preview.person), {
      craftpersonId: preview.person, assignedStartDateTime: preview.start, assignedEndDateTime: preview.end,
    }],
  } : wr);
  const resize = (event: React.MouseEvent, wr: BaseWorkRequest, person: string, edge: "start" | "end") => {
    event.preventDefault();
    event.stopPropagation();
    const interval = intervalFor(wr, person);
    if (!interval) return;
    cleanup.current?.();
    const startX = event.clientX;
    let nextStart = interval.assignedStartDateTime, nextEnd = interval.assignedEndDateTime;
    const move = (e: MouseEvent) => {
      const delta = Math.round((e.clientX - startX) / (HOUR_WIDTH / 2)) * 30;
      const start = wallMinutes(interval.assignedStartDateTime), end = wallMinutes(interval.assignedEndDateTime);
      nextStart = fromWallMinutes(edge === "start" ? Math.min(start + delta, end - 30) : start);
      nextEnd = fromWallMinutes(edge === "end" ? Math.max(end + delta, start + 30) : end);
      setPreview({ wr, person, start: nextStart, end: nextEnd });
    };
    const up = () => {
      cleanup.current?.();
      setPreview(null);
      if (nextStart !== interval.assignedStartDateTime || nextEnd !== interval.assignedEndDateTime) onMove(wr.WR_ID, person, nextStart, nextEnd, person);
    };
    const clear = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); cleanup.current = null; };
    cleanup.current = clear;
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return <div className="min-w-0 flex-1 overflow-auto rounded border bg-white">
    <table className="border-separate border-spacing-0 text-xs"><thead className="sticky top-0 z-30 bg-white"><tr><th rowSpan={2} className="sticky left-0 z-20 min-w-48 border-r bg-white p-2 text-left shadow-[2px_0_5px_-2px_rgba(0,0,0,0.12)] dark:bg-slate-900">Craftsperson</th>{weeks.map((week, index) => <th key={`${week.label}-${index}`} colSpan={week.count} className="border-l">{week.label}</th>)}</tr><tr>
      {dates.map((day) => <th key={day} className="border-l" style={{ minWidth: width }}><div>{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][new Date(`${day}T00:00:00Z`).getUTCDay()]} {day.slice(8)}</div><div className="flex font-normal">{Array.from({ length: lastHour - firstHour }, (_, i) => <span key={i} style={{ width: HOUR_WIDTH }} className="shrink-0 border-l">{String(firstHour + i).padStart(2, "0")}</span>)}</div></th>)}</tr>
      {(visibleFreezes.length ? visibleFreezes : [null]).map((freeze, index) => <tr key={freeze?.id ?? "empty"} className="h-7 bg-white">
        <th className="sticky left-0 z-20 border-r bg-white px-2 text-left">{index === 0 ? "❄ Location Freezes" : ""}</th>
        {dates.map((day) => {
          const start = wallMinutes(`${day}T00:00`) + firstHour * 60, end = start + (lastHour - firstHour) * 60;
          const left = freeze ? Math.max(start, wallMinutes(freeze.startDateTime)) : start;
          const right = freeze ? Math.min(end, wallMinutes(freeze.endDateTime)) : start;
          const allowed = freeze ? (["PM", "FJ", "LJ"] as const).filter((type) => freeze[`allow${type}`]).join(", ") || "none" : "";
          const detail = freeze ? `What is happening: ${freeze.description}\nResponsible person: ${freeze.responsiblePerson}\nLocations: ${freezeLocationLabel(freeze)}\n${freeze.startDateTime} – ${freeze.endDateTime}\nAllowed: ${allowed}` : "";
          return <td key={day} className="border-l"><div className="relative h-7" style={{ width }}>{freeze && right > left && <button type="button" title={detail} aria-label={`Location freeze ${freeze.title}: ${detail}`} onMouseEnter={() => setHoverFreeze(freeze.id)} onMouseLeave={() => setHoverFreeze(null)} onFocus={() => setHoverFreeze(freeze.id)} onBlur={() => setHoverFreeze(null)} onClick={() => setSelectedFreeze((current) => current === freeze.id ? null : freeze.id)} className="absolute top-0 h-7 truncate rounded border border-cyan-400 bg-cyan-100/90 px-2 text-left text-[11px] font-medium text-cyan-950" style={{ left: (left - start) / 60 * HOUR_WIDTH, width: (right - left) / 60 * HOUR_WIDTH }}>❄ {freeze.title} ({freezeLocationLabel(freeze)}) • Allowed: {allowed}</button>}</div></td>;
        })}
      </tr>)}</thead>
      <tbody>{CLASSICAL_TRADES.filter((trade) => people.some((person) => person.Trade === trade)).map((trade) => <React.Fragment key={trade}>
        <tr className="bg-slate-100"><th className="sticky left-0 z-20 border-r bg-slate-100 p-2 text-left shadow-[2px_0_5px_-2px_rgba(0,0,0,0.12)] dark:bg-slate-900"><button onClick={() => setCollapsed((old) => old.includes(trade) ? old.filter((item) => item !== trade) : [...old, trade])}>{collapsed.includes(trade) ? "▶" : "▼"} 📁 {trade}</button></th>{dates.length > 0 && <td colSpan={dates.length} />}</tr>
        {!collapsed.includes(trade) && people.filter((person) => person.Trade === trade).map((person) => <tr key={person.id}>
          <th className={`sticky left-0 z-20 border-r border-t p-2 text-left align-top shadow-[2px_0_5px_-2px_rgba(0,0,0,0.12)] ${spotlight?.person === person.id ? "bg-amber-100" : "bg-white dark:bg-slate-900"}`}>{person.Name} {person.LastName}{person.username && ` · ${person.username}`}<p className="font-normal"><span className={`rounded border px-1 ${tradeColor(person.Trade)}`}>{person.Trade}</span> · Base {person.baseShiftType ?? "Standard"} {person.shiftStart ?? "07:00"}–{person.shiftEnd ?? "15:30"}</p></th>
          {dates.map((day) => {
            const start = wallMinutes(`${day}T00:00`) + firstHour * 60, end = start + (lastHour - firstHour) * 60;
            const shift = getEffectiveCraftpersonShift(person, day);
            const cap = dailyCapacity(displayed, absences, site, person.id, day, person.ShiftHours, shift.shiftStart, shift.shiftEnd, person);
            const entries = cap.assigned.filter(visible).map((wr) => ({ wr, interval: intervalFor(wr, person.id) })).filter((item) => item.interval && wallMinutes(item.interval.assignedEndDateTime) > start && wallMinutes(item.interval.assignedStartDateTime) < end);
            const segments = shiftSegments(person, day).map((part) => ({ start: Math.max(start, part.start), end: Math.min(end, part.end) })).filter((part) => part.end > part.start);
            return <td key={day} className="border align-top" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
              event.preventDefault();
              let payload: unknown;
              try {
                payload = JSON.parse(event.dataTransfer.getData("application/json"));
              } catch { window.alert("Could not read the dragged work request."); return; }
              if (!payload || typeof payload !== "object" || !("id" in payload) || typeof payload.id !== "string") { window.alert("Invalid dragged work request."); return; }
              const wr = requests.find((item) => item.WR_ID === payload.id);
              if (!wr) { window.alert("The dragged work request is no longer available."); return; }
              const from = "from" in payload && typeof payload.from === "string" ? payload.from : undefined;
              const previous = intervalFor(wr, person.id) ?? (from ? intervalFor(wr, from) : null);
              const duration = previous ? wallMinutes(previous.assignedEndDateTime) - wallMinutes(previous.assignedStartDateTime) : Math.max(30, (wr.ExpectedHours ?? 1) * 60);
              const slot = start + Math.max(0, Math.min(lastHour - firstHour - 1, Math.floor((event.clientX - event.currentTarget.getBoundingClientRect().left) / HOUR_WIDTH))) * 60;
              onMove(wr.WR_ID, person.id, fromWallMinutes(slot), fromWallMinutes(slot + duration), from);
            }}><div className="relative" style={{ width, height: Math.max(56, 32 + entries.length * 28) }}>
              <div className="absolute inset-0 bg-slate-200/85" title={`${shift.shiftType} ${shift.shiftStart}–${shift.shiftEnd}`} />
              {segments.map((part, index) => <div key={index} className="pointer-events-none absolute inset-y-0 border-t-2 border-t-emerald-400 bg-white" style={{ left: (part.start - start) / 60 * HOUR_WIDTH, width: (part.end - part.start) / 60 * HOUR_WIDTH }} />)}
              {Array.from({ length: lastHour - firstHour }, (_, index) => <div key={index} className="pointer-events-none absolute inset-y-0 border-r border-slate-300/70" style={{ left: index * HOUR_WIDTH, width: HOUR_WIDTH }} />)}
              {cap.leave.map((leave) => {
                const interval = absenceInterval(leave, day);
                if (!interval) return null;
                const left = Math.max(start, wallMinutes(interval[0])), right = Math.min(end, wallMinutes(interval[1]));
                if (right <= left) return null;
                const color = leave.absenceType === "Vacation" ? "bg-amber-100/90 text-amber-900" : leave.absenceType === "Training" ? "bg-indigo-100/90 text-indigo-900" : leave.absenceType === "SickLeave" ? "bg-rose-100/90 text-rose-900" : "bg-teal-100/90 text-teal-900";
                return <div key={leave.id} className={`pointer-events-none absolute inset-y-0 overflow-hidden border ${color}`} style={{ left: (left - start) / 60 * HOUR_WIDTH, width: (right - left) / 60 * HOUR_WIDTH, ...(leave.absenceType === "Vacation" ? { backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(180, 83, 9, 0.1) 6px, rgba(180, 83, 9, 0.1) 9px)" } : {}) }} title={leave.absenceType} />;
              })}
              {spotlight?.person === person.id && spotlight.day === day && <div className="pointer-events-none absolute inset-0 bg-amber-200/40" />}
              <div className="pointer-events-none absolute inset-x-1 top-0 flex items-center justify-between gap-2 overflow-hidden whitespace-nowrap"><span>{cap.allocated.toFixed(1)} / {cap.available.toFixed(1)} h</span><span>{shift.shiftType} {shift.shiftStart}–{shift.shiftEnd}</span><span>{cap.leave.map((leave) => leave.absenceType).join(", ")}</span></div>
              {entries.map(({ wr, interval }, index) => {
                if (!interval) return null;
                const left = Math.max(start, wallMinutes(interval.assignedStartDateTime)), right = Math.min(end, wallMinutes(interval.assignedEndDateTime));
                const conflicts = getActiveFreezeConflictsForWR(wr, freezes);
                const title = `${wr.WR_ID} ${wr.Description}\n${interval.assignedStartDateTime} – ${interval.assignedEndDateTime}\n${wr.bl_id ?? ""} / ${wr.LevelName ?? ""} / ${wr.RoomCode ?? ""}${conflicts.map((item) => `\n❄ Planned in Freeze Period: ${describeLocationFreeze(item)}`).join("")}${(disputeMap.get(wr.WR_ID) ?? []).map((item) => `\n${item.label}: ${item.detail}`).join("")}`;
                const editable = ![27, 78, 100].includes(wr.Percentage);
                const highlighted = spotlight?.id === wr.WR_ID && spotlight.person === person.id && spotlight.day === day;
                const affected = !!focusFreeze && getActiveFreezeConflictsForWR({ ...wr, AssignedCraftpersonIds: [person.id], CraftpersonAssignments: [interval], StartDate_DateToPerform: undefined }, [focusFreeze]).length > 0;
                const update = (wr.technicianFieldUpdates ?? []).filter((item) => item.status === "Open").sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])[0];
                const overdue = isOverdue(wr, new Date(), person.id);
                return <div key={wr.WR_ID} ref={highlighted ? target : undefined} title={`${title}${update ? `\n${fieldReasonLabels[update.reasonCategory]}: ${update.message}` : ""}${overdue ? "\nOverdue / Behind Planned Schedule" : ""}`} draggable={editable} onDragStart={(event) => startRequestDrag(event, wr, person.id)} className={`absolute flex h-6 items-center overflow-hidden rounded border-l-4 ${tradeColor(wr.TradeName)} ${highlighted ? "z-20 animate-pulse bg-amber-200 font-bold shadow-lg ring-4 ring-amber-400" : disputeMode === "highlight" ? disputeMap.get(wr.WR_ID)?.length ? "z-10 animate-pulse bg-rose-100 font-bold text-rose-950 shadow-lg ring-4 ring-rose-500" : "opacity-40" : update || overdue ? "z-10 ring-2 ring-rose-500" : affected ? "z-10 ring-2 ring-cyan-500" : ""}`} style={{ left: (left - start) / 60 * HOUR_WIDTH, width: (right - left) / 60 * HOUR_WIDTH, top: 28 + index * 28 }}>
                  {editable && left === wallMinutes(interval.assignedStartDateTime) && <span role="separator" aria-label="Resize start" className="h-full w-2 shrink-0 cursor-ew-resize bg-black/20" onMouseDown={(event) => resize(event, wr, person.id, "start")} />}
                  <button className="min-w-0 flex-1 truncate text-left" onClick={() => onOpen(wr.WR_ID)}>{wr.WR_ID}{update ? ` ${update.urgency === "UrgentBlocked" ? "🔴 BLOCKER" : "🚩"} ${fieldReasonLabels[update.reasonCategory]}` : ""}{overdue ? " ⏰ Overdue" : ""}{disputeMap.get(wr.WR_ID)?.length ? " ⚠ Dispute" : conflicts.length ? " ❄ Planned in Freeze Period" : ""}</button>
                  {editable && <button aria-label={`Edit time for ${wr.WR_ID}`} onClick={() => onEdit(wr, person.id)}>✎</button>}
                  <button title="Remove from calendar (Unschedule)" aria-label={`Unschedule ${wr.WR_ID} for ${person.Name} ${person.LastName}`} onClick={() => onRemove(wr.WR_ID, person.id)}>✕</button>
                  {editable && right === wallMinutes(interval.assignedEndDateTime) && <span role="separator" aria-label="Resize end" className="h-full w-2 shrink-0 cursor-ew-resize bg-black/20" onMouseDown={(event) => resize(event, wr, person.id, "end")} />}
                </div>;
              })}
            </div></td>;
          })}
        </tr>)}
      </React.Fragment>)}</tbody></table>
    {selectedFreeze && visibleFreezes.filter((freeze) => freeze.id === selectedFreeze).map((freeze) => <div key={freeze.id} role="status" className="sticky bottom-0 left-0 z-30 w-fit max-w-full rounded border border-cyan-400 bg-cyan-50 p-2 text-cyan-950">
      <strong>❄ {freeze.title}</strong> · {freeze.description} · Responsible: {freeze.responsiblePerson} · Locations: {freezeLocationLabel(freeze)} · {freeze.startDateTime} – {freeze.endDateTime} · Allowed: {(["PM", "FJ", "LJ"] as const).filter((type) => freeze[`allow${type}`]).join(", ") || "none"}
      <button type="button" className="ml-2 underline" onClick={() => setSelectedFreeze(null)}>Close</button>
    </div>)}
  </div>;
}
