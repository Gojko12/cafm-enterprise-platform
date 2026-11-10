"use client";

import React, { useEffect, useState } from "react";
import { pmTargetLabel, pmTargetType, formatDateDDMMYYYY, getNextUnsuppressedOccurrence } from "@cafm/shared-schema";
import type { PM_ChecklistStandard, PM_Schedule } from "@cafm/shared-schema";
import type { DemoData } from "@/lib/cafm-data";

const columns = [
  ["id", "PMS #"], ["scope", "Target Scope"], ["target", "Equipment / Location"], ["building", "Building"],
  ["floor", "Floor"], ["room", "Room"], ["code", "Blueprint Code"], ["title", "Blueprint Title"],
  ["family", "Family / Mode"], ["trade", "Trade"], ["frequency", "Locked Freq"], ["anchor", "Cycle Date (Visit #1)"],
  ["due", "Next Due"], ["technician", "Default Tech"],
] as const;
type Column = typeof columns[number][0];
const ids = columns.map(([id]) => id);
const key = "cafm_pms_table_prefs_v1";
const button = "rounded border bg-white px-2 py-1 text-xs disabled:opacity-40";
type Prefs = { order: Column[]; hidden: Column[] };
function readPrefs(): Prefs {
  const raw = localStorage.getItem(key);
  if (!raw) return { order: [...ids], hidden: [] };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("order" in value) || !("hidden" in value) || !Array.isArray(value.order) || !Array.isArray(value.hidden))
    throw new Error("Saved PMS column preferences are invalid. Use Reset Columns.");
  const valid = (id: unknown): id is Column => ids.some((item) => item === id);
  return { order: [...new Set([...value.order.filter(valid), ...ids])], hidden: value.hidden.filter(valid) };
}
export function PmSchedulesGrid({ orders, blueprints, data, selected, onSelect, onOpen }: {
  orders: PM_Schedule[]; blueprints: PM_ChecklistStandard[]; data: DemoData; selected: string[];
  onSelect: (ids: string[]) => void; onOpen: (order: PM_Schedule) => void;
}) {
  const [prefs, setPrefs] = useState<Prefs>({ order: [...ids], hidden: [] });
  const [ready, setReady] = useState(false), [error, setError] = useState("");
  const [filters, setFilters] = useState<Partial<Record<Column, string>>>({});
  const [sort, setSort] = useState<{ id: Column; desc: boolean }>({ id: "id", desc: false });
  const [drag, setDrag] = useState<Column>();
  useEffect(() => { try { setPrefs(readPrefs()); } catch (problem) { setError(String(problem)); } setReady(true); }, []);
  const changePrefs = (next: Prefs) => {
    setPrefs(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setError(""); }
    catch (problem) { setError(`Could not save column preferences: ${String(problem)}`); }
  };
  const move = (id: Column, destination: number) => {
    if (destination < 0 || destination >= prefs.order.length) return;
    const order = prefs.order.filter((item) => item !== id); order.splice(destination, 0, id);
    changePrefs({ ...prefs, order });
  };
  const value = (order: PM_Schedule, id: Column): string => {
    const bp = blueprints.find((item) => item.ChecklistCode === order.ChecklistCode);
    switch (id) {
      case "id": return order.ScheduleId;
      case "scope": return pmTargetType(order);
      case "target": return pmTargetType(order) === "equipment" ? `${order.EquipmentCodes[0]} · ${data.equipment.find((item) => item.EquipmentCode === order.EquipmentCodes[0])?.EquipmentName ?? ""}` : pmTargetLabel(order);
      case "building": return order.bl_id ?? "";
      case "floor": return order.LevelName ?? "";
      case "room": return order.RoomCode ?? "";
      case "code": return order.ChecklistCode;
      case "title": return bp?.Title ?? "";
      case "family": return bp?.blueprintMode === "standalone" ? "Standalone" : `${bp?.familyId} · ${bp?.familyName}`;
      case "trade": return bp?.TradeName ?? "";
      case "frequency": return bp?.frequencyCode ?? "";
      case "anchor": return formatDateDDMMYYYY(order.cycleDate ?? order.anchorDate);
      case "due": return formatDateDDMMYYYY(getNextUnsuppressedOccurrence(order, orders, new Date().toISOString().slice(0, 10))?.date);
      case "technician": return order.defaultTechnicianNames?.join(", ") ?? "";
    }
  };
  const rows = orders.filter((order) => ids.every((id) => !filters[id] || value(order, id).toLowerCase().includes(filters[id]!.trim().toLowerCase())))
    .sort((a, b) => {
      const sortValue = (order: PM_Schedule) => sort.id === "anchor" ? order.cycleDate ?? order.anchorDate ?? "" :
        sort.id === "due" ? getNextUnsuppressedOccurrence(order, orders, new Date().toISOString().slice(0, 10))?.date ?? "" : value(order, sort.id);
      return (sort.desc ? -1 : 1) * sortValue(a).localeCompare(sortValue(b), undefined, { numeric: true }) || a.ScheduleId.localeCompare(b.ScheduleId);
    });
  const visible = prefs.order.filter((id) => !prefs.hidden.includes(id));
  return <section className="space-y-3 rounded-xl border bg-white p-4">
    <div className="flex flex-wrap items-start gap-2"><strong>{rows.length} / {orders.length} PMS orders</strong>
      <button className={button} onClick={() => setFilters({})}>Reset Filters</button>
      <details className="relative"><summary className={`${button} cursor-pointer`}>Columns ⚙</summary><div className="absolute left-0 z-30 w-80 space-y-1 rounded border bg-white p-3 shadow-xl">
        <p className="text-xs">Select stays pinned first. Drag or use arrows.</p>
        {prefs.order.map((id, index) => <div key={id} draggable onDragStart={() => setDrag(id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (drag) move(drag, index); setDrag(undefined); }} className="flex items-center gap-2 rounded border p-1">
          <label className="flex-1 text-xs"><input type="checkbox" checked={!prefs.hidden.includes(id)} onChange={(e) => changePrefs({ ...prefs, hidden: e.target.checked ? prefs.hidden.filter((item) => item !== id) : [...prefs.hidden, id] })} /> {columns.find(([item]) => item === id)![1]}</label>
          <button aria-label={`Move ${id} up`} className={button} disabled={index === 0} onClick={() => move(id, index - 1)}>↑</button><button aria-label={`Move ${id} down`} className={button} disabled={index === ids.length - 1} onClick={() => move(id, index + 1)}>↓</button>
        </div>)}
        <button className={button} onClick={() => changePrefs({ order: [...ids], hidden: [] })}>Reset Columns</button>
      </div></details>
    </div>
    {error && <p role="alert" className="text-sm text-rose-700">{error} <button className={button} onClick={() => changePrefs({ order: [...ids], hidden: [] })}>Reset Columns</button></p>}
    {ready && <div className="max-h-[70vh] overflow-auto"><table className="w-full whitespace-nowrap text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50"><tr><th className="sticky left-0 z-20 bg-slate-50 p-2">Select</th>
      {visible.map((id) => <th key={id} className="p-2"><button onClick={() => setSort({ id, desc: sort.id === id ? !sort.desc : false })}>{columns.find(([item]) => item === id)![1]} {sort.id === id ? sort.desc ? "▼" : "▲" : ""}</button></th>)}</tr>
      <tr><th className="sticky left-0 bg-slate-50 p-2"><input type="checkbox" aria-label="Select all filtered PMS orders" checked={!!rows.length && rows.every((order) => selected.includes(order.ScheduleId))} onChange={(e) => onSelect(e.target.checked ? [...new Set([...selected, ...rows.map((order) => order.ScheduleId)])] : selected.filter((id) => !rows.some((order) => order.ScheduleId === id)))} /></th>
        {visible.map((id) => <th key={id} className="p-1"><input aria-label={`Filter ${columns.find(([item]) => item === id)![1]}`} className="w-full min-w-28 rounded border p-1 font-normal" value={filters[id] ?? ""} onChange={(e) => setFilters({ ...filters, [id]: e.target.value })} /></th>)}</tr></thead>
      <tbody>{rows.map((order) => <tr key={order.ScheduleId} className="border-t hover:bg-sky-50"><td className="sticky left-0 bg-white p-2"><input type="checkbox" aria-label={`Select PMS ${order.ScheduleId}`} checked={selected.includes(order.ScheduleId)} onChange={(e) => onSelect(e.target.checked ? [...selected, order.ScheduleId] : selected.filter((id) => id !== order.ScheduleId))} /></td>
        {visible.map((id) => <td key={id} className="max-w-sm truncate p-2" title={value(order, id)}>{id === "target" ? <button className="text-blue-700 underline" onClick={() => onOpen(order)}>{value(order, id)}</button> : value(order, id)}</td>)}</tr>)}</tbody></table>
      {!rows.length && <p className="p-4">No PM orders match these filters.</p>}
    </div>}
  </section>;
}
