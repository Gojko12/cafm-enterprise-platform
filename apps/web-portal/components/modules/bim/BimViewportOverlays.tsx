"use client";

import React from "react";
import type * as THREE from "three";
import { Crosshair, RefreshCw } from "lucide-react";
import type { BimModelIndex } from "@/lib/ifc-cafm-bridge";
import {
  ALL_STOREYS,
  type CameraView, type ColorMode, type IsolateTarget, type IssuePin, type SetState, type ViewportHealth,
} from "./bim-viewport-math";

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
}

export function BimViewportOverlays({
  viewportHealth, index, selection, roomSelection, isolate, setIsolate, isolatePadding, setIsolatePadding, measureMode, setMeasureMode, measurePoints, setMeasurePoints, pinsOn, setPinsOn, issuePins, setOverlayEl, setCameraView, resetCamera, flyToElement, flyToRoom, selectAndFly, selectRoom, storeyFilter, setStoreyFilter, xray, setXray, xrayOpacity, setXrayOpacity, explodeGap, setExplodeGap, clipEnabled, setClipEnabled, clipPercent, setClipPercent, colorMode, setColorMode, showSpaces, setShowSpaces,
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
            {measurePoints.length > 0 && <button onClick={() => setMeasurePoints([])} className="rounded px-2 py-1 hover:bg-gray-700">Clear</button>}
          </div>

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
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#dc2626" }} /> Overdue WR / Unfavourable finding</p>
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#f59e0b" }} /> Open 50% / 55% WR</p>
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#06b6d4" }} /> Active Freeze Period</p>
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#10b981" }} /> Linked &amp; Healthy</p>
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#8b5cf6" }} /> Unassigned MEP element</p>
              </div>
            )}
          </div>
    </>
  );
}
