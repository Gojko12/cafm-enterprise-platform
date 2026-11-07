"use client";

import React, { useState } from "react";
import { LocationFreezeSchema } from "@cafm/shared-schema";
import type { Building, Floor, LocationFreeze, Room } from "@cafm/shared-schema";
import { OverviewTable } from "@/components/common/TableColumns";
import { LocationEquipmentPickerGroup } from "@/components/common/LocationEquipmentPickerGroup";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";

export function LocationFreezes() {
  const { data, setData } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const [editing, setEditing] = useState<LocationFreeze | "new" | null>(null);
  const [error, setError] = useState("");
  const rows = data.locationFreezes.filter((item) => item.siteId === activeSiteId);
  const remove = (item: LocationFreeze) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setData((state) => {
      const current = state.locationFreezes.find((entry) => entry.siteId === activeSiteId && entry.id === item.id);
      if (JSON.stringify(current) !== JSON.stringify(item)) { queueMicrotask(() => setError("Freeze changed; retry.")); return state; }
      return { ...state, locationFreezes: state.locationFreezes.filter((entry) => entry !== current) };
    });
  };
  const columns = [
    { id: "title", label: "Title", value: (item: LocationFreeze) => item.title },
    { id: "building", label: "Building", value: (item: LocationFreeze) => item.buildingId },
    { id: "floor", label: "Floor", value: (item: LocationFreeze) => item.floorId },
    { id: "room", label: "Room", value: (item: LocationFreeze) => item.roomId },
    { id: "description", label: "Description", value: (item: LocationFreeze) => item.description },
    { id: "responsible", label: "Responsible", value: (item: LocationFreeze) => item.responsiblePerson },
    { id: "start", label: "Start", value: (item: LocationFreeze) => item.startDateTime },
    { id: "end", label: "End", value: (item: LocationFreeze) => item.endDateTime },
    ...(["PM", "FJ", "LJ"] as const).map((type) => ({ id: type, label: `Allow ${type}`, value: (item: LocationFreeze) => item[`allow${type}`] ? "Yes" : "No" })),
    { id: "action", label: "Actions", value: () => "Edit Delete", render: (item: LocationFreeze) => <span className="space-x-2"><button onClick={() => setEditing(item)} className="text-blue-700 underline">Edit</button><button onClick={() => remove(item)} className="text-red-700 underline">Delete</button></span> },
  ];
  return <div className="space-y-4 p-6"><div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Location Freezes</h1><button className="rounded bg-blue-700 px-3 py-2 text-white" onClick={() => setEditing("new")}>+ Create Freeze</button></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <OverviewTable preferenceKey="location-freezes" columns={columns} rows={rows} rowKey={(item) => item.id} />
    {editing && <FreezeEditor key={editing === "new" ? "new" : editing.id} item={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
  </div>;
}

function FreezeEditor({ item, onClose }: { item?: LocationFreeze; onClose: () => void }) {
  const { data, setData } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [responsible, setResponsible] = useState(item?.responsiblePerson ?? "");
  const [start, setStart] = useState(item?.startDateTime ?? "");
  const [end, setEnd] = useState(item?.endDateTime ?? "");
  const [allow, setAllow] = useState({ PM: item?.allowPM ?? false, FJ: item?.allowFJ ?? false, LJ: item?.allowLJ ?? false });
  const [location, setLocation] = useState<{ building: Building | null; floor: Floor | null; room: Room | null }>({
    building: data.buildings.find((entry) => entry.bl_id === item?.buildingId) ?? null,
    floor: data.floors.find((entry) => entry.bl_id === item?.buildingId && entry.LevelName === item?.floorId) ?? null,
    room: data.rooms.find((entry) => entry.bl_id === item?.buildingId && entry.LevelName === item?.floorId && entry.RoomCode === item?.roomId) ?? null,
  });
  const [error, setError] = useState("");
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const result = LocationFreezeSchema.safeParse({ id: item?.id ?? crypto.randomUUID(), siteId: activeSiteId, buildingId: location.building?.bl_id,
      floorId: location.floor?.LevelName, roomId: location.room?.RoomCode, title, description, responsiblePerson: responsible,
      startDateTime: start, endDateTime: end, allowPM: allow.PM, allowFJ: allow.FJ, allowLJ: allow.LJ });
    if (!result.success) { setError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")); return; }
    setData((state) => {
      const current = item && state.locationFreezes.find((entry) => entry.id === item.id && entry.siteId === activeSiteId);
      const validLocation = state.buildings.some((entry) => entry.SiteId === activeSiteId && entry.bl_id === result.data.buildingId) &&
        (!result.data.floorId || state.floors.some((entry) => entry.SiteId === activeSiteId && entry.bl_id === result.data.buildingId && entry.LevelName === result.data.floorId)) &&
        (!result.data.roomId || state.rooms.some((entry) => entry.SiteId === activeSiteId && entry.bl_id === result.data.buildingId && entry.LevelName === result.data.floorId && entry.RoomCode === result.data.roomId));
      if ((item && JSON.stringify(current) !== JSON.stringify(item)) || !validLocation) { queueMicrotask(() => setError("Freeze or location changed; reopen and retry.")); return state; }
      queueMicrotask(onClose);
      return { ...state, locationFreezes: item ? state.locationFreezes.map((entry) => entry === current ? result.data : entry) : [...state.locationFreezes, result.data] };
    });
  };
  return <div role="dialog" aria-modal="true" aria-label="Location freeze editor" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><form onSubmit={save} className="max-h-[90vh] w-full max-w-2xl space-y-3 overflow-auto rounded bg-white p-5 text-sm">
    <h2 className="font-bold">{item ? "Edit" : "Create"} Location Freeze</h2>{error && <p role="alert" className="text-red-700">{error}</p>}
    <LocationEquipmentPickerGroup buildings={data.buildings} floors={data.floors} rooms={data.rooms} selectedBuilding={location.building} selectedFloor={location.floor} selectedRoom={location.room} onLocationChange={setLocation} showEquipment={false} />
    <label className="block">Title<input required className="block w-full border p-1" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    <label className="block">Description<textarea required className="block w-full border p-1" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
    <label className="block">Responsible person<input required className="block w-full border p-1" value={responsible} onChange={(e) => setResponsible(e.target.value)} /></label>
    <div className="flex gap-3"><label>Start<input required type="datetime-local" className="block border p-1" value={start} onChange={(e) => setStart(e.target.value)} /></label><label>End<input required type="datetime-local" className="block border p-1" value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>
    {(["PM", "FJ", "LJ"] as const).map((type) => <label key={type} className="block"><input type="checkbox" checked={allow[type]} onChange={(e) => setAllow({ ...allow, [type]: e.target.checked })} /> Allow {type} without issues</label>)}
    <button className="rounded bg-blue-700 px-3 py-1 text-white">Save</button> <button type="button" className="rounded border px-3 py-1" onClick={onClose}>Cancel</button>
  </form></div>;
}
