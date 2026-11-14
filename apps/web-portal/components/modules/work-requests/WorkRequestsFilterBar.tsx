"use client";

import React from "react";
import type { WR_Type } from "@cafm/shared-schema";
import { LocationEquipmentPickerGroup } from "@/components/common/LocationEquipmentPickerGroup";
import { DateInputDDMMYYYY } from "@/components/common/DateInputDDMMYYYY";
import { isDissatisfied } from "@/lib/fj-satisfaction";
import { isInPmQueue, PM_QUEUE_BUCKETS } from "./useWorkRequestsQueue";
import type { WorkRequestsQueue, WrSignalFilter } from "./useWorkRequestsQueue";

/** Signal filter pills; execution signals stay hidden on `Issued PM WRs` and `Canceled PM WRs`. */
export function WorkRequestSignalFilters({ queue, requestType }: { queue: WorkRequestsQueue; requestType: WR_Type }) {
  const { signalFilter, setSignalFilter, scopedRequests, hasSignal, signalsHidden } = queue;
  const options = ([
    ...(signalsHidden ? [] : [["unfavourable", "⚠ Unfavourable Checklist"]]),
    ...(requestType === "PM" && !signalsHidden ? [["incomplete-checklist", "⚠ Incomplete Checklist"]] : []),
    ...(requestType === "PM" && !signalsHidden ? [["follow-up", "🔧 Has Follow-Up FJ"]] : []),
    ...(requestType === "FJ" ? [["parent", "🔗 PM Follow-Ups Only"]] : []),
  ] as Array<[WrSignalFilter, string]>);
  if (!options.length) return null;
  return <div className="flex flex-wrap gap-2 text-xs">
    {options.map(([signal, label]) => <button key={signal} type="button" aria-pressed={signalFilter === signal}
      className={`rounded-lg border px-2 py-1 font-semibold ${signalFilter === signal ? "border-blue-600 bg-blue-100 text-blue-900" : "bg-white"}`}
      onClick={() => setSignalFilter(signalFilter === signal ? null : signal)}>{label} ({scopedRequests.filter((wr) => hasSignal(wr, signal)).length})</button>)}
  </div>;
}

export function WorkRequestsFilterBar({ queue, requestType }: { queue: WorkRequestsQueue; requestType: WR_Type }) {
  const {
    permissions, isFilterExpanded, setFilterExpanded, columnFilterCount, textFilter, setTextFilter,
    view, setView, locationFilter, setLocationFilter, selectedEquipmentCodes, setSelectedEquipmentCodes,
    dueDateFrom, setDueDateFrom, dueDateTo, setDueDateTo, resetFilters,
    siteBuildings, siteFloors, siteRooms, siteEquipment, handleCreateLJ, setFastJobOpen,
    bucket, setBucket, fjView, setFjView, groupLJ, setGroupLJ, siteRequests, teamQueue, setTeamQueue, currentRole,
  } = queue;
  return <>
    <section className="bg-white border rounded-lg">
      <div className="min-h-10 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {requestType === "LJ" && <button disabled={!permissions?.canCreateLJ} onClick={handleCreateLJ} className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-40">+ Create LJ</button>}
          {requestType === "FJ" && <button disabled={!permissions?.canCreateFJ} onClick={() => setFastJobOpen(true)} className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-40">+ Create FJ</button>}
          <button type="button" aria-expanded={isFilterExpanded} onClick={() => setFilterExpanded(!isFilterExpanded)} className="font-semibold whitespace-nowrap">
            {isFilterExpanded ? "▼" : "▶"} Filter Work Requests <span className="rounded-full bg-blue-100 px-2">{columnFilterCount + [!!locationFilter.building, !!locationFilter.floor, !!locationFilter.room, selectedEquipmentCodes.length > 0, !!textFilter.trim(), !!dueDateFrom, !!dueDateTo].filter(Boolean).length}</span>
          </button>
          <input value={textFilter} onChange={(event) => setTextFilter(event.target.value)} placeholder="Quick search" aria-label="Search work requests" className="min-w-0 w-40 rounded border px-2 py-1" />
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={`rounded px-2 py-1 ${view === "grid" ? "bg-blue-600 text-white" : "border"}`}>Data Grid</button>
          <button type="button" aria-pressed={view === "card"} onClick={() => setView("card")} className={`rounded px-2 py-1 ${view === "card" ? "bg-blue-600 text-white" : "border"}`}>Card View</button>
          <button type="button" onClick={resetFilters} className="px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Reset Filter</button>
        </div>
      </div>
      {isFilterExpanded && <div className="space-y-2 border-t p-3 text-xs">
        <LocationEquipmentPickerGroup
          compact
          buildings={siteBuildings}
          floors={siteFloors}
          rooms={siteRooms}
          equipment={siteEquipment}
          selectedBuilding={locationFilter.building}
          selectedFloor={locationFilter.floor}
          selectedRoom={locationFilter.room}
          selectedEquipmentCodes={selectedEquipmentCodes}
          onLocationChange={setLocationFilter}
          onEquipmentChange={setSelectedEquipmentCodes}
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="text-sm text-gray-600">
            Due From
            <DateInputDDMMYYYY value={dueDateFrom} onValueChange={setDueDateFrom} className="mt-1 block w-full px-3 py-2 border rounded" aria-label="Due date from" />
          </label>
          <label className="text-sm text-gray-600">
            Due To
            <DateInputDDMMYYYY value={dueDateTo} onValueChange={setDueDateTo} className="mt-1 block w-full px-3 py-2 border rounded" aria-label="Due date to" />
          </label>
        </div>
      </div>}
    </section>

    {currentRole === "TeamLeader" && requestType !== "LJ" && (
      <button type="button" className="block w-full text-left bg-blue-50 border border-blue-200 rounded p-4"
        onClick={() => { if (requestType === "PM") setBucket("inspection"); else setTeamQueue(!teamQueue); }}>
        <strong>Team Leader Checklist &amp; WR Overview</strong>
        <span className="block text-sm">Review {siteRequests.filter((wr) => wr.Percentage === 78).length} technically completed {requestType} work requests.</span>
      </button>
    )}
    {requestType === "PM" && <div className="flex flex-wrap gap-2">
      {PM_QUEUE_BUCKETS.map((item) => <button key={item.id} onClick={() => setBucket(item.id)}
        aria-pressed={bucket === item.id}
        className={`px-3 py-2 rounded text-sm ${bucket === item.id ? "bg-blue-100 text-blue-900" : "bg-white border"}`}>
        {item.label} ({siteRequests.filter((wr) => isInPmQueue(wr, item.id)).length})
      </button>)}
    </div>}
    {requestType === "FJ" && <div className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={fjView === "all"} onClick={() => setFjView("all")} className={`px-3 py-2 rounded text-sm ${fjView === "all" ? "bg-blue-100 text-blue-900" : "bg-white border"}`}>All FJs</button>
      <button type="button" aria-pressed={fjView === "dissatisfied"} onClick={() => setFjView("dissatisfied")} className={`px-3 py-2 rounded text-sm ${fjView === "dissatisfied" ? "bg-red-100 text-red-900" : "bg-white border"}`}>Dissatisfaction Feedback ({siteRequests.filter((wr) => isDissatisfied(wr)).length})</button>
    </div>}
    {requestType === "LJ" && <div className="flex gap-2 text-xs">
      <button aria-pressed={groupLJ} onClick={() => setGroupLJ(true)} className="rounded border px-2 py-1">Group by Substatus</button>
      <button aria-pressed={!groupLJ} onClick={() => setGroupLJ(false)} className="rounded border px-2 py-1">Flat List</button>
    </div>}
  </>;
}
