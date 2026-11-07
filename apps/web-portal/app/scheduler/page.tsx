"use client";

import React, { useState } from "react";
import { CLASSICAL_TRADES, CraftpersonAbsenceSchema } from "@cafm/shared-schema";
import type { BaseWorkRequest, CraftpersonAbsence } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { activeAbsences, addDays, calendarDate, dailyCapacity, frozenOn, resolveLeaveConflicts } from "@/lib/dispatch";
import { PMWorkRequestPopup } from "@/components/modules/PMWorkRequestPopup";
import { FJWorkRequestPopup } from "@/components/modules/FJWorkRequestPopup";
import { LJWorkRequestPopup } from "@/components/modules/LJWorkRequestPopup";

type Person = ReturnType<typeof useCafmStore>["data"]["craftspeople"][number];
type Move = { id: string; from?: string; person: string; date: string };
const button = "rounded border bg-white px-2 py-1 text-xs hover:bg-slate-100";

export default function SchedulerPage() {
  const { data, setData } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const { currentRole } = useApp();
  const [date, setDate] = useState(() => calendarDate(new Date()));
  const [view, setView] = useState<"day" | "week" | "two" | "month">("week");
  const [trade, setTrade] = useState("");
  const [building, setBuilding] = useState("");
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("All");
  const [types, setTypes] = useState(["PM", "FJ", "LJ", "Frozen", "Completed"]);
  const [pool, setPool] = useState(true);
  const [poolSearch, setPoolSearch] = useState("");
  const [quickAssign, setQuickAssign] = useState<string | null>(null);
  const [quickPerson, setQuickPerson] = useState("");
  const [quickDate, setQuickDate] = useState(date);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [freeze, setFreeze] = useState<string | null>(null);
  const [freezeList, setFreezeList] = useState(false);
  const [leaveFor, setLeaveFor] = useState<string | null>(null);
  const [conflict, setConflict] = useState<CraftpersonAbsence | null>(null);
  const [error, setError] = useState("");
  const siteRequests = data.workRequests.filter((wr) => wr.SiteId === activeSiteId);
  const people = data.craftspeople.filter((person) => person.SiteId === activeSiteId);
  const days = view === "day" ? 1 : view === "week" ? 7 : view === "two" ? 14 : new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate();
  const start = view === "month" ? `${date.slice(0, 7)}-01` : date;
  const dates = Array.from({ length: days }, (_, index) => addDays(start, index));
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
  const update = (original: BaseWorkRequest, change: (wr: BaseWorkRequest) => BaseWorkRequest, description: string) => {
    setData((state) => {
      const current = state.workRequests.find((wr) => wr.SiteId === activeSiteId && wr.WR_ID === original.WR_ID);
      if (!current || JSON.stringify(current) !== JSON.stringify(original)) {
        queueMicrotask(() => setError("Work request changed. Retry with the latest data."));
        return state;
      }

      return { ...state, workRequests: state.workRequests.map((wr) => wr === current ? audit(change(wr), description) : wr) };
    });
  };
  const assign = (move: Move) => {
    const wr = siteRequests.find((item) => item.WR_ID === move.id);
    const person = people.find((item) => item.id === move.person);
    if (!wr || !person) { setError("The selected request or craftsperson is unavailable."); return; }
    if (wr.IsFrozen || [27, 78, 100].includes(wr.Percentage)) { setError("Frozen, cancelled or completed requests cannot be rescheduled here."); return; }
    const newIds = [...new Set([...wr.AssignedCraftpersonIds.filter((id) => id !== move.from), person.id])];
    if (wr.StartDate_DateToPerform && wr.StartDate_DateToPerform !== move.date && newIds.length > 1 && !window.confirm("The date is shared by all assigned craftspeople. Move all assignments to this date?")) return;
    const leave = newIds.flatMap((id) => activeAbsences(data.craftpersonAbsences, activeSiteId, id, move.date));
    if (leave.length && !window.confirm(`${leave.map((item) => `${people.find((p) => p.id === item.craftpersonId)?.Name ?? item.craftpersonId}: ${item.absenceType} (${item.startDate} to ${item.endDate})`).join("; ")}. Force assignment?`)) return;
    if (wr.TradeName && person.Trade !== wr.TradeName && !window.confirm(`${person.Name} works in ${person.Trade}, not ${wr.TradeName}. Assign anyway?`)) return;
    if (wr.PlannedFreezeText && wr.FreezeStartDate && wr.FreezeEndDate && wr.FreezeStartDate <= move.date && move.date <= wr.FreezeEndDate && !window.confirm(`This date falls within the planned freeze: ${wr.PlannedFreezeText}. Continue?`)) return;
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
      if (!current || JSON.stringify(current) !== JSON.stringify(wr) || JSON.stringify(state.craftpersonAbsences) !== snapshot || !state.craftspeople.some((item) => item.id === person.id && item.SiteId === activeSiteId && item.Trade === person.Trade)) {
        queueMicrotask(() => setError("Request, availability or craftsperson changed. Retry scheduling.")); return state;
      }
      const next = audit({ ...current, AssignedCraftpersonIds: newIds, StartDate_DateToPerform: move.date, StartDateTBD: false }, `Scheduled ${move.date}; craftspeople ${newIds.join(", ")}${leave.length ? "; leave override" : ""}${person.Trade !== wr.TradeName ? "; trade mismatch override" : ""}${reason ? `; margin override: ${reason}` : ""} by ${activePerson}`);
      return { ...state, workRequests: state.workRequests.map((item) => item === current ? next : item) };
    });
    setError("");
    setQuickAssign(null);
  };
  const moveDate = (direction: number) => {
    if (view === "month") {
      const [year, month] = date.split("-").map(Number);
      setDate(calendarDate(new Date(year, month - 1 + direction, 1, 12)));
    } else setDate(addDays(date, direction * days));
  };
  const resolveLeave = (mode: "unassign" | "reassign") => {
    if (!conflict) return;
    setData((state) => {
      if (!state.craftpersonAbsences.some((entry) => entry.id === conflict.id && JSON.stringify(entry) === JSON.stringify(conflict))) {
        queueMicrotask(() => setError("Leave record changed; retry.")); return state;
      }
      const { requests, unresolved } = resolveLeaveConflicts(state.workRequests, state.craftpersonAbsences, state.craftspeople, conflict, mode,
        (wr, text) => audit(wr, `${text} by ${activePerson}`));
      queueMicrotask(() => { setConflict(null); setError(unresolved ? `${unresolved} request(s) could not be reassigned; leave conflicts remain.` : ""); });
      return { ...state, workRequests: requests };
    });
  };
  return <div className="space-y-2 p-3 text-xs">
    <div className="flex flex-wrap items-center gap-2 rounded border bg-white p-2">
      <button className={button} onClick={() => moveDate(-1)}>◀ Prev</button><button className={button} onClick={() => setDate(calendarDate(new Date()))}>Today</button><button className={button} onClick={() => moveDate(1)}>Next ▶</button>
      <strong>{dates[0]} – {dates[dates.length - 1]}</strong>
      <select aria-label="Timeline" className={button} value={view} onChange={(e) => setView(e.target.value as typeof view)}><option value="day">Day</option><option value="week">Week</option><option value="two">2 Weeks</option><option value="month">Month</option></select>
      <select aria-label="Trade" className={button} value={trade} onChange={(e) => setTrade(e.target.value)}><option value="">All trades</option>{CLASSICAL_TRADES.map((item) => <option key={item}>{item}</option>)}</select>
      <select aria-label="Building" className={button} value={building} onChange={(e) => setBuilding(e.target.value)}><option value="">All buildings</option>{data.buildings.map((item) => <option key={item.bl_id} value={item.bl_id}>{item.bl_id}</option>)}</select>
      <select aria-label="Availability" className={button} value={availability} onChange={(e) => setAvailability(e.target.value)}><option>All</option><option>Only available</option><option>On leave</option></select>
      <input className="rounded border p-1" placeholder="Craftsperson name" value={search} onChange={(e) => setSearch(e.target.value)} />
      {["PM", "FJ", "LJ", "Frozen", "Completed"].map((item) => <label key={item}><input type="checkbox" checked={types.includes(item)} onChange={(e) => setTypes((current) => e.target.checked ? [...current, item] : current.filter((entry) => entry !== item))} /> {item}</label>)}
      <button className={button} onClick={() => setLeaveFor(people[0]?.id ?? "")}>+ Add Absence / Vacation</button>
      <button className={button} onClick={() => setFreezeList(true)}>❄ Manage Freezes</button>
    </div>
    {error && <p role="alert" className="rounded bg-red-100 p-2 text-red-900">{error}</p>}
    <div className="flex items-start gap-2"><aside className={`shrink-0 rounded border bg-white p-2 ${pool ? "w-80" : "w-12"}`}><button className={button} onClick={() => setPool(!pool)}>{pool ? "◀ Pool" : "▶"}</button>
      {pool && <div className="max-h-[75vh] space-y-2 overflow-auto"><input aria-label="Filter pool" className="w-full rounded border p-1" placeholder="ID, trade, location or urgency" value={poolSearch} onChange={(event) => setPoolSearch(event.target.value)} />{siteRequests.filter((wr) => visible(wr) && (!wr.AssignedCraftpersonIds.length || !wr.StartDate_DateToPerform) && (!trade || wr.TradeName === trade) && (!building || wr.bl_id === building) && [wr.WR_ID, wr.TradeName, wr.bl_id, wr.LevelName, wr.RoomCode, wr.Helper_SortUrgency].some((value) => String(value ?? "").toLowerCase().includes(poolSearch.toLowerCase()))).sort((a, b) => (a.Helper_SortUrgency ?? 4) - (b.Helper_SortUrgency ?? 4)).map((wr) => <article key={wr.WR_ID} draggable onDragStart={(event) => event.dataTransfer.setData("application/json", JSON.stringify({ id: wr.WR_ID }))} className="rounded border p-2">
        <strong>{wr.WR_ID} · {wr.WR_Type}</strong><p>{wr.Description} · {wr.EquipmentCodes.join(", ")}</p><p>{wr.TradeName} · {wr.ExpectedHours ?? 0}h · urgency {wr.Helper_SortUrgency ?? "—"}</p><p>Due {wr.DueDate ?? "—"} · Margin {wr.MarginDate ?? "—"}</p>
        <button className={button} onClick={() => { setQuickPerson(""); setQuickDate(date); setQuickAssign(wr.WR_ID); }}>Assign...</button> <button className={button} onClick={() => setFreeze(wr.WR_ID)}>❄ Freeze</button></article>)}</div>}</aside>
      <div className="min-w-0 flex-1 overflow-auto rounded border bg-white"><table className="text-xs"><thead><tr><th className="min-w-48 p-2 text-left">Craftsperson</th>{dates.map((day) => <th className="min-w-44 border-l p-2" key={day}>{day}</th>)}</tr></thead><tbody>
      {CLASSICAL_TRADES.filter((item) => filteredPeople.some((person) => person.Trade === item)).map((group) => <React.Fragment key={group}><tr className="bg-slate-100"><th colSpan={dates.length + 1} className="p-2 text-left"><button onClick={() => setCollapsed((current) => current.includes(group) ? current.filter((item) => item !== group) : [...current, group])}>{collapsed.includes(group) ? "▶" : "▼"} {group}</button></th></tr>
        {!collapsed.includes(group) && filteredPeople.filter((person) => person.Trade === group).map((person) => <tr key={person.id}><th className="border-t p-2 text-left align-top">{person.Name} {person.LastName}<p className="font-normal">{person.Trade} · {person.ShiftHours}h</p><button className={button} onClick={() => setLeaveFor(person.id)}>+ Leave</button></th>
          {dates.map((day) => { const cap = dailyCapacity(siteRequests, data.craftpersonAbsences, activeSiteId, person.id, day, person.ShiftHours); const ratio = cap.available ? cap.allocated / cap.available : cap.allocated ? Infinity : 0;
            return <td key={day} className={`border p-1 align-top ${ratio > 1 ? "border-red-500 bg-red-50" : cap.available === 0 ? "bg-gray-200" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); try { const drag: unknown = JSON.parse(e.dataTransfer.getData("application/json")); if (!drag || typeof drag !== "object" || !("id" in drag) || typeof drag.id !== "string") throw new Error("Invalid drag data"); assign({ id: drag.id, from: "from" in drag && typeof drag.from === "string" ? drag.from : undefined, person: person.id, date: day }); } catch { setError("Could not read the dragged work request."); } }}>
              <div>{cap.allocated.toFixed(1)} / {cap.available.toFixed(1)} h</div><div className="h-1 bg-gray-200"><div className={`h-1 ${ratio > 1 ? "bg-red-600" : ratio >= 0.8 ? "bg-blue-600" : "bg-green-600"}`} style={{ width: `${Math.min(ratio * 100, 100)}%` }} /></div>
              {cap.leave.map((leave) => <p key={leave.id} className={`my-1 rounded p-1 ${leave.absenceType === "SickLeave" ? "bg-red-100" : leave.absenceType === "Training" ? "bg-indigo-100" : "bg-orange-100"}`}>⚠ {leave.absenceType}</p>)}
              {siteRequests.filter((wr) => wr.AssignedCraftpersonIds.includes(person.id) && wr.PlannedFreezeText && wr.FreezeStartDate && wr.FreezeEndDate && wr.FreezeStartDate <= day && day <= wr.FreezeEndDate && visible(wr)).map((wr) => <p key={`planned-${wr.WR_ID}`} className="my-1 rounded bg-amber-100 p-1">⏸ {wr.WR_ID}: {wr.PlannedFreezeText}</p>)}
              {cap.assigned.filter(visible).map((wr) => <article key={wr.WR_ID} draggable={!wr.IsFrozen && ![27, 78, 100].includes(wr.Percentage)} onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ id: wr.WR_ID, from: person.id }))} className={`my-1 rounded border p-1 ${frozenOn(wr, day) ? "border-dashed border-cyan-600 bg-cyan-100" : [78, 100].includes(wr.Percentage) ? "bg-green-100" : wr.WR_Type === "PM" ? "bg-blue-100" : wr.WR_Type === "LJ" ? "bg-purple-100" : "bg-teal-100"}`}>
                <button className="text-left font-semibold underline" onClick={() => frozenOn(wr, day) ? setFreeze(wr.WR_ID) : setOpen(wr.WR_ID)}>{frozenOn(wr, day) ? "❄ " : [78, 100].includes(wr.Percentage) ? "✓ " : ""}{wr.WR_ID}</button> {wr.EquipmentCodes.join(", ")} · {frozenOn(wr, day) ? `FROZEN: ${wr.ActiveFreezeName ?? "On hold"} · 0.0h` : [78, 100].includes(wr.Percentage) ? `${wr.TotalTimeMinutes} min actual` : `${wr.ExpectedHours ?? 0}h`} · {wr.Percentage}%
                {cap.leave.length > 0 && <p className="font-bold text-red-700">⚠ Leave Conflict</p>}{((wr.MarginDate && day >= wr.MarginDate.slice(0, 10)) || (wr.DueDate && day > wr.DueDate.slice(0, 10))) && <p className="text-red-700">⚠ SLA / Margin</p>}
                {wr.IsFrozen && wr.FreezeEndDate && wr.FreezeEndDate < calendarDate(new Date()) && <p className="text-red-700">Overdue Freeze - Follow Up</p>}
                <div className="flex gap-2">{!wr.IsFrozen && ![27, 78, 100].includes(wr.Percentage) && <><button onClick={() => update(wr, (current) => ({ ...current, ExpectedHours: Math.max(0, (current.ExpectedHours ?? 0) - 0.5) }), `Expected hours changed from ${wr.ExpectedHours ?? 0} to ${Math.max(0, (wr.ExpectedHours ?? 0) - 0.5)} by ${activePerson}`)}>−</button><button onClick={() => update(wr, (current) => ({ ...current, ExpectedHours: (current.ExpectedHours ?? 0) + 0.5 }), `Expected hours changed from ${wr.ExpectedHours ?? 0} to ${(wr.ExpectedHours ?? 0) + 0.5} by ${activePerson}`)}>+</button></>}<button onClick={() => setFreeze(wr.WR_ID)}>❄ Freeze</button></div>
              </article>)}</td>; })}</tr>)}</React.Fragment>)}</tbody></table></div></div>
    {quickAssign && <div role="dialog" aria-modal="true" aria-label="Assign work request" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><form className="space-y-2 rounded bg-white p-5" onSubmit={(event) => { event.preventDefault(); assign({ id: quickAssign, person: quickPerson, date: quickDate }); }}><h2 className="font-bold">Assign {quickAssign}</h2><select required className="block border p-1" value={quickPerson} onChange={(event) => setQuickPerson(event.target.value)}><option value="">Select craftsperson</option>{people.map((person) => <option key={person.id} value={person.id}>{person.Name} {person.LastName} · {person.Trade}</option>)}</select><input required type="date" className="block border p-1" value={quickDate} onChange={(event) => setQuickDate(event.target.value)} /><button className={button}>Assign</button> <button type="button" className={button} onClick={() => setQuickAssign(null)}>Cancel</button></form></div>}
    {freezeList && <div role="dialog" aria-modal="true" aria-label="Manage freezes" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="max-h-[80vh] w-96 overflow-auto rounded bg-white p-5"><h2 className="font-bold">Manage freezes</h2>{siteRequests.filter((wr) => wr.IsFrozen || wr.PlannedFreezeText).map((wr) => <button key={wr.WR_ID} className="block w-full border-b py-2 text-left" onClick={() => { setFreezeList(false); setFreeze(wr.WR_ID); }}>{wr.WR_ID} · {wr.ActiveFreezeName ?? wr.PlannedFreezeText ?? "Frozen"}</button>)}<button className={button} onClick={() => setFreezeList(false)}>Close</button></div></div>}
    {leaveFor !== null && <AbsenceForm people={people} initial={leaveFor} onClose={() => setLeaveFor(null)} onSave={(entry) => { setData((state) => ({ ...state, craftpersonAbsences: [...state.craftpersonAbsences, entry] })); setLeaveFor(null); setConflict(entry); }} site={activeSiteId} date={date} />}
    {conflict && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="rounded bg-white p-5"><h2 className="font-bold">Leave conflict resolution</h2>{siteRequests.filter((wr) => wr.AssignedCraftpersonIds.includes(conflict.craftpersonId) && wr.StartDate_DateToPerform && wr.StartDate_DateToPerform >= conflict.startDate && wr.StartDate_DateToPerform <= conflict.endDate).map((wr) => <p key={wr.WR_ID}>{wr.WR_ID} · {wr.Description}</p>)}<div className="mt-3 flex gap-2"><button className={button} onClick={() => resolveLeave("reassign")}>Auto-Reassign to Available Trade Peer</button><button className={button} onClick={() => resolveLeave("unassign")}>Unassign &amp; Return to Trade Pool</button><button className={button} onClick={() => setConflict(null)}>Close</button></div></div></div>}
    {freeze && siteRequests.find((wr) => wr.WR_ID === freeze) && <FreezeForm wr={siteRequests.find((wr) => wr.WR_ID === freeze)!} onClose={() => setFreeze(null)} onSave={(wr, change) => { update(wr, (current) => ({ ...current, ...change }), `Freeze settings updated by ${activePerson}: ${JSON.stringify(change)}`); setFreeze(null); }} />}
    {request?.WR_Type === "PM" && <PMWorkRequestPopup workRequest={request} onClose={() => setOpen(null)} onNavigate={setOpen} onEscalateToLJ={() => { setOpen(null); setError("Create Long Jobs from the work request overview."); }} />}
    {request?.WR_Type === "FJ" && <FJWorkRequestPopup workRequest={request} onClose={() => setOpen(null)} onNavigate={setOpen} onEscalateToLJ={() => { setOpen(null); setError("Create Long Jobs from the work request overview."); }} />}
    {request?.WR_Type === "LJ" && <LJWorkRequestPopup workRequest={request} onClose={() => setOpen(null)} onNavigate={setOpen} />}
  </div>;
}

function AbsenceForm({ people, initial, site, date, onClose, onSave }: {
  people: Person[]; initial: string; site: CraftpersonAbsence["siteId"]; date: string;
  onClose: () => void; onSave: (absence: CraftpersonAbsence) => void;
}) {
  const [person, setPerson] = useState(initial);
  const [type, setType] = useState<CraftpersonAbsence["absenceType"]>("Vacation");
  const [start, setStart] = useState(date);
  const [end, setEnd] = useState(date);
  const [full, setFull] = useState(true);
  const [hours, setHours] = useState(8);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  return <div role="dialog" aria-modal="true" aria-label="Add absence" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><form className="w-96 space-y-3 rounded bg-white p-5" onSubmit={(event) => {
    event.preventDefault();
    const parsed = CraftpersonAbsenceSchema.safeParse({ id: crypto.randomUUID(), siteId: site, craftpersonId: person, absenceType: type, startDate: start, endDate: end, isFullDay: full, unavailableHoursPerDay: hours, status: "Approved", notes });
    if (!parsed.success || !people.some((item) => item.id === person)) { setError(parsed.success ? "Select a craftsperson." : parsed.error.issues.map((issue) => issue.message).join("; ")); return; }
    onSave(parsed.data);
  }}><h2 className="font-bold">Add absence / vacation</h2>{error && <p role="alert" className="text-red-700">{error}</p>}
    <label className="block">Craftsperson <select className="block w-full border p-1" value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Select</option>{people.map((item) => <option value={item.id} key={item.id}>{item.Name} {item.LastName} · {item.Trade}</option>)}</select></label>
    <label className="block">Type <select className="block w-full border p-1" value={type} onChange={(e) => setType(e.target.value as CraftpersonAbsence["absenceType"])}>{["Vacation", "SickLeave", "Training", "PublicHoliday", "OtherAbsence"].map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="block">From <input required type="date" className="block w-full border p-1" value={start} onChange={(e) => setStart(e.target.value)} /></label>
    <label className="block">To <input required type="date" className="block w-full border p-1" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
    <label><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} /> Full day</label>
    {!full && <label className="block">Unavailable hours <input required min="0" step="0.5" type="number" className="block w-full border p-1" value={hours} onChange={(e) => setHours(Number(e.target.value))} /></label>}
    <label className="block">Notes <textarea className="block w-full border p-1" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    <button className={button} type="submit">Save absence</button> <button className={button} type="button" onClick={onClose}>Cancel</button></form></div>;
}

function FreezeForm({ wr, onClose, onSave }: { wr: BaseWorkRequest; onClose: () => void; onSave: (wr: BaseWorkRequest, change: Partial<BaseWorkRequest>) => void }) {
  const [active, setActive] = useState(wr.IsFrozen);
  const [name, setName] = useState(wr.ActiveFreezeName ?? "");
  const [planned, setPlanned] = useState(wr.PlannedFreezeText ?? "");
  const [start, setStart] = useState(wr.FreezeStartDate ?? "");
  const [end, setEnd] = useState(wr.FreezeEndDate ?? "");
  const [error, setError] = useState("");
  return <div role="dialog" aria-modal="true" aria-label="Manage freeze" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><form className="w-96 space-y-3 rounded bg-white p-5" onSubmit={(event) => {
    event.preventDefault();
    if (active && !wr.IsFrozen && [27, 78, 100].includes(wr.Percentage)) { setError("Cancelled or completed requests cannot be frozen."); return; }
    if ((active && !name.trim()) || ((active || planned.trim()) && (!start || !end || end < start))) { setError("Enter a freeze name and a valid date range."); return; }
    onSave(wr, { IsFrozen: active, ActiveFreezeName: active ? name.trim() : undefined, PlannedFreezeText: planned.trim() || undefined,
      FreezeStartDate: start || undefined, FreezeEndDate: end || undefined,
      ...(active && !wr.IsFrozen ? { FreezeStartedAt: new Date().toISOString() } : !active && wr.IsFrozen ? { FreezeEndedAt: new Date().toISOString() } : {}) });
  }}><h2 className="font-bold">Manage freeze · {wr.WR_ID}</h2>{error && <p role="alert" className="text-red-700">{error}</p>}
    <label><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active freeze</label>
    <label className="block">Freeze name <input list="freeze-names" className="block w-full border p-1" value={name} onChange={(e) => setName(e.target.value)} /><datalist id="freeze-names">{["Waiting for Spare Parts", "External Contractor Required", "Room Access Restricted", "Customer Hold", "Permit Required"].map((item) => <option key={item} value={item} />)}</datalist></label>
    <label className="block">Planned freeze <input className="block w-full border p-1" value={planned} onChange={(e) => setPlanned(e.target.value)} /></label>
    <label className="block">From <input type="date" className="block w-full border p-1" value={start} onChange={(e) => setStart(e.target.value)} /></label>
    <label className="block">To <input type="date" className="block w-full border p-1" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
    <button className={button} type="submit">Save</button> <button className={button} type="button" onClick={onClose}>Cancel</button></form></div>;
}
