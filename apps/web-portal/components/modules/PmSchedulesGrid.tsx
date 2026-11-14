"use client";

import React from "react";
import { pmTargetLabel, pmTargetType, pmTargetKey, formatDateDDMMYYYY, forecastPmCycle, getNextUnsuppressedOccurrence } from "@cafm/shared-schema";
import type { PM_ChecklistStandard, PM_Schedule } from "@cafm/shared-schema";
import type { DemoData } from "@/lib/cafm-data";
import { SmartDataGrid } from "@/components/common/SmartDataGrid";
import type { SmartGridColumn } from "@/components/common/SmartDataGrid";
import { ScheduleBadges } from "./PmStakeholderTagging";

const button = "rounded border bg-white px-2 py-1 text-xs disabled:opacity-40";

/** `3. PMS Master Overview Table` — every PMS schedule in one `<SmartDataGrid/>`; clicking a row opens that target's cycle in Tab 2. */
export function PmSchedulesGrid({ orders, blueprints, data, selected, onSelect, onOpen }: {
  orders: PM_Schedule[]; blueprints: PM_ChecklistStandard[]; data: DemoData; selected: string[];
  onSelect: (ids: string[]) => void; onOpen: (order: PM_Schedule) => void;
}) {
  const [teamFilter, setTeamFilter] = React.useState(""), [reqFilter, setReqFilter] = React.useState("");
  const today = new Date().toISOString().slice(0, 10);
  const groupKey = (order: PM_Schedule) => order.suppressionMode === "independent" ? `standalone:${order.SiteId}:${order.ScheduleId}` : `${order.SiteId}:${pmTargetKey(order)}:${order.suppressionGroupKey}`;
  const bp = (order: PM_Schedule) => blueprints.find((item) => item.ChecklistCode === order.ChecklistCode);
  const equipmentOf = (order: PM_Schedule) => pmTargetType(order) === "equipment"
    ? data.equipment.find((item) => item.EquipmentCode === order.EquipmentCodes[0] && item.SiteId === order.SiteId) : undefined;
  const wrsPerYear = (order: PM_Schedule) => {
    const group = orders.filter((item) => groupKey(item) === groupKey(order));
    try { return forecastPmCycle(group[0], group).annualAverage; } catch { return 0; }
  };
  const openWrs = (order: PM_Schedule) => data.workRequests.filter((wr) => wr.WR_Type === "PM" && wr.SiteId === order.SiteId &&
    wr.ScheduleId === order.ScheduleId && wr.Percentage < 100 && wr.Percentage !== 27 && wr.Percentage !== 29).length;
  const nextDue = (order: PM_Schedule) => {
    try { return getNextUnsuppressedOccurrence(order, orders, today)?.date ?? ""; } catch { return ""; }
  };
  const teamsLabel = (order: PM_Schedule) => [
    ...(order.affectedTeamIds ?? []).map((id) => data.stakeholderTeams?.find((item) => item.id === id)?.code ?? id),
    ...(order.requirementIds ?? []).map((id) => data.coordinationRequirements?.find((item) => item.id === id)?.code ?? id),
  ].join(", ");

  const columns: Array<SmartGridColumn<PM_Schedule>> = [
    { id: "pms", label: "PMS #", value: (order) => order.ScheduleId, defaultWidth: 80 },
    { id: "target", label: "Target Code & Name", defaultWidth: 240,
      value: (order) => pmTargetType(order) === "equipment" ? `${order.EquipmentCodes[0]} · ${equipmentOf(order)?.EquipmentName ?? ""}` : pmTargetLabel(order),
      render: (order) => <button type="button" className="max-w-full truncate text-blue-700 underline" onClick={() => onOpen(order)}>
        {pmTargetType(order) === "equipment" ? `${order.EquipmentCodes[0]} · ${equipmentOf(order)?.EquipmentName ?? ""}` : pmTargetLabel(order)}</button> },
    { id: "hierarchy", label: "Hierarchy Level", defaultWidth: 110,
      value: (order) => pmTargetType(order) !== "equipment" ? `${pmTargetType(order)[0].toUpperCase()}${pmTargetType(order).slice(1)} scope`
        : equipmentOf(order)?.HierarchyLevel ?? (equipmentOf(order)?.IsInstallation === false ? "SubEquipment" : "Installation") },
    { id: "location", label: "Location", defaultWidth: 180, value: (order) => [order.bl_id, order.LevelName, order.RoomCode].filter(Boolean).join(" / ") },
    { id: "blueprint", label: "Blueprint", defaultWidth: 220, value: (order) => `${order.ChecklistCode} · ${bp(order)?.Title ?? ""}` },
    { id: "freq", label: "Freq", defaultWidth: 70, value: (order) => bp(order)?.frequencyCode ?? order.frequencyCode ?? "" },
    { id: "trade", label: "Trade", defaultWidth: 110, value: (order) => bp(order)?.TradeName ?? "" },
    { id: "next", label: "Next Occurrence", defaultWidth: 120, value: (order) => formatDateDDMMYYYY(nextDue(order)) || "No winning visits", sortValue: (order) => nextDue(order) },
    { id: "wrsYear", label: "WRs/Year", defaultWidth: 85, value: (order) => wrsPerYear(order).toFixed(1), sortValue: (order) => wrsPerYear(order) },
    { id: "openWrs", label: "Open WRs", defaultWidth: 85, value: (order) => String(openWrs(order)), sortValue: (order) => openWrs(order) },
    { id: "teams", label: "Teams", defaultWidth: 180, value: teamsLabel, render: (order) => <ScheduleBadges order={order} /> },
  ];

  const rows = orders.filter((order) => (!teamFilter || order.affectedTeamIds?.includes(teamFilter)) && (!reqFilter || order.requirementIds?.includes(reqFilter)));
  const allSelected = !!rows.length && rows.every((order) => selected.includes(order.ScheduleId));

  return <section className="space-y-3 rounded-xl border bg-white p-4">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-lg font-bold">PMS Master Overview Table</h2>
      <select aria-label="Filter by Team" className={button} value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}><option value="">Filter by Team</option>{(data.stakeholderTeams ?? []).filter((item) => item.siteId === orders[0]?.SiteId || !orders.length).map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select>
      <select aria-label="Filter by Notice / Newsflash" className={button} value={reqFilter} onChange={(e) => setReqFilter(e.target.value)}><option value="">Filter by Notice / Newsflash</option>{(data.coordinationRequirements ?? []).filter((item) => item.siteId === orders[0]?.SiteId || !orders.length).map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select>
      <span className="text-xs text-slate-500">Click any row to open that target&apos;s cycle in Tab 2.</span>
    </div>
    <SmartDataGrid
      tableId="smartpm-pms-overview"
      columns={columns}
      rows={rows}
      rowKey={(order) => `${order.SiteId}:${order.ScheduleId}`}
      onRowClick={onOpen}
      countLabel="PMS schedules"
      emptyText="No PM orders match these filters."
      leading={{
        width: 48,
        header: <input type="checkbox" aria-label="Select all filtered PMS orders" checked={allSelected}
          onChange={(e) => onSelect(e.target.checked ? [...new Set([...selected, ...rows.map((order) => order.ScheduleId)])] : selected.filter((id) => !rows.some((order) => order.ScheduleId === id)))} />,
        cell: (order) => <input type="checkbox" aria-label={`Select PMS ${order.ScheduleId}`} checked={selected.includes(order.ScheduleId)}
          onChange={(e) => onSelect(e.target.checked ? [...selected, order.ScheduleId] : selected.filter((id) => id !== order.ScheduleId))} />,
      }}
    />
  </section>;
}
