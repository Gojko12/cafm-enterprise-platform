"use client";

import React, { useState } from "react";
import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { gridStatusChange } from "@/lib/wr-grid";
import { groupLongJobs } from "@/lib/wr-overview";
import { useTableColumns } from "@/components/common/TableColumns";

type Column = "id" | "description" | "status" | "percentage" | "trade" | "building" | "floor" | "room" | "equipment" | "cost" | "costType" | "craftperson" | "due" | "margin" | "created";
const columns: { key: Column; label: string }[] = [
  { key: "id", label: "WR ID" }, { key: "description", label: "Title / Description" },
  { key: "status", label: "Status" }, { key: "percentage", label: "Substatus %" },
  { key: "trade", label: "Trade" }, { key: "building", label: "Building" },
  { key: "floor", label: "Floor" }, { key: "room", label: "Room" }, { key: "equipment", label: "Equipment" },
  { key: "cost", label: "Estimated Cost (EUR)" }, { key: "costType", label: "Cost Type" },
  { key: "craftperson", label: "Assigned Craftperson" }, { key: "due", label: "Due Date" },
  { key: "margin", label: "Margin Date" }, { key: "created", label: "Created" },
];

export function WRDataGrid({ requests, onOpen, grouped = false, onFilterCount, requestType }: { requests: BaseWorkRequest[]; onOpen: (wr: BaseWorkRequest) => void; grouped?: boolean; onFilterCount?: (count: number) => void; requestType: "PM" | "FJ" | "LJ" }) {
  const { data, setData } = useCafmStore();
  const { activePerson, activeSiteId } = useSiteContext();
  const { currentRole } = useApp();
  const [filters, setFilters] = useState<Partial<Record<Column, string>>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkTrade, setBulkTrade] = useState("");
  const [bulkRoom, setBulkRoom] = useState("");
  const [bulkDue, setBulkDue] = useState("");
  const [error, setError] = useState("");
  const value = (wr: BaseWorkRequest, key: Column): string => {
    switch (key) {
      case "id": return wr.WR_ID;
      case "description": return wr.Description;
      case "status": return `${wr.WorkRequestStatus} · ${wr.WorkRequestSubstatus}`;
      case "percentage": return `${wr.Percentage}%`;
      case "trade": return wr.TradeName ?? wr.TradeId ?? "";
      case "building": return wr.bl_id;
      case "floor": return wr.LevelName ?? "";
      case "room": return wr.RoomCode ?? "";
      case "equipment": return wr.EquipmentCodes.join(", ");
      case "cost": return wr.EstimatedCostEur?.toString() ?? "";
      case "costType": return wr.CostType ?? "";
      case "craftperson": return wr.AssignedCraftpersonIds.map((id) => {
        const person = data.craftspeople.find((item) => item.id === id && item.SiteId === wr.SiteId);
        return person ? `${person.Name} ${person.LastName}` : id;
      }).join(", ");
      case "due": return wr.DueDate ?? "";
      case "margin": return wr.MarginDate ?? "";
      case "created": return wr.CreatedDate;
    }
  };
  const config = useTableColumns(`work-requests-${requestType}`, columns.map(({ key, label }) => ({ id: key, label, value: (wr: BaseWorkRequest) => key === "cost" ? wr.EstimatedCostEur : key === "percentage" ? wr.Percentage : value(wr, key) })));
  const visible = config.sorted(requests.filter((wr) => config.visible.every(({ id }) =>
    value(wr, id as Column).toLowerCase().includes((filters[id as Column] ?? "").trim().toLowerCase()))));
  const groups = grouped ? groupLongJobs(visible) : [];
  const displayed = grouped ? groups.filter((group) => !collapsed.includes(group.key)).flatMap((group) => group.requests) : visible;
  const allVisible = displayed.length > 0 && displayed.every((wr) => selected.includes(wr.WR_ID));
  const roomKey = (room: { bl_id: string; LevelName: string; RoomCode: string }) => JSON.stringify([room.bl_id, room.LevelName, room.RoomCode]);
  const audit = (wr: BaseWorkRequest, text: string): BaseWorkRequest => {
    const now = new Date().toISOString();
    return { ...wr, UpdatedAt: now, Activity: [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log",
      actorId: activePerson, actorName: activePerson, actorRole: currentRole, createdAt: now, text }] };
  };
  const apply = (change: (wr: BaseWorkRequest) => BaseWorkRequest, description: string) => {
    setError("");
    try {
      const targets = selected.map((id) => data.workRequests.find((wr) => wr.WR_ID === id && wr.SiteId === activeSiteId));
      if (targets.some((item) => !item)) throw new Error("A selected work request is no longer available.");
      const updates = new Map<string, BaseWorkRequest>();
      for (const wr of targets) if (wr) {
        const next = change(wr);
        if (JSON.stringify(next) !== JSON.stringify(wr)) {
          const fields = (["WorkRequestStatus", "WorkRequestSubstatus", "Percentage", "TradeName", "bl_id", "LevelName", "RoomCode", "EquipmentCodes", "DueDate"] as const)
            .filter((field) => JSON.stringify(wr[field]) !== JSON.stringify(next[field]))
            .map((field) => `${field}: ${JSON.stringify(wr[field] ?? null)} -> ${JSON.stringify(next[field] ?? null)}`);
          updates.set(wr.WR_ID, audit(next, `${description}. ${fields.join("; ")}`));
        }
      }
      if (!updates.size) return;
      setData((state) => {
        if (targets.some((target) => target && updates.has(target.WR_ID) &&
          JSON.stringify(state.workRequests.find((wr) => wr.WR_ID === target.WR_ID && wr.SiteId === target.SiteId)) !== JSON.stringify(target))) {
          queueMicrotask(() => setError("A work request changed. Retry the edit."));
          return state;
        }
        return { ...state, workRequests: state.workRequests.map((wr) => wr.SiteId === activeSiteId ? updates.get(wr.WR_ID) ?? wr : wr) };
      });
    } catch (problem) { setError(problem instanceof Error ? problem.message : "The update failed."); }
  };
  const remove = () => {
    if (!window.confirm(`Delete ${selected.length} selected work requests? Their history will be retained in the site archive.`)) return;
    const ids = new Set(selected);
    setData((state) => {
      const removed = state.workRequests.filter((wr) => wr.SiteId === activeSiteId && ids.has(wr.WR_ID));
      return { ...state, workRequests: state.workRequests.filter((wr) => !(wr.SiteId === activeSiteId && ids.has(wr.WR_ID))),
        deletedWorkRequests: [...(state.deletedWorkRequests ?? []), ...removed.map((wr) => audit(wr, `Work request deleted by ${activePerson}`))] };
    });
    setSelected([]);
  };
  const row = (wr: BaseWorkRequest) => <tr key={wr.WR_ID} className="border-t hover:bg-slate-50" onDoubleClick={() => onOpen(wr)}>
    <td className="p-2" onDoubleClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${wr.WR_ID}`} checked={selected.includes(wr.WR_ID)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, wr.WR_ID] : current.filter((id) => id !== wr.WR_ID))} /></td>
    {config.visible.map(({ id }) => { const key = id as Column; return <td key={key} className="px-2 py-1.5">{key === "percentage" || key === "status" ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-900">{value(wr, key)}</span> : value(wr, key) || "—"}</td>; })}
    <td className="p-2" onDoubleClick={(event) => event.stopPropagation()}><button className="whitespace-nowrap text-blue-700 underline" onClick={() => onOpen(wr)}>Open / Edit</button></td></tr>;
  return <div className="space-y-2">
    <div className="flex justify-end">{config.menu}</div>
    {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
    {selected.length > 0 && <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded border bg-white p-2 text-xs shadow">
      <strong>{selected.length} selected ({selected.filter((id) => !displayed.some((wr) => wr.WR_ID === id)).length} hidden) · Bulk Actions</strong>
      <select aria-label="Bulk status" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}><option value="">Status</option>{[50, 55, 78, 100, 27].map((n) => <option key={n} value={n}>{n}%</option>)}</select>
      <button disabled={!bulkStatus} onClick={() => apply((wr) => gridStatusChange(wr, Number(bulkStatus), currentRole), `Bulk status changed to ${bulkStatus}%`)}>Apply status</button>
      <select aria-label="Bulk trade" value={bulkTrade} onChange={(e) => setBulkTrade(e.target.value)}><option value="">Trade</option>{CLASSICAL_TRADES.map((trade) => <option key={trade}>{trade}</option>)}</select>
      <button disabled={!bulkTrade} onClick={() => apply((wr) => ({ ...wr, TradeId: bulkTrade, TradeName: bulkTrade }), `Bulk trade changed to ${bulkTrade}`)}>Apply trade</button>
      <select aria-label="Bulk room" value={bulkRoom} onChange={(e) => setBulkRoom(e.target.value)}><option value="">Room</option>{data.rooms.map((room) => <option key={roomKey(room)} value={roomKey(room)}>{room.bl_id} / {room.LevelName} / {room.RoomCode}</option>)}</select>
      <button disabled={!bulkRoom} onClick={() => apply((wr) => {
        const room = data.rooms.find((item) => item.SiteId === activeSiteId && roomKey(item) === bulkRoom);
        if (!room) throw new Error("Select a valid room for this site.");
        return { ...wr, bl_id: room.bl_id, LevelName: room.LevelName, RoomCode: room.RoomCode, ProblemLocation: `${room.bl_id} / ${room.LevelName} / ${room.RoomCode}`,
          EquipmentCodes: wr.EquipmentCodes.filter((code) => data.equipment.some((item) => item.SiteId === activeSiteId && item.EquipmentCode === code && item.bl_id === room.bl_id && item.LevelName === room.LevelName && item.RoomCode === room.RoomCode)) };
      }, `Bulk location changed to ${bulkRoom}`)}>Apply room</button>
      <input aria-label="Bulk due date" type="date" value={bulkDue} onChange={(e) => setBulkDue(e.target.value)} />
      <button disabled={!bulkDue} onClick={() => apply((wr) => ({ ...wr, DueDate: bulkDue }), `Bulk due date changed to ${bulkDue}`)}>Apply date</button>
      <button className="text-red-700" onClick={remove}>Bulk Delete</button>
    </div>}
    <div className="overflow-auto rounded border bg-white"><table className="w-full text-left text-xs"><thead className="bg-slate-50"><tr>
      <th className="p-2"><input type="checkbox" aria-label="Select all visible" checked={allVisible} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, ...displayed.map((wr) => wr.WR_ID)])] : current.filter((id) => !displayed.some((wr) => wr.WR_ID === id)))} /></th>
      {config.visible.map((column) => <th key={column.id} className="min-w-[7rem] p-2"><button onClick={() => config.toggleSort(column.id)}>{column.label} {config.sort?.id === column.id ? config.sort.direction === "asc" ? "▲" : "▼" : ""}</button></th>)}<th className="p-2">Action</th></tr>
      <tr><th />{config.visible.map((column) => <th key={column.id} className="p-1"><input aria-label={`Filter ${column.label}`} placeholder="Filter" className="w-full min-w-[6rem] rounded border px-1 py-1" value={filters[column.id as Column] ?? ""} onChange={(event) => {
        const next = { ...filters, [column.id]: event.target.value };
        setFilters(next);
        onFilterCount?.(Object.values(next).filter((item) => item?.trim()).length);
      }} /></th>)}<th /></tr></thead>
      <tbody>{grouped ? groups.map((group) => <React.Fragment key={group.key}><tr className="border-t bg-slate-100"><th colSpan={config.visible.length + 2} className="p-2">
        <button aria-expanded={!collapsed.includes(group.key)} onClick={() => setCollapsed((current) => current.includes(group.key) ? current.filter((key) => key !== group.key) : [...current, group.key])}>
          {collapsed.includes(group.key) ? "▶" : "▼"} <span className="rounded bg-blue-100 px-2">{group.percentage}%</span> {group.description} · {group.track} · {group.requests.length} LJs · {group.cost.toLocaleString("en-IE", { style: "currency", currency: "EUR" })}
        </button></th></tr>{!collapsed.includes(group.key) && group.requests.map(row)}</React.Fragment>) : visible.map(row)}</tbody></table>
      {!visible.length && <p className="p-4 text-slate-600">No matching work requests.</p>}
    </div>
  </div>;
}
