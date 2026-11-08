"use client";

import React, { useState } from "react";
import { LocationFreezeSchema } from "@cafm/shared-schema";
import type { LocationFreeze } from "@cafm/shared-schema";
import { OverviewTable } from "@/components/common/TableColumns";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { freezeLocations } from "@/lib/location-freezes";

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
    { id: "building", label: "Building", value: (item: LocationFreeze) => freezeLocations(item).buildings.join(", ") },
    { id: "floor", label: "Floor", value: (item: LocationFreeze) => freezeLocations(item).floors.join(", ") },
    { id: "room", label: "Room", value: (item: LocationFreeze) => freezeLocations(item).rooms.join(", ") },
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
  const [buildings, setBuildings] = useState<string[]>(item ? freezeLocations(item).buildings : []);
  const [floors, setFloors] = useState<string[]>(item ? freezeLocations(item).floors : []);
  const [rooms, setRooms] = useState<string[]>(item ? freezeLocations(item).rooms : []);
  const [locationChanged, setLocationChanged] = useState(false);
  const [picker, setPicker] = useState<"buildings" | "floors" | "rooms" | null>(null);
  const siteBuildings = data.buildings.filter((entry) => entry.SiteId === activeSiteId);
  const siteFloors = data.floors.filter((entry) => entry.SiteId === activeSiteId);
  const siteRooms = data.rooms.filter((entry) => entry.SiteId === activeSiteId);
  const [error, setError] = useState("");
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const locationFields = item && !locationChanged ? { buildingId: item.buildingId, floorId: item.floorId, roomId: item.roomId, buildingIds: item.buildingIds, floorIds: item.floorIds, roomIds: item.roomIds } :
      { buildingId: buildings[0], buildingIds: buildings, floorIds: floors, roomIds: rooms };
    const result = LocationFreezeSchema.safeParse({ id: item?.id ?? crypto.randomUUID(), siteId: activeSiteId, ...locationFields, title, description, responsiblePerson: responsible,
      startDateTime: start, endDateTime: end, allowPM: allow.PM, allowFJ: allow.FJ, allowLJ: allow.LJ });
    if (!result.success) { setError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")); return; }
    setData((state) => {
      const current = item && state.locationFreezes.find((entry) => entry.id === item.id && entry.siteId === activeSiteId);
      const validLocation = buildings.every((id) => state.buildings.some((entry) => entry.SiteId === activeSiteId && entry.bl_id === id)) &&
        floors.every((id) => state.floors.some((entry) => entry.SiteId === activeSiteId && buildings.includes(entry.bl_id) && entry.LevelName === id)) &&
        rooms.every((id) => state.rooms.some((entry) => entry.SiteId === activeSiteId && buildings.includes(entry.bl_id) && floors.includes(entry.LevelName) && entry.RoomCode === id));
      if ((item && JSON.stringify(current) !== JSON.stringify(item)) || !validLocation) { queueMicrotask(() => setError("Freeze or location changed; reopen and retry.")); return state; }
      queueMicrotask(onClose);
      return { ...state, locationFreezes: item ? state.locationFreezes.map((entry) => entry === current ? result.data : entry) : [...state.locationFreezes, result.data] };
    });
  };
  return <div role="dialog" aria-modal="true" aria-label="Location freeze editor" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><form onSubmit={save} className="max-h-[90vh] w-full max-w-2xl space-y-3 overflow-auto rounded bg-white p-5 text-sm">
    <h2 className="font-bold">{item ? "Edit" : "Create"} Location Freeze</h2>{error && <p role="alert" className="text-red-700">{error}</p>}
    {(["buildings", "floors", "rooms"] as const).map((kind) => <div key={kind}><strong>{kind[0].toUpperCase() + kind.slice(1)}:</strong> {(kind === "buildings" ? buildings : kind === "floors" ? floors : rooms).join(", ") || "None"} <button type="button" className="rounded border px-2" onClick={() => setPicker(kind)}>Select...</button></div>)}
    <p className="text-amber-800">A new multi-location freeze applies when any selected building, floor name, or room code matches. Selecting a floor or room also selects its parents, which broadens the freeze to those buildings.</p>
    <label className="block">Title<input required className="block w-full border p-1" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    <label className="block">Description<textarea required className="block w-full border p-1" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
    <label className="block">Responsible person<input required className="block w-full border p-1" value={responsible} onChange={(e) => setResponsible(e.target.value)} /></label>
    <div className="flex gap-3"><label>Start<input required type="datetime-local" className="block border p-1" value={start} onChange={(e) => setStart(e.target.value)} /></label><label>End<input required type="datetime-local" className="block border p-1" value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>
    {(["PM", "FJ", "LJ"] as const).map((type) => <label key={type} className="block"><input type="checkbox" checked={allow[type]} onChange={(e) => setAllow({ ...allow, [type]: e.target.checked })} /> Allow {type} without issues</label>)}
    <button className="rounded bg-blue-700 px-3 py-1 text-white">Save</button> <button type="button" className="rounded border px-3 py-1" onClick={onClose}>Cancel</button>
  </form>{picker && (() => {
    const options = picker === "buildings" ? siteBuildings.map((entry) => ({ id: entry.bl_id, label: `${entry.bl_id} · ${entry.Name}`, building: entry.bl_id, floor: "" })) :
      picker === "floors" ? siteFloors.filter((entry) => !buildings.length || buildings.includes(entry.bl_id)).map((entry) => ({ id: entry.LevelName, label: `${entry.bl_id} / ${entry.LevelName}`, building: entry.bl_id, floor: entry.LevelName })) :
      siteRooms.filter((entry) => (!buildings.length || buildings.includes(entry.bl_id)) && (!floors.length || floors.includes(entry.LevelName))).map((entry) => ({ id: entry.RoomCode, label: `${entry.bl_id} / ${entry.LevelName} / ${entry.RoomCode}`, building: entry.bl_id, floor: entry.LevelName }));
    const selected = picker === "buildings" ? buildings : picker === "floors" ? floors : rooms;
    const apply = (ids: string[], selectedParents = options.filter((option) => ids.includes(option.id))) => {
      setLocationChanged(true);
      if (picker === "buildings") {
        setBuildings(ids);
        const remainingFloors = floors.filter((id) => siteFloors.some((entry) => ids.includes(entry.bl_id) && entry.LevelName === id));
        setFloors(remainingFloors);
        setRooms(rooms.filter((id) => siteRooms.some((entry) => ids.includes(entry.bl_id) && remainingFloors.includes(entry.LevelName) && entry.RoomCode === id)));
      } else if (picker === "floors") {
        setFloors(ids);
        setBuildings((previous) => [...new Set([...previous, ...selectedParents.map((entry) => entry.building)])]);
        setRooms(rooms.filter((id) => siteRooms.some((entry) => buildings.includes(entry.bl_id) && ids.includes(entry.LevelName) && entry.RoomCode === id)));
      } else {
        setRooms(ids);
        setBuildings((previous) => [...new Set([...previous, ...selectedParents.map((entry) => entry.building)])]);
        setFloors((previous) => [...new Set([...previous, ...selectedParents.map((entry) => entry.floor)])]);
      }
    };
    return <div role="dialog" aria-modal="true" aria-label={`Select ${picker}`} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"><div className="max-h-[80vh] w-full max-w-lg space-y-2 overflow-auto rounded bg-white p-4"><h3 className="font-bold">Select {picker}</h3><button type="button" className="rounded border px-2" onClick={() => apply([...new Set(options.map((option) => option.id))])}>Select All</button> <button type="button" className="rounded border px-2" onClick={() => apply([])}>Clear All</button><div className="max-h-80 overflow-auto">{options.map((option, index) => <div key={`${option.label}-${index}`} className="flex items-center justify-between border-b p-1"><span>{option.label}</span><button type="button" className={`rounded border px-2 ${selected.includes(option.id) ? "bg-green-100" : ""}`} onClick={() => apply(selected.includes(option.id) ? selected.filter((id) => id !== option.id) : [...selected, option.id], selected.includes(option.id) ? [] : [option])}>{selected.includes(option.id) ? "Unselect" : "Select"}</button></div>)}</div><button type="button" className="rounded bg-blue-700 px-3 py-1 text-white" onClick={() => setPicker(null)}>Done ({selected.length} selected)</button></div></div>;
  })()}</div>;
}
