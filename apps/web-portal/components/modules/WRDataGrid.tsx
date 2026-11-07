"use client";

import React, { useMemo, useState } from "react";
import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { gridStatusChange } from "@/lib/wr-grid";

type Column = "id" | "description" | "status" | "percentage" | "trade" | "building" | "floor" | "room" | "equipment" | "cost" | "costType" | "due" | "margin" | "created";
const columns: { key: Column; label: string }[] = [
  { key: "id", label: "WR ID" }, { key: "description", label: "Title / Description" },
  { key: "status", label: "Status" }, { key: "percentage", label: "Substatus %" },
  { key: "trade", label: "Trade" }, { key: "building", label: "Building" },
  { key: "floor", label: "Floor" }, { key: "room", label: "Room" }, { key: "equipment", label: "Equipment" },
  { key: "cost", label: "Estimated Cost (EUR)" }, { key: "costType", label: "Cost Type" },
  { key: "due", label: "Due Date" }, { key: "margin", label: "Margin Date" }, { key: "created", label: "Created" },
];
function value(wr: BaseWorkRequest, key: Column): string {
  switch (key) {
    case "id": return wr.WR_ID;
    case "description": return wr.Description;
    case "status": return `${wr.WorkRequestStatus} ${wr.WorkRequestSubstatus}`;
    case "percentage": return String(wr.Percentage);
    case "trade": return wr.TradeName ?? wr.TradeId ?? "";
    case "building": return wr.bl_id;
    case "floor": return wr.LevelName ?? "";
    case "room": return wr.RoomCode ?? "";
    case "equipment": return wr.EquipmentCodes.join(", ");
    case "cost": return wr.EstimatedCostEur?.toString() ?? "";
    case "costType": return wr.CostType ?? "";
    case "due": return wr.DueDate ?? "";
    case "margin": return wr.MarginDate ?? "";
    case "created": return wr.CreatedDate;
  }
}

export function WRDataGrid({ requests, onOpen }: { requests: BaseWorkRequest[]; onOpen: (wr: BaseWorkRequest) => void }) {
  const { data, setData } = useCafmStore();
  const { activePerson, activeSiteId } = useSiteContext();
  const { currentRole } = useApp();
  const [filters, setFilters] = useState<Partial<Record<Column, string>>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkTrade, setBulkTrade] = useState("");
  const [bulkRoom, setBulkRoom] = useState("");
  const [bulkDue, setBulkDue] = useState("");
  const [error, setError] = useState("");
  const visible = useMemo(() => requests.filter((wr) => columns.every(({ key }) =>
    value(wr, key).toLowerCase().includes((filters[key] ?? "").trim().toLowerCase()))), [requests, filters]);
  const allVisible = visible.length > 0 && visible.every((wr) => selected.includes(wr.WR_ID));
  const controls = "w-full min-w-[6rem] rounded border border-slate-300 bg-white px-1 py-1 text-xs";
  const roomKey = (room: { bl_id: string; LevelName: string; RoomCode: string }) => JSON.stringify([room.bl_id, room.LevelName, room.RoomCode]);
  const audit = (wr: BaseWorkRequest, description: string): BaseWorkRequest => {
    const now = new Date().toISOString();
    return { ...wr, UpdatedAt: now, Activity: [...(wr.Activity ?? []), {
      id: crypto.randomUUID(), kind: "log", actorId: activePerson, actorName: activePerson,
      actorRole: currentRole, createdAt: now, text: description,
    }] };
  };
  const apply = (ids: string[], change: (wr: BaseWorkRequest) => BaseWorkRequest, description: string) => {
    setError("");
    try {
      const targets = ids.map((id) => data.workRequests.find((wr) => wr.WR_ID === id && wr.SiteId === activeSiteId));
      if (targets.some((item) => !item)) throw new Error("A selected work request is no longer available.");
      const updates = new Map<string, BaseWorkRequest>();
      for (const wr of targets) if (wr) {
        const next = change(wr);
        if (JSON.stringify(next) !== JSON.stringify(wr)) {
          const changedFields = (["Description", "WorkRequestStatus", "WorkRequestSubstatus", "Percentage", "TradeName", "bl_id", "LevelName", "RoomCode", "EquipmentCodes", "EstimatedCostEur", "CostType", "DueDate", "MarginDate"] as const)
            .filter((field) => JSON.stringify(wr[field]) !== JSON.stringify(next[field]))
            .map((field) => `${field}: ${JSON.stringify(wr[field] ?? null)} -> ${JSON.stringify(next[field] ?? null)}`);
          updates.set(wr.WR_ID, audit(next, `${description}. ${changedFields.join("; ")}`));
        }
      }
      if (!updates.size) return;
      setData((state) => {
        if (targets.some((target) => target && updates.has(target.WR_ID) &&
          JSON.stringify(state.workRequests.find((wr) => wr.WR_ID === target.WR_ID && wr.SiteId === target.SiteId)) !== JSON.stringify(target))) {
          queueMicrotask(() => setError("A work request changed. Retry the edit."));
          return state;
        }
        return { ...state, workRequests: state.workRequests.map((wr) => updates.get(wr.WR_ID) ?? wr) };
      });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The update failed.");
    }
  };
  const location = (wr: BaseWorkRequest, building: string, floor?: string, room?: string): BaseWorkRequest => ({
    ...wr, bl_id: building, LevelName: floor, RoomCode: room,
    ProblemLocation: [building, floor, room].filter(Boolean).join(" / "),
    EquipmentCodes: wr.EquipmentCodes.filter((code) => data.equipment.some((item) =>
      item.EquipmentCode === code && item.SiteId === activeSiteId && item.bl_id === building &&
      (!floor || item.LevelName === floor) && (!room || item.RoomCode === room))),
  });
  const roomChange = (wr: BaseWorkRequest, key: string) => {
    const room = data.rooms.find((item) => item.SiteId === activeSiteId && roomKey(item) === key);
    if (!room) throw new Error("Select a valid room for this site.");
    return location(wr, room.bl_id, room.LevelName, room.RoomCode);
  };
  const input = (wr: BaseWorkRequest, field: "Description" | "EstimatedCostEur" | "DueDate" | "MarginDate", type = "text") =>
    <input key={`${wr.WR_ID}-${field}-${wr[field] ?? ""}`} className={controls} type={type}
      defaultValue={type === "date" && typeof wr[field] === "string" ? String(wr[field]).slice(0, 10) : wr[field] ?? ""}
      min={field === "EstimatedCostEur" ? 0 : undefined}
      aria-label={`${field} ${wr.WR_ID}`} onBlur={(event) => {
        const raw = event.currentTarget.value.trim();
        if (raw === (type === "date" && typeof wr[field] === "string" ? String(wr[field]).slice(0, 10) : String(wr[field] ?? ""))) return;
        if (field === "Description" && !raw) { setError("Description is required."); event.currentTarget.value = wr.Description; return; }
        const next = field === "EstimatedCostEur" ? (raw ? Number(raw) : undefined) : raw || undefined;
        if ((field === "EstimatedCostEur" && wr.WR_Type === "LJ" && next === undefined) ||
            (typeof next === "number" && (!Number.isFinite(next) || next < 0 || (wr.WR_Type === "LJ" && next < 750)))) {
          setError(wr.WR_Type === "LJ" ? "Long Job estimated cost must be at least 750 EUR." : "Cost must be non-negative.");
          event.currentTarget.value = String(wr[field] ?? "");
          return;
        }
        apply([wr.WR_ID], (current) => ({ ...current, [field]: next }), `${field} changed from ${wr[field] ?? "empty"} to ${raw || "empty"}`);
      }} />;
  const cell = (wr: BaseWorkRequest, key: Column): React.ReactNode => {
    switch (key) {
      case "id": case "created": return value(wr, key);
      case "description": return input(wr, "Description");
      case "cost": return input(wr, "EstimatedCostEur", "number");
      case "due": return input(wr, "DueDate", "date");
      case "margin": return input(wr, "MarginDate", "date");
      case "status": return <span>{wr.WorkRequestStatus} · {wr.WorkRequestSubstatus}</span>;
      case "percentage": return <select className={controls} aria-label={`Status ${wr.WR_ID}`} value={wr.Percentage}
        onChange={(event) => { const target = Number(event.target.value); apply([wr.WR_ID], (current) => gridStatusChange(current, target, currentRole), `Status changed to ${target}%`); }}>
        {![50, 55, 78, 100, 27].includes(wr.Percentage) && <option value={wr.Percentage}>{wr.Percentage}%</option>}
        {[50, 55, 78, 100, 27].map((number) => <option key={number} value={number}>{number}%</option>)}</select>;
      case "trade": return <select className={controls} aria-label={`Trade ${wr.WR_ID}`} value={wr.TradeName ?? wr.TradeId ?? ""}
        onChange={(event) => { const target = event.target.value; apply([wr.WR_ID], (current) => ({ ...current, TradeName: target || undefined, TradeId: target || undefined }), `Trade changed to ${target || "none"}`); }}>
        <option value="">None</option>{wr.TradeName && !CLASSICAL_TRADES.some((trade) => trade === wr.TradeName) && <option>{wr.TradeName}</option>}
        {CLASSICAL_TRADES.map((trade) => <option key={trade}>{trade}</option>)}</select>;
      case "building": return <select className={controls} aria-label={`Building ${wr.WR_ID}`} value={wr.bl_id}
        onChange={(event) => { const target = event.target.value; apply([wr.WR_ID], (current) => location(current, target), `Building changed to ${target}`); }}>
        {!data.buildings.some((item) => item.bl_id === wr.bl_id) && <option value={wr.bl_id}>{wr.bl_id}</option>}
        {data.buildings.map((item) => <option key={item.bl_id} value={item.bl_id}>{item.bl_id}</option>)}</select>;
      case "floor": return <select className={controls} aria-label={`Floor ${wr.WR_ID}`} value={wr.LevelName ?? ""}
        onChange={(event) => { const target = event.target.value; apply([wr.WR_ID], (current) => location(current, current.bl_id, target || undefined), `Floor changed to ${target || "none"}`); }}>
        <option value="">None</option>{wr.LevelName && !data.floors.some((item) => item.bl_id === wr.bl_id && item.LevelName === wr.LevelName) && <option>{wr.LevelName}</option>}
        {data.floors.filter((item) => item.bl_id === wr.bl_id).map((item) => <option key={item.LevelName}>{item.LevelName}</option>)}</select>;
      case "room": return <select className={controls} aria-label={`Room ${wr.WR_ID}`} value={wr.RoomCode ?? ""}
        onChange={(event) => { const target = event.target.value; apply([wr.WR_ID], (current) => location(current, current.bl_id, current.LevelName, target || undefined), `Room changed to ${target || "none"}`); }}>
        <option value="">None</option>{wr.RoomCode && !data.rooms.some((item) => item.bl_id === wr.bl_id && item.LevelName === wr.LevelName && item.RoomCode === wr.RoomCode) && <option>{wr.RoomCode}</option>}
        {data.rooms.filter((item) => item.bl_id === wr.bl_id && item.LevelName === wr.LevelName).map((item) => <option key={item.RoomCode}>{item.RoomCode}</option>)}</select>;
      case "equipment": return <select multiple className={controls} aria-label={`Equipment ${wr.WR_ID}`} value={wr.EquipmentCodes}
        onChange={(event) => { const codes = Array.from(event.target.selectedOptions, (option) => option.value);
          apply([wr.WR_ID], (current) => ({ ...current, EquipmentCodes: codes }), `Equipment changed to ${codes.join(", ") || "none"}`); }}>
        {data.equipment.filter((item) => item.bl_id === wr.bl_id && (!wr.LevelName || item.LevelName === wr.LevelName) && (!wr.RoomCode || item.RoomCode === wr.RoomCode)).map((item) => <option key={item.EquipmentCode}>{item.EquipmentCode}</option>)}</select>;
      case "costType": return <select className={controls} aria-label={`Cost type ${wr.WR_ID}`} value={wr.CostType ?? ""}
        onChange={(event) => { const selectedType = event.target.value; apply([wr.WR_ID], (current) => ({ ...current, CostType: selectedType === "Fixed" || selectedType === "Ceiling" ? selectedType : undefined }), `Cost type changed to ${selectedType || "none"}`); }}>
        <option value="">None</option><option>Fixed</option><option>Ceiling</option></select>;
    }
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
  return <div className="space-y-3">
    {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
    {selected.length > 0 && <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded border bg-white p-2 shadow">
      <strong>{selected.length} selected ({selected.filter((id) => !visible.some((wr) => wr.WR_ID === id)).length} hidden) · Bulk Actions</strong>
      <select aria-label="Bulk status" className="rounded border p-1" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}><option value="">Status</option>{[50, 55, 78, 100, 27].map((n) => <option key={n} value={n}>{n}%</option>)}</select>
      <button disabled={!bulkStatus} onClick={() => apply(selected, (wr) => gridStatusChange(wr, Number(bulkStatus), currentRole), `Bulk status changed to ${bulkStatus}%`)}>Apply status</button>
      <select aria-label="Bulk trade" className="rounded border p-1" value={bulkTrade} onChange={(e) => setBulkTrade(e.target.value)}><option value="">Trade</option>{CLASSICAL_TRADES.map((trade) => <option key={trade}>{trade}</option>)}</select>
      <button disabled={!bulkTrade} onClick={() => apply(selected, (wr) => ({ ...wr, TradeId: bulkTrade, TradeName: bulkTrade }), `Bulk trade changed to ${bulkTrade}`)}>Apply trade</button>
      <select aria-label="Bulk room" className="rounded border p-1 max-w-48" value={bulkRoom} onChange={(e) => setBulkRoom(e.target.value)}><option value="">Room</option>{data.rooms.map((room) => <option key={roomKey(room)} value={roomKey(room)}>{room.bl_id} / {room.LevelName} / {room.RoomCode}</option>)}</select>
      <button disabled={!bulkRoom} onClick={() => apply(selected, (wr) => roomChange(wr, bulkRoom), `Bulk location changed to ${bulkRoom}`)}>Apply room</button>
      <input aria-label="Bulk due date" type="date" className="rounded border p-1" value={bulkDue} onChange={(e) => setBulkDue(e.target.value)} />
      <button disabled={!bulkDue} onClick={() => apply(selected, (wr) => ({ ...wr, DueDate: bulkDue }), `Bulk due date changed to ${bulkDue}`)}>Apply date</button>
      <button className="text-red-700" onClick={remove}>Bulk Delete</button>
    </div>}
    <div className="overflow-auto rounded border bg-white"><table className="w-full text-left text-xs"><thead className="bg-slate-50"><tr>
      <th className="p-2"><input type="checkbox" aria-label="Select all visible" checked={allVisible} onChange={(event) => setSelected((current) => event.target.checked
        ? [...new Set([...current, ...visible.map((wr) => wr.WR_ID)])] : current.filter((id) => !visible.some((wr) => wr.WR_ID === id)))} /></th>
      {columns.map((column) => <th key={column.key} className="min-w-[7rem] p-2">{column.label}</th>)}<th className="p-2">Action</th></tr>
      <tr><th /><>{columns.map((column) => <th key={column.key} className="p-1"><input aria-label={`Filter ${column.label}`} placeholder="Filter" className={controls} value={filters[column.key] ?? ""} onChange={(event) => setFilters((current) => ({ ...current, [column.key]: event.target.value }))} /></th>)}</><th /></tr></thead>
      <tbody>{visible.map((wr) => <tr key={wr.WR_ID} className="border-t"><td className="p-2"><input type="checkbox" aria-label={`Select ${wr.WR_ID}`} checked={selected.includes(wr.WR_ID)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, wr.WR_ID] : current.filter((id) => id !== wr.WR_ID))} /></td>
        {columns.map((column) => <td key={column.key} className="p-1">{cell(wr, column.key)}</td>)}<td className="p-2"><button className="whitespace-nowrap text-blue-700 underline" onClick={() => onOpen(wr)}>Open / Edit</button></td></tr>)}</tbody></table>
      {!visible.length && <p className="p-4 text-slate-600">No matching work requests.</p>}
    </div>
  </div>;
}
