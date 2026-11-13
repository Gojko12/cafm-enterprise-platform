"use client";

import React, { useMemo, useState } from "react";
import { formatDateDDMMYYYY, pmTargetLabel } from "@cafm/shared-schema";
import type { BaseWorkRequest, LocationFreeze } from "@cafm/shared-schema";
import type { DemoData } from "../../../lib/cafm-data";
import { describeLocationFreeze, getCurrentLocationFreezes } from "../../../lib/location-freezes";
import { intervalFor } from "../../../lib/dispatch";
import { startRequestDrag } from "../../../lib/drag-preview";
import { tradeColor } from "../../../lib/trade-colors";
import { useTableColumns } from "../../common/TableColumns";
import { cannotScheduleMessage, isWrSchedulable } from "./scheduler-rules";
import { SchedulerPoolTable } from "./SchedulerPoolTable";
import { finishSchedulerRequestDrag } from "../../../lib/scheduler-drag";
import { DateInputDDMMYYYY } from "../../common/DateInputDDMMYYYY";
import type { DisputeViewMode, WRDispute } from "../../../lib/disputes";
import { DisputeViewFilter } from "../../common/DisputeViewFilter";
import { FrequencyPill } from "../../common/PmFrequency";

type Person = DemoData["craftspeople"][number];
type Field = "id" | "type" | "description" | "trade" | "status" | "location" | "equipment" | "hours" | "due" | "margin" | "urgency" | "person";
const fields: Array<[Field, string]> = [
  ["id", "WR ID"], ["type", "WR Type"], ["description", "Title / Description"], ["trade", "Trade"],
  ["status", "Status / Substatus %"], ["location", "Location"], ["equipment", "Equipment ID"],
  ["hours", "Expected Hours"], ["due", "Due Date"], ["margin", "Margin Date"], ["urgency", "Urgency"], ["person", "Assigned Craftsperson"],
];
const preferenceKey = "cafm-wr-source-preferences-v1";
const button = "rounded border bg-white px-2 py-1 text-xs hover:bg-slate-100";
const activeTab = "bg-blue-600 text-white font-semibold shadow-sm";
const inactiveTab = "bg-white text-slate-600 hover:bg-slate-100";

type FilterOption = { value: string; label: string; count: number };
function FilterPopover({ label, options, value, onChange }: { label: string; options: FilterOption[]; value: string[]; onChange: (value: string[]) => void }) {
  const [search, setSearch] = useState("");
  const filtered = options.filter((option) => option.label.toLowerCase().includes(search.toLowerCase()));
  return <details className="relative">
    <summary className={`${button} cursor-pointer whitespace-nowrap`}>{label}{value.length ? ` (${value.length})` : " (All)"}</summary>
    <div className="absolute left-0 z-40 mt-1 max-h-72 w-64 overflow-auto rounded border bg-white p-2 shadow-lg">
      <input aria-label={`Search ${label}`} className="mb-1 w-full rounded border p-1" placeholder={`Search ${label}`} value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="flex gap-2"><button type="button" className="text-blue-700 underline" onClick={() => onChange([])}>Clear</button><button type="button" className="text-blue-700 underline" onClick={() => onChange(options.map((option) => option.value))}>Select all</button></div>
      {filtered.map((option) => <label key={option.value} className="flex items-center gap-1 py-0.5"><input type="checkbox" checked={value.includes(option.value)} onChange={(event) => onChange(event.target.checked ? [...new Set([...value, option.value])] : value.filter((item) => item !== option.value))} /><span className="min-w-0 flex-1 truncate">{option.label}</span><small className="text-slate-500">{option.count}</small></label>)}
      {!filtered.length && <p className="p-2 text-slate-500">No matching values.</p>}
    </div>
  </details>;
}

export function SchedulerPoolFilters({ requests, people, buildings, freezes, now, onOpen, onAssign, onShow, onDraggingChange, disputeMap, disputeMode, onDisputeMode }: {
  requests: BaseWorkRequest[]; people: Person[]; buildings: DemoData["buildings"]; freezes: LocationFreeze[]; now: string;
  onOpen: (id: string) => void; onAssign: (id: string) => void; onShow: (id: string) => void;
  onDraggingChange?: (wr: BaseWorkRequest | null) => void;
  disputeMap: Map<string, WRDispute[]>; disputeMode: DisputeViewMode; onDisputeMode: (mode: DisputeViewMode) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [mode, setMode] = useState<"card" | "list">("card");
  const [types, setTypes] = useState<string[]>(["PM", "FJ", "LJ"]);
  const [activeOnly, setActiveOnly] = useState(true);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [substatuses, setSubstatuses] = useState<string[]>([]);
  const [trades, setTrades] = useState<string[]>([]);
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState<"all" | "scheduled" | "unscheduled">("all");
  const typesInUse = requests.filter((wr) => types.includes(wr.WR_Type));
  const statusOptions = useMemo(() => [...new Set(typesInUse.map((wr) => String(wr.Percentage)))].sort((a, b) => Number(a) - Number(b)).map((percentage) => {
    const matches = typesInUse.filter((wr) => String(wr.Percentage) === percentage);
    return { value: percentage, label: `${percentage}% ${matches[0]?.WorkRequestStatus ?? ""}`, count: matches.length };
  }), [requests, types.join("|")]);
  const substatusOptions = useMemo(() => [...new Set(typesInUse.map((wr) => wr.WorkRequestSubstatus).filter(Boolean))].sort().map((substatus) => ({
    value: substatus, label: substatus, count: typesInUse.filter((wr) => wr.WorkRequestSubstatus === substatus).length,
  })), [requests, types.join("|")]);
  const tradeOptions = [...new Set(requests.map((wr) => wr.TradeName).filter((value): value is string => !!value))].sort().map((trade) => ({
    value: trade, label: trade, count: requests.filter((wr) => wr.TradeName === trade).length,
  }));
  const buildingOptions = buildings.map((building) => ({ value: building.bl_id, label: `${building.bl_id} · ${building.Name}`, count: requests.filter((wr) => wr.bl_id === building.bl_id).length }));
  const valueFor = (wr: BaseWorkRequest): Record<Field, string> => ({
    id: wr.WR_ID, type: wr.WR_Type, description: wr.Description, trade: wr.TradeName ?? "",
    status: `${wr.Percentage}% ${wr.WorkRequestStatus} / ${wr.WorkRequestSubstatus}`,
    location: [wr.bl_id, wr.LevelName, wr.RoomCode].filter(Boolean).join(" / "),
    equipment: pmTargetLabel(wr), hours: String(wr.ExpectedHours ?? ""), due: wr.DueDate?.slice(0, 10) ?? "",
    margin: wr.MarginDate?.slice(0, 10) ?? "", urgency: String(wr.Helper_SortUrgency ?? ""),
    person: wr.AssignedCraftpersonIds.map((id) => { const p = people.find((item) => item.id === id); return p ? `${p.Name} ${p.LastName}` : id; }).join(", "),
  });
  const table = useTableColumns("scheduler-pool", fields.map(([id, label]) => ({
    id, label, value: (wr: BaseWorkRequest) => valueFor(wr)[id],
  })), fields.slice(0, 9).map(([id]) => id), "Fields ⚙");
  const baseRows = requests.filter((wr) => {
    const schedulable = isWrSchedulable(wr);
    const terminal = wr.Percentage === 27 || wr.Percentage === 29 || wr.Percentage >= 78;
    return types.includes(wr.WR_Type) &&
      (!activeOnly || schedulable || includeClosed && terminal || statuses.includes(String(wr.Percentage))) &&
      (!statuses.length || statuses.includes(String(wr.Percentage))) &&
      (!substatuses.length || substatuses.includes(wr.WorkRequestSubstatus)) &&
      (!trades.length || trades.includes(wr.TradeName ?? "")) &&
      (!selectedBuildings.length || selectedBuildings.includes(wr.bl_id ?? "")) &&
      [wr.bl_id, wr.LevelName, wr.RoomCode, buildings.find((item) => item.bl_id === wr.bl_id)?.Name].some((value) => String(value ?? "").toLowerCase().includes(location.toLowerCase())) &&
      (disputeMode !== "only" || (disputeMap.get(wr.WR_ID)?.length ?? 0) > 0) &&
      (!from || !!wr.DueDate && wr.DueDate.slice(0, 10) >= from) && (!to || !!wr.DueDate && wr.DueDate.slice(0, 10) <= to) &&
      Object.values(valueFor(wr)).some((value) => value.toLowerCase().includes(search.toLowerCase()));
  });
  const scheduled = (wr: BaseWorkRequest) => wr.AssignedCraftpersonIds.some((id) => intervalFor(wr, id) !== null);
  const rows = table.sorted(baseRows.filter((wr) => scheduleFilter === "all" || scheduled(wr) === (scheduleFilter === "scheduled")));
  const dueLabels = [from && `From ${formatDateDDMMYYYY(from)}`, to && `To ${formatDateDDMMYYYY(to)}`].filter(Boolean);
  const changed = !activeOnly || includeClosed || types.length !== 3 || statuses.length > 0 || substatuses.length > 0 || trades.length > 0 || selectedBuildings.length > 0 || !!location || !!search || !!from || !!to || disputeMode !== "all" || scheduleFilter !== "all";
  const reset = () => { setTypes(["PM", "FJ", "LJ"]); setActiveOnly(true); setIncludeClosed(false); setStatuses([]); setSubstatuses([]); setTrades([]); setSelectedBuildings([]); setLocation(""); setSearch(""); setFrom(""); setTo(""); setScheduleFilter("all"); onDisputeMode("all"); };
  const toggleType = (type: string) => setTypes((old) => old.includes(type) ? old.filter((item) => item !== type) : [...old, type]);
  const chip = (label: string, remove: () => void) => <button key={label} type="button" onClick={remove} className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-800 hover:bg-blue-100">{label} ×</button>;
  const cell = (wr: BaseWorkRequest, field: string) => field === "id" ? <>{wr.WR_ID} <FrequencyPill code={wr.pmFrequency} /></>
    : field === "due" ? formatDateDDMMYYYY(wr.DueDate) || "—" : field === "margin" ? formatDateDDMMYYYY(wr.MarginDate) || "—" : valueFor(wr)[field as Field] || "—";
  const dragStart = (event: React.DragEvent, wr: BaseWorkRequest) => { if (!isWrSchedulable(wr)) { event.preventDefault(); return; } startRequestDrag(event, wr); onDraggingChange?.(wr); };
  const dragEnd = () => { finishSchedulerRequestDrag(); onDraggingChange?.(null); };
  const actions = (wr: BaseWorkRequest) => <span className="flex flex-wrap gap-1">
    {isWrSchedulable(wr) ? <button className={button} title="Assign a craftperson or drag onto the calendar" onClick={() => onAssign(wr.WR_ID)}>Assign...</button>
      : wr.Percentage === 27 || wr.Percentage === 29 || wr.Percentage >= 78 ? <button className={button} onClick={() => onOpen(wr.WR_ID)}>View</button>
        : <button className={button} disabled title={cannotScheduleMessage(wr)}>Assign...</button>}
    <button className={button} onClick={() => onOpen(wr.WR_ID)}>👁 Open</button>
    {wr.AssignedCraftpersonIds.some((id) => intervalFor(wr, id)) && <button className={button} onClick={() => onShow(wr.WR_ID)}>📍 Show</button>}
  </span>;
  return <aside className={`order-2 shrink-0 rounded border bg-white p-2 ${expanded ? "w-[min(34rem,70vw)] min-w-[22rem]" : "w-12"}`}>
    <button className={button} onClick={() => setExpanded(!expanded)}>{expanded ? "▶ Pool" : "◀"}</button>
    {expanded && <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1"><button className={button} aria-pressed={mode === "card"} onClick={() => setMode("card")}>Card</button><button className={button} aria-pressed={mode === "list"} onClick={() => setMode("list")}>List</button>
        <div className="[&>details>summary]:rounded [&>details>summary]:border [&>details>summary]:bg-white [&>details>summary]:px-2 [&>details>summary]:py-1 [&>details>summary]:text-xs [&>details>summary]:cursor-pointer">{table.menu}</div>
      </div>
      <div className="flex flex-wrap items-center gap-1 rounded bg-slate-50 p-1">
        <input aria-label="Search work requests" className="min-w-48 flex-1 rounded border px-2 py-1" placeholder="Search WR ID, title, EQ, room..." value={search} onChange={(event) => setSearch(event.target.value)} />
        {["PM", "FJ", "LJ"].map((type) => <button key={type} type="button" aria-pressed={types.includes(type)} className={`rounded-full border px-2 py-1 font-semibold ${types.includes(type) ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-slate-600"}`} onClick={() => toggleType(type)}>{type}</button>)}
        <button type="button" aria-pressed={activeOnly} className={`rounded-full border px-2 py-1 ${activeOnly ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white text-slate-600"}`} onClick={() => setActiveOnly(!activeOnly)}>Active Only</button>
        <button type="button" aria-pressed={includeClosed} className={`rounded-full border px-2 py-1 ${includeClosed ? "border-amber-500 bg-amber-100 text-amber-900" : "bg-white text-slate-600"}`} onClick={() => setIncludeClosed(!includeClosed)}>Include Completed &amp; Cancelled</button>
        {changed && <button type="button" className={button} onClick={reset}>Reset</button>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <FilterPopover label="Status" options={statusOptions} value={statuses} onChange={setStatuses} />
        <FilterPopover label="Substatus" options={substatusOptions} value={substatuses} onChange={setSubstatuses} />
        <FilterPopover label="Trade" options={tradeOptions} value={trades} onChange={setTrades} />
        <FilterPopover label="Building" options={buildingOptions} value={selectedBuildings} onChange={setSelectedBuildings} />
        <input aria-label="Filter location" className="w-32 rounded border px-2 py-1" placeholder="Location" value={location} onChange={(event) => setLocation(event.target.value)} />
        <details className="relative"><summary className={`${button} cursor-pointer`}>Due Date &amp; Disputes</summary><div className="absolute right-0 z-40 w-72 rounded border bg-white p-2 shadow-lg"><label className="flex items-center justify-between gap-2">From <DateInputDDMMYYYY value={from} onValueChange={setFrom} aria-label="Due date from" /></label><label className="mt-1 flex items-center justify-between gap-2">To <DateInputDDMMYYYY value={to} onValueChange={setTo} aria-label="Due date to" /></label><DisputeViewFilter value={disputeMode} onChange={onDisputeMode} count={requests.filter((wr) => (disputeMap.get(wr.WR_ID)?.length ?? 0) > 0).length} /></div></details>
      </div>
      {from && to && from > to && <p role="alert" className="text-red-700">Due date range is invalid.</p>}
      <div className="flex flex-wrap items-center gap-1 border-b pb-2">
        {!activeOnly && chip("All statuses", () => setActiveOnly(true))}
        {includeClosed && chip("Completed & Cancelled", () => setIncludeClosed(false))}
        {types.length !== 3 && chip(`Types: ${types.join(", ") || "none"}`, () => setTypes(["PM", "FJ", "LJ"]))}
        {statuses.map((status) => chip(statusOptions.find((option) => option.value === status)?.label ?? `${status}%`, () => setStatuses((old) => old.filter((item) => item !== status))))}
        {substatuses.map((status) => chip(status, () => setSubstatuses((old) => old.filter((item) => item !== status))))}
        {trades.map((trade) => chip(trade, () => setTrades((old) => old.filter((item) => item !== trade))))}
        {selectedBuildings.map((building) => chip(building, () => setSelectedBuildings((old) => old.filter((item) => item !== building))))}
        {location && chip(`Location: ${location}`, () => setLocation(""))}
        {search && chip(`Search: ${search}`, () => setSearch(""))}
        {dueLabels.map((label) => chip(label!, () => label!.startsWith("From") ? setFrom("") : setTo("")))}
        {disputeMode !== "all" && chip(`Disputes: ${disputeMode}`, () => onDisputeMode("all"))}
        {!changed && <span className="text-slate-500">Active schedulable work requests</span>}
      </div>
      <div className="flex rounded-lg border p-0.5" role="group" aria-label="Schedule filter">
        {([["unscheduled", "Unscheduled", baseRows.filter((wr) => !scheduled(wr)).length], ["all", "Scheduled & Unscheduled", baseRows.length], ["scheduled", "Scheduled", baseRows.filter(scheduled).length]] as const).map(([value, label, count]) =>
          <button key={value} type="button" aria-pressed={scheduleFilter === value} onClick={() => setScheduleFilter(value)} className={`flex-1 rounded-md px-2 py-1.5 ${scheduleFilter === value ? activeTab : inactiveTab}`}>{label} ({count})</button>)}
      </div>
      <div className="max-h-[65vh] overflow-auto">
        {mode === "card" ? rows.map((wr) => {
          const schedulable = isWrSchedulable(wr);
          const disputes = disputeMap.get(wr.WR_ID) ?? [];
          const freezesForWr = getCurrentLocationFreezes(wr, freezes, now);
          return <article key={`${wr.SiteId}-${wr.WR_ID}`} draggable={schedulable} title={schedulable ? undefined : cannotScheduleMessage(wr)} onDragStart={(event) => dragStart(event, wr)} onDragEnd={dragEnd} className={`mb-1 rounded border border-l-4 p-2 ${tradeColor(wr.TradeName)} ${!schedulable ? "cursor-not-allowed opacity-50" : "cursor-grab"} ${disputeMode === "highlight" && disputes.length ? "bg-rose-100 text-rose-950 ring-2 ring-rose-500" : ""}`}>
            {disputes.length > 0 && <p title={disputes.map((item) => item.detail).join("\n")} className="text-rose-800">⚠ {disputes.map((item) => item.label).join(", ")}</p>}
            {table.visible.map(({ id, label }) => <p key={id} className="truncate" title={`${label}: ${valueFor(wr)[id as Field]}`}><strong>{label}: </strong>{cell(wr, id)}</p>)}
            {freezesForWr.length > 0 && <span title={freezesForWr.map(describeLocationFreeze).join("; ")}>❄ Freeze Active at Location</span>}
            {actions(wr)}
          </article>;
        }) : <SchedulerPoolTable rows={rows} columns={table.visible} sort={table.sort} onSort={table.toggleSort} width={table.width} onResize={table.resize}
          isSchedulable={isWrSchedulable} dragStart={dragStart} dragEnd={dragEnd}
          cell={(wr, id) => cell(wr, id)} actions={actions} />}
      </div>
    </div>}
  </aside>;
}
