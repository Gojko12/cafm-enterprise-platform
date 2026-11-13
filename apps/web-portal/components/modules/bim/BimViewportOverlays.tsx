"use client";

import React from "react";
import type * as THREE from "three";
import { Crosshair, RefreshCw, Zap } from "lucide-react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import type { BimDiscipline, BimModelIndex } from "@/lib/ifc-cafm-bridge";
import {
  ALL_STOREYS,
  type CameraView, type ColorMode, type DisciplineVisibility, type FjSpotPin, type FloorIsolation,
  type IsolateTarget, type IssuePin, type SetState, type StatusBucket, type StatusColorVisibility, type ViewportHealth,
} from "./bim-viewport-math";

const STATUS_ROWS: readonly { bucket: StatusBucket; color: string; label: string }[] = [
  { bucket: "overdue", color: "#dc2626", label: "Overdue WR / Unfavourable finding" },
  { bucket: "openWr", color: "#f59e0b", label: "Open 50% / 55% WR" },
  { bucket: "freeze", color: "#06b6d4", label: "Active Freeze Period" },
  { bucket: "healthy", color: "#10b981", label: "Linked & Healthy" },
  { bucket: "unassigned", color: "#8b5cf6", label: "Unassigned MEP element" },
];

const DISCIPLINE_PILLS: readonly { key: BimDiscipline; label: string }[] = [
  { key: "shell", label: "🏛 Shell" },
  { key: "hvac", label: "🌀 HVAC" },
  { key: "piping", label: "🚰 Piping/Sanitary" },
  { key: "electrical", label: "⚡ Electrical" },
];

export interface BimViewportOverlaysProps {
  viewportHealth: ViewportHealth;
  index: BimModelIndex | null;
  selection: number | null;
  roomSelection: number | null;
  isolate: IsolateTarget;
  setIsolate: SetState<IsolateTarget>;
  isolatePadding: number;
  setIsolatePadding: SetState<number>;
  measureMode: boolean;
  setMeasureMode: SetState<boolean>;
  measurePoints: THREE.Vector3[];
  setMeasurePoints: SetState<THREE.Vector3[]>;
  pinsOn: boolean;
  setPinsOn: SetState<boolean>;
  issuePins: IssuePin[];
  fjSpotPins: FjSpotPin[];
  onOpenFjPin: (wr: BaseWorkRequest) => void;
  pinFjMode: boolean;
  setPinFjMode: SetState<boolean>;
  canCreateFastJob: boolean;
  floorIsolation: FloorIsolation;
  onShowAllFloors: () => void;
  setOverlayEl: (key: string, element: HTMLElement | null) => void;
  setCameraView: (view: CameraView) => void;
  resetCamera: () => void;
  flyToElement: (expressId: number) => void;
  flyToRoom: (expressId: number) => void;
  selectAndFly: (expressId: number) => void;
  selectRoom: (expressId: number, fly: boolean) => void;
  storeyFilter: string;
  setStoreyFilter: SetState<string>;
  xray: boolean;
  setXray: SetState<boolean>;
  xrayOpacity: number;
  setXrayOpacity: SetState<number>;
  explodeGap: number;
  setExplodeGap: SetState<number>;
  clipEnabled: boolean;
  setClipEnabled: SetState<boolean>;
  clipPercent: number;
  setClipPercent: SetState<number>;
  colorMode: ColorMode;
  setColorMode: SetState<ColorMode>;
  showSpaces: boolean;
  setShowSpaces: SetState<boolean>;
  statusColorVisibility: StatusColorVisibility;
  setStatusColorVisibility: SetState<StatusColorVisibility>;
  disciplineVisibility: DisciplineVisibility;
  setDisciplineVisibility: SetState<DisciplineVisibility>;
}

export function BimViewportOverlays({
  viewportHealth, index, selection, roomSelection, isolate, setIsolate, isolatePadding, setIsolatePadding, measureMode, setMeasureMode, measurePoints, setMeasurePoints, pinsOn, setPinsOn, issuePins, fjSpotPins, onOpenFjPin, pinFjMode, setPinFjMode, canCreateFastJob, floorIsolation, onShowAllFloors, setOverlayEl, setCameraView, resetCamera, flyToElement, flyToRoom, selectAndFly, selectRoom, storeyFilter, setStoreyFilter, xray, setXray, xrayOpacity, setXrayOpacity, explodeGap, setExplodeGap, clipEnabled, setClipEnabled, clipPercent, setClipPercent, colorMode, setColorMode, showSpaces, setShowSpaces, statusColorVisibility, setStatusColorVisibility, disciplineVisibility, setDisciplineVisibility,
}: BimViewportOverlaysProps) {
  return (
    <>
          {viewportHealth && (
            <div className="absolute bottom-3 left-3 max-w-[70%] space-y-1 pointer-events-none">
              {viewportHealth.warning && (
                <div role="alert" className="rounded border border-amber-400 bg-amber-100/95 px-2 py-1 text-[11px] font-medium text-amber-900">
                  {viewportHealth.warning}
                </div>
              )}
              <div className="inline-block rounded-full bg-gray-900/80 px-2.5 py-1 text-[10px] text-gray-200 border border-gray-600">
                {viewportHealth.buildingId} · {viewportHealth.meshCount} meshes · {viewportHealth.size[0].toFixed(1)}×{viewportHealth.size[2].toFixed(1)}×{viewportHealth.size[1].toFixed(1)}m
              </div>
            </div>
          )}

          {/* Camera presets, Laser Measure, Issue Pins */}
          <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1 rounded-lg border border-gray-600 bg-gray-900/85 p-1 text-[11px] text-gray-100 shadow-lg">
            {([["iso", "3D Iso"], ["top", "Top Plan"], ["front", "Front"], ["right", "Right"]] as const).map(([view, label]) => (
              <button key={view} onClick={() => setCameraView(view)} className="rounded px-2 py-1 hover:bg-gray-700">{label}</button>
            ))}
            <span className="mx-0.5 h-4 w-px bg-gray-600" />
            <button onClick={() => { setMeasureMode((value) => !value); setMeasurePoints([]); }} aria-pressed={measureMode}
              className={`rounded px-2 py-1 ${measureMode ? "bg-yellow-500 text-gray-900 font-semibold" : "hover:bg-gray-700"}`}>Measure</button>
            <button onClick={() => setPinsOn((value) => !value)} aria-pressed={pinsOn}
              className={`rounded px-2 py-1 ${pinsOn ? "bg-red-600 text-white font-semibold" : "hover:bg-gray-700"}`}>Issue Pins</button>
            {canCreateFastJob && (
              <button onClick={() => setPinFjMode((value) => !value)} aria-pressed={pinFjMode}
                className={`rounded px-2 py-1 inline-flex items-center gap-1 ${pinFjMode ? "bg-amber-500 text-gray-900 font-semibold" : "hover:bg-gray-700"}`}>
                <Zap size={11} /> + Fast Job at Spot
              </button>
            )}
            <span className="mx-0.5 h-4 w-px bg-gray-600" />
            {DISCIPLINE_PILLS.map((pill) => (
              <button key={pill.key} aria-pressed={disciplineVisibility[pill.key]}
                onClick={() => setDisciplineVisibility((value) => ({ ...value, [pill.key]: !value[pill.key] }))}
                title={`Toggle the ${pill.label} discipline layer`}
                className={`rounded-full px-2 py-0.5 ${disciplineVisibility[pill.key] ? "bg-gray-200 text-gray-900 font-semibold" : "bg-gray-800 text-gray-500 line-through"}`}>
                {pill.label}
              </button>
            ))}
            {measurePoints.length > 0 && <button onClick={() => setMeasurePoints([])} className="rounded px-2 py-1 hover:bg-gray-700">Clear</button>}
          </div>

          {pinFjMode && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 rounded-full border border-amber-400 bg-amber-100/95 px-3 py-1 text-[11px] font-semibold text-amber-900 shadow-lg pointer-events-none">
              ⚡ Click any floor, ceiling, wall, or equipment to pin a Fast Job at that exact spot
            </div>
          )}

          {floorIsolation && storeyFilter === floorIsolation.storeyName && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full border border-cyan-400 bg-gray-900/90 px-3 py-1 text-[11px] text-cyan-100 shadow-lg">
              <span>🏢 Floor Isolated: {floorIsolation.storeyName} · Room {floorIsolation.roomCode}</span>
              <button onClick={onShowAllFloors} className="font-semibold underline hover:text-white">Show All Floors</button>
            </div>
          )}

          {isolate && (
            <div className="absolute top-14 left-3 flex items-center gap-2 rounded-full border border-cyan-500 bg-gray-900/90 px-3 py-1 text-[11px] text-cyan-100 shadow-lg">
              <span>Isolated: {isolate.label}</span>
              <label className="flex items-center gap-1">Padding {isolatePadding.toFixed(1)}m
                <input type="range" min={0.5} max={4} step={0.5} value={isolatePadding} onChange={(event) => setIsolatePadding(Number(event.target.value))} className="h-1 w-20 cursor-pointer" />
              </label>
              <button onClick={() => setIsolate(null)} className="font-semibold hover:text-white">× Clear</button>
            </div>
          )}

          {measurePoints.length === 2 && (() => {
            const delta = measurePoints[1].clone().sub(measurePoints[0]);
            const dist = delta.length();
            const horiz = Math.hypot(delta.x, delta.z);
            return (
              <div ref={(el) => setOverlayEl("measure", el)} className="absolute left-0 top-0 z-10 invisible -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-yellow-400 px-2 py-1 text-[11px] font-semibold text-gray-900 shadow-lg">
                {dist.toFixed(2)} m ({Math.round(dist * 1000)} mm) · ΔXY {horiz.toFixed(2)}m · ΔH {Math.abs(delta.y).toFixed(2)}m
                <button onClick={() => setMeasurePoints([])} className="ml-2 underline">Clear</button>
              </div>
            );
          })()}

          {pinsOn && issuePins.map((pin) => (
            <button key={pin.key} ref={(el) => setOverlayEl(pin.key, el)}
              onClick={() => (pin.kind === "element" ? selectAndFly(pin.expressId) : selectRoom(pin.expressId, true))}
              className="absolute left-0 top-0 z-10 invisible -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg ring-1 ring-white/70"
              style={{ background: `#${pin.color.toString(16).padStart(6, "0")}` }}>
              ● {pin.label}
            </button>
          ))}

          {pinsOn && fjSpotPins.map((spot) => (
            <button key={spot.key} ref={(el) => setOverlayEl(spot.key, el)}
              onClick={() => onOpenFjPin(spot.wr)}
              title={`${spot.wr.WR_ID} · ${spot.pin.spotLabel ?? spot.wr.Description}`}
              className="absolute left-0 top-0 z-10 invisible -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-gray-900 shadow-lg ring-1 ring-white/80 hover:bg-amber-400">
              ⚡ {spot.wr.WR_ID} · {spot.wr.Percentage}%
            </button>
          ))}

          {/* Viewport Controls Overlay */}
          <div className="absolute top-3 right-3 w-56 max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-gray-300 bg-white/95 p-3 shadow-lg space-y-2 text-xs">
            <div className="font-semibold text-gray-700 border-b pb-1.5">Viewport Controls</div>
            <div className="flex gap-1.5">
              <button onClick={resetCamera} className="flex-1 inline-flex items-center justify-center gap-1 rounded border border-gray-300 px-2 py-1 hover:bg-gray-100">
                <RefreshCw size={12} /> Reset Camera
              </button>
              <button onClick={() => { if (selection !== null) flyToElement(selection); else if (roomSelection !== null) flyToRoom(roomSelection); }} disabled={selection === null && roomSelection === null} className="flex-1 inline-flex items-center justify-center gap-1 rounded border border-gray-300 px-2 py-1 hover:bg-gray-100 disabled:opacity-40">
                <Crosshair size={12} /> Fit Selected
              </button>
            </div>
            <label className="block font-medium text-gray-700">
              Storey Filter
              <select value={storeyFilter} onChange={(event) => setStoreyFilter(event.target.value)} className="mt-1 w-full rounded border border-gray-300 px-1.5 py-1 bg-white">
                <option value={ALL_STOREYS}>{ALL_STOREYS}</option>
                {index?.storeys.map((storey) => <option key={storey.expressId} value={storey.name}>{storey.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-700">
              <input type="checkbox" checked={xray} onChange={(event) => setXray(event.target.checked)} className="rounded border-gray-300" />
              X-Ray Shell Mode
            </label>
            {xray && (
              <div>
                <label className="text-gray-600">Shell opacity: {xrayOpacity}%</label>
                <input type="range" min={0} max={85} step={5} value={xrayOpacity} onChange={(event) => setXrayOpacity(Number(event.target.value))} className="w-full h-1.5 cursor-pointer" />
              </div>
            )}
            <div>
              <label className="font-medium text-gray-700">Explode Storeys: {explodeGap}m</label>
              <input type="range" min={0} max={14} step={1} value={explodeGap} onChange={(event) => setExplodeGap(Number(event.target.value))} className="w-full h-1.5 cursor-pointer" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-700">
              <input type="checkbox" checked={clipEnabled} onChange={(event) => setClipEnabled(event.target.checked)} className="rounded border-gray-300" />
              Clipping Plane
            </label>
            {clipEnabled && (
              <div>
                <label className="text-gray-600">Section height: {clipPercent}%</label>
                <input type="range" min={0} max={100} value={clipPercent} onChange={(event) => setClipPercent(Number(event.target.value))} className="w-full h-1.5 cursor-pointer" />
              </div>
            )}
            <div className="font-medium text-gray-700">
              Color Mode
              <div className="mt-1 flex rounded border border-gray-300 overflow-hidden">
                <button onClick={() => setColorMode("bim")} aria-pressed={colorMode === "bim"} className={`flex-1 px-1.5 py-1 ${colorMode === "bim" ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"}`}>BIM Default</button>
                <button onClick={() => setColorMode("status")} aria-pressed={colorMode === "status"} className={`flex-1 px-1.5 py-1 ${colorMode === "status" ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"}`}>Live Status</button>
                <button onClick={() => { setColorMode("heatmap"); setXray(true); }} aria-pressed={colorMode === "heatmap"} className={`flex-1 px-1.5 py-1 ${colorMode === "heatmap" ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"}`}>Room Heatmap</button>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-700">
              <input type="checkbox" checked={showSpaces} onChange={(event) => setShowSpaces(event.target.checked)} className="rounded border-gray-300" />
              Show Room Volumes (IfcSpace)
            </label>
            {colorMode === "heatmap" && (
              <div className="border-t pt-1.5 space-y-0.5 text-[11px] text-gray-600">
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#dc2626" }} /> Overdue WR / Audit in room</p>
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#f59e0b" }} /> Open WR in room</p>
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#06b6d4" }} /> Active Freeze Period</p>
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#10b981" }} /> Healthy / Clear</p>
              </div>
            )}
            {colorMode === "status" && (
              <div className="border-t pt-1.5 space-y-0.5 text-[11px] text-gray-600">
                <p className="text-[10px] text-gray-400">Click a row to toggle Colored ↔ Normal BIM material (elements always stay visible).</p>
                {STATUS_ROWS.map((row) => (
                  <button key={row.bucket} aria-pressed={statusColorVisibility[row.bucket]}
                    onClick={() => setStatusColorVisibility((value) => ({ ...value, [row.bucket]: !value[row.bucket] }))}
                    className={`flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-gray-100 ${statusColorVisibility[row.bucket] ? "" : "opacity-50"}`}>
                    <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: statusColorVisibility[row.bucket] ? row.color : "#9ca3af" }} />
                    <span className="flex-1">{row.label}</span>
                    <span className="text-[9px] font-semibold uppercase">{statusColorVisibility[row.bucket] ? "Colored" : "Normal"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
    </>
  );
}
