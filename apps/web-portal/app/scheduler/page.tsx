"use client";

import React, { useEffect, useState } from "react";
import { CLASSICAL_TRADES, CraftpersonAbsenceSchema } from "@cafm/shared-schema";
import type { BaseWorkRequest, CraftpersonAbsence } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { activeAbsences, addDays, assignmentAbsences, calendarDate, fromWallMinutes, intervalFor, resolveLeaveConflicts, wallMinutes } from "@/lib/dispatch";
import { HourlyTimeline } from "@/components/modules/HourlyTimeline";
import { PMWorkRequestPopup } from "@/components/modules/PMWorkRequestPopup";
import { FJWorkRequestPopup } from "@/components/modules/FJWorkRequestPopup";
import { LJWorkRequestPopup } from "@/components/modules/LJWorkRequestPopup";
import { describeLocationFreeze, getActiveFreezeConflictsForWR, getCurrentLocationFreezes } from "@/lib/location-freezes";

type Person = ReturnType<typeof useCafmStore>["data"]["craftspeople"][number];
type Move = { id: string; from?: string; person: string; date: string; start?: string; end?: string };
const button = "rounded border bg-white px-2 py-1 text-xs hover:bg-slate-100";

export default function SchedulerPage() {
  const { data, setData } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const { currentRole } = useApp();
  const [date, setDate] = useState("2026-11-09");
  const [view, setView] = useState<"day" | "week" | "two" | "month">("week");
  const [trade, setTrade] = useState("");
  const [building, setBuilding] = useState("");
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("All");
  const [types, setTypes] = useState(["PM", "FJ", "LJ", "Frozen", "Completed"]);
  const [pool, setPool] = useState(true);
  const [poolSearch, setPoolSearch] = useState("");
  const [showScheduled, setShowScheduled] = useState(false);
  const [poolMode, setPoolMode] = useState("Detailed");
  const [poolSort, setPoolSort] = useState("Urgency");
  const [quickAssign, setQuickAssign] = useState<string | null>(null);
  const [quickPerson, setQuickPerson] = useState("");
  const [quickDate, setQuickDate] = useState(date);
  const [tab, setTab] = useState<"dispatch" | "availability">("dispatch");
  const [firstHour, setFirstHour] = useState(6);
  const [lastHour, setLastHour] = useState(20);
  const [weekends, setWeekends] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [leaveFor, setLeaveFor] = useState<string | null>(null);
  const [editLeave, setEditLeave] = useState<CraftpersonAbsence | null>(null);
  const [editTime, setEditTime] = useState<{ id: string; person: string; start: string; end: string } | null>(null);
  const [conflict, setConflict] = useState<CraftpersonAbsence | null>(null);
  const [error, setError] = useState("");
  const siteRequests = data.workRequests.filter((wr) => wr.SiteId === activeSiteId);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setDate(calendarDate(new Date()));
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const localNow = now ? `${calendarDate(now)}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` : "";
  const people = data.craftspeople.filter((person) => person.SiteId === activeSiteId);
  const days = view === "day" ? 1 : view === "week" ? 7 : view === "two" ? 14 : new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate();
  const start = view === "month" ? `${date.slice(0, 7)}-01` : date;
  const dates = Array.from({ length: days }, (_, index) => addDays(start, index)).filter((day) => weekends || (view !== "week" && view !== "two") || ![0, 6].includes(new Date(`${day}T12:00:00`).getDay()));
  const visible = (wr: BaseWorkRequest) => types.includes(wr.WR_Type) && (types.includes("Frozen") || !wr.IsFrozen) && (types.includes("Completed") || ![78, 100].includes(wr.Percentage));
  const filteredPeople = people.filter((person) => (!trade || person.Trade === trade) &&
    `${person.Name} ${person.LastName}`.toLowerCase().includes(search.toLowerCase()) &&
    (!building || siteRequests.some((wr) => wr.bl_id === building && wr.AssignedCraftpersonIds.includes(person.id))) &&
    (availability === "All" || dates.some((day) => (activeAbsences(data.craftpersonAbsences, activeSiteId, person.id, day).length > 0) === (availability === "On leave"))));
  const request = siteRequests.find((wr) => wr.WR_ID === open);
  const audit = (wr: BaseWorkRequest, text: string): BaseWorkRequest => {
    const now = new Date().toISOString();
    return { ...wr, UpdatedAt: now, Activity: [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: activePerson, actorName: activePerson, actorRole: currentRole, createdAt: now, text }] };
  };
  const assign = (move: Move) => {
    const wr = siteRequests.find((item) => item.WR_ID === move.id);
    const person = people.find((item) => item.id === move.person);
    if (!wr || !person) { setError("The selected request or craftsperson is unavailable."); return; }
    if ([27, 78, 100].includes(wr.Percentage)) { setError("Cancelled or completed requests cannot be rescheduled here."); return; }
    if (move.from !== person.id && wr.AssignedCraftpersonIds.includes(person.id)) { setError("This craftsperson is already assigned to the request."); return; }
    const newIds = [...new Set([...wr.AssignedCraftpersonIds.filter((id) => id !== move.from), person.id])];
    const old = move.from ? intervalFor(wr, move.from) : null;
    const startTime = move.start ?? `${move.date}T07:00`;
    const endTime = move.end ?? fromWallMinutes(wallMinutes(startTime) + (old ? wallMinutes(old.assignedEndDateTime) - wallMinutes(old.assignedStartDateTime) : Math.max(30, (wr.ExpectedHours ?? 1) * 60)));
    if (endTime <= startTime) { setError("End time must be after start time."); return; }
    const assignment = { craftpersonId: person.id, assignedStartDateTime: startTime, assignedEndDateTime: endTime };
    const leave = assignmentAbsences(data.craftpersonAbsences, activeSiteId, assignment);
    if (leave.length && !window.confirm(`${leave.map((item) => `${people.find((p) => p.id === item.craftpersonId)?.Name ?? item.craftpersonId}: ${item.absenceType} (${item.startDate} to ${item.endDate})`).join("; ")}. Force assignment?`)) return;
    let offShift = false;
    for (let day = startTime.slice(0, 10); day <= endTime.slice(0, 10); day = addDays(day, 1)) {
      const start = Math.max(wallMinutes(startTime), wallMinutes(`${day}T00:00`));
      const end = Math.min(wallMinutes(endTime), wallMinutes(`${addDays(day, 1)}T00:00`));
      if (end > start && (start < wallMinutes(`${day}T${person.shiftStart ?? "07:00"}`) || end > wallMinutes(`${day}T${person.shiftEnd ?? "15:30"}`))) offShift = true;
    }
    if (offShift && !window.confirm("This assignment includes off-shift hours. Schedule anyway?")) return;
    const mismatch = !!wr.TradeName && person.Trade !== wr.TradeName && !(person.secondaryTradeIds ?? []).includes(wr.TradeName);
    if (mismatch && !window.confirm(`${person.Name} works in ${person.Trade}, not ${wr.TradeName}. Assign anyway?`)) return;
    let reason = "";
    if (wr.MarginDate && move.date > wr.MarginDate.slice(0, 10)) {
      const manager = activePerson === "SiteAdmin" || data.siteRoleAssignments.some((item) => item.SiteId === activeSiteId && item.PersonName === activePerson && ["ESA_TM", "TRADE_TM", "ESA_LJM", "ESA_TO"].includes(item.RoleCode) && (item.Trade === "All" || item.Trade === wr.TradeName));
      if (!manager) { setError("A site/trade manager must override a margin breach."); return; }
      reason = window.prompt("Enter the manager override reason for scheduling after the margin date:")?.trim() ?? "";
      if (!reason) { setError("A margin override reason is required."); return; }
    }
    const snapshot = JSON.stringify(data.craftpersonAbsences);
    setData((state) => {
      const current = state.workRequests.find((item) => item.SiteId === activeSiteId && item.WR_ID === wr.WR_ID);
      if (!current || JSON.stringify(current) !== JSON.stringify(wr) || JSON.stringify(state.craftpersonAbsences) !== snapshot || !state.craftspeople.some((item) => item.id === person.id && item.SiteId === activeSiteId && JSON.stringify(item) === JSON.stringify(person))) {
        queueMicrotask(() => setError("Request, availability or craftsperson changed. Retry scheduling.")); return state;
      }
      const previous = current.AssignedCraftpersonIds.filter((id) => id !== move.from && id !== person.id).map((id) => intervalFor(current, id)).filter((item): item is NonNullable<typeof item> => item !== null);
      const next = audit({ ...current, AssignedCraftpersonIds: newIds, CraftpersonAssignments: [...previous, assignment], StartDate_DateToPerform: startTime.slice(0, 10), StartDateTBD: false, ...(newIds.length === 1 ? { ExpectedHours: (wallMinutes(endTime) - wallMinutes(startTime)) / 60 } : {}) }, `Scheduled ${person.id}: ${startTime} – ${endTime}${leave.length ? "; leave override" : ""}${offShift ? "; off-shift override" : ""}${mismatch ? "; trade mismatch override" : ""}${reason ? `; margin override: ${reason}` : ""} by ${activePerson}`);
      const conflicts = getActiveFreezeConflictsForWR(next, state.locationFreezes);
      queueMicrotask(() => setNotice(conflicts.length ? `❄ Planned in Freeze Period: ${conflicts.map(describeLocationFreeze).join("; ")}` : ""));
      return { ...state, workRequests: state.workRequests.map((item) => item === current ? next : item) };
    });
    setError("");
    setQuickAssign(null);
    setEditTime(null);
  };
  const moveDate = (direction: number) => {
    if (view === "month") {
      const [year, month] = date.split("-").map(Number);
      setDate(calendarDate(new Date(year, month - 1 + direction, 1, 12)));
    } else setDate(addDays(date, direction * days));
  };
  const resolveLeave = (mode: "unassign" | "reassign", selected = conflict) => {
    if (!selected) return;
    setData((state) => {
      if (!state.craftpersonAbsences.some((entry) => entry.id === selected.id && JSON.stringify(entry) === JSON.stringify(selected))) {
        queueMicrotask(() => setError("Leave record changed; retry.")); return state;
      }
      const { requests, unresolved } = resolveLeaveConflicts(state.workRequests, state.craftpersonAbsences, state.craftspeople, selected, mode,
        (wr, text) => audit(wr, `${text} by ${activePerson}`));
      queueMicrotask(() => { setConflict(null); setError(unresolved ? `${unresolved} request(s) could not be reassigned; leave conflicts remain.` : ""); setNotice(unresolved ? "" : "Affected assignments updated."); });
      return { ...state, workRequests: requests };
    });
  };
  return <div className="space-y-2 p-3 text-xs">
    <div className="flex gap-2"><button className={button} onClick={() => setTab("dispatch")}>WR Dispatch Calendar</button><button className={button} onClick={() => setTab("availability")}>Shifts, Vacations &amp; Trainings</button></div>
    {error && <p role="alert" className="rounded bg-red-100 p-2 text-red-900">{error}</p>}
    {notice && <p role="status" className="rounded bg-cyan-100 p-2">{notice}</p>}
    {tab === "dispatch" && <>
    <div className="flex flex-wrap items-center gap-2 rounded border bg-white p-2">
      <button className={button} onClick={() => moveDate(-1)}>◀ Prev</button><button className={button} onClick={() => setDate(calendarDate(new Date()))}>Today</button><button className={button} onClick={() => moveDate(1)}>Next ▶</button>
      <strong>{dates[0]} – {dates[dates.length - 1]}</strong>
      <select aria-label="Timeline" className={button} value={view} onChange={(e) => setView(e.target.value as typeof view)}><option value="day">Day</option><option value="week">Week</option><option value="two">2 Weeks</option><option value="month">Month</option></select>
      <select aria-label="Trade" className={button} value={trade} onChange={(e) => setTrade(e.target.value)}><option value="">All trades</option>{CLASSICAL_TRADES.map((item) => <option key={item}>{item}</option>)}</select>
      <select aria-label="Building" className={button} value={building} onChange={(e) => setBuilding(e.target.value)}><option value="">All buildings</option>{data.buildings.map((item) => <option key={item.bl_id} value={item.bl_id}>{item.bl_id}</option>)}</select>
      <select aria-label="Availability" className={button} value={availability} onChange={(e) => setAvailability(e.target.value)}><option>All</option><option>Only available</option><option>On leave</option></select>
      <input className="rounded border p-1" placeholder="Craftsperson name" value={search} onChange={(e) => setSearch(e.target.value)} />
      {["PM", "FJ", "LJ", "Frozen", "Completed"].map((item) => <label key={item}><input type="checkbox" checked={types.includes(item)} onChange={(e) => setTypes((current) => e.target.checked ? [...current, item] : current.filter((entry) => entry !== item))} /> {item}</label>)}
      <label>Hours: <select value={firstHour} onChange={(event) => setFirstHour(Number(event.target.value))}>{Array.from({ length: lastHour }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}</select></label>
      <label>to <select value={lastHour} onChange={(event) => setLastHour(Number(event.target.value))}>{Array.from({ length: 24 - firstHour }, (_, i) => <option key={i} value={firstHour + i + 1}>{String(firstHour + i + 1).padStart(2, "0")}:00</option>)}</select></label>
      <button className={button} onClick={() => { setFirstHour(0); setLastHour(24); }}>0–24h</button>
      <label><input type="checkbox" checked={weekends} onChange={(event) => setWeekends(event.target.checked)} /> Show Weekends</label>
      <a className={button} href="/freezes">❄ Location Freezes</a>
    </div>
    <p>Shift Hours · <span className="bg-slate-100">Off-Shift</span> · <span className="bg-amber-100">🏖 Vacation</span> · <span className="bg-indigo-100">🎓 Training</span> · <span className="bg-rose-100">🤒 Sick Leave</span> · ❄ Location Freeze</p>
    <div className="flex items-start gap-2"><aside className={`order-2 shrink-0 rounded border bg-white p-2 ${pool ? "w-80" : "w-12"}`}><button className={button} onClick={() => setPool(!pool)}>{pool ? "▶ Pool" : "◀"}</button>
      {pool && <div className="max-h-[75vh] space-y-2 overflow-auto"><details open><summary className="cursor-pointer font-bold">Filter</summary><input aria-label="Filter pool" className="w-full rounded border p-1" placeholder="ID, trade, location or urgency" value={poolSearch} onChange={(event) => setPoolSearch(event.target.value)} /><label className="block"><input type="checkbox" checked={showScheduled} onChange={(event) => setShowScheduled(event.target.checked)} /> Show scheduled WRs</label><label>Display mode <select value={poolMode} onChange={(event) => setPoolMode(event.target.value)}><option>Detailed</option><option>Compact</option></select></label><label className="ml-2">Sort by <select value={poolSort} onChange={(event) => setPoolSort(event.target.value)}><option>Urgency</option><option>WR ID</option><option>Due Date</option><option>Margin Date</option></select></label></details>{siteRequests.filter((wr) => visible(wr) && (showScheduled || !wr.AssignedCraftpersonIds.length || !wr.StartDate_DateToPerform) && (!trade || wr.TradeName === trade) && (!building || wr.bl_id === building) && [wr.WR_ID, wr.TradeName, wr.bl_id, wr.LevelName, wr.RoomCode, wr.Helper_SortUrgency].some((value) => String(value ?? "").toLowerCase().includes(poolSearch.toLowerCase()))).sort((a, b) => poolSort === "Urgency" ? (a.Helper_SortUrgency ?? 4) - (b.Helper_SortUrgency ?? 4) : String(poolSort === "WR ID" ? a.WR_ID : poolSort === "Due Date" ? a.DueDate ?? "" : a.MarginDate ?? "").localeCompare(String(poolSort === "WR ID" ? b.WR_ID : poolSort === "Due Date" ? b.DueDate ?? "" : b.MarginDate ?? ""))).map((wr) => <article key={wr.WR_ID} draggable onDragStart={(event) => event.dataTransfer.setData("application/json", JSON.stringify({ id: wr.WR_ID }))} className="rounded border p-2">
        <strong>{wr.WR_Type} · {wr.WR_ID}</strong>{getCurrentLocationFreezes(wr, data.locationFreezes, localNow).length > 0 && <span className="ml-2 text-cyan-800" title={getCurrentLocationFreezes(wr, data.locationFreezes, localNow).map(describeLocationFreeze).join("; ")}>❄ Freeze Active at Location</span>}{poolMode === "Detailed" && <><p>{wr.Description} · {wr.EquipmentCodes.join(", ")}</p><p>{wr.TradeName} · {wr.bl_id} / {wr.RoomCode} · urgency {wr.Helper_SortUrgency ?? "—"}</p><p>Due {wr.DueDate ?? "—"} · Margin {wr.MarginDate ?? "—"}</p></>}
        <button className={button} onClick={() => { setQuickPerson(""); setQuickDate(date); setQuickAssign(wr.WR_ID); }}>Assign...</button> <button className={button} onClick={() => setOpen(wr.WR_ID)}>👁 Open</button></article>)}</div>}</aside>
      <HourlyTimeline dates={dates} people={filteredPeople} requests={siteRequests} visible={visible} absences={data.craftpersonAbsences} freezes={data.locationFreezes} site={activeSiteId} firstHour={firstHour} lastHour={lastHour} onOpen={setOpen} onEdit={(wr, person) => { const interval = intervalFor(wr, person); if (interval) setEditTime({ id: wr.WR_ID, person, start: interval.assignedStartDateTime, end: interval.assignedEndDateTime }); }} onMove={(id, person, start, end, from) => assign({ id, person, date: start.slice(0, 10), start, end, from })} /></div>
    </>}
    {tab === "availability" && <div className="space-y-4 rounded border bg-white p-3">
      <h2 className="text-base font-bold">Craftsperson Working Shifts</h2>
      <div className="overflow-auto"><table className="w-full text-left"><thead><tr><th>Craftsperson</th><th>Shift start</th><th>Shift end</th><th>Daily capacity</th><th>Primary trade</th><th>Secondary trades</th><th /></tr></thead><tbody>
        {people.map((person) => <ShiftRow key={`${activeSiteId}-${person.id}-${JSON.stringify(person)}`} person={person} onSave={(updated) => setData((state) => {
          const current = state.craftspeople.find((item) => item.id === person.id && item.SiteId === activeSiteId);
          if (!current || JSON.stringify(current) !== JSON.stringify(person)) { queueMicrotask(() => setError("Craftsperson changed; refresh the shift editor and retry.")); return state; }
          return { ...state, craftspeople: state.craftspeople.map((item) => item === current ? updated : item) };
        })} />)}
      </tbody></table></div>
      <div className="flex items-center justify-between"><h2 className="text-base font-bold">Vacations, Trainings &amp; Absences</h2><button className={button} onClick={() => { setEditLeave(null); setLeaveFor(people[0]?.id ?? ""); }}>+ Add Vacation / Training / Sick Leave</button></div>
      <div className="overflow-auto"><table className="w-full text-left"><thead><tr><th>Craftsperson</th><th>Type</th><th>Dates</th><th>Hours</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {data.craftpersonAbsences.filter((entry) => entry.siteId === activeSiteId).map((entry) => <tr key={entry.id} className="border-t"><td>{people.find((person) => person.id === entry.craftpersonId)?.Name ?? entry.craftpersonId}</td><td>{entry.absenceType}</td><td>{entry.startDate} – {entry.endDate}</td><td>{entry.isFullDay ? "Full day" : entry.startTime && entry.endTime ? `${entry.startTime} – ${entry.endTime}` : `${entry.unavailableHoursPerDay}h`}</td><td>{entry.status}</td><td className="space-x-1"><button className={button} onClick={() => { setEditLeave(entry); setLeaveFor(entry.craftpersonId); }}>Edit</button><button className={button} onClick={() => { if (window.confirm("Delete this absence?")) setData((state) => {
          const current = state.craftpersonAbsences.find((item) => item.id === entry.id && item.siteId === activeSiteId);
          if (JSON.stringify(current) !== JSON.stringify(entry)) { queueMicrotask(() => setError("Absence changed; retry with the latest data.")); return state; }
          return { ...state, craftpersonAbsences: state.craftpersonAbsences.filter((item) => item !== current) };
        }); }}>Delete</button><button className={button} onClick={() => resolveLeave("reassign", entry)}>Auto-Reassign Affected WRs</button><button className={button} onClick={() => resolveLeave("unassign", entry)}>Return to Unassigned Pool</button></td></tr>)}
      </tbody></table></div>
    </div>}
    {quickAssign && <div role="dialog" aria-modal="true" aria-label="Assign work request" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><form className="space-y-2 rounded bg-white p-5" onSubmit={(event) => { event.preventDefault(); assign({ id: quickAssign, person: quickPerson, date: quickDate }); }}><h2 className="font-bold">Assign {quickAssign}</h2><select required className="block border p-1" value={quickPerson} onChange={(event) => setQuickPerson(event.target.value)}><option value="">Select craftsperson</option>{people.map((person) => <option key={person.id} value={person.id}>{person.Name} {person.LastName} · {person.Trade}</option>)}</select><input required type="date" className="block border p-1" value={quickDate} onChange={(event) => setQuickDate(event.target.value)} /><button className={button}>Assign</button> <button type="button" className={button} onClick={() => setQuickAssign(null)}>Cancel</button></form></div>}
    {editTime && <div role="dialog" aria-modal="true" aria-label="Edit assignment time" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><form className="space-y-2 rounded bg-white p-5" onSubmit={(event) => { event.preventDefault(); assign({ id: editTime.id, person: editTime.person, from: editTime.person, date: editTime.start.slice(0, 10), start: editTime.start, end: editTime.end }); }}><h2 className="font-bold">Edit {editTime.id}</h2><label className="block">Start <input required type="datetime-local" value={editTime.start} onChange={(event) => setEditTime({ ...editTime, start: event.target.value })} /></label><label className="block">End <input required type="datetime-local" value={editTime.end} onChange={(event) => setEditTime({ ...editTime, end: event.target.value })} /></label><button className={button}>Save</button> <button type="button" className={button} onClick={() => setEditTime(null)}>Cancel</button></form></div>}
    {leaveFor !== null && <AbsenceForm people={people} initial={leaveFor} existing={editLeave} onClose={() => setLeaveFor(null)} onSave={(entry) => {
      setData((state) => {
        const current = state.craftpersonAbsences.find((item) => item.id === entry.id && item.siteId === activeSiteId);
        if ((editLeave && JSON.stringify(current) !== JSON.stringify(editLeave)) || (!editLeave && current)) { queueMicrotask(() => setError("Absence changed; retry with the latest data.")); return state; }
        queueMicrotask(() => setConflict(entry));
        return { ...state, craftpersonAbsences: [...state.craftpersonAbsences.filter((item) => item.id !== entry.id || item.siteId !== activeSiteId), entry] };
      });
      setLeaveFor(null);
    }} site={activeSiteId} date={date} />}
    {conflict && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="rounded bg-white p-5"><h2 className="font-bold">Leave conflict resolution</h2>{siteRequests.filter((wr) => { const interval = intervalFor(wr, conflict.craftpersonId); return interval && assignmentAbsences([conflict], activeSiteId, interval).length; }).map((wr) => <p key={wr.WR_ID}>{wr.WR_ID} · {wr.Description}</p>)}<div className="mt-3 flex gap-2"><button className={button} onClick={() => resolveLeave("reassign")}>Auto-Reassign to Available Trade Peer</button><button className={button} onClick={() => resolveLeave("unassign")}>Unassign &amp; Return to Trade Pool</button><button className={button} onClick={() => setConflict(null)}>Close</button></div></div></div>}
    {request?.WR_Type === "PM" && <PMWorkRequestPopup workRequest={request} onClose={() => setOpen(null)} onNavigate={setOpen} onEscalateToLJ={() => { setOpen(null); setError("Create Long Jobs from the work request overview."); }} />}
    {request?.WR_Type === "FJ" && <FJWorkRequestPopup workRequest={request} onClose={() => setOpen(null)} onNavigate={setOpen} onEscalateToLJ={() => { setOpen(null); setError("Create Long Jobs from the work request overview."); }} />}
    {request?.WR_Type === "LJ" && <LJWorkRequestPopup workRequest={request} onClose={() => setOpen(null)} onNavigate={setOpen} />}
  </div>;
}

function ShiftRow({ person, onSave }: { person: Person; onSave: (person: Person) => void }) {
  const [start, setStart] = useState(person.shiftStart ?? "07:00");
  const [end, setEnd] = useState(person.shiftEnd ?? "15:30");
  const [hours, setHours] = useState(person.ShiftHours);
  const [trade, setTrade] = useState(person.Trade);
  const [secondary, setSecondary] = useState(person.secondaryTradeIds ?? []);
  const [error, setError] = useState("");
  return <tr className="border-t"><td>{person.Name} {person.LastName}</td>
    <td><input aria-label="Shift start" type="time" value={start} onChange={(event) => setStart(event.target.value)} /></td>
    <td><input aria-label="Shift end" type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></td>
    <td><input aria-label="Daily capacity" className="w-16 border" type="number" min="0" max="24" step="0.5" value={hours} onChange={(event) => setHours(Number(event.target.value))} /></td>
    <td><select aria-label="Primary trade" value={trade} onChange={(event) => setTrade(event.target.value)}>{CLASSICAL_TRADES.map((item) => <option key={item}>{item}</option>)}</select></td>
    <td><select aria-label="Secondary trades" multiple value={secondary} onChange={(event) => setSecondary(Array.from(event.target.selectedOptions, (option) => option.value))}>{CLASSICAL_TRADES.filter((item) => item !== trade).map((item) => <option key={item}>{item}</option>)}</select></td>
    <td><button className={button} onClick={() => { if (!start || !end || start >= end || !Number.isFinite(hours) || hours < 0 || hours > 24) { setError("Enter a valid same-day shift and capacity."); return; } onSave({ ...person, shiftStart: start, shiftEnd: end, ShiftHours: hours, Trade: trade, secondaryTradeIds: secondary.filter((item) => item !== trade) }); setError(""); }}>Save</button>{error && <span role="alert" className="text-red-700">{error}</span>}</td></tr>;
}

function AbsenceForm({ people, initial, existing, site, date, onClose, onSave }: {
  people: Person[]; initial: string; existing: CraftpersonAbsence | null; site: CraftpersonAbsence["siteId"]; date: string;
  onClose: () => void; onSave: (absence: CraftpersonAbsence) => void;
}) {
  const [person, setPerson] = useState(initial);
  const [type, setType] = useState<CraftpersonAbsence["absenceType"]>(existing?.absenceType ?? "Vacation");
  const [start, setStart] = useState(existing?.startDate ?? date);
  const [end, setEnd] = useState(existing?.endDate ?? date);
  const [full, setFull] = useState(existing?.isFullDay ?? true);
  const [startTime, setStartTime] = useState(existing && !existing.isFullDay ? existing.startTime ?? "" : "09:00");
  const [endTime, setEndTime] = useState(existing && !existing.isFullDay ? existing.endTime ?? "" : "13:00");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState("");
  return <div role="dialog" aria-modal="true" aria-label="Add absence" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><form className="w-96 space-y-3 rounded bg-white p-5" onSubmit={(event) => {
    event.preventDefault();
    const hours = full ? 8 : (wallMinutes(`${start}T${endTime}`) - wallMinutes(`${start}T${startTime}`)) / 60;
    const parsed = CraftpersonAbsenceSchema.safeParse({ id: existing?.id ?? crypto.randomUUID(), siteId: site, craftpersonId: person, absenceType: type, startDate: start, endDate: end, isFullDay: full, ...(!full ? { startTime, endTime } : {}), unavailableHoursPerDay: hours, status: existing?.status ?? "Approved", notes });
    if (!parsed.success || !people.some((item) => item.id === person)) { setError(parsed.success ? "Select a craftsperson." : parsed.error.issues.map((issue) => issue.message).join("; ")); return; }
    onSave(parsed.data);
  }}><h2 className="font-bold">Add absence / vacation</h2>{error && <p role="alert" className="text-red-700">{error}</p>}
    <label className="block">Craftsperson <select className="block w-full border p-1" value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Select</option>{people.map((item) => <option value={item.id} key={item.id}>{item.Name} {item.LastName} · {item.Trade}</option>)}</select></label>
    <label className="block">Type <select className="block w-full border p-1" value={type} onChange={(e) => setType(e.target.value as CraftpersonAbsence["absenceType"])}>{["Vacation", "SickLeave", "Training", "PublicHoliday", "OtherAbsence"].map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="block">From <input required type="date" className="block w-full border p-1" value={start} onChange={(e) => setStart(e.target.value)} /></label>
    <label className="block">To <input required type="date" className="block w-full border p-1" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
    <label><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} /> Full day</label>
    {!full && <div className="flex gap-2"><label>Start time <input required type="time" className="block border p-1" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label><label>End time <input required type="time" className="block border p-1" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label></div>}
    <label className="block">Notes <textarea className="block w-full border p-1" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    <button className={button} type="submit">Save absence</button> <button className={button} type="button" onClick={onClose}>Cancel</button></form></div>;
}
