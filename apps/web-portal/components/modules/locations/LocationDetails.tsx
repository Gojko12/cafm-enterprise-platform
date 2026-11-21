"use client";

// V52 Locations Workbench detail panel: the right half of the split screen.
// Rich read views per kind (building / floor / room) with child stats, child chips
// and guarded management actions (edit, activate/deactivate, delete).
import React, { useState } from "react";
import { Building2, Layers, DoorOpen, Pencil, Plus, Trash2, Power } from "lucide-react";
import type { Building, Floor, Room } from "@cafm/shared-schema";
import { CadUpload } from "@/components/modules/CadUpload";
import type { DemoData } from "@/lib/cafm-data";
import {
  buildingStats,
  floorStats,
  formatGps,
  roomStats,
  locationDeleteBlockers,
  type LocationKind,
} from "@/lib/locations";

const tile = "rounded-lg border border-slate-200 bg-slate-50 p-3";
const tileValue = "text-xl font-bold text-slate-900";
const tileLabel = "text-[11px] font-semibold uppercase text-slate-500";
const row = "flex items-start justify-between gap-2 py-1.5";
const rowKey = "text-xs font-semibold text-slate-500";
const rowValue = "text-sm text-slate-900 text-right";
const action = "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40";

function pill(active: boolean) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
    {active ? "Active" : "Inactive"}
  </span>;
}

function chips(entries: { key: string; label: string; onClick: () => void }[]) {
  const visible = entries.slice(0, 12);
  return <div className="flex flex-wrap gap-1.5">
    {visible.map((entry) => <button key={entry.key} onClick={entry.onClick}
      className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 hover:bg-blue-100">
      {entry.label}
    </button>)}
    {entries.length > visible.length && <span className="self-center text-xs text-slate-400">+{entries.length - visible.length} more</span>}
  </div>;
}

function DeleteButton({ kind, blockers, onDelete }: { kind: LocationKind; blockers: string[]; onDelete: () => void }) {
  const [why, setWhy] = useState(false);
  const blocked = blockers.length > 0;
  return <div className="relative">
    <button type="button" disabled={blocked} onClick={onDelete} className={`${action} text-red-600 hover:bg-red-50`} aria-disabled={blocked}>
      <Trash2 size={15} /> Delete
    </button>
    {blocked && <button type="button" onClick={() => setWhy((value) => !value)}
      className="absolute left-0 top-8 z-10 w-72 rounded-lg border border-amber-300 bg-amber-50 p-2 text-left text-xs text-amber-900 shadow-lg">
      {why ? "▾" : "▸"} Why is delete disabled?
      {why && <ul className="mt-1 list-disc pl-4">
        {blockers.map((blocker) => <li key={blocker}>{blocker.charAt(0).toUpperCase() + blocker.slice(1)}</li>)}
        <li className="mt-1 font-semibold">Deactivate the {kind} instead, or remove the references first.</li>
      </ul>}
    </button>}
  </div>;
}

export function LocationDetailsPanel({
  kind, building, floor, room, data, siteId, canWrite,
  onEdit, onToggleActive, onDelete, onJumpBuilding, onJumpFloor, onJumpRoom, onAdd,
}: {
  kind: LocationKind;
  building: Building | null;
  floor: Floor | null;
  room: Room | null;
  data: DemoData;
  siteId: string;
  canWrite: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onJumpBuilding: (building: Building) => void;
  onJumpFloor: (floor: Floor) => void;
  onJumpRoom: (room: Room) => void;
  onAdd: () => void;
}) {
  if (kind === "building" && building) {
    const stats = buildingStats(data, siteId, building.bl_id);
    const gps = formatGps(building);
    const floors = data.floors.filter((item) => item.SiteId === siteId && item.bl_id === building.bl_id);
    const rooms = data.rooms.filter((item) => item.SiteId === siteId && item.bl_id === building.bl_id);
    return <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase text-slate-400">{building.bl_id}</p>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Building2 size={22} className="text-blue-600" /> {building.Name}</h2>
        </div>
        {pill(building.IsActive !== false)}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={tile}><p className={tileValue}>{stats.floors}</p><p className={tileLabel}>Floors</p></div>
        <div className={tile}><p className={tileValue}>{stats.rooms}</p><p className={tileLabel}>Rooms</p></div>
        <div className={tile}><p className={tileValue}>{stats.equipment}</p><p className={tileLabel}>Equipment</p></div>
        <div className={tile}><p className={tileValue}>{stats.openWrCount}</p><p className={tileLabel}>Open WRs</p></div>
      </div>
      <section className="rounded-lg border p-3">
        <div className={row}><p className={rowKey}>Address</p><p className={rowValue}>{building.Address}</p></div>
        <div className={row}><p className={rowKey}>GPS</p><p className={rowValue}>{gps ?? <span className="text-slate-400">Not set</span>}</p></div>
        <div className={row}><p className={rowKey}>Total gross area</p><p className={rowValue}>{stats.grossArea.toLocaleString()} m²</p></div>
        <div className={row}><p className={rowKey}>Created</p><p className={rowValue}>{building.CreatedAt ?? <span className="text-slate-400">Unknown</span>}</p></div>
        <div className={row}><p className={rowKey}>Last updated</p><p className={rowValue}>{building.UpdatedAt ?? <span className="text-slate-400">Unknown</span>}</p></div>
      </section>
      {floors.length > 0 && <section>
        <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Floors ({floors.length})</h3>
        {chips(floors.sort((a, b) => (a.FloorNumber ?? 0) - (b.FloorNumber ?? 0)).map((item) =>
          ({ key: item.LevelName, label: item.LevelName, onClick: () => onJumpFloor(item) })))}
      </section>}
      {rooms.length > 0 && <section>
        <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Rooms ({rooms.length})</h3>
        {chips(rooms.map((item) => ({ key: item.RoomCode, label: item.RoomCode, onClick: () => onJumpRoom(item) })))}
      </section>}
      {canWrite && <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <button type="button" onClick={onAdd} className={`${action} text-emerald-700 hover:bg-emerald-50`}><Plus size={15} /> Add floor</button>
        <DeleteButton kind="building" blockers={locationDeleteBlockers(data, siteId, "building", building)} onDelete={onDelete} />
        {building.IsActive === false
          ? <button type="button" onClick={onToggleActive} className={`${action} text-emerald-700 hover:bg-emerald-50`}><Power size={15} /> Activate</button>
          : <button type="button" onClick={onToggleActive} className={`${action} text-slate-700 hover:bg-slate-100`} title="Inactive locations stay in lists but flag their children"><Power size={15} /> Deactivate</button>}
        <button type="button" onClick={onEdit} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"><Pencil size={15} /> Edit</button>
      </div>}
    </div>;
  }

  if (kind === "floor" && floor) {
    const stats = floorStats(data, siteId, floor.bl_id, floor.LevelName);
    const parent = data.buildings.find((item) => item.SiteId === siteId && item.bl_id === floor.bl_id);
    const rooms = data.rooms.filter((item) => item.SiteId === siteId && item.bl_id === floor.bl_id && item.LevelName === floor.LevelName);
    return <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase text-slate-400">{parent ? `${parent.bl_id} · ${parent.Name}` : floor.bl_id}</p>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Layers size={22} className="text-blue-600" /> {floor.LevelName}</h2>
        </div>
        {pill(floor.IsActive !== false)}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={tile}><p className={tileValue}>{stats.rooms}</p><p className={tileLabel}>Rooms</p></div>
        <div className={tile}><p className={tileValue}>{stats.equipment}</p><p className={tileLabel}>Equipment</p></div>
        <div className={tile}><p className={tileValue}>{stats.desks}</p><p className={tileLabel}>Desks</p></div>
        <div className={tile}><p className={tileValue}>{stats.openWrCount}</p><p className={tileLabel}>Open WRs</p></div>
      </div>
      <section className="rounded-lg border p-3">
        <div className={row}><p className={rowKey}>Floor number</p><p className={rowValue}>{floor.FloorNumber ?? <span className="text-slate-400">Not set</span>}</p></div>
        <div className={row}><p className={rowKey}>Gross area</p><p className={rowValue}>{floor.GrossAreaM2 !== undefined ? `${floor.GrossAreaM2.toLocaleString()} m²` : <span className="text-slate-400">Not set</span>}</p></div>
        <div className={row}><p className={rowKey}>Net area (rooms sum)</p><p className={rowValue}>{stats.netArea ? `${stats.netArea.toLocaleString()} m²` : <span className="text-slate-400">Not set</span>}</p></div>
        {floor.FloorPlanUrl
          ? <div className={row}><p className={rowKey}>Floor plan</p><p className="rowValue"><a className="text-blue-700 underline" href={floor.FloorPlanUrl} target="_blank" rel="noreferrer">{floor.FloorPlanFormat ?? "Open plan"}</a></p></div>
          : <div className={row}><p className={rowKey}>Floor plan</p><p className={rowValue + " text-slate-400"}>None yet</p></div>}
        {parent && <div className={row}><p className={rowKey}>Building</p><p className="rowValue"><button className="text-blue-700 underline" onClick={() => onJumpBuilding(parent)}>{parent.Name}</button></p></div>}
      </section>
      {rooms.length > 0 && <section>
        <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Rooms on this floor ({rooms.length})</h3>
        {chips(rooms.map((item) => ({ key: item.RoomCode, label: `${item.RoomCode}${item.Name ? ` · ${item.Name}` : ""}`, onClick: () => onJumpRoom(item) })))}
      </section>}
      <section className="rounded-lg border p-3">
        <CadUpload floor={floor} />
      </section>
      {canWrite && <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <button type="button" onClick={onAdd} className={`${action} text-emerald-700 hover:bg-emerald-50`}><Plus size={15} /> Add room</button>
        <DeleteButton kind="floor" blockers={locationDeleteBlockers(data, siteId, "floor", floor)} onDelete={onDelete} />
        {floor.IsActive === false
          ? <button type="button" onClick={onToggleActive} className={`${action} text-emerald-700 hover:bg-emerald-50`}><Power size={15} /> Activate</button>
          : <button type="button" onClick={onToggleActive} className={`${action} text-slate-700 hover:bg-slate-100`}><Power size={15} /> Deactivate</button>}
        <button type="button" onClick={onEdit} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"><Pencil size={15} /> Edit</button>
      </div>}
    </div>;
  }

  if (kind === "room" && room) {
    const stats = roomStats(data, siteId, room.bl_id, room.LevelName, room.RoomCode);
    const parentBuilding = data.buildings.find((item) => item.SiteId === siteId && item.bl_id === room.bl_id);
    const parentFloor = data.floors.find((item) => item.SiteId === siteId && item.bl_id === room.bl_id && item.LevelName === room.LevelName);
    const equipment = data.equipment.filter((eq) => eq.SiteId === siteId && eq.bl_id === room.bl_id && eq.LevelName === room.LevelName && eq.RoomCode === room.RoomCode);
    const desks = data.desks.filter((desk) => desk.SiteId === siteId && desk.bl_id === room.bl_id && desk.LevelName === room.LevelName && desk.RoomCode === room.RoomCode);
    const absent = (value: string | undefined) => !value ? <span className="text-slate-400">Not set</span> : value;
    return <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase text-slate-400">{room.RoomCode}</p>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><DoorOpen size={22} className="text-blue-600" /> {room.Name}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {parentBuilding && <button className="text-blue-700 underline" onClick={() => onJumpBuilding(parentBuilding)}>{parentBuilding.Name}</button>}
            {" › "}
            {parentFloor && <button className="text-blue-700 underline" onClick={() => onJumpFloor(parentFloor)}>{parentFloor.LevelName}</button>}
            {" › "}{room.RoomCode}
          </p>
        </div>
        {pill(room.IsActive !== false)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className={tile}><p className={tileValue}>{stats.equipment}</p><p className={tileLabel}>Equipment</p></div>
        <div className={tile}><p className={tileValue}>{stats.desks}</p><p className={tileLabel}>Desks</p></div>
        <div className={tile}><p className={tileValue}>{stats.openWrCount}</p><p className={tileLabel}>Open WRs</p></div>
      </div>
      <section className="rounded-lg border p-3">
        <div className={row}><p className={rowKey}>Category</p><p className={rowValue}>{absent(room.RoomCategory)}</p></div>
        <div className={row}><p className={rowKey}>Usage</p><p className={rowValue}>{absent(room.Usage)}</p></div>
        <div className={row}><p className={rowKey}>Net area</p><p className={rowValue}>{room.NetAreaM2 !== undefined ? `${room.NetAreaM2.toLocaleString()} m²` : <span className="text-slate-400">Not set</span>}</p></div>
        <div className={row}><p className={rowKey}>Department</p><p className={rowValue}>{absent(room.Department)}</p></div>
        <div className={row}><p className={rowKey}>Cost center</p><p className={rowValue}>{absent(room.CostCenter)}</p></div>
        <div className={row}><p className={rowKey}>Polygon</p><p className={rowValue}>{room.Polygon ? <span className="font-semibold text-emerald-700">{room.PolygonSource === "CAD" ? "Extracted from CAD" : room.PolygonSource ?? "Present"}</span> : <span className="text-slate-400">None</span>}</p></div>
        <div className={row}><p className={rowKey}>Desk reservable</p><p className={rowValue}>{room.IsDeskReservable ? "Yes" : "No"}</p></div>
      </section>
      {equipment.length > 0 && <section>
        <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Equipment in this room ({equipment.length})</h3>
        <ul className="space-y-1 text-sm">
          {equipment.slice(0, 8).map((eq) => <li key={eq.EquipmentCode} className="flex justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1">
            <span className="font-mono text-xs text-slate-700">{eq.EquipmentCode}</span>
            <span className="truncate text-xs">{eq.EquipmentName}</span>
          </li>)}
          {equipment.length > 8 && <li className="text-xs text-slate-400">+{equipment.length - 8} more in the Equipment Registry</li>}
        </ul>
      </section>}
      {desks.length > 0 && <section>
        <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Desks in this room ({desks.length})</h3>
        <ul className="space-y-1 text-sm">
          {desks.slice(0, 8).map((desk) => <li key={desk.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs">
            {desk.name ?? desk.id} · {desk.deskType}{desk.isPermanent ? "" : " · removable"}
          </li>)}
        </ul>
      </section>}
      {canWrite && <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <DeleteButton kind="room" blockers={locationDeleteBlockers(data, siteId, "room", room)} onDelete={onDelete} />
        {room.IsActive === false
          ? <button type="button" onClick={onToggleActive} className={`${action} text-emerald-700 hover:bg-emerald-50`}><Power size={15} /> Activate</button>
          : <button type="button" onClick={onToggleActive} className={`${action} text-slate-700 hover:bg-slate-100`}><Power size={15} /> Deactivate</button>}
        <button type="button" onClick={onEdit} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"><Pencil size={15} /> Edit</button>
      </div>}
    </div>;
  }

  return <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
    <p className="text-sm text-slate-400">Select a location on the left to see its details.</p>
    {canWrite && <button type="button" onClick={onAdd} className={`${action} text-emerald-700 hover:bg-emerald-50`}><Plus size={15} /> Add the first location</button>}
  </div>;
}
