"use client";

// V52 Locations Workbench editor: create and edit buildings, floors and rooms.
// V53 (MASTER_SPEC Section 103): identity fields (bl_id, LevelName, RoomCode) are
// editable; renaming is validated against the same one-level-uniqueness rules as
// creation and cascades through every referencing record in one atomic save
// (lib/location-rename.ts). Parent selects stay locked on edit: moving a floor or
// room to another parent is not a rename and would leave stale references behind.
import React, { useState } from "react";
import type { Building, Floor, Room } from "@cafm/shared-schema";
import {
  emptyLocationForm,
  type LocationFormValues,
  type LocationKind,
} from "@/lib/locations";
import { formRenameRequest, renameLabel } from "@/lib/location-rename";

const label = "block text-xs font-semibold text-slate-600 mb-1";
const input = "w-full min-w-0 rounded-lg border p-2 text-sm";
const inputError = "w-full min-w-0 rounded-lg border border-red-400 p-2 text-sm";
const fieldError = "text-xs text-red-600 mt-1";

export interface LocationEditorTarget {
  kind: LocationKind;
  mode: "create" | "edit";
  building?: Building | null;
  floor?: Floor | null;
  room?: Room | null;
}

export function formValuesFor(target: LocationEditorTarget): LocationFormValues {
  const base = emptyLocationForm();
  if (target.mode !== "edit") {
    // Prefill only the parent context, never an existing level/room identity:
    // "Add Floor" preloads the selected building (from the building panel) or the
    // building of the selected floor (header button); "Add Room" preloads building
    // and floor.
    if (target.kind === "floor" || target.kind === "room")
      base.blId = target.floor?.bl_id ?? target.building?.bl_id ?? "";
    if (target.kind === "room" && target.floor) base.levelName = target.floor.LevelName;
    return base;
  }
  const building = target.building;
  const floor = target.floor;
  const room = target.room;
  if (target.kind === "building" && building) return {
    ...base,
    blId: building.bl_id, name: building.Name, address: building.Address,
    latitude: building.GPSCoordinates ? String(building.GPSCoordinates.latitude) : "",
    longitude: building.GPSCoordinates ? String(building.GPSCoordinates.longitude) : "",
    elevation: building.GPSCoordinates?.elevationMeters !== undefined ? String(building.GPSCoordinates.elevationMeters) : "",
    isActive: building.IsActive !== false,
  };
  if (target.kind === "floor" && floor) return {
    ...base,
    blId: floor.bl_id, levelName: floor.LevelName,
    floorNumber: floor.FloorNumber !== undefined ? String(floor.FloorNumber) : "",
    grossArea: floor.GrossAreaM2 !== undefined ? String(floor.GrossAreaM2) : "",
    floorPlanUrl: floor.FloorPlanUrl ?? "", floorPlanFormat: floor.FloorPlanFormat ?? "",
    isActive: floor.IsActive !== false,
  };
  if (target.kind === "room" && room) return {
    ...base,
    blId: room.bl_id, levelName: room.LevelName, roomCode: room.RoomCode, name: room.Name,
    roomCategory: room.RoomCategory ?? "", usage: room.Usage ?? "", department: room.Department ?? "",
    costCenter: room.CostCenter ?? "", netArea: room.NetAreaM2 !== undefined ? String(room.NetAreaM2) : "",
    isActive: room.IsActive !== false, deskReservable: room.IsDeskReservable === true,
  };
  return base;
}

export function LocationEditor({
  target, buildings, floors, validate, onClose, onApply, impactFor,
}: {
  target: LocationEditorTarget;
  buildings: Building[];
  floors: Floor[];
  validate: (values: LocationFormValues, target: LocationEditorTarget) => Partial<Record<keyof LocationFormValues, string>>;
  onClose: () => void;
  onApply: (values: LocationFormValues, target: LocationEditorTarget) => void;
  impactFor?: (values: LocationFormValues, target: LocationEditorTarget) => string[] | null;
}) {
  const [values, setValues] = useState<LocationFormValues>(() => formValuesFor(target));
  const errors = validate(values, target);
  const set = <K extends keyof LocationFormValues>(key: K, value: LocationFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const title = target.mode === "create"
    ? (target.kind === "building" ? "Add Building" : target.kind === "floor" ? "Add Floor" : "Add Room")
    : (target.kind === "building" ? "Edit Building" : target.kind === "floor" ? "Edit Floor" : "Edit Room");

  const rename = formRenameRequest(target, values);
  const renameNote = "This is the location's identity. Renaming it updates every record that references it in one atomic save.";
  const parentLockNote = "Locked: moving to another parent is not a rename (references would be ambiguous); create the location under the new parent instead.";
  const impactLines = rename ? impactFor?.(values, target) ?? null : null;

  return <div role="dialog" aria-modal="true" aria-label={title}
    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2">
    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <button type="button" onClick={onClose} className="rounded border px-2 py-1 text-sm hover:bg-slate-100">Close</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {target.kind === "building" && <>
          <div>
            <label className={label}>Building code (bl_id)</label>
            <input className={errors.blId ? inputError : input} value={values.blId}
              onChange={(event) => set("blId", event.target.value)} aria-invalid={!!errors.blId} />
            {errors.blId && <p className={fieldError}>{errors.blId}</p>}
            {target.mode === "edit" && <p className="mt-1 text-[11px] text-slate-400">{renameNote}</p>}
          </div>
          <div>
            <label className={label}>Name *</label>
            <input className={errors.name ? inputError : input} value={values.name}
              onChange={(event) => set("name", event.target.value)} aria-invalid={!!errors.name} />
            {errors.name && <p className={fieldError}>{errors.name}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Address *</label>
            <input className={errors.address ? inputError : input} value={values.address}
              onChange={(event) => set("address", event.target.value)} aria-invalid={!!errors.address} />
            {errors.address && <p className={fieldError}>{errors.address}</p>}
          </div>
          <div>
            <label className={label}>GPS latitude</label>
            <input className={errors.latitude ? inputError : input} value={values.latitude} placeholder="-90 … 90"
              onChange={(event) => set("latitude", event.target.value)} aria-invalid={!!errors.latitude} />
            {errors.latitude && <p className={fieldError}>{errors.latitude}</p>}
          </div>
          <div>
            <label className={label}>GPS longitude</label>
            <input className={errors.longitude ? inputError : input} value={values.longitude} placeholder="-180 … 180"
              onChange={(event) => set("longitude", event.target.value)} aria-invalid={!!errors.longitude} />
            {errors.longitude && <p className={fieldError}>{errors.longitude}</p>}
          </div>
          <div>
            <label className={label}>Elevation (m)</label>
            <input className={input} value={values.elevation}
              onChange={(event) => set("elevation", event.target.value)} />
          </div>
        </>}

        {target.kind === "floor" && <>
          <div>
            <label className={label}>Building *</label>
            <select className={input} value={values.blId} disabled={target.mode === "edit"}
              onChange={(event) => { set("blId", event.target.value); if (target.mode === "create") set("levelName", ""); }}>
              <option value="">Select a building…</option>
              {buildings.map((building) => <option key={building.bl_id} value={building.bl_id}>{building.bl_id} · {building.Name}</option>)}
            </select>
            {errors.blId && <p className={fieldError}>{errors.blId}</p>}
            {target.mode === "edit" && <p className="mt-1 text-[11px] text-slate-400">{parentLockNote}</p>}
          </div>
          <div>
            <label className={label}>Level name *</label>
            <input className={errors.levelName ? inputError : input} value={values.levelName} placeholder="e.g. Level 0, Parking, L2"
              onChange={(event) => set("levelName", event.target.value)} aria-invalid={!!errors.levelName} />
            {errors.levelName && <p className={fieldError}>{errors.levelName}</p>}
            {target.mode === "edit" && <p className="mt-1 text-[11px] text-slate-400">{renameNote}</p>}
          </div>
          <div>
            <label className={label}>Floor number</label>
            <input className={errors.floorNumber ? inputError : input} value={values.floorNumber} placeholder="0, 1, -1 for basement"
              onChange={(event) => set("floorNumber", event.target.value)} aria-invalid={!!errors.floorNumber} />
            {errors.floorNumber && <p className={fieldError}>{errors.floorNumber}</p>}
          </div>
          <div>
            <label className={label}>Gross area (m²)</label>
            <input className={errors.grossArea ? inputError : input} value={values.grossArea}
              onChange={(event) => set("grossArea", event.target.value)} aria-invalid={!!errors.grossArea} />
            {errors.grossArea && <p className={fieldError}>{errors.grossArea}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Floor plan URL</label>
            <input className={errors.floorPlanUrl ? inputError : input} value={values.floorPlanUrl} placeholder="https://…"
              onChange={(event) => set("floorPlanUrl", event.target.value)} aria-invalid={!!errors.floorPlanUrl} />
            {errors.floorPlanUrl && <p className={fieldError}>{errors.floorPlanUrl}</p>}
          </div>
          <div>
            <label className={label}>Plan format</label>
            <select className={input} value={values.floorPlanFormat} onChange={(event) => set("floorPlanFormat", event.target.value)}>
              <option value="">Not set</option>
              {["DWG", "DXF", "SVG", "GEOJSON"].map((format) => <option key={format} value={format}>{format}</option>)}
            </select>
          </div>
        </>}

        {target.kind === "room" && <>
          <div>
            <label className={label}>Building *</label>
            <select className={input} value={values.blId} disabled={target.mode === "edit"}
              onChange={(event) => { set("blId", event.target.value); if (target.mode === "create") { set("levelName", ""); set("roomCode", ""); } }}>
              <option value="">Select a building…</option>
              {buildings.map((building) => <option key={building.bl_id} value={building.bl_id}>{building.bl_id} · {building.Name}</option>)}
            </select>
            {errors.blId && <p className={fieldError}>{errors.blId}</p>}
            {target.mode === "edit" && <p className="mt-1 text-[11px] text-slate-400">{parentLockNote}</p>}
          </div>
          <div>
            <label className={label}>Floor *</label>
            <select className={input} value={values.levelName} disabled={target.mode === "edit"}
              onChange={(event) => set("levelName", event.target.value)}>
              <option value="">Select a floor…</option>
              {floors.filter((floor) => floor.bl_id === values.blId).map((floor) =>
                <option key={floor.LevelName} value={floor.LevelName}>{floor.LevelName}{floor.FloorNumber !== undefined ? ` (${floor.FloorNumber})` : ""}</option>)}
            </select>
            {errors.levelName && <p className={fieldError}>{errors.levelName}</p>}
            {target.mode === "edit" && <p className="mt-1 text-[11px] text-slate-400">{parentLockNote}</p>}
          </div>
          <div>
            <label className={label}>Room code *</label>
            <input className={errors.roomCode ? inputError : input} value={values.roomCode}
              onChange={(event) => set("roomCode", event.target.value)} aria-invalid={!!errors.roomCode} />
            {errors.roomCode && <p className={fieldError}>{errors.roomCode}</p>}
            {target.mode === "edit" && <p className="mt-1 text-[11px] text-slate-400">{renameNote}</p>}
          </div>
          <div>
            <label className={label}>Name *</label>
            <input className={errors.name ? inputError : input} value={values.name}
              onChange={(event) => set("name", event.target.value)} aria-invalid={!!errors.name} />
            {errors.name && <p className={fieldError}>{errors.name}</p>}
          </div>
          <div>
            <label className={label}>Category</label>
            <input className={input} value={values.roomCategory} onChange={(event) => set("roomCategory", event.target.value)} />
          </div>
          <div>
            <label className={label}>Usage</label>
            <input className={input} value={values.usage} onChange={(event) => set("usage", event.target.value)} />
          </div>
          <div>
            <label className={label}>Net area (m²)</label>
            <input className={errors.netArea ? inputError : input} value={values.netArea}
              onChange={(event) => set("netArea", event.target.value)} aria-invalid={!!errors.netArea} />
            {errors.netArea && <p className={fieldError}>{errors.netArea}</p>}
          </div>
          <div>
            <label className={label}>Department</label>
            <input className={input} value={values.department} onChange={(event) => set("department", event.target.value)} />
          </div>
          <div>
            <label className={label}>Cost center</label>
            <input className={input} value={values.costCenter} onChange={(event) => set("costCenter", event.target.value)} />
          </div>
        </>}

        {target.mode === "edit" && rename && (
          <div className="sm:col-span-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
            <p className="font-bold">
              Rename {renameLabel(rename).from} → {renameLabel(rename).to}
            </p>
            <p>
              {impactLines && impactLines.length > 0
                ? `All references update automatically in one atomic save: ${impactLines.join(", ")}.`
                : "No other records reference this location, so nothing else changes."}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-4 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={values.isActive} onChange={(event) => set("isActive", event.target.checked)} />
            Active
          </label>
          {target.kind === "room" && <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={values.deskReservable} onChange={(event) => set("deskReservable", event.target.checked)} />
            Desk reservable
          </label>}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2 border-t pt-3">
        {Object.keys(errors).length > 0
          ? <p className="text-xs text-red-600">Fix the highlighted fields first.</p>
          : <span />}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-100">Cancel</button>
          <button type="button" disabled={Object.keys(errors).length > 0} onClick={() => onApply(values, target)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
            {target.mode === "create" ? "Create" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  </div>;
}
