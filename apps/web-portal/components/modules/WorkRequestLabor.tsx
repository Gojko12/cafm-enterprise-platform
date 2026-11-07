"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { BaseWorkRequest, CraftpersonAbsence, LocationFreeze } from "@cafm/shared-schema";
import type { DemoData } from "../../lib/cafm-data";
import { OverviewTable } from "../common/TableColumns";
import { assignmentAbsences, intervalFor, unassignPerson, wallMinutes } from "../../lib/dispatch";
import { getActiveFreezeConflictsForWR } from "../../lib/location-freezes";
import { tradeColor } from "../../lib/trade-colors";

type Person = DemoData["craftspeople"][number];
export function WorkRequestLabor({ wr, people, absences, freezes, update, onClose }: {
  wr: BaseWorkRequest; people: Person[]; absences: CraftpersonAbsence[]; freezes: LocationFreeze[];
  update: (change: (wr: BaseWorkRequest) => BaseWorkRequest, log?: string) => void; onClose: () => void;
}) {
  const router = useRouter();
  const ids = [...new Set([...wr.AssignedCraftpersonIds, ...(wr.CraftpersonLabor ?? []).map((item) => item.craftpersonId)])];
  const rows = ids.map((id) => {
    const person = people.find((item) => item.id === id);
    const labor = wr.CraftpersonLabor?.find((item) => item.craftpersonId === id);
    const interval = intervalFor(wr, id);
    return { id, person, labor, interval, name: labor?.name ?? person?.Name ?? id, lastName: labor?.lastName ?? person?.LastName ?? "" };
  });
  const updateLabor = (row: typeof rows[number], field: "hourlyRate" | "workingTimeMinutes", value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    update((current) => {
      const previous = current.CraftpersonLabor?.find((item) => item.craftpersonId === row.id) ?? { craftpersonId: row.id, name: row.name, lastName: row.lastName, hourlyRate: row.person?.HourlyRate ?? 0, workingTimeMinutes: 0 };
      return { ...current, CraftpersonLabor: [...(current.CraftpersonLabor ?? []).filter((item) => item.craftpersonId !== row.id), { ...previous, [field]: value }] };
    }, `Labor ${field} updated for ${row.id}`);
  };
  const columns = [
    { id: "name", label: "Name", value: (row: typeof rows[number]) => row.name },
    { id: "last", label: "LastName", value: (row: typeof rows[number]) => row.lastName },
    { id: "trade", label: "Trade", value: (row: typeof rows[number]) => row.person?.Trade, render: (row: typeof rows[number]) => <span className={`rounded border px-1 ${tradeColor(row.person?.Trade)}`}>{row.person?.Trade ?? "—"}</span> },
    { id: "shift", label: "Shift", value: (row: typeof rows[number]) => row.person?.shiftStart ? `${row.person.shiftStart}–${row.person.shiftEnd}` : "Standard" },
    { id: "start", label: "Planned Start", value: (row: typeof rows[number]) => row.interval?.assignedStartDateTime },
    { id: "end", label: "Planned End", value: (row: typeof rows[number]) => row.interval?.assignedEndDateTime },
    { id: "hours", label: "Planned Duration (h)", value: (row: typeof rows[number]) => row.interval ? (wallMinutes(row.interval.assignedEndDateTime) - wallMinutes(row.interval.assignedStartDateTime)) / 60 : undefined },
    { id: "actual", label: "Actual time (h/min)", value: (row: typeof rows[number]) => row.labor?.workingTimeMinutes ?? 0, render: (row: typeof rows[number]) => <span><input aria-label={`Actual minutes ${row.name}`} type="number" min="0" value={row.labor?.workingTimeMinutes ?? 0} onChange={(event) => updateLabor(row, "workingTimeMinutes", Number(event.target.value))} className="w-16 border" /> min ({Math.floor((row.labor?.workingTimeMinutes ?? 0) / 60)}h {(row.labor?.workingTimeMinutes ?? 0) % 60}m)</span> },
    { id: "rate", label: "Hourly Rate EUR/h", value: (row: typeof rows[number]) => row.labor?.hourlyRate ?? row.person?.HourlyRate ?? 0, render: (row: typeof rows[number]) => <input aria-label={`Hourly rate ${row.name}`} type="number" min="0" step="0.01" value={row.labor?.hourlyRate ?? row.person?.HourlyRate ?? 0} onChange={(event) => updateLabor(row, "hourlyRate", Number(event.target.value))} className="w-20 border" /> },
    { id: "cost", label: "Est. Cost EUR", value: (row: typeof rows[number]) => row.interval ? ((wallMinutes(row.interval.assignedEndDateTime) - wallMinutes(row.interval.assignedStartDateTime)) / 60 * (row.labor?.hourlyRate ?? row.person?.HourlyRate ?? 0)).toFixed(2) : "" },
    { id: "warnings", label: "Status / Warnings", value: (row: typeof rows[number]) => !wr.AssignedCraftpersonIds.includes(row.id) ? "Unassigned (labor retained)" : !row.interval ? "Unscheduled" : [getActiveFreezeConflictsForWR({ ...wr, AssignedCraftpersonIds: [row.id], CraftpersonAssignments: [row.interval], StartDate_DateToPerform: undefined }, freezes).length ? "❄ Freeze" : "", assignmentAbsences(absences, wr.SiteId, row.interval).length ? "🏖 Leave Conflict" : "", "Scheduled"].filter(Boolean).join(" · ") },
    { id: "actions", label: "Actions", value: () => "", render: (row: typeof rows[number]) => <span className="flex flex-col items-start whitespace-normal"><button disabled={!row.interval} onClick={() => { if (!row.interval) return; const query = new URLSearchParams({ focusWrId: wr.WR_ID, focusCraftpersonId: row.id, focusStart: row.interval.assignedStartDateTime, isolateWr: "true" }); onClose(); router.push(`/scheduler?${query}`); }}>📍 Show in Calendar</button>{wr.AssignedCraftpersonIds.includes(row.id) && <button onClick={() => { if (window.confirm(`Unassign ${row.name} ${row.lastName}?`)) update((current) => unassignPerson(current, row.id), `Unassigned ${row.id}`); }}>✕ Unassign</button>}</span> },
  ];
  return <OverviewTable preferenceKey="wr-labor" columns={columns} rows={rows} rowKey={(row) => row.id} />;
}
