"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { activeAbsences, addDays, assignmentAbsences, calendarDate, fromWallMinutes, intervalFor, schedulePerson, unassignPerson, wallMinutes } from "@/lib/dispatch";
import { HourlyTimeline } from "@/components/modules/HourlyTimeline";
import { gateForWorkRequest } from "@/lib/pm-coordination";
import { FieldAlerts } from "@/components/modules/FieldAlerts";
import { QAReportNotifications } from "@/components/modules/QAReportNotifications";
import type { TimelineSpotlight } from "@/components/modules/HourlyTimeline";
import { MultiSelectFilter } from "@/components/common/MultiSelectFilter";
import { tradeColor } from "@/lib/trade-colors";
import { revealAssignment } from "@/lib/calendar-locator";
import { LocationFreezes } from "@/components/modules/LocationFreezes";
import { PmsDefaultSchedules } from "@/components/modules/PmsDefaultSchedules";
import { WRSourcePanel } from "@/components/modules/WRSourcePanel";
import { AssignmentLocatorDialog } from "@/components/modules/AssignmentLocatorDialog";
import { PMWorkRequestPopup } from "@/components/modules/PMWorkRequestPopup";
import { FJWorkRequestPopup } from "@/components/modules/FJWorkRequestPopup";
import { LJWorkRequestPopup } from "@/components/modules/LJWorkRequestPopup";
import { describeLocationFreeze, getActiveFreezeConflictsForWR } from "@/lib/location-freezes";
import { isOutsideShift } from "@/lib/craftperson-shifts";
import { CraftpersonShiftWorkspace } from "@/components/modules/CraftpersonShiftWorkspace";
import type { DisputeNavigation } from "@/components/modules/CraftpersonShiftWorkspace";
import { getWRDisputes, mapWRDisputes } from "@/lib/disputes";
import type { DisputeViewMode } from "@/lib/disputes";
import { cannotScheduleMessage, isWrSchedulable, isWrTerminal } from "@/components/modules/scheduler/scheduler-rules";
import { finishSchedulerRequestDrag, logSchedulerDropRejected } from "@/lib/scheduler-drag";
import { SchedulerAssignModal } from "@/components/modules/scheduler/SchedulerAssignModal";

type DropContext = { rawPayload: string; targetDate: string; targetHour: number; targetCraftpersonId: string };
type Move = { id: string; from?: string; person: string; date: string; start?: string; end?: string; dropContext?: DropContext };
const button = "rounded border bg-white px-2 py-1 text-xs hover:bg-slate-100";

export default function SchedulerPage() {
  return <React.Suspense fallback={<div className="p-3">Loading scheduler…</div>}><SchedulerContent /></React.Suspense>;
}

function SchedulerContent() {
  const searchParams = useSearchParams();
  const { data, setData, commitSnapshot } = useCafmStore();
  const { permissions } = useActiveUserPermissions();
  const { activeSiteId, activePerson } = useSiteContext();
  const { currentRole } = useApp();
  const gates = useMemo(() => {
    const map = new Map<string, { cleared: boolean; label: string }>();
    for (const wr of data.workRequests) {
      const gate = gateForWorkRequest(data, wr);
      if (gate && gate.state !== "None") map.set(wr.WR_ID, { cleared: gate.state === "Cleared", label: gate.state });
    }
    return map;
  }, [data]);
  const [date, setDate] = useState("2026-11-09");
  const [view, setView] = useState<"day" | "week" | "two" | "month">("week");
  const [trades, setTrades] = useState<string[] | null>(null);
  const [buildings, setBuildings] = useState<string[] | null>(null);
  const [personSearch, setPersonSearch] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<string[] | null>(null);
  const [availability, setAvailability] = useState("All");
  const [types, setTypes] = useState(["PM", "FJ", "LJ", "Frozen", "Completed"]);
  const [quickAssign, setQuickAssign] = useState<string | null>(null);
  const [tab, setTab] = useState<"dispatch" | "availability" | "freezes" | "pms">("dispatch");
  const [disputeMode, setDisputeMode] = useState<DisputeViewMode>("all");
  const disputeMap = useMemo(() => mapWRDisputes(data.workRequests, data.craftspeople, data.craftpersonAbsences, data.locationFreezes), [data.workRequests, data.craftspeople, data.craftpersonAbsences, data.locationFreezes]);
  const [firstHour, setFirstHour] = useState(6);
  const [lastHour, setLastHour] = useState(20);
  const [weekends, setWeekends] = useState(false);
  const [isolateWrId, setIsolateWrId] = useState<string | null>(null);
  const focusHandled = useRef("");
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [editTime, setEditTime] = useState<{ id: string; person: string; start: string; end: string } | null>(null);
  const [error, setError] = useState("");
  const [spotlight, setSpotlight] = useState<TimelineSpotlight | null>(null);
  const [showChoices, setShowChoices] = useState<string | null>(null);
  const [draggingWr, setDraggingWr] = useState<BaseWorkRequest | null>(null);
  const dragStateFrame = useRef<number | null>(null);
  const siteRequests = data.workRequests.filter((wr) => wr.SiteId === activeSiteId && !wr.suppressedByWrId);
  const changeDraggingWr = (wr: BaseWorkRequest | null) => {
    if (dragStateFrame.current !== null) cancelAnimationFrame(dragStateFrame.current);
    dragStateFrame.current = null;
    if (wr) {
      dragStateFrame.current = requestAnimationFrame(() => { setDraggingWr(wr); dragStateFrame.current = null; });
    } else {
      setDraggingWr(null);
      finishSchedulerRequestDrag();
    }
  };
  useEffect(() => () => {
    if (dragStateFrame.current !== null) cancelAnimationFrame(dragStateFrame.current);
    finishSchedulerRequestDrag();
  }, []);
  const matchesDraggingTrade = (person: (typeof data.craftspeople)[number]) =>
    !!draggingWr?.TradeName && (person.Trade === draggingWr.TradeName ||
      (person.secondaryTradeIds ?? []).includes(draggingWr.TradeName));
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setDate(calendarDate(new Date()));
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const value = searchParams.get("tab");
    setTab(value === "freezes" || value === "availability" || value === "pms" ? value : "dispatch");
  }, [searchParams]);
  useEffect(() => { setSelectedPeople(null); setBuildings(null); setSpotlight(null); setShowChoices(null); setIsolateWrId(null); }, [activeSiteId]);
  useEffect(() => {
    if (!spotlight) return;
    const timer = window.setTimeout(() => setSpotlight(null), 5000);
    const clear = () => setSpotlight(null);
    document.addEventListener("pointerdown", clear);
    return () => { window.clearTimeout(timer); document.removeEventListener("pointerdown", clear); };
  }, [spotlight]);
  const changeTab = (next: typeof tab) => {
    const url = new URL(window.location.href);
    ["focusWrId", "focusCraftpersonId", "focusDate", "focusStart", "disputeMode", "isolateWr"].forEach((key) => url.searchParams.delete(key));
    if (next === "dispatch") url.searchParams.delete("tab"); else url.searchParams.set("tab", next);
    window.history.pushState(null, "", url);
    setTab(next);
  };
  const localNow = now ? `${calendarDate(now)}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` : "";
  const people = data.craftspeople.filter((person) => person.SiteId === activeSiteId);
  const days = view === "day" ? 1 : view === "week" ? 7 : view === "two" ? 14 : new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate();
  const start = view === "month" ? `${date.slice(0, 7)}-01` : date;
  const dates = Array.from({ length: days }, (_, index) => addDays(start, index)).filter((day) => weekends || view === "day" || ![0, 6].includes(new Date(`${day}T12:00:00`).getDay()));
  const visible = (wr: BaseWorkRequest) => (disputeMode !== "only" || (disputeMap.get(wr.WR_ID)?.length ?? 0) > 0) && (!isolateWrId || wr.WR_ID === isolateWrId) && types.includes(wr.WR_Type) && (types.includes("Frozen") || !wr.IsFrozen) && (types.includes("Completed") || ![78, 100].includes(wr.Percentage));
  const filteredPeople = people.filter((person) => (trades === null || trades.includes(person.Trade) || matchesDraggingTrade(person)) &&
    (selectedPeople === null || selectedPeople.includes(person.id)) &&
    (buildings === null || siteRequests.some((wr) => wr.bl_id && buildings.includes(wr.bl_id) && wr.AssignedCraftpersonIds.includes(person.id)) || matchesDraggingTrade(person)) &&
    (availability === "All" || dates.some((day) => (activeAbsences(data.craftpersonAbsences, activeSiteId, person.id, day).length > 0) === (availability === "On leave"))) &&
    (disputeMode !== "only" || siteRequests.some((wr) => {
      const slot = intervalFor(wr, person.id);
      return visible(wr) && !!slot && dates.some((day) => slot.assignedStartDateTime < `${addDays(day, 1)}T00:00` && slot.assignedEndDateTime > `${day}T00:00`) &&
        getWRDisputes({ ...wr, AssignedCraftpersonIds: [person.id], CraftpersonAssignments: [slot], StartDate_DateToPerform: undefined }, people, data.craftpersonAbsences, data.locationFreezes, siteRequests).length > 0;
    })));
  const request = siteRequests.find((wr) => wr.WR_ID === open);
  const audit = (wr: BaseWorkRequest, text: string): BaseWorkRequest => {
    const now = new Date().toISOString();
    return { ...wr, UpdatedAt: now, Activity: [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: activePerson, actorName: activePerson, actorRole: currentRole, createdAt: now, text }] };
  };
  const assign = (move: Move) => {
    const reject = (reason: string) => {
      if (move.dropContext) logSchedulerDropRejected(reason, move.dropContext.rawPayload, {
        wrId: move.id, siteId: activeSiteId, targetCraftpersonId: move.dropContext.targetCraftpersonId,
        targetDate: move.dropContext.targetDate, targetHour: move.dropContext.targetHour,
      });
      setError(reason);
    };
    if (!permissions?.canScheduleCraftperson) { reject("Permission required to schedule craftspeople."); return; }
    const wr = siteRequests.find((item) => item.WR_ID === move.id);
    const person = people.find((item) => item.id === move.person);
    if (!wr || !person) { reject("The selected request or craftsperson is unavailable."); return; }
    if (!isWrSchedulable(wr)) { reject(cannotScheduleMessage(wr)); return; }
    const old = intervalFor(wr, person.id) ?? (move.from ? intervalFor(wr, move.from) : null);
    const startTime = move.start ?? `${move.date}T07:00`;
    const endTime = move.end ?? fromWallMinutes(wallMinutes(startTime) + (old ? wallMinutes(old.assignedEndDateTime) - wallMinutes(old.assignedStartDateTime) : Math.max(30, (wr.ExpectedHours ?? 1) * 60)));
    if (endTime <= startTime) { reject("End time must be after start time."); return; }
    const assignment = { craftpersonId: person.id, assignedStartDateTime: startTime, assignedEndDateTime: endTime };
    const leave = assignmentAbsences(data.craftpersonAbsences, activeSiteId, assignment);
    if (leave.length && !window.confirm(`${leave.map((item) => `${people.find((p) => p.id === item.craftpersonId)?.Name ?? item.craftpersonId}: ${item.absenceType} (${item.startDate} to ${item.endDate})`).join("; ")}. Force assignment?`)) return;
    const offShift = isOutsideShift(person, startTime, endTime);
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
      const scheduled = schedulePerson(current, assignment);
      if (!scheduled.CraftpersonLabor?.some((item) => item.craftpersonId === person.id)) scheduled.CraftpersonLabor = [...(scheduled.CraftpersonLabor ?? []), { craftpersonId: person.id, name: person.Name, lastName: person.LastName, hourlyRate: person.HourlyRate, workingTimeMinutes: 0 }];
      const next = audit(scheduled, `Scheduled ${person.id}: ${startTime} – ${endTime}${leave.length ? "; leave override" : ""}${offShift ? "; off-shift override" : ""}${mismatch ? "; trade mismatch override" : ""}${reason ? `; margin override: ${reason}` : ""} by ${activePerson}`);
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
  const locate = (wr: BaseWorkRequest, personId: string, focusDate?: string) => {
    const person = people.find((item) => item.id === personId);
    const interval = intervalFor(wr, personId);
    if (!person || !interval) { setShowChoices(null); setError("The scheduled craftsperson or assignment is no longer available."); return; }
    if (!CLASSICAL_TRADES.some((trade) => trade === person.Trade)) { setError("The craftsperson's trade has no calendar lane."); setShowChoices(null); return; }
    const requestedDay = focusDate && /^\d{4}-\d{2}-\d{2}$/.test(focusDate) && interval.assignedStartDateTime < `${addDays(focusDate, 1)}T00:00` && interval.assignedEndDateTime > `${focusDate}T00:00` ? focusDate : interval.assignedStartDateTime.slice(0, 10);
    const clipped = { ...interval, assignedStartDateTime: interval.assignedStartDateTime < `${requestedDay}T00:00` ? `${requestedDay}T00:00` : interval.assignedStartDateTime,
      assignedEndDateTime: interval.assignedEndDateTime > `${addDays(requestedDay, 1)}T00:00` ? `${addDays(requestedDay, 1)}T00:00` : interval.assignedEndDateTime };
    const result = revealAssignment(wr, clipped, person.Trade, { dates, weekends, firstHour, lastHour, people: selectedPeople, trades, buildings, availability, types });
    setWeekends(result.weekends);
    setFirstHour(result.firstHour);
    setLastHour(result.lastHour);
    setSelectedPeople(result.people);
    setTrades(result.trades);
    setBuildings(result.buildings);
    setAvailability("All");
    setTypes(result.types);
    setDate(result.day);
    if (focusDate) setView("day");
    setShowChoices(null);
    setError("");
    setNotice(focusDate && focusDate !== requestedDay ? "The assignment has moved; showing its current scheduled time." : result.changed.length ? `Calendar adjusted: ${result.changed.join(", ")}.` : "Showing selected assignment.");
    setSpotlight({ id: wr.WR_ID, person: personId, day: result.day, trade: person.Trade, token: Date.now() });
  };
  const navigateDispute = (target: DisputeNavigation) => {
    const wr = siteRequests.find((item) => item.WR_ID === target.wrId);
    if (!wr || !intervalFor(wr, target.craftpersonId)) { setError("The disputed assignment is no longer available."); return; }
    changeTab("dispatch");
    setIsolateWrId(null);
    setDisputeMode("highlight");
    locate(wr, target.craftpersonId, target.date);
  };
  const showRequest = (id: string) => {
    const wr = siteRequests.find((item) => item.WR_ID === id);
    if (!wr) { setError("Work request is no longer available."); return; }
    if (isolateWrId && isolateWrId !== id) {
      setIsolateWrId(null);
      const url = new URL(window.location.href);
      ["focusWrId", "focusCraftpersonId", "focusStart", "isolateWr"].forEach((key) => url.searchParams.delete(key));
      window.history.replaceState(null, "", url);
    }
    const assignments = wr.AssignedCraftpersonIds.filter((id) => intervalFor(wr, id));
    if (!assignments.length) { setError("This request has no scheduled assignment."); return; }
    if (assignments.length === 1) locate(wr, assignments[0]); else setShowChoices(id);
  };
  useEffect(() => {
    const id = searchParams.get("focusWrId"), person = searchParams.get("focusCraftpersonId");
    const key = `${activeSiteId}:${searchParams.toString()}`;
    if (!id || !person) { focusHandled.current = ""; setIsolateWrId(null); return; }
    if (focusHandled.current === key) return;
    const wr = siteRequests.find((item) => item.WR_ID === id);
    if (!wr || !people.some((item) => item.id === person) || !intervalFor(wr, person)) {
      setError("The requested assignment is unavailable for this site."); focusHandled.current = key; return;
    }
    focusHandled.current = key;
    setIsolateWrId(searchParams.get("isolateWr") === "true" ? id : null);
    if (searchParams.get("disputeMode") === "highlight") setDisputeMode("highlight");
    setTab("dispatch");
    locate(wr, person, searchParams.get("focusDate") ?? undefined);
    if (searchParams.get("focusStart") && searchParams.get("focusStart") !== intervalFor(wr, person)?.assignedStartDateTime) setNotice("The assignment has moved; showing its current scheduled time.");
  });
  const removeAssignment = (id: string, person: string) => {
    if (!permissions?.canScheduleCraftperson) { setError("Permission required to schedule craftspeople."); return; }
    const original = siteRequests.find((item) => item.WR_ID === id);
    if (!original || !original.AssignedCraftpersonIds.includes(person)) { setError("Assignment is no longer available."); return; }
    if (isWrTerminal(original)) { setError(`Cannot unassign WR ${id}: ${original.Percentage}% ${original.WorkRequestStatus} assignments are read-only.`); return; }
    if (!window.confirm(`Remove ${person} from ${id}?`)) return;
    setData((state) => {
      const current = state.workRequests.find((item) => item.SiteId === activeSiteId && item.WR_ID === id);
      if (!current || JSON.stringify(current) !== JSON.stringify(original)) { queueMicrotask(() => setError("Request changed; retry.")); return state; }
      return { ...state, workRequests: state.workRequests.map((item) => item === current ? audit(unassignPerson(current, person), `Unassigned ${person} by ${activePerson}`) : item) };
    });
    setEditTime(null);
  };
  return <div className="space-y-2 p-3 text-xs">
    {!permissions?.canScheduleCraftperson && <p role="status" className="rounded bg-amber-100 p-2">Scheduling is read-only. Ask a site administrator for permission.</p>}
    <div className="flex gap-2"><button className={button} aria-pressed={tab === "dispatch"} onClick={() => changeTab("dispatch")}>WR Dispatch Calendar</button><button className={button} aria-pressed={tab === "availability"} onClick={() => changeTab("availability")}>Shifts, Vacations &amp; Trainings</button><button className={button} aria-pressed={tab === "freezes"} onClick={() => changeTab("freezes")}>Location Freezes</button><button className={button} aria-pressed={tab === "pms"} onClick={() => changeTab("pms")}>🔁 PMS Default Schedules &amp; Auto-Assign</button><a className={button} href="/work-requests?view=hub#PM">📢 Team Alignment Hub</a></div>
    {error && <div role="alert" className="flex items-start justify-between gap-2 rounded bg-red-100 p-2 text-red-900"><span>{error}</span><button type="button" className="shrink-0 underline" aria-label="Dismiss scheduling warning" onClick={() => setError("")}>Dismiss</button></div>}
    {notice && <p role="status" className="rounded bg-cyan-100 p-2">{notice}</p>}
    {tab === "dispatch" && <>
    <QAReportNotifications />
    <FieldAlerts requests={siteRequests} canReply={!!permissions?.canScheduleCraftperson} onOpen={setOpen} onShow={(wr, update) => {
      setIsolateWrId(null); setDisputeMode("all");
      if (intervalFor(wr, update.craftpersonId)) locate(wr, update.craftpersonId);
      else showRequest(wr.WR_ID);
    }} onReply={async (wr, update, reply, status) => {
      if (!permissions?.canScheduleCraftperson) throw new Error("Permission required to respond to field updates.");
      const current = data.workRequests.find((item) => item.SiteId === activeSiteId && item.WR_ID === wr.WR_ID);
      const latest = current?.technicianFieldUpdates?.find((item) => item.id === update.id);
      if (!current || !latest || JSON.stringify(latest) !== JSON.stringify(update) || latest.status === "Resolved") throw new Error("The field update changed. Reopen it and try again.");
      const timestamp = new Date().toISOString();
      const changed = audit({ ...current, technicianFieldUpdates: current.technicianFieldUpdates?.map((item) => item.id === update.id ? { ...item, teamLeaderReply: reply, status, ...(status === "Resolved" ? { resolvedBy: activePerson, resolvedAt: timestamp } : {}) } : item) }, `Team Leader ${activePerson} ${status.toLowerCase()} field update from ${update.craftpersonName}: ${reply}`);
      await commitSnapshot(data, { ...data, workRequests: data.workRequests.map((item) => item === current ? changed : item) }, { optimistic: true });
      setNotice(`Field update ${status.toLowerCase()} and synchronized.`);
    }} />
    {isolateWrId && <div role="status" className="rounded bg-blue-100 p-2">Showing only assignments for WR {isolateWrId} <button className={button} onClick={() => { setIsolateWrId(null); const url = new URL(window.location.href); ["focusWrId", "focusCraftpersonId", "focusStart", "isolateWr"].forEach((key) => url.searchParams.delete(key)); window.history.replaceState(null, "", url); }}>Show All Calendar WRs ✕</button></div>}
    <div className="flex flex-wrap items-center gap-2 rounded border bg-white p-2">
      <button className={button} onClick={() => moveDate(-1)}>◀ Prev</button><button className={button} onClick={() => setDate(calendarDate(new Date()))}>Today</button><button className={button} onClick={() => moveDate(1)}>Next ▶</button>
      <strong>{dates[0]} – {dates[dates.length - 1]}</strong>
      <select aria-label="Timeline" className={button} value={view} onChange={(e) => setView(e.target.value as typeof view)}><option value="day">Day</option><option value="week">Week</option><option value="two">2 Weeks</option><option value="month">Month</option></select>
      <MultiSelectFilter label="Trades" value={trades} onChange={setTrades} options={CLASSICAL_TRADES.map((item) => ({ value: item, label: item, className: `rounded border px-1 ${tradeColor(item)}` }))} />
      <MultiSelectFilter label="Buildings" value={buildings} onChange={setBuildings} options={data.buildings.filter((item) => item.SiteId === activeSiteId).map((item) => ({ value: item.bl_id, label: `${item.bl_id} · ${item.Name}` }))} />
      <select aria-label="Availability" className={button} value={availability} onChange={(e) => setAvailability(e.target.value)}><option>All</option><option>Only available</option><option>On leave</option></select>
      <details className="relative"><summary className={`${button} cursor-pointer`}>Craftpeople {selectedPeople === null ? "(All)" : `(${selectedPeople.length} selected)`}</summary><div className="absolute left-0 z-30 w-64 rounded border bg-white p-2 shadow-lg"><input aria-label="Search craftspeople" className="w-full border p-1" placeholder="Search craftspeople" value={personSearch} onChange={(event) => setPersonSearch(event.target.value)} /><div className="flex gap-1"><button className={button} onClick={() => setSelectedPeople(null)}>Select All</button><button className={button} onClick={() => setSelectedPeople([])}>Clear</button></div><div className="max-h-60 overflow-auto">{people.filter((person) => `${person.Name} ${person.LastName} ${person.Trade}`.toLowerCase().includes(personSearch.toLowerCase())).map((person) => <label key={person.id} className="block"><input type="checkbox" checked={selectedPeople === null || selectedPeople.includes(person.id)} onChange={(event) => { const checked = event.target.checked; setSelectedPeople((current) => { const ids = current ?? people.map((item) => item.id); return checked ? [...ids, person.id] : ids.filter((id) => id !== person.id); }); }} /> {person.Name} {person.LastName} · {person.Trade}</label>)}</div></div></details>
      {["PM", "FJ", "LJ", "Frozen", "Completed"].map((item) => <label key={item}><input type="checkbox" checked={types.includes(item)} onChange={(e) => setTypes((current) => e.target.checked ? [...current, item] : current.filter((entry) => entry !== item))} /> {item}</label>)}
      <label>Hours: <select value={firstHour} onChange={(event) => setFirstHour(Number(event.target.value))}>{Array.from({ length: lastHour }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}</select></label>
      <label>to <select value={lastHour} onChange={(event) => setLastHour(Number(event.target.value))}>{Array.from({ length: 24 - firstHour }, (_, i) => <option key={i} value={firstHour + i + 1}>{String(firstHour + i + 1).padStart(2, "0")}:00</option>)}</select></label>
      <label><input type="checkbox" checked={weekends} onChange={(event) => setWeekends(event.target.checked)} /> Show Weekends</label>
    </div>
    <p>Shift Hours · <span className="bg-slate-100">Off-Shift</span> · <span className="bg-amber-100">🏖 Vacation</span> · <span className="bg-indigo-100">🎓 Training</span> · <span className="bg-rose-100">🤒 Sick Leave</span> · ❄ Location Freeze</p>
    <div className="flex items-start gap-2"><WRSourcePanel requests={siteRequests} people={people} buildings={data.buildings.filter((item) => item.SiteId === activeSiteId)} freezes={data.locationFreezes} now={localNow} disputeMap={disputeMap} disputeMode={disputeMode} onDisputeMode={setDisputeMode} onOpen={setOpen} onShow={showRequest} onDraggingChange={changeDraggingWr} onAssign={(id) => {
      const wr = siteRequests.find((item) => item.WR_ID === id);
      if (!wr) { setError("Work request is no longer available."); return; }
      if (!isWrSchedulable(wr)) { setError(cannotScheduleMessage(wr)); return; }
      setQuickAssign(id);
    }} />
      <HourlyTimeline gates={gates} dates={dates} people={filteredPeople} requests={siteRequests} visible={visible} absences={data.craftpersonAbsences} freezes={data.locationFreezes} disputeMap={disputeMap} disputeMode={disputeMode} site={activeSiteId} firstHour={firstHour} lastHour={lastHour} spotlight={spotlight} draggingWr={draggingWr} onDraggingChange={changeDraggingWr} onDropRejected={setError} onOpen={setOpen} onRemove={removeAssignment} onEdit={(wr, person) => { const interval = intervalFor(wr, person); if (interval) setEditTime({ id: wr.WR_ID, person, start: interval.assignedStartDateTime, end: interval.assignedEndDateTime }); }} onMove={(id, person, start, end, from, dropContext) => assign({ id, person, date: start.slice(0, 10), start, end, from, dropContext })} /></div>
    </>}
    {tab === "freezes" && <LocationFreezes key={activeSiteId} />}
    {tab === "pms" && <PmsDefaultSchedules key={activeSiteId} onNotice={setNotice} />}
    {tab === "availability" && <CraftpersonShiftWorkspace key={activeSiteId} onNavigateToDisputeInCalendar={navigateDispute} />}
    {showChoices && (() => { const wr = siteRequests.find((item) => item.WR_ID === showChoices); return wr ? <AssignmentLocatorDialog request={wr} people={people} onSelect={(id) => locate(wr, id)} onClose={() => setShowChoices(null)} /> : null; })()}
    {quickAssign && (() => {
      const wr = siteRequests.find((item) => item.WR_ID === quickAssign);
      if (!wr) return null;
      const startTime = `${date}T07:00`;
      const duration = Math.max(30, (wr.ExpectedHours ?? 1) * 60);
      return <SchedulerAssignModal key={`assign-${wr.WR_ID}`} requestId={wr.WR_ID} people={people} initialStart={startTime}
        initialEnd={fromWallMinutes(wallMinutes(startTime) + duration)} onCancel={() => setQuickAssign(null)}
        onSubmit={(person, start, end) => assign({ id: wr.WR_ID, person, date: start.slice(0, 10), start, end })} />;
    })()}
    {editTime && <SchedulerAssignModal key={`edit-${editTime.id}-${editTime.person}`} requestId={editTime.id} people={people}
      initialPerson={editTime.person} initialStart={editTime.start} initialEnd={editTime.end}
      onCancel={() => setEditTime(null)} onSubmit={(person, start, end) => assign({ id: editTime.id, person, from: editTime.person, date: start.slice(0, 10), start, end })} />}
    {request?.WR_Type === "PM" && <PMWorkRequestPopup workRequest={request} onClose={() => setOpen(null)} onNavigate={setOpen} onEscalateToLJ={() => { setOpen(null); setError("Create Long Jobs from the work request overview."); }} />}
    {request?.WR_Type === "FJ" && <FJWorkRequestPopup workRequest={request} onClose={() => setOpen(null)} onNavigate={setOpen} onEscalateToLJ={() => { setOpen(null); setError("Create Long Jobs from the work request overview."); }} />}
    {request?.WR_Type === "LJ" && <LJWorkRequestPopup workRequest={request} onClose={() => setOpen(null)} onNavigate={setOpen} />}
  </div>;
}
