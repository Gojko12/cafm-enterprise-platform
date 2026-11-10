"use client";

import React, { useMemo, useState } from "react";
import { CLASSICAL_TRADES, pmTargetLabel } from "@cafm/shared-schema";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { gridStatusChange } from "@/lib/wr-grid";
import { groupLongJobs } from "@/lib/wr-overview";
import { ResizeHandle, useTableColumns } from "@/components/common/TableColumns";
import { DisputeViewFilter } from "@/components/common/DisputeViewFilter";
import { mapWRDisputes } from "@/lib/disputes";
import type { DisputeViewMode } from "@/lib/disputes";
import { useQAActions } from "@/lib/use-qa-actions";
import { WRSignals } from "./WRSignals";
import { getFollowUpFJsForPM, getParentPM, getUnfavourableStepCount } from "@/lib/wr-signals";
import type { SignalTab } from "@/lib/wr-signals";

type Column = "id" | "description" | "status" | "percentage" | "signals" | "trade" | "building" | "floor" | "room" | "equipment" | "cost" | "costType" | "craftperson" | "due" | "margin" | "created" | "disputes" | "qa";
const columns: { key: Column; label: string }[] = [
  { key: "id", label: "WR ID" }, { key: "description", label: "Title / Description" },
  { key: "status", label: "Status" }, { key: "percentage", label: "Substatus %" },
  { key: "signals", label: "Signals / Alerts" },
  { key: "trade", label: "Trade" }, { key: "building", label: "Building" },
  { key: "floor", label: "Floor" }, { key: "room", label: "Room" }, { key: "equipment", label: "Equipment" },
  { key: "cost", label: "Estimated Cost (EUR)" }, { key: "costType", label: "Cost Type" },
  { key: "craftperson", label: "Assigned Craftperson" }, { key: "due", label: "Due Date" },
  { key: "margin", label: "Margin Date" }, { key: "created", label: "Created" }, { key: "disputes", label: "Disputes" }, { key: "qa", label: "QA Audit Status" },
];

export function WRDataGrid({ requests, onOpen, grouped = false, onFilterCount, requestType, signalFilters }: { requests: BaseWorkRequest[]; onOpen: (wr: BaseWorkRequest, tab?: SignalTab) => void; grouped?: boolean; onFilterCount?: (count: number) => void; requestType: "PM" | "FJ" | "LJ"; signalFilters?: React.ReactNode }) {
  const { data, setData } = useCafmStore();
  const { permissions } = useActiveUserPermissions();
  const { activePerson, activeSiteId } = useSiteContext();
  const { currentRole } = useApp();
  const qa = useQAActions();
  const [filters, setFilters] = useState<Partial<Record<Column, string>>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkTrade, setBulkTrade] = useState("");
  const [bulkRoom, setBulkRoom] = useState("");
  const [bulkDue, setBulkDue] = useState("");
  const [error, setError] = useState("");
  const [disputeMode, setDisputeMode] = useState<DisputeViewMode>("all");
  const disputeMap = useMemo(() => mapWRDisputes(data.workRequests, data.craftspeople, data.craftpersonAbsences, data.locationFreezes), [data.workRequests, data.craftspeople, data.craftpersonAbsences, data.locationFreezes]);
  const value = (wr: BaseWorkRequest, key: Column): string => {
    switch (key) {
      case "id": return wr.WR_ID;
      case "description": return wr.Description;
      case "status": return `${wr.WorkRequestStatus} · ${wr.WorkRequestSubstatus}`;
      case "percentage": return `${wr.Percentage}%`;
      case "signals": return [
        getUnfavourableStepCount(wr, data) ? `${getUnfavourableStepCount(wr, data)} Unfavourable` : "",
        wr.WR_Type === "PM" && getFollowUpFJsForPM(wr.WR_ID, data.workRequests).length ? `${getFollowUpFJsForPM(wr.WR_ID, data.workRequests).length} Follow-Up FJ` : "",
        getParentPM(wr, data.workRequests) ? `Follow-up of PM #${getParentPM(wr, data.workRequests)!.WR_ID}` : "",
      ].filter(Boolean).join(" · ");
      case "trade": return wr.TradeName ?? wr.TradeId ?? "";
      case "building": return wr.bl_id;
      case "floor": return wr.LevelName ?? "";
      case "room": return wr.RoomCode ?? "";
      case "equipment": return pmTargetLabel(wr);
      case "cost": return wr.EstimatedCostEur?.toString() ?? "";
      case "costType": return wr.CostType ?? "";
      case "craftperson": return wr.AssignedCraftpersonIds.map((id) => {
        const person = data.craftspeople.find((item) => item.id === id && item.SiteId === wr.SiteId);
        return person ? `${person.Name} ${person.LastName}` : id;
      }).join(", ");
      case "due": return wr.DueDate ?? "";
      case "margin": return wr.MarginDate ?? "";
      case "created": return wr.CreatedDate;
      case "disputes": return (disputeMap.get(wr.WR_ID) ?? []).map((item) => item.label).join(", ");
      case "qa": return wr.WR_Type === "LJ" ? "—" : wr.QA_AuditStatus === "QA_Failed_ActionRequired" ? "⚠ QA REWORK REQUIRED" : wr.QA_AuditStatus ?? "None";
    }
  };
  const savedConfig = useTableColumns(`work-requests-${requestType}`, columns.map(({ key, label }) => ({ id: key, label, value: (wr: BaseWorkRequest) => key === "cost" ? wr.EstimatedCostEur : key === "percentage" ? wr.Percentage : value(wr, key) })));
  const visibleColumns = savedConfig.visible.filter((column) => !["id", "percentage", "signals"].includes(column.id));
  const signalColumn = savedConfig.ordered.find((column) => column.id === "signals")!;
  const primaryColumns = ["id", "percentage"].flatMap((id) => savedConfig.visible.filter((column) => column.id === id));
  const config = { ...savedConfig, visible: [...primaryColumns, signalColumn, ...visibleColumns], width: (id: string) => id === "signals" ? Math.max(240, savedConfig.width(id)) : savedConfig.width(id) };
  const visible = config.sorted(requests.filter((wr) => (disputeMode !== "only" || (disputeMap.get(wr.WR_ID)?.length ?? 0) > 0) && config.visible.every(({ id }) =>
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
      if (targets.some((item) => item && !requests.some((visibleRequest) => visibleRequest.WR_ID === item.WR_ID))) throw new Error("A selected work request is outside your current scope.");
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
    if (selected.some((id) => !requests.some((wr) => wr.WR_ID === id))) { setError("A selected work request is outside your current scope."); return; }
    if (!window.confirm(`Delete ${selected.length} selected work requests? Their history will be retained in the site archive.`)) return;
    const ids = new Set(selected);
    setData((state) => {
      const removed = state.workRequests.filter((wr) => wr.SiteId === activeSiteId && ids.has(wr.WR_ID));
      return { ...state, workRequests: state.workRequests.filter((wr) => !(wr.SiteId === activeSiteId && ids.has(wr.WR_ID))),
        deletedWorkRequests: [...(state.deletedWorkRequests ?? []), ...removed.map((wr) => audit(wr, `Work request deleted by ${activePerson}`))] };
    });
    setSelected([]);
  };
  const row = (wr: BaseWorkRequest) => <tr key={wr.WR_ID} className={`border-t hover:bg-slate-50 ${disputeMode === "highlight" ? (disputeMap.get(wr.WR_ID)?.length ? "border-l-4 border-l-rose-600 bg-rose-50 ring-1 ring-rose-300" : "opacity-40") : ""}`} onDoubleClick={() => onOpen(wr)}>
    <td className="p-2" title={`Select ${wr.WR_ID}`} onDoubleClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${wr.WR_ID}`} checked={selected.includes(wr.WR_ID)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, wr.WR_ID] : current.filter((id) => id !== wr.WR_ID))} /></td>
    {config.visible.map(({ id }) => { const key = id as Column; return <td key={key} className="px-2 py-1.5" title={key === "disputes" ? (disputeMap.get(wr.WR_ID) ?? []).map((item) => item.detail).join("\n") : value(wr, key)}><div className={key === "signals" ? "" : "truncate"}>{key === "signals" ? <WRSignals wr={wr} onOpen={onOpen} /> : key === "percentage" || key === "status" ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-900">{value(wr, key)}</span> : key === "disputes" && value(wr, key) ? <span className="rounded bg-rose-100 px-1 text-rose-900">{value(wr, key)}</span> : value(wr, key) || "—"}</div></td>; })}
    <td className="p-2" title="Open / Edit" onDoubleClick={(event) => event.stopPropagation()}><button className="block max-w-full truncate text-blue-700 underline" onClick={() => onOpen(wr)}>Open / Edit</button></td></tr>;
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2"><DisputeViewFilter value={disputeMode} onChange={setDisputeMode} count={requests.filter((wr) => (disputeMap.get(wr.WR_ID)?.length ?? 0) > 0).length} />{signalFilters}<div className="ml-auto">{config.menu}</div></div>
    {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
    {selected.length > 0 && <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded border bg-white p-2 text-xs shadow">
      <strong>{selected.length} selected ({selected.filter((id) => !displayed.some((wr) => wr.WR_ID === id)).length} hidden) · Bulk Actions</strong>
      <button onClick={() => { setError(""); void qa.manualSelectForQAAudit(selected, "ManualInspectorPick").then(() => setSelected([])).catch((problem: unknown) => setError(problem instanceof Error ? problem.message : "Could not select QA audits.")); }}>+ Add Selected to QA Audit</button>
      <select aria-label="Bulk status" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}><option value="">Status</option>{[50, 55, 78, 100, 27].map((n) => <option key={n} value={n}>{n}%</option>)}</select>
      <button disabled={!bulkStatus || (Number(bulkStatus) === 78 && !permissions?.canCompleteWR78) || (Number(bulkStatus) === 100 && !permissions?.canCloseWR100)} onClick={() => {
        if ((Number(bulkStatus) === 78 && !permissions?.canCompleteWR78) || (Number(bulkStatus) === 100 && !permissions?.canCloseWR100)) { setError("Permission required for this status."); return; }
        apply((wr) => gridStatusChange(wr, Number(bulkStatus), currentRole), `Bulk status changed to ${bulkStatus}%`);
      }}>Apply status</button>
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
    <div className="overflow-auto rounded border bg-white"><table className="table-fixed text-left text-xs" style={{ width: config.width("__select") + config.width("__action") + config.visible.reduce((sum, column) => sum + config.width(column.id), 0) }}><colgroup><col style={{width: config.width("__select")}} />{config.visible.map((column) => <col key={column.id} style={{width: config.width(column.id)}} />)}<col style={{width: config.width("__action")}} /></colgroup><thead className="bg-slate-50"><tr>
      <th className="relative p-2" title="Select all visible"><input type="checkbox" aria-label="Select all visible" checked={allVisible} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, ...displayed.map((wr) => wr.WR_ID)])] : current.filter((id) => !displayed.some((wr) => wr.WR_ID === id)))} /><ResizeHandle label="Selection" width={config.width("__select")} onResize={(width) => config.resize("__select", width)} /></th>
      {config.visible.map((column) => <th key={column.id} className="relative p-2" title={column.label}><button className="block max-w-full truncate text-left" onClick={() => config.toggleSort(column.id)}>{column.label} {config.sort?.id === column.id ? config.sort.direction === "asc" ? "▲" : "▼" : ""}</button><ResizeHandle label={column.label} width={config.width(column.id)} onResize={(width) => config.resize(column.id, width)} /></th>)}<th className="relative p-2" title="Action"><span className="block truncate">Action</span><ResizeHandle label="Action" width={config.width("__action")} onResize={(width) => config.resize("__action", width)} /></th></tr>
      <tr><th />{config.visible.map((column) => <th key={column.id} className="p-1"><input aria-label={`Filter ${column.label}`} placeholder="Filter" className="w-full min-w-0 rounded border px-1 py-1" value={filters[column.id as Column] ?? ""} onChange={(event) => {
        const next = { ...filters, [column.id]: event.target.value };
        setFilters(next);
        onFilterCount?.(Object.values(next).filter((item) => item?.trim()).length);
      }} /></th>)}<th /></tr></thead>
      <tbody>{grouped ? groups.map((group) => <React.Fragment key={group.key}><tr className="border-t bg-slate-100"><th colSpan={config.visible.length + 2} className="p-2" title={`${group.percentage}% · ${group.description} · ${group.track} · ${group.requests.length} LJs · ${group.cost.toLocaleString("en-IE", { style: "currency", currency: "EUR" })}`}>
        <button className="block max-w-full truncate text-left" aria-expanded={!collapsed.includes(group.key)} onClick={() => setCollapsed((current) => current.includes(group.key) ? current.filter((key) => key !== group.key) : [...current, group.key])}>
          {collapsed.includes(group.key) ? "▶" : "▼"} <span className="rounded bg-blue-100 px-2">{group.percentage}%</span> {group.description} · {group.track} · {group.requests.length} LJs · {group.cost.toLocaleString("en-IE", { style: "currency", currency: "EUR" })}
        </button></th></tr>{!collapsed.includes(group.key) && group.requests.map(row)}</React.Fragment>) : visible.map(row)}</tbody></table>
      {!visible.length && <p className="p-4 text-slate-600">No matching work requests.</p>}
    </div>
  </div>;
}
