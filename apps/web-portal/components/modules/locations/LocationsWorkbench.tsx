"use client";

// V52 Locations Workbench (MASTER_SPEC Section 102): tabbed overview
// (Buildings / Floors / Rooms) with a 50/50 split screen; selecting a row opens its
// details panel on the right. Create / edit / toggle / delete run through the standard
// cafm-store setData pipeline, so the Stage B delta sync pushes only the changed
// collection. V53 (Section 103): identity fields are editable; a rename rewrites
// every referencing record (floors, rooms, desks, equipment, work requests, PM
// schedules, freezes, inspections, BIM links) in the same setData via
// lib/location-rename.ts, so the server's validateSite always sees a consistent site.
import React, { useMemo, useState } from "react";
import { Building2, Layers, DoorOpen, Plus } from "lucide-react";
import type { Building, Floor, Room } from "@cafm/shared-schema";
import { useApp } from "@/lib/hooks/useApp";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { LocationRenameHistory } from "./LocationRenameHistory";
import { OverviewTable, type TableColumn } from "@/components/common/TableColumns";
import { LocationDetailsPanel } from "./LocationDetails";
import { LocationEditor, type LocationEditorTarget } from "./LocationEditor";
import { numberOrUndefined, validateLocationForm, type LocationFormValues, type LocationKind } from "@/lib/locations";
import { appendRenameLog, applyLocationRename, formRenameRequest, locationRenameImpact, renameLabel, type LocationRenameRequest } from "@/lib/location-rename";

type Tab = LocationKind;
interface Selection {
  kind: Tab;
  buildingKey: string | null;
  floorKey: string | null;
  roomKey: string | null;
}

const activeCell = (value: boolean | undefined) =>
  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${value === false ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-800"}`}>
    {value === false ? "Inactive" : "Active"}
  </span>;

const buildingColumns: TableColumn<Building>[] = [
  { id: "code", label: "Code", value: (item) => item.bl_id },
  { id: "name", label: "Name", value: (item) => item.Name },
  { id: "address", label: "Address", value: (item) => item.Address },
  { id: "active", label: "Status", value: (item) => (item.IsActive === false ? "Inactive" : "Active"), render: (item) => activeCell(item.IsActive) },
];
const floorColumns: TableColumn<Floor>[] = [
  { id: "building", label: "Building", value: (item) => item.bl_id },
  { id: "floor", label: "Level", value: (item) => item.LevelName },
  { id: "number", label: "Floor No.", value: (item) => item.FloorNumber },
  { id: "area", label: "Gross Area (m²)", value: (item) => item.GrossAreaM2 },
  { id: "active", label: "Status", value: (item) => (item.IsActive === false ? "Inactive" : "Active"), render: (item) => activeCell(item.IsActive) },
];
const roomColumns: TableColumn<Room>[] = [
  { id: "building", label: "Building", value: (item) => item.bl_id },
  { id: "floor", label: "Floor", value: (item) => item.LevelName },
  { id: "code", label: "Room", value: (item) => item.RoomCode },
  { id: "name", label: "Name", value: (item) => item.Name },
  { id: "area", label: "Net Area (m²)", value: (item) => item.NetAreaM2 },
  { id: "active", label: "Status", value: (item) => (item.IsActive === false ? "Inactive" : "Active"), render: (item) => activeCell(item.IsActive) },
];

export function LocationsWorkbench() {
  const { data, setData } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const { canAccess, setSelectedBuilding, setSelectedFloor, setSelectedRoom } = useApp();
  const canWrite = canAccess("locations.write");
  const { profile } = useActiveUserPermissions();
  const actorName = profile?.fullName?.trim() || activePerson;
  const [tab, setTab] = useState<Tab>("building");
  const [selection, setSelection] = useState<Selection>({ kind: "building", buildingKey: null, floorKey: null, roomKey: null });
  const [editing, setEditing] = useState<LocationEditorTarget | null>(null);

  const siteBuildings = useMemo(() => data.buildings.filter((item) => item.SiteId === activeSiteId), [data.buildings, activeSiteId]);
  const siteFloors = useMemo(() => data.floors.filter((item) => item.SiteId === activeSiteId), [data.floors, activeSiteId]);
  const siteRooms = useMemo(() => data.rooms.filter((item) => item.SiteId === activeSiteId), [data.rooms, activeSiteId]);

  const selectedBuilding = selection.buildingKey ? siteBuildings.find((item) => item.bl_id === selection.buildingKey) ?? null : null;
  const selectedFloor = selection.floorKey ? siteFloors.find((item) => `${item.bl_id}:${item.LevelName}` === selection.floorKey) ?? null : null;
  const selectedRoom = selection.roomKey ? siteRooms.find((item) => `${item.bl_id}:${item.LevelName}:${item.RoomCode}` === selection.roomKey) ?? null : null;

  const select = (kind: Tab, building: Building | null, floor: Floor | null, room: Room | null) => {
    setSelection({
      kind,
      buildingKey: building?.bl_id ?? null,
      floorKey: floor ? `${floor.bl_id}:${floor.LevelName}` : null,
      roomKey: room ? `${room.bl_id}:${room.LevelName}:${room.RoomCode}` : null,
    });
    // Keep the app-wide cascading selection in sync so other pages follow this context.
    setSelectedBuilding(building);
    setSelectedFloor(floor);
    setSelectedRoom(room);
  };

  const selectBuilding = (building: Building) => { setTab("building"); select("building", building, null, null); };
  const selectFloor = (floor: Floor) => {
    setTab("floor");
    const parent = siteBuildings.find((item) => item.bl_id === floor.bl_id) ?? null;
    select("floor", parent, floor, null);
  };
  const selectRoom = (room: Room) => {
    setTab("room");
    const parentBuilding = siteBuildings.find((item) => item.bl_id === room.bl_id) ?? null;
    const parentFloor = siteFloors.find((item) => item.bl_id === room.bl_id && item.LevelName === room.LevelName) ?? null;
    select("room", parentBuilding, parentFloor, room);
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "building", label: "Buildings", icon: <Building2 size={15} />, count: siteBuildings.length },
    { key: "floor", label: "Floors", icon: <Layers size={15} />, count: siteFloors.length },
    { key: "room", label: "Rooms", icon: <DoorOpen size={15} />, count: siteRooms.length },
  ];
  const addLabel = tab === "building" ? "Add Building" : tab === "floor" ? "Add Floor" : "Add Room";

  // On edit, the record being edited is excluded from the one-level-uniqueness checks.
  const editIgnore = (target: LocationEditorTarget) =>
    target.mode === "edit" && target.kind === "building" && target.building ? { blId: target.building.bl_id } :
    target.mode === "edit" && target.kind === "floor" && target.floor ? { blId: target.floor.bl_id, levelName: target.floor.LevelName } :
    target.mode === "edit" && target.kind === "room" && target.room
      ? { blId: target.room.bl_id, levelName: target.room.LevelName, roomCode: target.room.RoomCode }
      : undefined;

  const applyEditor = (values: LocationFormValues, target: LocationEditorTarget) => {
    const errors = validateLocationForm(target.kind, target.mode, values, data, activeSiteId, editIgnore(target));
    if (Object.keys(errors).length) return;
    const rename = formRenameRequest(target, values);
    if (rename) {
      const impacted = locationRenameImpact(data, rename);
      const detail = impacted.length > 0
        ? impacted.map((item) => `${item.count} ${item.label}`).join(", ")
        : "no other records";
      const labels = renameLabel(rename);
      if (!window.confirm(`Rename "${labels.from}" to "${labels.to}"? This updates ${detail} in one atomic save.`)) return;
    }
    const now = new Date().toISOString();
    setData((current) => {
      let next = current;
      if (target.kind === "building") {
        const gps = values.latitude.trim() !== "" && values.longitude.trim() !== "" ? {
          latitude: Number(values.latitude.trim()),
          longitude: Number(values.longitude.trim()),
          ...(values.elevation.trim() !== "" ? { elevationMeters: Number(values.elevation.trim()) } : {}),
        } : undefined;
        if (target.mode === "create") {
          const building: Building = {
            bl_id: values.blId.trim(), SiteId: activeSiteId, Name: values.name.trim(), Address: values.address.trim(),
            ...(gps ? { GPSCoordinates: gps } : {}), IsActive: values.isActive, CreatedAt: now, UpdatedAt: now,
          };
          next = { ...next, buildings: [...next.buildings, building] };
        } else {
          next = { ...next, buildings: next.buildings.map((building) =>
            building.SiteId === activeSiteId && target.building && building.bl_id === target.building.bl_id
              ? { ...building, bl_id: values.blId.trim(), Name: values.name.trim(), Address: values.address.trim(),
                  ...(gps ? { GPSCoordinates: gps } : { GPSCoordinates: undefined }), IsActive: values.isActive, UpdatedAt: now }
              : building) };
        }
      } else if (target.kind === "floor") {
        const floorBody = {
          FloorNumber: Number(values.floorNumber.trim()),
          ...(values.grossArea.trim() !== "" ? { GrossAreaM2: numberOrUndefined(values.grossArea) } : { GrossAreaM2: undefined }),
          ...(values.floorPlanUrl.trim() !== "" ? { FloorPlanUrl: values.floorPlanUrl.trim() } : { FloorPlanUrl: undefined }),
          ...(values.floorPlanFormat !== "" ? { FloorPlanFormat: values.floorPlanFormat as "DWG" | "DXF" | "SVG" | "GEOJSON" } : { FloorPlanFormat: undefined }),
          IsActive: values.isActive,
        };
        if (target.mode === "create") {
          const floor: Floor = { bl_id: values.blId, SiteId: activeSiteId, LevelName: values.levelName.trim(), ...floorBody };
          next = { ...next, floors: [...next.floors, floor] };
        } else {
          next = { ...next, floors: next.floors.map((floor) =>
            floor.SiteId === activeSiteId && target.floor && floor.bl_id === target.floor.bl_id && floor.LevelName === target.floor.LevelName
              ? { ...floor, LevelName: values.levelName.trim(), ...floorBody } : floor) };
        }
      } else {
        const roomBody = {
          Name: values.name.trim(),
          ...(values.roomCategory.trim() !== "" ? { RoomCategory: values.roomCategory.trim() } : { RoomCategory: undefined }),
          ...(values.usage.trim() !== "" ? { Usage: values.usage.trim() } : { Usage: undefined }),
          ...(values.department.trim() !== "" ? { Department: values.department.trim() } : { Department: undefined }),
          ...(values.costCenter.trim() !== "" ? { CostCenter: values.costCenter.trim() } : { CostCenter: undefined }),
          ...(values.netArea.trim() !== "" ? { NetAreaM2: numberOrUndefined(values.netArea) } : { NetAreaM2: undefined }),
          IsDeskReservable: values.deskReservable,
          IsActive: values.isActive,
        };
        if (target.mode === "create") {
          const room: Room = { bl_id: values.blId, SiteId: activeSiteId, LevelName: values.levelName, RoomCode: values.roomCode.trim(), ...roomBody };
          next = { ...next, rooms: [...next.rooms, room] };
        } else {
          next = { ...next, rooms: next.rooms.map((room) =>
            room.SiteId === activeSiteId && target.room && room.bl_id === target.room.bl_id && room.LevelName === target.room.LevelName && room.RoomCode === target.room.RoomCode
              ? { ...room, RoomCode: values.roomCode.trim(), ...roomBody } : room) };
        }
      }
      if (rename) {
        const result = applyLocationRename(next, rename);
        next = appendRenameLog(result.next, rename, actorName, result.counts, now);
      }
      return next;
    });
    if (rename) reselectAfterRename(rename, target);
    setEditing(null);
  };

  // Keeps the selection (and the app-wide selected building/floor/room) pointing at
  // the renamed identity instead of a key that no longer exists.
  const reselectAfterRename = (rename: LocationRenameRequest, target: LocationEditorTarget) => {
    if (rename.kind === "building" && target.building) {
      select("building", { ...target.building, bl_id: rename.to.blId }, null, null);
    } else if (rename.kind === "floor" && target.floor) {
      const parent = siteBuildings.find((item) => item.bl_id === target.floor?.bl_id) ?? null;
      select("floor", parent, { ...target.floor, LevelName: rename.to.levelName }, null);
    } else if (rename.kind === "room" && target.room) {
      const parentBuilding = siteBuildings.find((item) => item.bl_id === target.room?.bl_id) ?? null;
      const parentFloor = siteFloors.find((item) => item.bl_id === target.room?.bl_id && item.LevelName === target.room?.LevelName) ?? null;
      select("room", parentBuilding, parentFloor, { ...target.room, RoomCode: rename.to.roomCode });
    }
  };

  const toggleActive = (kind: Tab) => {
    setData((current) => {
      if (kind === "building" && selectedBuilding) return { ...current, buildings: current.buildings.map((building) =>
        building.SiteId === activeSiteId && building.bl_id === selectedBuilding.bl_id ? { ...building, IsActive: building.IsActive === false, UpdatedAt: new Date().toISOString() } : building) };
      if (kind === "floor" && selectedFloor) return { ...current, floors: current.floors.map((floor) =>
        floor.SiteId === activeSiteId && floor.bl_id === selectedFloor.bl_id && floor.LevelName === selectedFloor.LevelName ? { ...floor, IsActive: floor.IsActive === false } : floor) };
      if (kind === "room" && selectedRoom) return { ...current, rooms: current.rooms.map((room) =>
        room.SiteId === activeSiteId && room.bl_id === selectedRoom.bl_id && room.LevelName === selectedRoom.LevelName && room.RoomCode === selectedRoom.RoomCode
          ? { ...room, IsActive: room.IsActive === false } : room) };
      return current;
    });
  };

  const removeSelected = (kind: Tab) => {
    const label = kind === "building" ? selectedBuilding?.bl_id : kind === "floor" ? selectedFloor?.LevelName : selectedRoom?.RoomCode;
    if (!window.confirm(`Delete this ${kind} (${label})? This cannot be undone.`)) return;
    setData((current) => {
      if (kind === "building" && selectedBuilding) return { ...current, buildings: current.buildings.filter((building) =>
        !(building.SiteId === activeSiteId && building.bl_id === selectedBuilding.bl_id)) };
      if (kind === "floor" && selectedFloor) return { ...current, floors: current.floors.filter((floor) =>
        !(floor.SiteId === activeSiteId && floor.bl_id === selectedFloor.bl_id && floor.LevelName === selectedFloor.LevelName)) };
      if (kind === "room" && selectedRoom) return { ...current, rooms: current.rooms.filter((room) =>
        !(room.SiteId === activeSiteId && room.bl_id === selectedRoom.bl_id && room.LevelName === selectedRoom.LevelName && room.RoomCode === selectedRoom.RoomCode)) };
      return current;
    });
    setSelection({ kind, buildingKey: null, floorKey: null, roomKey: null });
  };

  return <div className="p-4 lg:p-6">
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900">Locations</h1>
        {canWrite && <button type="button" onClick={() => setEditing({
          kind: tab, mode: "create",
          floor: tab === "building" ? null : selectedFloor,
        })}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
          <Plus size={15} /> {addLabel}
        </button>}
      </div>
      <div role="tablist" aria-label="Location types" className="flex gap-1 rounded-lg border bg-white p-1">
        {tabs.map((entry) => <button key={entry.key} role="tab" aria-selected={tab === entry.key} onClick={() => setTab(entry.key)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${tab === entry.key ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
          {entry.icon} {entry.label}
          <span className={`rounded-full px-1.5 text-[11px] ${tab === entry.key ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-700"}`}>{entry.count}</span>
        </button>)}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-white p-3 shadow-sm">
          {tab === "building" && <OverviewTable preferenceKey="locations-buildings" columns={buildingColumns} rows={siteBuildings}
            rowKey={(item) => item.bl_id} onRow={selectBuilding} exportName="locations-buildings"
            rowClassName={(item) => item.bl_id === selection.buildingKey ? "bg-blue-50" : item.IsActive === false ? "opacity-50" : ""} />}
          {tab === "floor" && <OverviewTable preferenceKey="locations-floors" columns={floorColumns} rows={siteFloors}
            rowKey={(item) => `${item.bl_id}:${item.LevelName}`} onRow={selectFloor} exportName="locations-floors"
            rowClassName={(item) => `${item.bl_id}:${item.LevelName}` === selection.floorKey ? "bg-blue-50" : item.IsActive === false ? "opacity-50" : ""} />}
          {tab === "room" && <OverviewTable preferenceKey="locations-rooms" columns={roomColumns} rows={siteRooms}
            rowKey={(item) => `${item.bl_id}:${item.LevelName}:${item.RoomCode}`} onRow={selectRoom} exportName="locations-rooms"
            rowClassName={(item) => `${item.bl_id}:${item.LevelName}:${item.RoomCode}` === selection.roomKey ? "bg-blue-50" : item.IsActive === false ? "opacity-50" : ""} />}
        </section>

        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <LocationDetailsPanel kind={tab} building={selectedBuilding} floor={selectedFloor} room={selectedRoom}
            data={data} siteId={activeSiteId} canWrite={canWrite}
            onEdit={() => setEditing({ kind: tab, mode: "edit", building: selectedBuilding, floor: selectedFloor, room: selectedRoom })}
            onToggleActive={() => toggleActive(tab)}
            onDelete={() => removeSelected(tab)}
            onAdd={() => setEditing(
              tab === "building" && selectedBuilding ? { kind: "floor", mode: "create", building: selectedBuilding } :
              tab === "floor" && selectedFloor ? { kind: "room", mode: "create", building: selectedBuilding, floor: selectedFloor } :
              { kind: tab, mode: "create" })}
            onJumpBuilding={selectBuilding} onJumpFloor={selectFloor} onJumpRoom={selectRoom} />
        </section>
      </div>
      <LocationRenameHistory entries={data.locationRenameLog ?? []} siteId={activeSiteId} />

    </div>

    {editing && <LocationEditor target={editing} buildings={siteBuildings} floors={siteFloors}
      validate={(values, target) => validateLocationForm(target.kind, target.mode, values, data, activeSiteId, editIgnore(target))}
      impactFor={(values, target) => {
        const rename = formRenameRequest(target, values);
        return rename ? locationRenameImpact(data, rename).map((item) => `${item.count} ${item.label}`) : null;
      }}
      onClose={() => setEditing(null)} onApply={applyEditor} />}
  </div>;
}
