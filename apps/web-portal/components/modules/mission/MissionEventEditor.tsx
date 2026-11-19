"use client";

import React, { useMemo, useState } from "react";
import { MissionEventSchema, type MissionEvent, type MissionFacilityConstraint } from "@cafm/shared-schema";
import { DateTimeInputDDMMYYYY } from "@/components/common/DateInputDDMMYYYY";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { MISSION_CONSTRAINTS, missionFreezeDescription, missionEventToFreeze } from "@/lib/mission-control";

const EVENT_TYPES = ["LEOP", "Launch Window", "Critical Pass", "Maneuver", "Collision Avoidance", "Commissioning", "Special Event"] as const;
const CRITICALITIES = ["Critical", "High", "Standard"] as const;
const CONSTRAINTS: MissionFacilityConstraint[] = ["TOTAL_LOCKDOWN", "PLANNED_ONLY", "COORDINATE_FIRST"];

export function MissionEventEditor({ item, onClose }: { item?: MissionEvent; onClose: () => void }) {
  const { data, setData } = useCafmStore();
  const { permissions } = useActiveUserPermissions();
  const { activeSiteId } = useSiteContext();
  const [missionName, setMissionName] = useState(item?.missionName ?? "");
  const [missionRef, setMissionRef] = useState(item?.missionRef ?? "");
  const [eventType, setEventType] = useState<MissionEvent["eventType"]>(item?.eventType ?? "LEOP");
  const [criticality, setCriticality] = useState<MissionEvent["criticality"]>(item?.criticality ?? "Critical");
  const [start, setStart] = useState(item?.startDateTime ?? "");
  const [end, setEnd] = useState(item?.endDateTime ?? "");
  const [buildings, setBuildings] = useState<string[]>(item?.buildingIds ?? []);
  const [floors, setFloors] = useState<string[]>(item?.floorIds ?? []);
  const [rooms, setRooms] = useState<string[]>(item?.roomIds ?? []);
  const [constraint, setConstraint] = useState<MissionFacilityConstraint>(item?.facilityConstraint ?? "TOTAL_LOCKDOWN");
  const [missionLead, setMissionLead] = useState(item?.missionLead ?? "");
  const [remarks, setRemarks] = useState(item?.remarks ?? "");
  const [error, setError] = useState("");
  const published = !!(item?.freezeId && data.locationFreezes.some((entry) => entry.id === item.freezeId));
  const siteBuildings = data.buildings.filter((entry) => entry.SiteId === activeSiteId);
  const siteFloors = data.floors.filter((entry) => entry.SiteId === activeSiteId && (!buildings.length || buildings.includes(entry.bl_id)));
  const siteRooms = data.rooms.filter((entry) => entry.SiteId === activeSiteId && (!buildings.length || buildings.includes(entry.bl_id)) && (!floors.length || floors.includes(entry.LevelName)));

  const draft = useMemo<MissionEvent | null>(() => {
    const result = MissionEventSchema.safeParse({
      id: item?.id ?? "preview", siteId: activeSiteId, missionRef, missionName, eventType, criticality, startDateTime: start, endDateTime: end,
      buildingIds: buildings, floorIds: floors, roomIds: rooms, facilityConstraint: constraint, missionLead, remarks,
    });
    return result.success ? result.data : null;
  }, [activeSiteId, missionRef, missionName, eventType, criticality, start, end, buildings, floors, rooms, constraint, missionLead, remarks]);

  const toggleBuilding = (id: string) => {
    const next = buildings.includes(id) ? buildings.filter((value) => value !== id) : [...buildings, id];
    setBuildings(next);
    setFloors(floors.filter((floor) => data.floors.some((entry) => entry.LevelName === floor && next.includes(entry.bl_id) && entry.SiteId === activeSiteId)));
    setRooms(rooms.filter((room) => data.rooms.some((entry) => entry.RoomCode === room && next.includes(entry.bl_id) && entry.SiteId === activeSiteId)));
  };
  const toggleFloor = (id: string) => {
    setFloors((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  };
  const toggleRoom = (id: string) => {
    const room = siteRooms.find((entry) => entry.RoomCode === id);
    const next = rooms.includes(id) ? rooms.filter((value) => value !== id) : [...rooms, id];
    setRooms(next);
    if (room && !rooms.includes(id)) {
      setFloors((previous) => previous.includes(room.LevelName) ? previous : [...previous, room.LevelName]);
      setBuildings((previous) => previous.includes(room.bl_id) ? previous : [...previous, room.bl_id]);
    }
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!permissions?.canManageMissionEvents) { setError("Permission required: Manage Mission Events."); return; }
    const result = MissionEventSchema.safeParse({
      id: item?.id ?? crypto.randomUUID(), siteId: activeSiteId, missionRef, missionName, eventType, criticality,
      startDateTime: start, endDateTime: end, buildingIds: buildings, floorIds: floors, roomIds: rooms,
      facilityConstraint: constraint, missionLead, remarks,
    });
    if (!result.success) { setError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")); return; }
    const saved = result.data;
    setData((state) => {
      const current = item ? (state.missionEvents ?? []).find((entry) => entry.id === item.id && entry.siteId === activeSiteId) : undefined;
      if (item && (!current || JSON.stringify(current) !== JSON.stringify(item))) { queueMicrotask(() => setError("Mission event changed; reopen and retry.")); return state; }
      const freezeId = current?.freezeId && state.locationFreezes.some((entry) => entry.id === current.freezeId) ? current.freezeId : undefined;
      const nextEvent: MissionEvent = freezeId ? { ...saved, freezeId } : { ...saved };
      const nextFreeze = freezeId ? missionEventToFreeze(nextEvent, freezeId) : undefined;
      queueMicrotask(onClose);
      return {
        ...state,
        missionEvents: current
          ? (state.missionEvents ?? []).map((entry) => entry === current ? nextEvent : entry)
          : [...(state.missionEvents ?? []), nextEvent],
        locationFreezes: nextFreeze
          ? state.locationFreezes.map((entry) => entry.id === nextFreeze.id ? nextFreeze : entry)
          : state.locationFreezes,
      };
    });
  };

  const rule = MISSION_CONSTRAINTS[constraint];
  return <div role="dialog" aria-modal="true" aria-label="Mission event editor" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><form onSubmit={save} className="max-h-[85vh] w-full max-w-3xl space-y-3 overflow-auto rounded bg-white p-5 text-sm">
    <h2 className="font-bold">{item ? "Edit" : "Plan"} Mission Event</h2>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {published && <p className="text-amber-800">This event is published to CAFM. Saving updates the facility freeze automatically.</p>}
    <div className="grid gap-3 sm:grid-cols-2"><label className="block">Mission / programme name<input required className="block w-full border p-1" value={missionName} onChange={(e) => setMissionName(e.target.value)} /></label>
      <label className="block">Mission reference<input required className="block w-full border p-1" value={missionRef} onChange={(e) => setMissionRef(e.target.value)} /></label></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block">Event type<select className="block w-full border p-1" value={eventType} onChange={(e) => setEventType(e.target.value as MissionEvent["eventType"])}>{EVENT_TYPES.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
      <label className="block">Criticality<select className="block w-full border p-1" value={criticality} onChange={(e) => setCriticality(e.target.value as MissionEvent["criticality"])}>{CRITICALITIES.map((entry) => <option key={entry}>{entry}</option>)}</select></label></div>
    <div className="flex gap-3"><label>Ops window start<DateTimeInputDDMMYYYY required className="block border p-1" value={start} onChange={(event) => setStart(event.target.value)} aria-label="Ops window start" /></label><label>end<DateTimeInputDDMMYYYY required className="block border p-1" value={end} onChange={(event) => setEnd(event.target.value)} aria-label="Ops window end" /></label></div>
    <fieldset className="rounded border p-2"><legend className="font-semibold">Protected zones</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><p className="font-semibold">Buildings</p><div className="max-h-40 overflow-auto">{siteBuildings.map((entry) => <label key={entry.bl_id} className="block"><input type="checkbox" checked={buildings.includes(entry.bl_id)} onChange={() => toggleBuilding(entry.bl_id)} /> {entry.bl_id} · {entry.Name}</label>)}</div></div>
        <div><p className="font-semibold">Floors</p><div className="max-h-40 overflow-auto">{siteFloors.map((entry) => <label key={`${entry.bl_id}-${entry.LevelName}`} className="block"><input type="checkbox" checked={floors.includes(entry.LevelName)} onChange={() => toggleFloor(entry.LevelName)} disabled={!buildings.includes(entry.bl_id)} /> {entry.bl_id} / {entry.LevelName}</label>)}</div></div>
        <div><p className="font-semibold">Rooms</p><div className="max-h-40 overflow-auto">{siteRooms.map((entry) => <label key={`${entry.bl_id}-${entry.LevelName}-${entry.RoomCode}`} className="block"><input type="checkbox" checked={rooms.includes(entry.RoomCode)} onChange={() => toggleRoom(entry.RoomCode)} disabled={!buildings.includes(entry.bl_id) || !floors.includes(entry.LevelName)} /> {entry.RoomCode}</label>)}</div></div>
      </div>
      <p className="text-amber-800">Selecting a room automatically selects its floor and building; deselecting a building clears its floors and rooms.</p>
    </fieldset>
    <fieldset className="rounded border p-2"><legend className="font-semibold">Facility constraint during the window</legend>
      {CONSTRAINTS.map((entry) => <label key={entry} className={`block rounded border p-2 ${constraint === entry ? "border-blue-600 bg-blue-50" : ""}`}><input type="radio" name="facilityConstraint" checked={constraint === entry} onChange={() => setConstraint(entry)} /> <strong>{MISSION_CONSTRAINTS[entry].missionLabel}.</strong> {MISSION_CONSTRAINTS[entry].missionDescription}</label>)}
    </fieldset>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block">Mission lead<input required className="block w-full border p-1" value={missionLead} onChange={(e) => setMissionLead(e.target.value)} /></label>
      <label className="block">Ops remarks<textarea className="block w-full border p-1" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label></div>
    <div className="rounded border border-slate-300 bg-slate-50 p-2"><p className="font-semibold">What the facility team will see</p>
      {draft ? <>
        <p>Freeze title: <strong>{missionEventToFreeze(draft, "preview").title}</strong></p>
        <p>{missionFreezeDescription(draft)}</p>
        <p>{(["PM", "FJ", "LJ"] as const).map((type) => `${type}: ${rule[`allow${type}`] ? "Allowed" : "Frozen"}`).join(" · ")}</p>
      </> : <p>Complete the form to preview the facility freeze.</p>}
    </div>
    <button disabled={!permissions?.canManageMissionEvents} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-40">Save</button> <button type="button" className="rounded border px-3 py-1" onClick={onClose}>Cancel</button>
  </form></div>;
}
