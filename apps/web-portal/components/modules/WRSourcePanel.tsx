"use client";

import React, { useEffect, useState } from "react";
import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { BaseWorkRequest, LocationFreeze } from "@cafm/shared-schema";
import type { DemoData } from "../../lib/cafm-data";
import { describeLocationFreeze, getCurrentLocationFreezes } from "../../lib/location-freezes";
import { tradeColor } from "../../lib/trade-colors";
import { intervalFor } from "../../lib/dispatch";
import { MultiSelectFilter } from "../common/MultiSelectFilter";
import { startRequestDrag } from "../../lib/drag-preview";

type Person = DemoData["craftspeople"][number];
const fields = [
  ["id", "WR ID"], ["type", "WR Type (PM/FJ/LJ)"], ["description", "Title / Description"],
  ["trade", "Trade"], ["status", "Status / Substatus %"], ["location", "Location (Building / Floor / Room)"],
  ["equipment", "Equipment ID"], ["hours", "Expected Hours"], ["due", "Due Date"],
  ["margin", "Margin Date"], ["urgency", "Urgency"], ["person", "Assigned Craftsperson"],
] as const;
type Field = typeof fields[number][0];
const defaults: Field[] = fields.slice(0, 9).map(([id]) => id);
const commonStatuses: Record<number, string> = { 27: "Cancelled", 50: "Issued", 55: "On Hold", 78: "Technically Completed", 100: "Completed" };
const ljStatuses: Record<number, string> = { 0: "New Request for Quotation", 10: "On Hold", 20: "Quotation Preparation Offer by Contractor", 21: "Quotation Preparation Offer by Trade", 23: "Quotation Review", 25: "Submitted for Acceptance", 26: "Submitted to User", 28: "Quotation Accepted", 29: "Quotation Rejected", 30: "Request for Work", 31: "On Hold for Budget", 32: "Approved and Ordered", 40: "Committed", 79: "Pre-SAT Approved", 80: "Acceptance Invitation Sent", 81: "SAT Approved", 94: "All Acceptances Completed", 95: "Completed", 96: "Yellow Page Signed", 97: "Costs Approved", 98: "Final Approval", 99: "Invoice Information Confirmed" };
const preferenceKey = "cafm-wr-source-preferences-v1";
const button = "rounded border bg-white px-2 py-1 text-xs hover:bg-slate-100";

export function WRSourcePanel({ requests, people, buildings, freezes, now, onOpen, onAssign, onShow }: {
  requests: BaseWorkRequest[]; people: Person[]; buildings: DemoData["buildings"]; freezes: LocationFreeze[]; now: string;
  onOpen: (id: string) => void; onAssign: (id: string) => void; onShow: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [mode, setMode] = useState<"card" | "list">("card");
  const [shown, setShown] = useState<Field[]>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [types, setTypes] = useState<string[]>(["PM", "FJ", "LJ"]);
  const [statuses, setStatuses] = useState<number[]>([]);
  const [trades, setTrades] = useState<string[] | null>(null);
  const [buildingsFilter, setBuildingsFilter] = useState<string[] | null>(null);
  const [location, setLocation] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState<"all" | "scheduled" | "unscheduled">("all");
  const [sort, setSort] = useState<Field>("id");
  const [descending, setDescending] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(preferenceKey);
      if (saved) {
        const value: unknown = JSON.parse(saved);
        if (!value || typeof value !== "object" || !("mode" in value) || (value.mode !== "card" && value.mode !== "list") || !("fields" in value) || !Array.isArray(value.fields) || !value.fields.every((item: unknown) => fields.some(([id]) => id === item))) throw new Error("Invalid saved preferences");
        setMode(value.mode);
        setShown(value.fields);
      }
    } catch { setStorageError("Could not load source panel preferences. Defaults are being used."); }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(preferenceKey, JSON.stringify({ mode, fields: shown })); }
    catch { setStorageError("Could not save source panel preferences."); }
  }, [loaded, mode, shown]);
  const values = (wr: BaseWorkRequest): Record<Field, string> => ({
    id: wr.WR_ID, type: wr.WR_Type, description: wr.Description, trade: wr.TradeName ?? "",
    status: `${wr.Percentage}% ${wr.WorkRequestStatus} / ${wr.WorkRequestSubstatus}`,
    location: [wr.bl_id, wr.LevelName, wr.RoomCode].filter(Boolean).join(" / "),
    equipment: wr.EquipmentCodes.join(", "), hours: String(wr.ExpectedHours ?? ""), due: wr.DueDate?.slice(0, 10) ?? "",
    margin: wr.MarginDate?.slice(0, 10) ?? "", urgency: String(wr.Helper_SortUrgency ?? ""),
    person: wr.AssignedCraftpersonIds.map((id) => { const p = people.find((item) => item.id === id); return p ? `${p.Name} ${p.LastName}` : id; }).join(", "),
  });
  const options = { ...commonStatuses, ...(types.includes("LJ") ? ljStatuses : {}) };
  const activeStatuses = statuses.filter((value) => value in options);
  const rows = requests.filter((wr) => types.includes(wr.WR_Type) &&
    (!activeStatuses.length || activeStatuses.includes(wr.Percentage)) &&
    (trades === null || trades.includes(wr.TradeName ?? "")) && (buildingsFilter === null || buildingsFilter.includes(wr.bl_id ?? "")) &&
    [wr.bl_id, wr.LevelName, wr.RoomCode, buildings.find((item) => item.bl_id === wr.bl_id)?.Name].some((value) => String(value ?? "").toLowerCase().includes(location.toLowerCase())) &&
    (scheduleFilter === "all" || wr.AssignedCraftpersonIds.some((id) => intervalFor(wr, id) !== null) === (scheduleFilter === "scheduled")) &&
    (!from || !!wr.DueDate && wr.DueDate.slice(0, 10) >= from) && (!to || !!wr.DueDate && wr.DueDate.slice(0, 10) <= to) &&
    Object.values(values(wr)).some((value) => value.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => values(a)[sort].localeCompare(values(b)[sort], undefined, { numeric: true }) * (descending ? -1 : 1));
  const cell = (wr: BaseWorkRequest, field: Field) => field === "trade" ? <span className={`rounded border px-1 ${tradeColor(wr.TradeName)}`}>{values(wr)[field] || "—"}</span> : values(wr)[field] || "—";
  const toggle = <T,>(set: React.Dispatch<React.SetStateAction<T[]>>, value: T, checked: boolean) => set((old) => checked ? [...old, value] : old.filter((item) => item !== value));
  return <aside className={`order-2 shrink-0 rounded border bg-white p-2 ${expanded ? "w-96 min-w-[20rem] max-w-[70vw] resize-x overflow-auto" : "w-12"}`}>
    <button className={button} onClick={() => setExpanded(!expanded)}>{expanded ? "▶ Pool" : "◀"}</button>
    {expanded && <div className="space-y-2">
      <div className="flex flex-wrap gap-1"><button className={button} aria-pressed={mode === "card"} onClick={() => setMode("card")}>Card View</button><button className={button} aria-pressed={mode === "list"} onClick={() => setMode("list")}>List View</button>
        <details className="relative"><summary className={`${button} cursor-pointer`}>Fields ⚙️</summary><div className="absolute right-0 z-30 max-h-80 w-60 overflow-auto rounded border bg-white p-2 shadow-lg">{fields.map(([id, label]) => <label key={id} className="block"><input type="checkbox" checked={shown.includes(id)} onChange={(event) => toggle(setShown, id, event.target.checked)} /> {label}</label>)}</div></details>
      </div>
      {storageError && <p role="alert" className="text-red-700">{storageError}</p>}
      <details open><summary className="cursor-pointer font-bold">Filter</summary>
        <input aria-label="Search work requests" className="w-full border p-1" placeholder="Search work requests" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div>{["PM", "FJ", "LJ"].map((type) => <label key={type} className="mr-2"><input type="checkbox" checked={types.includes(type)} onChange={(event) => { const checked = event.target.checked; toggle(setTypes, type, checked); if (type === "LJ" && !checked) setStatuses((old) => old.filter((status) => status in commonStatuses)); }} /> {type}</label>)}</div>
        <details><summary>WR Status {activeStatuses.length ? `(${activeStatuses.length})` : "(All)"}</summary><div className="max-h-40 overflow-auto">{Object.entries(options).map(([number, label]) => <label key={number} className="block"><input type="checkbox" checked={activeStatuses.includes(Number(number))} onChange={(event) => toggle(setStatuses, Number(number), event.target.checked)} /> {number}% {label}</label>)}</div><button className={button} onClick={() => setStatuses([])}>Clear</button></details>
        <MultiSelectFilter label="Pool Trades" value={trades} onChange={setTrades} options={CLASSICAL_TRADES.map((trade) => ({ value: trade, label: trade, className: `rounded border px-1 ${tradeColor(trade)}` }))} />
        <MultiSelectFilter label="Pool Buildings" value={buildingsFilter} onChange={setBuildingsFilter} options={buildings.map((item) => ({ value: item.bl_id, label: `${item.bl_id} · ${item.Name}` }))} />
        <input aria-label="Filter location" className="w-full border p-1" placeholder="Building, floor or room" value={location} onChange={(event) => setLocation(event.target.value)} />
        <label>Due From <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label> <label>To <input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        {from && to && from > to && <p role="alert" className="text-red-700">Due date range is invalid.</p>}
        <div role="group" aria-label="Schedule filter" className="flex flex-wrap">{([["unscheduled", "Unscheduled"], ["all", "Scheduled & Unscheduled"], ["scheduled", "Scheduled"]] as const).map(([value, label]) => <button key={value} type="button" className={button} aria-pressed={scheduleFilter === value} onClick={() => setScheduleFilter(value)}>{label}</button>)}</div>
      </details>
      <div className="max-h-[65vh] overflow-auto">
        {mode === "card" ? rows.map((wr) => <article key={wr.WR_ID} draggable onDragStart={(event) => startRequestDrag(event, wr)} className={`mb-1 rounded border border-l-4 p-2 ${tradeColor(wr.TradeName)}`}>
          {fields.filter(([id]) => shown.includes(id)).map(([id, label]) => <p key={id} className="truncate" title={`${label}: ${values(wr)[id]}`}><strong>{label}: </strong>{cell(wr, id)}</p>)}
          {getCurrentLocationFreezes(wr, freezes, now).length > 0 && <span title={getCurrentLocationFreezes(wr, freezes, now).map(describeLocationFreeze).join("; ")}>❄ Freeze Active at Location</span>}
          <div><button className={button} onClick={() => onAssign(wr.WR_ID)}>Assign...</button> <button className={button} onClick={() => onOpen(wr.WR_ID)}>👁 Open</button> {wr.AssignedCraftpersonIds.some((id) => intervalFor(wr, id)) && <button className={button} onClick={() => onShow(wr.WR_ID)}>📍 Show</button>}</div>
        </article>) : <table className="w-full table-fixed text-left" style={{ minWidth: `${shown.length * 144 + 230}px` }}><thead><tr>{fields.filter(([id]) => shown.includes(id)).map(([id, label]) => <th key={id} className="w-36"><button className="truncate" onClick={() => { if (sort === id) setDescending(!descending); else { setSort(id); setDescending(false); } }}>{label}{sort === id ? descending ? " ▼" : " ▲" : ""}</button></th>)}<th className="w-56">Actions</th></tr></thead><tbody>
          {rows.map((wr) => <tr key={wr.WR_ID} draggable onDragStart={(event) => startRequestDrag(event, wr)} className={`border-l-4 ${tradeColor(wr.TradeName)}`}>{fields.filter(([id]) => shown.includes(id)).map(([id]) => <td key={id} className="truncate p-1" title={values(wr)[id]}>{cell(wr, id)}</td>)}<td>{getCurrentLocationFreezes(wr, freezes, now).length > 0 && <span title={getCurrentLocationFreezes(wr, freezes, now).map(describeLocationFreeze).join("; ")}>❄</span>}<button className={button} onClick={() => onAssign(wr.WR_ID)}>Assign...</button><button className={button} onClick={() => onOpen(wr.WR_ID)}>👁 Open</button>{wr.AssignedCraftpersonIds.some((id) => intervalFor(wr, id)) && <button className={button} onClick={() => onShow(wr.WR_ID)}>📍 Show</button>}</td></tr>)}
        </tbody></table>}
        {!rows.length && <p className="p-2">No matching work requests.</p>}
      </div>
    </div>}
  </aside>;
}
