"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { BaseWorkRequest, CraftpersonAbsence, CraftpersonShift } from "@cafm/shared-schema";
import { OverviewTable } from "@/components/common/TableColumns";
import { ResizableHistory } from "@/components/common/ResizableHistory";
import { AbsenceForm } from "@/components/modules/AbsenceForm";
import { PMWorkRequestPopup } from "@/components/modules/PMWorkRequestPopup";
import { FJWorkRequestPopup } from "@/components/modules/FJWorkRequestPopup";
import { LJWorkRequestPopup } from "@/components/modules/LJWorkRequestPopup";
import { ShiftPlanner, MultiFilter, brushes, colors, labels } from "@/components/modules/ShiftPlanner";
import type { Brush } from "@/components/modules/ShiftPlanner";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { DEFAULT_SHIFTS, getEffectiveCraftpersonShift } from "@/lib/craftperson-shifts";
import { activeAbsences, addDays, assignmentAbsences, calendarDate, fromWallMinutes, intervalFor, resolveLeaveConflicts, unassignPerson, wallMinutes } from "@/lib/dispatch";
import { getCraftpersonDisputes } from "@/lib/craftperson-disputes";
import { newestFirst } from "@/lib/history-order";
import { tradeColor } from "@/lib/trade-colors";
import type { DemoData } from "@/lib/cafm-data";

type Person = DemoData["craftspeople"][number];
type Preset = keyof typeof DEFAULT_SHIFTS;
const presets = ["Early", "Standard", "Late", "Night"] as const;
const button = "rounded border bg-white px-2 py-1 text-xs hover:bg-slate-100";

export function CraftpersonShiftWorkspace() {
  const { data, setData } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const { currentRole } = useApp();
  const router = useRouter();
  const people = data.craftspeople.filter((item) => item.SiteId === activeSiteId);
  const [today, setToday] = useState("");
  const [anchor, setAnchor] = useState("");
  const [period, setPeriod] = useState<"week" | "two" | "month">("two");
  const [categorical, setCategorical] = useState<Record<string, string[]>>({});
  const [mode, setMode] = useState<"overview" | "planner">("overview");
  const [selected, setSelected] = useState<string[]>([]);
  const [personId, setPersonId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"profile" | "shifts" | "leaves" | "history">("profile");
  const [draft, setDraft] = useState<Person | null>(null);
  const [templates, setTemplates] = useState(DEFAULT_SHIFTS);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [brush, setBrush] = useState<Brush>("Early");
  const [customStart, setCustomStart] = useState("07:00");
  const [customEnd, setCustomEnd] = useState("15:30");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [target, setTarget] = useState("today");
  const [bulkTarget, setBulkTarget] = useState("today");
  const [leaveFor, setLeaveFor] = useState<string | null>(null);
  const [editLeave, setEditLeave] = useState<CraftpersonAbsence | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const person = people.find((item) => item.id === personId);
  const todayDate = today || "2026-11-09";
  const weekday = new Date(`${todayDate}T12:00:00`).getDay();
  const monday = addDays(todayDate, -((weekday + 6) % 7));
  const nextMonday = addDays(monday, 7);
  const plannerAnchor = anchor || todayDate;
  const anchorDate = new Date(`${plannerAnchor}T12:00:00`);
  const periodStart = period === "month" ? `${plannerAnchor.slice(0, 7)}-01` : addDays(plannerAnchor, -((anchorDate.getDay() + 6) % 7));
  const periodLength = period === "month" ? new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0).getDate() : period === "week" ? 7 : 14;
  const periodEnd = addDays(periodStart, periodLength - 1);
  const overviewStart = addDays(plannerAnchor, -((anchorDate.getDay() + 6) % 7));
  const twoWeekDays = Array.from({ length: 14 }, (_, index) => addDays(overviewStart, index));
  const disputeStart = periodStart < overviewStart ? periodStart : overviewStart;
  const disputeEnd = periodEnd > addDays(overviewStart, 13) ? periodEnd : addDays(overviewStart, 13);
  const disputes = useMemo(() => Object.fromEntries(data.craftspeople.filter((item) => item.SiteId === activeSiteId).map((item) => [item.id, getCraftpersonDisputes(item, data.workRequests, data.craftpersonAbsences, { start: disputeStart, end: disputeEnd })])), [data.craftspeople, data.workRequests, data.craftpersonAbsences, activeSiteId, disputeStart, disputeEnd]);
  const activity = (text: string, kind: "log" | "comment" = "log") => ({ id: crypto.randomUUID(), kind, actorId: activePerson, actorName: activePerson, actorRole: currentRole, createdAt: new Date().toISOString(), text });
  useEffect(() => { const date = calendarDate(new Date()); setToday(date); setAnchor(date); setRangeStart(date); setRangeEnd(date); }, []);
  useEffect(() => {
    setSelected([]); setPersonId(null); setDraft(null); setTemplatesLoaded(false);
    try {
      const saved = localStorage.getItem(`cafm-shift-templates:${activeSiteId}`);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!parsed || typeof parsed !== "object" || !presets.every((key) => key in parsed && typeof (parsed as Record<string, { shiftStart?: unknown; shiftEnd?: unknown }>)[key]?.shiftStart === "string" && typeof (parsed as Record<string, { shiftStart?: unknown; shiftEnd?: unknown }>)[key]?.shiftEnd === "string")) throw new Error("Invalid shift templates.");
        const value = parsed as Record<Preset, CraftpersonShift>;
        if (!presets.every((key) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value[key].shiftStart) && /^([01]\d|2[0-3]):[0-5]\d$/.test(value[key].shiftEnd) && value[key].shiftStart !== value[key].shiftEnd)) throw new Error("Invalid shift template times.");
        setTemplates(Object.fromEntries(presets.map((key) => [key, { ...value[key], shiftType: key }])) as typeof DEFAULT_SHIFTS);
      } else setTemplates(DEFAULT_SHIFTS);
    } catch (reason) { setError(`Could not load shift templates; saved data was not overwritten: ${String(reason)}`); setTemplates(DEFAULT_SHIFTS); return; }
    setTemplatesLoaded(true);
  }, [activeSiteId]);
  useEffect(() => {
    if (!templatesLoaded) return;
    try { localStorage.setItem(`cafm-shift-templates:${activeSiteId}`, JSON.stringify(templates)); }
    catch (reason) { setError(`Could not save shift templates: ${String(reason)}`); }
  }, [activeSiteId, templates, templatesLoaded]);
  const dateRange = (from: string, to: string) => {
    if (!from || !to || from > to || wallMinutes(`${to}T00:00`) - wallMinutes(`${from}T00:00`) > 366 * 1440) { setError("Enter a valid date range of at most 367 days."); return []; }
    const result: string[] = [];
    for (let day = from; day <= to; day = addDays(day, 1)) result.push(day);
    return result;
  };
  const datesFor = (value: string) => value === "base" ? [] : value === "today" ? [todayDate] : value === "tomorrow" ? [addDays(todayDate, 1)] : value === "week" ? dateRange(todayDate, addDays(monday, 6)) : value === "next" ? dateRange(nextMonday, addDays(nextMonday, 6)) : dateRange(rangeStart, rangeEnd);
  const paint = (ids: string[], dates: string[], chosen: Brush, base = false) => {
    if (!ids.length || (!base && !dates.length)) { setError("Select craftspeople and valid dates."); return; }
    if (chosen === "Custom" && (!customStart || !customEnd || customStart === customEnd)) { setError("Custom start and end times must be different."); return; }
    const shift: CraftpersonShift | null = chosen === "Custom" ? { shiftType: "Custom", shiftStart: customStart, shiftEnd: customEnd } : presets.some((key) => key === chosen) ? templates[chosen as Preset] : null;
    if (!shift && base) { setError("Leave cannot be applied as a base shift."); return; }
    if (!shift && !window.confirm(`Add ${chosen} for ${ids.length} craftsperson(s) on ${dates.length} day(s)? Existing assignments may conflict.`)) return;
    setData((state) => {
      const existing = state.craftspeople.filter((p) => p.SiteId === activeSiteId && ids.includes(p.id));
      if (existing.length !== ids.length) { queueMicrotask(() => setError("A selected craftsperson is no longer available.")); return state; }
      const added: CraftpersonAbsence[] = shift ? [] : ids.flatMap((id) => dates.filter((day) => !state.craftpersonAbsences.some((entry) => entry.siteId === activeSiteId && entry.craftpersonId === id && entry.status === "Approved" && entry.startDate <= day && entry.endDate >= day)).map((day) => ({ id: crypto.randomUUID(), siteId: activeSiteId, craftpersonId: id, absenceType: chosen as "Vacation" | "Training" | "SickLeave", startDate: day, endDate: day, isFullDay: true, unavailableHoursPerDay: 8, status: "Approved", notes: "" })));
      const conflicts = added.reduce((sum, absence) => sum + state.workRequests.filter((wr) => { const slot = intervalFor(wr, absence.craftpersonId); return wr.SiteId === activeSiteId && slot && assignmentAbsences([absence], activeSiteId, slot).length; }).length, 0);
      queueMicrotask(() => { setError(""); setNotice(shift ? "Shift updated." : `${added.length} absence records created; ${conflicts} assignment conflict(s). Use the leave tab to resolve conflicts.`); });
      return { ...state, craftpersonAbsences: [...state.craftpersonAbsences, ...added], craftspeople: state.craftspeople.map((p) => {
        if (p.SiteId !== activeSiteId || !ids.includes(p.id)) return p;
        const log = activity(shift ? `${base ? "Base shift" : `Shift on ${dates.join(", ")}`} set to ${shift.shiftType} ${shift.shiftStart}–${shift.shiftEnd}` : `${chosen} added for ${dates.join(", ")}`);
        return { ...p, ...(shift ? base ? { baseShiftType: shift.shiftType, shiftStart: shift.shiftStart, shiftEnd: shift.shiftEnd } : { shiftOverrides: { ...p.shiftOverrides, ...Object.fromEntries(dates.map((day) => [day, shift])) } } : {}), Activity: [...(p.Activity ?? []), log] };
      }) };
    });
  };
  const saveProfile = () => {
    if (!draft || !draft.id.trim() || !draft.Name.trim() || !draft.LastName.trim() || !draft.Trade || !Number.isFinite(draft.HourlyRate) || draft.HourlyRate < 0 || !Number.isFinite(draft.ShiftHours) || draft.ShiftHours <= 0 || draft.ShiftHours > 24 || !Number.isInteger(draft.SkillLevel) || draft.SkillLevel < 1 || draft.SkillLevel > 5 || !draft.shiftStart || !draft.shiftEnd || draft.shiftStart === draft.shiftEnd) { setError("Enter valid profile details and distinct shift times."); return; }
    setData((state) => {
      const current = state.craftspeople.find((p) => p.SiteId === activeSiteId && p.id === personId);
      if (personId && (!current || JSON.stringify(current) !== JSON.stringify(person))) { queueMicrotask(() => setError("Craftsperson changed; reopen the profile.")); return state; }
      if (!personId && state.craftspeople.some((p) => p.id === draft.id)) { queueMicrotask(() => setError("Employee ID already exists.")); return state; }
      const saved = { ...draft, SiteId: activeSiteId, id: personId ?? draft.id.trim(), shiftOverrides: current?.shiftOverrides ?? draft.shiftOverrides, Activity: [...(current?.Activity ?? []), activity(personId ? "Profile, trade or base shift updated" : "Craftsperson created")] };
      queueMicrotask(() => { setPersonId(saved.id); setDraft(saved); setError(""); });
      return { ...state, craftspeople: current ? state.craftspeople.map((p) => p === current ? saved : p) : [...state.craftspeople, saved] };
    });
  };
  const resolve = (absence: CraftpersonAbsence, mode: "reassign" | "unassign") => setData((state) => {
    if (!state.craftpersonAbsences.some((entry) => JSON.stringify(entry) === JSON.stringify(absence))) { queueMicrotask(() => setError("Absence changed; retry.")); return state; }
    const result = resolveLeaveConflicts(state.workRequests, state.craftpersonAbsences, state.craftspeople, absence, mode, (wr, text) => ({ ...wr, UpdatedAt: new Date().toISOString(), Activity: [...(wr.Activity ?? []), activity(text)] }));
    queueMicrotask(() => setNotice(result.unresolved ? `${result.unresolved} conflict(s) remain unresolved.` : "Affected assignments updated."));
    return { ...state, workRequests: result.requests };
  });
  const deleteAbsence = (absence: CraftpersonAbsence) => {
    if (!window.confirm("Delete absence?")) return;
    setData((state) => {
      const current = state.craftpersonAbsences.find((entry) => entry.id === absence.id && entry.siteId === activeSiteId);
      if (JSON.stringify(current) !== JSON.stringify(absence)) { queueMicrotask(() => setError("Absence changed; retry.")); return state; }
      return { ...state, craftpersonAbsences: state.craftpersonAbsences.filter((entry) => entry.id !== absence.id || entry.siteId !== activeSiteId), craftspeople: state.craftspeople.map((p) => p.id === absence.craftpersonId && p.SiteId === activeSiteId ? { ...p, Activity: [...(p.Activity ?? []), activity(`Deleted ${absence.absenceType} ${absence.startDate}–${absence.endDate}`)] } : p) };
    });
  };
  const focus = (wr: BaseWorkRequest, id: string) => {
    const slot = intervalFor(wr, id);
    if (!slot) { setError("This assignment has no scheduled time."); return; }
    router.push(`/scheduler?${new URLSearchParams({ focusWrId: wr.WR_ID, focusCraftpersonId: id, focusStart: slot.assignedStartDateTime, isolateWr: "true" })}`);
  };
  const status = (p: Person, day: string) => activeAbsences(data.craftpersonAbsences, activeSiteId, p.id, day).map((a) => a.absenceType).join(", ") || "Available";
  const describe = (p: Person, day: string) => { const s = getEffectiveCraftpersonShift(p, day); return `${s.shiftType} ${s.shiftStart}–${s.shiftEnd}`; };
  const dayValues = (p: Person, day: string) => [getEffectiveCraftpersonShift(p, day).shiftType, ...status(p, day).split(", ")];
  const overviewDisputes = (p: Person) => (disputes[p.id] ?? []).filter((entry) => entry.date >= overviewStart && entry.date <= addDays(overviewStart, 13));
  const filterOptions: Record<string, string[]> = { trade: [...CLASSICAL_TRADES], secondary: [...CLASSICAL_TRADES], base: [...presets, "Custom"], today: [...brushes, "Available"], tomorrow: [...brushes, "Available"], next: [...brushes, "Available"], status: ["Available", "Vacation", "Training", "SickLeave"], disputes: ["Has Dispute ⚠", "No Disputes ✓"] };
  const values = (p: Person, key: string): string[] => key === "trade" ? [p.Trade] : key === "secondary" ? p.secondaryTradeIds ?? [] : key === "base" ? [p.baseShiftType ?? "Standard"] : key === "today" ? dayValues(p, todayDate) : key === "tomorrow" ? dayValues(p, addDays(todayDate, 1)) : key === "next" ? twoWeekDays.flatMap((day) => dayValues(p, day)) : key === "status" ? status(p, todayDate).split(", ") : [overviewDisputes(p).length ? "Has Dispute ⚠" : "No Disputes ✓"];
  const filteredPeople = people.filter((p) => Object.entries(categorical).every(([key, choices]) => !choices.length || choices.some((choice) => values(p, key).includes(choice))));
  const filter = (key: string) => () => <MultiFilter label="All" options={filterOptions[key]} selected={categorical[key] ?? []} onChange={(selection) => setCategorical((old) => ({ ...old, [key]: selection }))} />;
  const badge = (p: Person, day: string) => { const shift = getEffectiveCraftpersonShift(p, day); const leave = activeAbsences(data.craftpersonAbsences, activeSiteId, p.id, day)[0]; const key = leave && brushes.includes(leave.absenceType as Brush) ? leave.absenceType as Brush : shift.shiftType; return <span className={`rounded px-1 ${colors[key]}`}>{leave ? leave.absenceType : describe(p, day)}</span>; };
  const adaptShift = (p: Person, wr: BaseWorkRequest, day: string) => {
    const interval = intervalFor(wr, p.id);
    if (!interval) { setError("Assignment is no longer scheduled."); return; }
    const begin = Math.max(wallMinutes(interval.assignedStartDateTime), wallMinutes(`${day}T00:00`));
    const finish = Math.min(wallMinutes(interval.assignedEndDateTime), wallMinutes(`${addDays(day, 1)}T00:00`));
    if (finish <= begin || finish - begin >= 1440) { setError("Cannot adapt a shift to a full-day assignment; edit the schedule manually."); return; }
    if (!window.confirm(`Replace ${day}'s shift with the working window for ${wr.WR_ID}? Other assignments may be affected.`)) return;
    setData((state) => {
      const current = state.workRequests.find((item) => item.SiteId === activeSiteId && item.WR_ID === wr.WR_ID);
      if (!current || JSON.stringify(intervalFor(current, p.id)) !== JSON.stringify(interval)) { queueMicrotask(() => setError("Assignment changed; retry.")); return state; }
      return { ...state, craftspeople: state.craftspeople.map((item) => item.SiteId === activeSiteId && item.id === p.id ? { ...item, shiftOverrides: { ...item.shiftOverrides, [day]: { shiftType: "Custom", shiftStart: fromWallMinutes(begin).slice(11), shiftEnd: fromWallMinutes(finish).slice(11) } }, Activity: [...(item.Activity ?? []), activity(`Shift on ${day} adapted to ${wr.WR_ID}`)] } : item) };
    });
  };
  const unassignDispute = (p: Person, wr: BaseWorkRequest) => {
    if (!window.confirm(`Unassign ${p.Name} from ${wr.WR_ID}? You can reassign it in the dispatch calendar.`)) return;
    setData((state) => {
      const current = state.workRequests.find((item) => item.SiteId === activeSiteId && item.WR_ID === wr.WR_ID);
      if (!current || JSON.stringify(current) !== JSON.stringify(wr)) { queueMicrotask(() => setError("Work request changed; retry.")); return state; }
      return { ...state, workRequests: state.workRequests.map((item) => item === current ? { ...unassignPerson(current, p.id), UpdatedAt: new Date().toISOString(), Activity: [...(current.Activity ?? []), activity(`Unassigned ${p.id} while resolving a dispute`)] } : item) };
    });
  };
  const columns = [
    { id: "__select", label: "Select", value: (p: Person) => selected.includes(p.id) ? "Selected" : "", render: (p: Person) => <input type="checkbox" aria-label={`Select ${p.Name} ${p.LastName}`} checked={selected.includes(p.id)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelected((old) => event.target.checked ? [...old, p.id] : old.filter((id) => id !== p.id))} /> },
    { id: "id", label: "Employee ID", value: (p: Person) => p.id },
    { id: "name", label: "Full Name", value: (p: Person) => `${p.Name} ${p.LastName}` },
    { id: "trade", label: "Primary Trade", value: (p: Person) => p.Trade, renderFilter: filter("trade"), render: (p: Person) => <span className={`rounded border px-1 ${tradeColor(p.Trade)}`}>{p.Trade}</span> },
    { id: "secondary", label: "Secondary Trades", value: (p: Person) => (p.secondaryTradeIds ?? []).join(", "), renderFilter: filter("secondary") },
    { id: "base", label: "Base Shift", value: (p: Person) => `${p.baseShiftType ?? "Standard"} ${p.shiftStart ?? "07:00"}–${p.shiftEnd ?? "15:30"}`, renderFilter: filter("base"), render: (p: Person) => <span className={`rounded px-1 ${colors[p.baseShiftType ?? "Standard"]}`}>{p.baseShiftType ?? "Standard"} {p.shiftStart ?? "07:00"}–{p.shiftEnd ?? "15:30"}</span> },
    { id: "today", label: "Today's Shift", value: (p: Person) => describe(p, todayDate), renderFilter: filter("today"), render: (p: Person) => badge(p, todayDate) },
    { id: "tomorrow", label: "Tomorrow's Shift", value: (p: Person) => describe(p, addDays(todayDate, 1)), renderFilter: filter("tomorrow"), render: (p: Person) => badge(p, addDays(todayDate, 1)) },
    { id: "next", label: "2-Week Period Shifts", value: (p: Person) => twoWeekDays.map((day) => `${day}: ${describe(p, day)}`).join(", "), renderFilter: filter("next"), render: (p: Person) => <span>{twoWeekDays.filter((day) => !(categorical.next?.length) || dayValues(p, day).some((value) => categorical.next.includes(value))).map((day) => <span key={day} className="mr-1">{day.slice(5)} {badge(p, day)}</span>)}</span> },
    { id: "capacity", label: "Daily Capacity (h)", value: (p: Person) => p.ShiftHours },
    { id: "rate", label: "Hourly Rate (EUR)", value: (p: Person) => p.HourlyRate },
    { id: "skill", label: "Skill Level", value: (p: Person) => p.SkillLevel },
    { id: "status", label: "Status / Availability", value: (p: Person) => status(p, todayDate), renderFilter: filter("status") },
    { id: "disputes", label: "Disputes / Conflicts", value: (p: Person) => overviewDisputes(p).map((item) => `${item.date}: ${item.message}`).join("; ") || "No Disputes", renderFilter: filter("disputes"), render: (p: Person) => <span className={overviewDisputes(p).length ? "font-bold text-red-700" : "text-green-700"}> {overviewDisputes(p).length ? `⚠ ${overviewDisputes(p).length} Disputes` : "✓ No Disputes"}</span> },
    { id: "__action", label: "Action", value: () => "Open / Edit", render: (p: Person) => <button onClick={(event) => { event.stopPropagation(); setPersonId(p.id); setDraft({ ...p }); }}>Open / Edit</button> },
  ];
  const request = data.workRequests.find((wr) => wr.SiteId === activeSiteId && wr.WR_ID === open);
  return <div className="w-full max-w-none space-y-3 rounded border bg-white px-4 py-3 text-xs">
    <h2 className="text-base font-bold">Craftperson &amp; Shift Workspace</h2>
    <div className="flex flex-wrap gap-2">{presets.map((key) => <div key={key} className="rounded border p-2"><strong>{labels[key]}</strong> <input aria-label={`${key} template from`} type="time" value={templates[key].shiftStart} onChange={(e) => { const value = e.target.value; if (value && value !== templates[key].shiftEnd) setTemplates((old) => ({ ...old, [key]: { ...old[key], shiftStart: value } })); else setError("Template start and end must differ."); }} /> – <input aria-label={`${key} template to`} type="time" value={templates[key].shiftEnd} onChange={(e) => { const value = e.target.value; if (value && value !== templates[key].shiftStart) setTemplates((old) => ({ ...old, [key]: { ...old[key], shiftEnd: value } })); else setError("Template start and end must differ."); }} /></div>)}</div>
    <div className="flex flex-wrap gap-2"><button className={button} aria-pressed={mode === "overview"} onClick={() => setMode("overview")}>Overview &amp; Detail Grid</button><button className={button} aria-pressed={mode === "planner"} onClick={() => setMode("planner")}>2-Week Interactive Shift Planner</button><button className={button} onClick={() => { setPersonId(null); setDraft({ id: "", SiteId: activeSiteId, Name: "", LastName: "", Trade: CLASSICAL_TRADES[0], HourlyRate: 0, ShiftHours: 8, SkillLevel: 1, baseShiftType: "Standard", shiftStart: "07:00", shiftEnd: "15:30", secondaryTradeIds: [] }); setDetailTab("profile"); setMode("overview"); }}>+ New Craftperson</button></div>
    {error && <p role="alert" className="bg-red-100 p-2">{error}</p>}{notice && <p role="status" className="bg-cyan-100 p-2">{notice}</p>}
    {selected.length > 0 && <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border bg-blue-50 p-2"><strong>{selected.length} selected</strong><select aria-label="Bulk shift period" value={bulkTarget} onChange={(e) => setBulkTarget(e.target.value)}><option value="base">Base Default</option><option value="today">Today Only</option><option value="tomorrow">Tomorrow Only</option><option value="week">This Week</option><option value="next">Next Week</option></select>{presets.map((key) => <button key={key} className={button} onClick={() => paint(selected, datesFor(bulkTarget), key, bulkTarget === "base")}>{labels[key]}</button>)}<button className={button} onClick={() => { setBrush("Vacation"); setMode("planner"); setNotice("Select Vacation or Training and paint a day, or fill a week."); }}>+ Bulk Add Vacation / Training</button></div>}
    {mode === "planner" && <ShiftPlanner people={people} absences={data.craftpersonAbsences} today={todayDate} selected={selected} setSelected={setSelected} brush={brush} setBrush={setBrush} customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd} paint={paint} disputes={disputes} period={period} setPeriod={setPeriod} anchor={plannerAnchor} setAnchor={setAnchor} editDay={(p, day) => { const shift = getEffectiveCraftpersonShift(p, day); setPersonId(p.id); setDraft({ ...p }); setDetailTab("shifts"); setTarget("custom"); setCustomStart(shift.shiftStart); setCustomEnd(shift.shiftEnd); setRangeStart(day); setRangeEnd(day); setMode("overview"); }} />}
    {mode === "overview" && <div className="flex gap-2"><div className={draft ? "min-w-0 w-1/2" : "min-w-0 w-full"}><OverviewTable preferenceKey="craftperson-workspace" columns={columns} rows={filteredPeople} rowKey={(p) => p.id} rowClassName={(p) => p.id === personId ? "bg-blue-100" : ""} onRow={(p) => { setPersonId(p.id); setDraft({ ...p }); setDetailTab("profile"); }} /></div>
    {draft && <aside className="w-1/2 min-w-0 space-y-3 overflow-auto rounded border p-3"><div className="flex justify-between"><strong>{personId ? `${draft.Name} ${draft.LastName}` : "New Craftsperson"}</strong><button onClick={() => { setDraft(null); setPersonId(null); }}>✕</button></div><nav className="flex flex-wrap gap-1">{([["profile", "Profile, Trades & Base Shift"], ["shifts", "Flexible Shift Schedule"], ["leaves", "Vacations, Trainings & Leaves"], ["history", "Assigned WRs & History"]] as const).map(([key, title]) => <button key={key} className={button} aria-pressed={detailTab === key} disabled={!personId && key !== "profile"} onClick={() => { setDetailTab(key); if (key === "shifts" && target === "base") setTarget("today"); }}>{title}</button>)}</nav>
    {person && <section className="space-y-1 rounded border border-red-200 p-2"><h3 className="font-bold">Disputes / Conflicts ({(disputes[person.id] ?? []).length})</h3>{(disputes[person.id] ?? []).map((issue, index) => <div key={`${issue.date}-${issue.wr.WR_ID}-${issue.type}-${index}`} className="border-t py-1"><p className="text-red-700">⚠ {issue.date} · {issue.type}: {issue.message}</p><div className="flex flex-wrap gap-1">{issue.type === "Shift Hours" && <button className={button} onClick={() => adaptShift(person, issue.wr, issue.date)}>Adapt Shift to Match WR</button>}<button className={button} onClick={() => focus(issue.wr, person.id)}>Open in Dispatch Calendar</button><button className={button} onClick={() => unassignDispute(person, issue.wr)}>Unassign / Reassign WR</button></div></div>)}</section>}
    {detailTab === "profile" && <div className="grid gap-2 sm:grid-cols-2">{(["id", "Name", "LastName", "username"] as const).map((key) => <label key={key}>{key === "id" ? "Employee Code" : key}<input className="block w-full border p-1" disabled={key === "id" && !!personId} value={draft[key] ?? ""} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></label>)}<label>Primary Trade<select className="block w-full border" value={draft.Trade} onChange={(e) => setDraft({ ...draft, Trade: e.target.value })}>{CLASSICAL_TRADES.map((t) => <option key={t}>{t}</option>)}</select></label><div>Secondary Trades{CLASSICAL_TRADES.filter((t) => t !== draft.Trade).map((t) => <label key={t} className="block"><input type="checkbox" checked={(draft.secondaryTradeIds ?? []).includes(t)} onChange={(e) => setDraft({ ...draft, secondaryTradeIds: e.target.checked ? [...(draft.secondaryTradeIds ?? []), t] : (draft.secondaryTradeIds ?? []).filter((id) => id !== t) })} /> {t}</label>)}</div>{([["HourlyRate", "Hourly Rate"], ["ShiftHours", "Daily Capacity"], ["SkillLevel", "Skill Level"]] as const).map(([key, title]) => <label key={key}>{title}<input type="number" className="block border" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })} /></label>)}<label>Base Shift Type<select className="block border" value={draft.baseShiftType ?? "Standard"} onChange={(e) => { const value = e.target.value as Preset | "Custom"; setDraft(value === "Custom" ? { ...draft, baseShiftType: value } : { ...draft, baseShiftType: value, shiftStart: templates[value].shiftStart, shiftEnd: templates[value].shiftEnd }); }}>{[...presets, "Custom"].map((key) => <option key={key}>{key}</option>)}</select></label><label>From<input type="time" className="block border" value={draft.shiftStart ?? "07:00"} onChange={(e) => setDraft({ ...draft, baseShiftType: "Custom", shiftStart: e.target.value })} /></label><label>To<input type="time" className="block border" value={draft.shiftEnd ?? "15:30"} onChange={(e) => setDraft({ ...draft, baseShiftType: "Custom", shiftEnd: e.target.value })} /></label><button className={button} onClick={saveProfile}>Save Profile</button></div>}
    {detailTab === "shifts" && person && <div className="space-y-2"><div className="flex flex-wrap gap-1"><select aria-label="Shift date range" value={target} onChange={(e) => setTarget(e.target.value)}><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="week">Rest of This Week</option><option value="next">All Next Week</option><option value="custom">Custom date range</option></select>{target === "custom" && <><input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} /><input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} /></>}</div><div className="flex flex-wrap gap-1">{presets.map((key) => <button key={key} className={button} onClick={() => paint([person.id], datesFor(target), key)}>{labels[key]}</button>)}<input type="time" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /><input type="time" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /><button className={button} onClick={() => paint([person.id], datesFor(target), "Custom")}>Set Custom</button></div><h3 className="font-bold">Date overrides</h3>{Object.entries(person.shiftOverrides ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([day, shift]) => <div key={day}>{day} · {shift.shiftType} {shift.shiftStart}–{shift.shiftEnd} <button className="text-red-700" onClick={() => setData((state) => ({ ...state, craftspeople: state.craftspeople.map((p) => { if (p.SiteId !== activeSiteId || p.id !== person.id) return p; const next = { ...p.shiftOverrides }; delete next[day]; return { ...p, shiftOverrides: next, Activity: [...(p.Activity ?? []), activity(`Shift override removed for ${day}`)] }; }) }))}>Remove</button></div>)}</div>}
    {detailTab === "leaves" && person && <div><button className={button} onClick={() => { setEditLeave(null); setLeaveFor(person.id); }}>+ Add Vacation / Training / Sick Leave</button><OverviewTable preferenceKey="craftperson-leaves" rows={data.craftpersonAbsences.filter((entry) => entry.siteId === activeSiteId && entry.craftpersonId === person.id)} rowKey={(entry) => entry.id} columns={[{ id: "type", label: "Type", value: (a) => a.absenceType }, { id: "start", label: "Start", value: (a) => a.startDate }, { id: "end", label: "End", value: (a) => a.endDate }, { id: "status", label: "Status", value: (a) => a.status }, { id: "actions", label: "Actions", value: () => "", render: (a) => <span className="flex flex-col items-start whitespace-normal"><button onClick={() => { setEditLeave(a); setLeaveFor(a.craftpersonId); }}>Edit</button><button onClick={() => deleteAbsence(a)}>Delete</button><button onClick={() => resolve(a, "reassign")}>Auto-Reassign Affected WRs</button><button onClick={() => resolve(a, "unassign")}>Return to Unassigned Pool</button></span> }]} /></div>}
    {detailTab === "history" && person && <><OverviewTable preferenceKey="craftperson-requests" rows={data.workRequests.filter((wr) => wr.SiteId === activeSiteId && wr.AssignedCraftpersonIds.includes(person.id))} rowKey={(wr) => wr.WR_ID} columns={[{ id: "id", label: "WR ID", value: (wr) => wr.WR_ID }, { id: "type", label: "Type", value: (wr) => wr.WR_Type }, { id: "title", label: "Title", value: (wr) => wr.Description }, { id: "start", label: "Planned Start", value: (wr) => intervalFor(wr, person.id)?.assignedStartDateTime }, { id: "end", label: "Planned End", value: (wr) => intervalFor(wr, person.id)?.assignedEndDateTime }, { id: "status", label: "Status", value: (wr) => `${wr.Percentage}% ${wr.WorkRequestStatus}` }, { id: "action", label: "Actions", value: () => "", render: (wr) => <span><button onClick={() => focus(wr, person.id)}>📍 Show in Calendar</button> <button onClick={() => setOpen(wr.WR_ID)}>Open WR</button></span> }]} /><div style={{ height: 300 }} className="flex flex-col"><ResizableHistory><div className="space-y-2 p-2"><strong>History</strong><div className="flex gap-1"><input aria-label="Write a craftperson comment" placeholder="Write a comment..." className="flex-1 border" value={comment} onChange={(e) => setComment(e.target.value)} /><button className={button} disabled={!comment.trim()} onClick={() => { const text = comment.trim(); setData((state) => ({ ...state, craftspeople: state.craftspeople.map((p) => p.id === person.id && p.SiteId === activeSiteId ? { ...p, Activity: [...(p.Activity ?? []), activity(text, "comment")] } : p) })); setComment(""); }}>Post</button></div>{newestFirst(person.Activity ?? [], (entry) => entry.createdAt).map((entry) => <div key={entry.id} className="border-t p-1">{entry.createdAt} · {entry.actorName}: {entry.text}</div>)}</div></ResizableHistory></div></>}
    </aside>}</div>}
    {leaveFor !== null && <AbsenceForm people={people} initial={leaveFor} existing={editLeave} site={activeSiteId} date={todayDate} onClose={() => setLeaveFor(null)} onSave={(entry) => { setData((state) => { const current = state.craftpersonAbsences.find((a) => a.id === entry.id && a.siteId === activeSiteId); if (editLeave && JSON.stringify(current) !== JSON.stringify(editLeave)) { queueMicrotask(() => setError("Absence changed; retry.")); return state; } queueMicrotask(() => { setError(""); setNotice("Absence saved. Review and resolve affected assignments in the leave table."); setLeaveFor(null); }); return { ...state, craftpersonAbsences: [...state.craftpersonAbsences.filter((a) => a.id !== entry.id || a.siteId !== activeSiteId), entry], craftspeople: state.craftspeople.map((p) => p.SiteId === activeSiteId && (p.id === entry.craftpersonId || (editLeave && p.id === editLeave.craftpersonId)) ? { ...p, Activity: [...(p.Activity ?? []), activity(p.id === entry.craftpersonId ? `${editLeave ? "Updated" : "Added"} ${entry.absenceType} ${entry.startDate}–${entry.endDate}` : `Moved ${editLeave?.absenceType} absence to ${entry.craftpersonId}`)] } : p) }; }); }} />}
    {request?.WR_Type === "PM" && <PMWorkRequestPopup workRequest={request} onClose={() => setOpen(null)} onNavigate={setOpen} onEscalateToLJ={() => setError("Create Long Jobs from the work request overview.")} />}
    {request?.WR_Type === "FJ" && <FJWorkRequestPopup workRequest={request} onClose={() => setOpen(null)} onNavigate={setOpen} onEscalateToLJ={() => setError("Create Long Jobs from the work request overview.")} />}
    {request?.WR_Type === "LJ" && <LJWorkRequestPopup workRequest={request} onClose={() => setOpen(null)} onNavigate={setOpen} />}
  </div>;
}
