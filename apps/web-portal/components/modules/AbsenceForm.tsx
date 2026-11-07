"use client";

import React, { useState } from "react";
import type { CraftpersonAbsence } from "@cafm/shared-schema";
import type { DemoData } from "../../lib/cafm-data";
import { validateAbsence } from "../../lib/absence-validator";
import { wallMinutes } from "../../lib/dispatch";

const button = "rounded border bg-white px-2 py-1 text-xs hover:bg-slate-100";

export function AbsenceForm({ people, initial, existing, site, date, onClose, onSave }: {
  people: DemoData["craftspeople"]; initial: string; existing: CraftpersonAbsence | null; site: CraftpersonAbsence["siteId"]; date: string;
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
    const parsed = validateAbsence({ id: existing?.id ?? crypto.randomUUID(), siteId: site, craftpersonId: person, absenceType: type, startDate: start, endDate: end, isFullDay: full, ...(!full ? { startTime, endTime } : {}), unavailableHoursPerDay: hours, status: existing?.status ?? "Approved", notes });
    if (!parsed.success || !people.some((item) => item.id === person)) { setError(parsed.success ? "Select a craftsperson." : parsed.message); return; }
    onSave(parsed.data);
  }}><h2 className="font-bold">{existing ? "Edit absence" : "Add absence / vacation"}</h2>{error && <p role="alert" className="text-red-700">{error}</p>}
    <label className="block">Craftsperson <select className="block w-full border p-1" value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Select</option>{people.map((item) => <option value={item.id} key={item.id}>{item.Name} {item.LastName} · {item.Trade}</option>)}</select></label>
    <label className="block">Type <select className="block w-full border p-1" value={type} onChange={(e) => setType(e.target.value as CraftpersonAbsence["absenceType"])}>{["Vacation", "SickLeave", "Training", "PublicHoliday", "OtherAbsence"].map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="block">From <input required type="date" className="block w-full border p-1" value={start} onChange={(e) => setStart(e.target.value)} /></label>
    <label className="block">To <input required type="date" className="block w-full border p-1" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
    <label><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} /> Full day</label>
    {!full && <div className="flex gap-2"><label>Start time <input required type="time" className="block border p-1" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label><label>End time <input required type="time" className="block border p-1" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label></div>}
    <label className="block">Notes <textarea className="block w-full border p-1" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    <button className={button} type="submit">Save absence</button> <button className={button} type="button" onClick={onClose}>Cancel</button></form></div>;
}
