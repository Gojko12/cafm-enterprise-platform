"use client";

import React, { useState } from "react";
import { EQUIPMENT_CATEGORIES, EquipmentSchema } from "@cafm/shared-schema";
import type { Building, Equipment, Floor, Room } from "@cafm/shared-schema";
import { LocationEquipmentPickerGroup } from "@/components/common/LocationEquipmentPickerGroup";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { LOCAL_EQUIPMENT_CODE_HINT, localEquipmentCodeIssue } from "@/lib/equipment-filters";

// V70 Section 120: extracted from EquipmentRegistry (file cap) and extended
// with the optional Local Equipment Code, the human-readable operational
// identifier. The internal EquipmentCode stays immutable and is allocated
// by the registry; the local code is free text with guidance only.

type Level = "Installation" | "SubEquipment" | "Component";

export function AddEquipmentModal({ siteId, onClose, onCreated }: { siteId: Equipment["SiteId"]; onClose: () => void; onCreated: (code: string) => void }) {
  const { data, setData } = useCafmStore();
  const { permissions } = useActiveUserPermissions();
  const { activePerson } = useSiteContext();
  const siteEquipment = data.equipment.filter((eq) => eq.SiteId === siteId);
  const buildings = data.buildings.filter((entry) => entry.SiteId === siteId);
  const floors = data.floors.filter((entry) => entry.SiteId === siteId);
  const rooms = data.rooms.filter((entry) => entry.SiteId === siteId);
  const [name, setName] = useState("");
  const [localCode, setLocalCode] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState<Level>("Installation");
  const [parent, setParent] = useState("");
  const [trade, setTrade] = useState("");
  const [location, setLocation] = useState<{ building: Building | null; floor: Floor | null; room: Room | null }>({ building: null, floor: null, room: null });
  const [error, setError] = useState("");
  const localCodeIssue = localEquipmentCodeIssue(localCode);
  const parentLevel = level === "SubEquipment" ? "Installation" : level === "Component" ? "SubEquipment" : undefined;
  const parents = parentLevel ? siteEquipment.filter((eq) => eq.HierarchyLevel === parentLevel) : [];
  const trades = [...new Set(siteEquipment.map((eq) => eq.PrimaryTradeId).filter((value): value is string => !!value))];
  const create = () => {
    if (!permissions?.canManageEquipment) { setError("Permission required: Manage Equipment."); return; }
    if (!name.trim()) { setError("Equipment name is required."); return; }
    if (!category) { setError("Select a category."); return; }
    const parentItem = parents.find((eq) => eq.EquipmentCode === parent);
    if (parentLevel && !parentItem) { setError(`Select a parent ${parentLevel}.`); return; }
    const place = parentItem ? { bl_id: parentItem.bl_id, LevelName: parentItem.LevelName, RoomCode: parentItem.RoomCode }
      : location.building && location.floor && location.room ? { bl_id: location.building.bl_id, LevelName: location.floor.LevelName, RoomCode: location.room.RoomCode } : null;
    if (!place) { setError("Select a building, floor and room."); return; }
    const maxCode = data.equipment.reduce((max, eq) => /^\d{10}$/.test(eq.EquipmentCode) ? Math.max(max, Number(eq.EquipmentCode)) : max, 0);
    const code = String(maxCode + 1).padStart(10, "0");
    const parsed = EquipmentSchema.safeParse({
      EquipmentCode: code, LocalEquipmentCode: localCode.trim() || undefined, EquipmentName: name.trim(), Category: category, HierarchyLevel: level, IsInstallation: level === "Installation",
      ParentEquipmentCode: parentItem?.EquipmentCode, Status: "In Service", TechnicalSpecifications: {}, SiteId: siteId, ...place,
      PrimaryTradeId: trade.trim() || parentItem?.PrimaryTradeId,
      Activity: [{ id: crypto.randomUUID(), kind: "log", actorId: activePerson, actorName: activePerson, actorRole: "", createdAt: new Date().toISOString(), text: "Equipment created in the registry." }],
    });
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")); return; }
    setData((state) => ({ ...state, equipment: [...state.equipment, parsed.data] }));
    onCreated(code);
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3" role="dialog" aria-label="Add equipment">
    <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5"><strong>Add Equipment</strong>
        <button aria-label="Close" onClick={onClose} className="rounded px-2 text-slate-500 hover:bg-slate-100">×</button></div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto px-4 py-3 text-xs">
        <label className="col-span-2">Name *<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded border p-1.5 text-sm" /></label>
        <label className="col-span-2">Local Equipment Code (optional)
          <input value={localCode} onChange={(event) => setLocalCode(event.target.value)} placeholder="e.g. E-1_ARLT1" aria-label="Local Equipment Code" className="mt-1 block w-full rounded border p-1.5 font-mono text-sm" />
          <span className={`mt-1 block text-[11px] ${localCodeIssue ? "text-amber-700" : "text-slate-400"}`}>{localCodeIssue ?? LOCAL_EQUIPMENT_CODE_HINT}</span></label>
        <label>Hierarchy level<select value={level} onChange={(event) => { setLevel(event.target.value as Level); setParent(""); }} className="mt-1 block w-full rounded border p-1.5 text-sm"><option>Installation</option><option>SubEquipment</option><option>Component</option></select></label>
        <label>Category *<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 block w-full rounded border p-1.5 text-sm"><option value="">Select</option>{Object.entries(EQUIPMENT_CATEGORIES).map(([code, label]) => <option key={code} value={code}>{code} · {label}</option>)}</select></label>
        {parentLevel && <label className="col-span-2">Parent {parentLevel} * (location is inherited)<select value={parent} onChange={(event) => setParent(event.target.value)} className="mt-1 block w-full rounded border p-1.5 text-sm"><option value="">Select</option>{parents.map((eq) => <option key={eq.EquipmentCode} value={eq.EquipmentCode}>{eq.EquipmentCode} · {eq.EquipmentName}</option>)}</select></label>}
        <label>Trade<input list="equipment-trades" value={trade} onChange={(event) => setTrade(event.target.value)} className="mt-1 block w-full rounded border p-1.5 text-sm" /><datalist id="equipment-trades">{trades.map((value) => <option key={value} value={value} />)}</datalist></label>
        {!parentLevel && <div className="col-span-2"><LocationEquipmentPickerGroup buildings={buildings} floors={floors} rooms={rooms} showEquipment={false}
          selectedBuilding={location.building} selectedFloor={location.floor} selectedRoom={location.room} onLocationChange={(next) => { setError(""); setLocation(next); }} /></div>}
        {error && <p role="alert" className="col-span-2 text-sm text-red-700">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t bg-slate-50 px-4 py-2.5">
        <button onClick={onClose} className="rounded border bg-white px-3 py-1.5 text-sm">Cancel</button>
        <button onClick={create} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">Create Equipment</button></div>
    </div>
  </div>;
}
