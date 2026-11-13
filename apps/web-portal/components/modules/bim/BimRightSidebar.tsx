"use client";

import React from "react";
import type { useRouter } from "next/navigation";
import * as THREE from "three";
import { Crosshair, Plus, Search, X } from "lucide-react";
import { formatDateDDMMYYYY } from "@cafm/shared-schema";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { formatFreezePeriodWindow } from "@/lib/location-freezes";
import type { BimElement, BimSpace, MissingSyncItems } from "@/lib/ifc-cafm-bridge";
import type { BimModelIndex } from "@/lib/ifc-cafm-bridge";
import { BimFilterPanel } from "./BimFilterPanel";
import { BimHandoverAuditPanel } from "./BimHandoverAuditPanel";
import {
  COLOR_EMERALD, ROOM_LEVEL_COLOR, displayName,
  type BimElementClassification, type BimLinkMap, type BimTab, type CafmData, type FastJobLocation, type FastJobPrefill, type IsolateTarget, type RoomHealth, type SetState,
} from "./bim-viewport-math";

export interface BimRightSidebarProps {
  selection: number | null;
  setSelection: SetState<number | null>;
  roomSelection: number | null;
  setRoomSelection: SetState<number | null>;
  isolate: IsolateTarget;
  setIsolate: SetState<IsolateTarget>;
  tab: BimTab;
  setTab: SetState<BimTab>;
  search: string;
  setSearch: SetState<string>;
  sidebarListRef: React.MutableRefObject<HTMLDivElement | null>;
  linkedRows: BimElement[];
  unassignedRows: BimElement[];
  roomRows: BimSpace[];
  links: BimLinkMap;
  statusColorByCode: Map<string, number>;
  roomHealth: Map<number, RoomHealth>;
  selectedElement: BimElement | null;
  selectedSpace: BimSpace | null;
  selectedRoomHealth: RoomHealth | null;
  selectedLink: BimLinkMap extends Map<number, infer L> ? L | null : never;
  selectedEquipment: CafmData["equipment"][number] | null;
  selectedOpenWRs: BaseWorkRequest[];
  selectedSchedules: CafmData["schedules"];
  roomElements: BimElement[];
  roomSchedules: CafmData["schedules"];
  assignOpen: boolean;
  setAssignOpen: SetState<boolean>;
  assignQuery: string;
  setAssignQuery: SetState<string>;
  assignCandidates: CafmData["equipment"];
  busy: boolean;
  data: CafmData;
  buildingId: string;
  router: ReturnType<typeof useRouter>;
  setWrPopup: SetState<BaseWorkRequest | null>;
  openFastJob: (prefill: FastJobPrefill, location: FastJobLocation) => void;
  index: BimModelIndex | null;
  missing: MissingSyncItems | null;
  classificationByExpressId: Map<number, BimElementClassification>;
  multiSelection: number[];
  setMultiSelection: SetState<number[]>;
  ghostRest: boolean;
  setGhostRest: SetState<boolean>;
  fitMultiSelection: () => void;
  syncIfcSpecs: (element: BimElement, equipmentCode: string) => void;
  spaceWorldBox: (expressId: number) => THREE.Box3 | null;
  flyToRoom: (expressId: number) => void;
  selectAndFly: (expressId: number) => void;
  selectRoom: (expressId: number, fly: boolean) => void;
  isolateTarget: (kind: "element" | "room", expressId: number, label: string) => void;
  assignExisting: (element: BimElement, equipmentCode: string) => Promise<void>;
  unassign: (element: BimElement) => Promise<void>;
  createNewEquipment: (element: BimElement) => Promise<void>;
}

export function BimRightSidebar({
  selection, setSelection, roomSelection, setRoomSelection, isolate, setIsolate, tab, setTab, search, setSearch, sidebarListRef, linkedRows, unassignedRows, roomRows, links, statusColorByCode, roomHealth, selectedElement, selectedSpace, selectedRoomHealth, selectedLink, selectedEquipment, selectedOpenWRs, selectedSchedules, roomElements, roomSchedules, assignOpen, setAssignOpen, assignQuery, setAssignQuery, assignCandidates, busy, data, buildingId, router, setWrPopup, openFastJob, index, missing, classificationByExpressId, multiSelection, setMultiSelection, ghostRest, setGhostRest, fitMultiSelection, syncIfcSpecs, spaceWorldBox, flyToRoom, selectAndFly, selectRoom, isolateTarget, assignExisting, unassign, createNewEquipment,
}: BimRightSidebarProps) {
  return (
    <>
        {/* Right Sidebar */}
        <div className="w-[26rem] flex flex-col rounded-lg border border-gray-300 bg-white shadow-lg overflow-hidden">
          <div className="border-b border-gray-200 p-2 space-y-2">
            <div className="flex rounded border border-gray-300 overflow-hidden text-xs font-medium">
              <button onClick={() => setTab("linked")} aria-pressed={tab === "linked"} className={`flex-1 px-1.5 py-1.5 ${tab === "linked" ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"}`}>Linked ({linkedRows.length})</button>
              <button onClick={() => setTab("unassigned")} aria-pressed={tab === "unassigned"} className={`flex-1 px-1.5 py-1.5 ${tab === "unassigned" ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"}`}>Unassigned ({unassignedRows.length})</button>
              <button onClick={() => setTab("rooms")} aria-pressed={tab === "rooms"} className={`flex-1 px-1.5 py-1.5 ${tab === "rooms" ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"}`}>Rooms ({roomRows.length})</button>
              <button onClick={() => setTab("filter")} aria-pressed={tab === "filter"} className={`flex-1 px-1.5 py-1.5 ${tab === "filter" ? "bg-pink-600 text-white" : "bg-white hover:bg-gray-100"}`}>Filter{multiSelection.length ? ` (${multiSelection.length})` : ""}</button>
              <button onClick={() => setTab("audit")} aria-pressed={tab === "audit"} className={`flex-1 px-1.5 py-1.5 ${tab === "audit" ? "bg-emerald-700 text-white" : "bg-white hover:bg-gray-100"}`}>Audit</button>
            </div>
            {["linked", "unassigned", "rooms"].includes(tab) && (
              <div className="relative">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search elements, EQ IDs, rooms…" className="w-full rounded border border-gray-300 pl-7 pr-2 py-1.5 text-xs" />
              </div>
            )}
          </div>

          {tab === "filter" && (
            <BimFilterPanel
              index={index}
              classificationByExpressId={classificationByExpressId}
              links={links}
              multiSelection={multiSelection}
              setMultiSelection={setMultiSelection}
              ghostRest={ghostRest}
              setGhostRest={setGhostRest}
              fitMultiSelection={fitMultiSelection}
              selectAndFly={selectAndFly}
            />
          )}
          {tab === "audit" && (
            <BimHandoverAuditPanel
              data={data}
              buildingId={buildingId}
              index={index}
              links={links}
              missing={missing}
              selectedElement={selectedElement}
              selectedIsLinked={!!selectedLink}
              busy={busy}
              assignExisting={assignExisting}
              selectAndFly={selectAndFly}
            />
          )}

          {/* Element list */}
          {["linked", "unassigned", "rooms"].includes(tab) && (
          <div ref={sidebarListRef} className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {tab === "linked" && linkedRows.map((element) => {
              const link = links.get(element.expressId)!;
              const color = statusColorByCode.get(link.equipmentCode) ?? COLOR_EMERALD;
              return (
                <button key={element.expressId} onClick={() => selectAndFly(element.expressId)}
                  className={`block w-full px-3 py-2 text-left text-xs hover:bg-blue-50 ${selection === element.expressId ? "bg-blue-100" : ""}`}>
                  <span className="font-semibold text-gray-900 flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: `#${color.toString(16).padStart(6, "0")}` }} />
                    {link.equipmentCode} · {displayName(element)}
                  </span>
                  <span className="text-gray-500">{element.storeyName}{element.roomCode ? ` · ${element.roomCode}` : ""}{link.source === "mark" ? " · Revit Mark" : " · In-app link"}</span>
                </button>
              );
            })}
            {tab === "unassigned" && unassignedRows.map((element) => (
              <button key={element.expressId} onClick={() => selectAndFly(element.expressId)}
                className={`block w-full px-3 py-2 text-left text-xs hover:bg-violet-50 ${selection === element.expressId ? "bg-violet-100" : ""}`}>
                <span className="font-semibold text-gray-900">{displayName(element)}</span>
                <span className="block text-gray-500">{element.ifcType}{element.category ? ` · ${element.category}` : ""} · {element.storeyName}{element.roomCode ? ` · ${element.roomCode}` : ""}</span>
              </button>
            ))}
            {tab === "rooms" && roomRows.map((space) => {
              const level = roomHealth.get(space.expressId)?.level ?? "clear";
              const dot = level === "clear" ? "#10b981" : `#${ROOM_LEVEL_COLOR[level].toString(16).padStart(6, "0")}`;
              const active = roomSelection === space.expressId;
              return (
                <button key={space.expressId} data-room-id={space.expressId} onClick={() => selectRoom(space.expressId, true)}
                  aria-pressed={active}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                    event.preventDefault();
                    const sibling = (event.key === "ArrowDown" ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling) as HTMLElement | null;
                    sibling?.focus();
                  }}
                  className={`block w-full px-3 py-2 text-left text-xs hover:bg-cyan-50 focus:outline-none focus:bg-cyan-50 ${active ? "bg-cyan-100 border-l-4 border-cyan-600" : ""}`}>
                  <span className="font-semibold text-gray-900 flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />
                    {space.code}
                  </span>
                  <span className="block text-gray-500">{space.longName} · {space.storeyName}</span>
                </button>
              );
            })}
            {tab === "linked" && !linkedRows.length && <p className="p-3 text-xs text-gray-500">No linked equipment in this view.</p>}
            {tab === "unassigned" && !unassignedRows.length && <p className="p-3 text-xs text-gray-500">Every MEP element has an EQ ID. 🎉</p>}
            {tab === "rooms" && !roomRows.length && <p className="p-3 text-xs text-gray-500">No IfcSpace rooms detected.</p>}
          </div>
          )}

          {/* Selected Element Action Card */}
          {selectedElement && (
            <div className="border-t border-gray-300 bg-gray-50 p-3 space-y-2 text-xs max-h-[45%] overflow-y-auto">
              <div className="flex items-start justify-between">
                <strong className="text-sm text-gray-900">{selectedLink ? `${selectedLink.equipmentCode} · ` : ""}{displayName(selectedElement)}</strong>
                <button aria-label="Clear selection" onClick={() => setSelection(null)}><X size={14} /></button>
              </div>
              <p className="text-gray-600">
                {selectedElement.ifcType}{selectedElement.category ? ` · ${selectedElement.category}` : ""}<br />
                {selectedEquipment
                  ? <>Location: {selectedEquipment.bl_id} &gt; {selectedEquipment.LevelName} &gt; {selectedEquipment.RoomCode}</>
                  : <>Storey: {selectedElement.storeyName || "—"} · Room: {selectedElement.roomCode || "—"}</>}<br />
                IfcGlobalId: <span className="font-mono">{selectedElement.globalId}</span>
              </p>
              <button onClick={() => isolateTarget("element", selectedElement.expressId, selectedLink?.equipmentCode ?? displayName(selectedElement))}
                aria-pressed={isolate?.kind === "element" && isolate.expressId === selectedElement.expressId}
                className={`w-full rounded border px-2 py-1.5 font-semibold ${isolate?.kind === "element" && isolate.expressId === selectedElement.expressId ? "border-cyan-600 bg-cyan-600 text-white" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100"}`}>
                {isolate?.kind === "element" && isolate.expressId === selectedElement.expressId ? "Clear Isolation Box" : "Isolate Box"}
              </button>

              {!selectedLink && selectedElement.isAssignable && (
                <div className="space-y-1.5">
                  {!assignOpen
                    ? (
                      <div className="flex gap-1.5">
                        <button onClick={() => setAssignOpen(true)} disabled={busy} className="flex-1 rounded bg-blue-600 px-2 py-1.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                          Assign Existing EQ ID
                        </button>
                        <button onClick={() => void createNewEquipment(selectedElement)} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-emerald-600 px-2 py-1.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                          <Plus size={12} /> Create New CAFM Equipment
                        </button>
                      </div>
                    )
                    : (
                      <div className="rounded border border-blue-300 bg-white p-2 space-y-1.5">
                        <input autoFocus value={assignQuery} onChange={(event) => setAssignQuery(event.target.value)} placeholder="Search equipment code or name…" className="w-full rounded border border-gray-300 px-2 py-1" />
                        <div className="max-h-28 overflow-y-auto divide-y divide-gray-100">
                          {assignCandidates.slice(0, 50).map((asset) => (
                            <button key={asset.EquipmentCode} onClick={() => void assignExisting(selectedElement, asset.EquipmentCode)} disabled={busy}
                              className="block w-full px-1.5 py-1 text-left hover:bg-blue-50 disabled:opacity-50">
                              <span className="font-semibold">{asset.EquipmentCode}</span> · {asset.EquipmentName}
                            </button>
                          ))}
                          {!assignCandidates.length && <p className="px-1.5 py-1 text-gray-500">No equipment matches.</p>}
                        </div>
                        <button onClick={() => setAssignOpen(false)} className="text-gray-600 underline">Cancel</button>
                      </div>
                    )}
                </div>
              )}

              {selectedLink && (
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    <button onClick={() => { setAssignOpen(true); }} disabled={busy} className="flex-1 rounded border border-blue-400 bg-white px-2 py-1.5 font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                      Change EQ ID
                    </button>
                    <button onClick={() => void unassign(selectedElement)} disabled={busy} className="flex-1 rounded border border-red-300 bg-white px-2 py-1.5 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                      Unassign EQ ID
                    </button>
                  </div>
                  {assignOpen && (
                    <div className="rounded border border-blue-300 bg-white p-2 space-y-1.5">
                      <input autoFocus value={assignQuery} onChange={(event) => setAssignQuery(event.target.value)} placeholder="Search equipment code or name…" className="w-full rounded border border-gray-300 px-2 py-1" />
                      <div className="max-h-28 overflow-y-auto divide-y divide-gray-100">
                        {assignCandidates.slice(0, 50).map((asset) => (
                          <button key={asset.EquipmentCode} onClick={() => void assignExisting(selectedElement, asset.EquipmentCode)} disabled={busy}
                            className="block w-full px-1.5 py-1 text-left hover:bg-blue-50 disabled:opacity-50">
                            <span className="font-semibold">{asset.EquipmentCode}</span> · {asset.EquipmentName}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setAssignOpen(false)} className="text-gray-600 underline">Cancel</button>
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-gray-800">Open WRs ({selectedOpenWRs.length})</p>
                    {selectedOpenWRs.length
                      ? selectedOpenWRs.map((wr) => (
                        <button key={wr.WR_ID} onClick={() => setWrPopup(wr)} className="block w-full rounded px-1.5 py-1 text-left hover:bg-blue-50">
                          <span className="font-medium text-blue-700 underline">{wr.WR_ID}</span> · {wr.WR_Type} · {wr.Percentage}% · Due {formatDateDDMMYYYY(wr.DueDate) || "—"}
                        </button>
                      ))
                      : <p className="text-gray-500">No open work requests.</p>}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">SmartPM Schedules ({selectedSchedules.length})</p>
                    {selectedSchedules.length
                      ? selectedSchedules.map((schedule) => (
                        <p key={schedule.ScheduleId} className="px-1.5 py-0.5 text-gray-700">
                          PMS {schedule.ScheduleId} · {schedule.ChecklistCode} · Next Occurrence {formatDateDDMMYYYY(schedule.NextDueDate) || "—"}
                        </p>
                      ))
                      : <p className="text-gray-500">No SmartPM schedules target this equipment.</p>}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => syncIfcSpecs(selectedElement, selectedLink.equipmentCode)} disabled={busy} className="flex-1 rounded border border-indigo-400 bg-indigo-50 px-2 py-1.5 font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                      title="Copy IFC Class, Type/Family, Manufacturer, Storey and BBox dimensions into this asset's Technical Specifications">
                      Sync IFC Metadata → CAFM Specs
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => openFastJob(
                      { equipmentCode: selectedLink.equipmentCode, spotLabel: `${selectedLink.equipmentCode} · ${displayName(selectedElement)}` },
                      selectedEquipment ? { bl_id: selectedEquipment.bl_id, levelName: selectedEquipment.LevelName, roomCode: selectedEquipment.RoomCode } : null,
                    )} className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-amber-600 px-2 py-1.5 font-semibold text-white hover:bg-amber-700">
                      <Plus size={12} /> + Fast Job
                    </button>
                    <button onClick={() => router.push(`/equipment?eq=${encodeURIComponent(selectedLink.equipmentCode)}`)} className="flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 font-semibold text-gray-800 hover:bg-gray-100">
                      Open in Equipment Registry
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Selected Room Inspector Card */}
          {selectedSpace && !selectedElement && (() => {
            const box = spaceWorldBox(selectedSpace.expressId);
            const size = box ? box.getSize(new THREE.Vector3()) : null;
            const cafmRoom = data.rooms.find((room) => room.bl_id === buildingId && room.RoomCode === selectedSpace.code);
            const isolated = isolate?.kind === "room" && isolate.expressId === selectedSpace.expressId;
            const freezes = selectedRoomHealth?.freezes ?? [];
            const openWrs = selectedRoomHealth?.wrs ?? [];
            return (
              <div className="border-t border-gray-300 bg-gray-50 p-3 space-y-2 text-xs max-h-[55%] overflow-y-auto">
                <div className="flex items-start justify-between">
                  <strong className="text-sm text-gray-900">{selectedSpace.code}{selectedSpace.longName ? ` · ${selectedSpace.longName}` : ""}</strong>
                  <button aria-label="Clear room selection" onClick={() => { setRoomSelection(null); if (isolate?.kind === "room") setIsolate(null); }}><X size={14} /></button>
                </div>
                <p className="text-gray-600">
                  Storey: {selectedSpace.storeyName || "—"}<br />
                  {size
                    ? <>Dimensions: {size.x.toFixed(1)} × {size.z.toFixed(1)} × {size.y.toFixed(1)} m · Est. floor area {(size.x * size.z).toFixed(1)} m²<br /></>
                    : <>Dimensions: —<br /></>}
                  IfcGlobalId: <span className="font-mono">{selectedSpace.globalId}</span>
                </p>
                {freezes.map((freeze) => (
                  <span key={freeze.id ?? freeze.title} className="block rounded border border-cyan-400 bg-cyan-50 px-2 py-1 font-medium text-cyan-900">
                    ❄ Active Freeze: {freeze.title} · {formatFreezePeriodWindow(freeze.startDateTime, freeze.endDateTime)}
                  </span>
                ))}
                <div className="flex gap-1.5">
                  <button onClick={() => isolateTarget("room", selectedSpace.expressId, selectedSpace.code)} aria-pressed={isolated}
                    className={`flex-1 rounded border px-2 py-1.5 font-semibold ${isolated ? "border-cyan-600 bg-cyan-600 text-white" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100"}`}>
                    {isolated ? "Clear Room Box" : "Isolate Room Box"}
                  </button>
                  <button onClick={() => flyToRoom(selectedSpace.expressId)} className="flex-1 inline-flex items-center justify-center gap-1 rounded border border-gray-300 bg-white px-2 py-1.5 font-semibold text-gray-800 hover:bg-gray-100">
                    <Crosshair size={12} /> Fit Room
                  </button>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Equipment in Room ({roomElements.length})</p>
                  <div className="max-h-24 overflow-y-auto divide-y divide-gray-100 rounded border border-gray-200 bg-white">
                    {roomElements.map((element) => {
                      const link = links.get(element.expressId);
                      return (
                        <button key={element.expressId} onClick={() => selectAndFly(element.expressId)} className="block w-full px-1.5 py-1 text-left hover:bg-blue-50">
                          <span className="font-semibold">{link ? link.equipmentCode : "Unassigned"}</span> · {displayName(element)}
                        </button>
                      );
                    })}
                    {!roomElements.length && <p className="px-1.5 py-1 text-gray-500">No equipment located in this room.</p>}
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Open WRs &amp; Schedules in Room ({openWrs.length + roomSchedules.length})</p>
                  {openWrs.map((wr) => (
                    <button key={wr.WR_ID} onClick={() => setWrPopup(wr)} className="block w-full rounded px-1.5 py-1 text-left hover:bg-blue-50">
                      <span className="font-medium text-blue-700 underline">{wr.WR_ID}</span> · {wr.WR_Type} · {wr.Percentage}% · Due {formatDateDDMMYYYY(wr.DueDate) || "—"}
                    </button>
                  ))}
                  {roomSchedules.map((schedule) => (
                    <p key={schedule.ScheduleId} className="px-1.5 py-0.5 text-gray-700">
                      PMS {schedule.ScheduleId} · {schedule.ChecklistCode} · Next {formatDateDDMMYYYY(schedule.NextDueDate) || "—"}
                    </p>
                  ))}
                  {!openWrs.length && !roomSchedules.length && <p className="text-gray-500">No open work requests or schedules.</p>}
                </div>
                <button
                  onClick={() => openFastJob(
                    { spotLabel: `Room ${selectedSpace.code}` },
                    { bl_id: buildingId, levelName: cafmRoom?.LevelName ?? selectedSpace.storeyName, roomCode: selectedSpace.code },
                  )}
                  className="w-full inline-flex items-center justify-center gap-1 rounded bg-amber-600 px-2 py-1.5 font-semibold text-white hover:bg-amber-700">
                  <Plus size={12} /> + Fast Job in Room
                </button>
                <button
                  onClick={() => router.push(`/floor-plans?building=${encodeURIComponent(buildingId)}&floor=${encodeURIComponent(cafmRoom?.LevelName ?? selectedSpace.storeyName)}&room=${encodeURIComponent(selectedSpace.code)}`)}
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 font-semibold text-gray-800 hover:bg-gray-100">
                  🗺 Open in 2D Floor Plan
                </button>
              </div>
            );
          })()}
        </div>
    </>
  );
}
