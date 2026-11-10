"use client";

import React, { useState } from "react";
import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { BaseWorkRequest, Building, Floor, Room } from "@cafm/shared-schema";
import { LocationEquipmentPickerGroup } from "@/components/common/LocationEquipmentPickerGroup";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";
import { describeLocationFreeze, getActiveFreezeConflictsForWR } from "@/lib/location-freezes";
import { DateInputDDMMYYYY } from "@/components/common/DateInputDDMMYYYY";

export function WRDetailsEditor({ workRequest }: { workRequest: BaseWorkRequest }) {
  const { data, setData } = useCafmStore();
  const { activePerson } = useSiteContext();
  const { currentRole } = useApp();
  const site = workRequest.SiteId;
  const buildings = data.buildings.filter((item) => item.SiteId === site);
  const floors = data.floors.filter((item) => item.SiteId === site);
  const rooms = data.rooms.filter((item) => item.SiteId === site);
  const equipment = data.equipment.filter((item) => item.SiteId === site);
  const [base] = useState(workRequest);
  const [description, setDescription] = useState(workRequest.Description);
  const [trade, setTrade] = useState(workRequest.TradeName ?? workRequest.TradeId ?? "");
  const [cost, setCost] = useState(workRequest.EstimatedCostEur?.toString() ?? "");
  const [costType, setCostType] = useState(workRequest.CostType ?? "");
  const [due, setDue] = useState(workRequest.DueDate?.slice(0, 10) ?? "");
  const [margin, setMargin] = useState(workRequest.MarginDate?.slice(0, 10) ?? "");
  const [craft, setCraft] = useState(workRequest.AssignedCraftpersonIds);
  const [codes, setCodes] = useState(workRequest.EquipmentCodes);
  const [location, setLocation] = useState<{ building: Building | null; floor: Floor | null; room: Room | null }>({
    building: buildings.find((item) => item.bl_id === workRequest.bl_id) ?? null,
    floor: floors.find((item) => item.bl_id === workRequest.bl_id && item.LevelName === workRequest.LevelName) ?? null,
    room: rooms.find((item) => item.bl_id === workRequest.bl_id && item.LevelName === workRequest.LevelName && item.RoomCode === workRequest.RoomCode) ?? null,
  });
  const [error, setError] = useState("");
  const save = () => {
    const amount = cost ? Number(cost) : undefined;
    if (!description.trim() || !location.building) { setError("Description and building are required."); return; }
    if (codes.some((code) => !equipment.some((item) => item.EquipmentCode === code && item.bl_id === location.building?.bl_id &&
      (!location.floor || item.LevelName === location.floor.LevelName) && (!location.room || item.RoomCode === location.room.RoomCode)))) {
      setError("Selected equipment must belong to the selected location."); return;
    }
    if (cost && (amount === undefined || !Number.isFinite(amount) || amount < 0)) { setError("Enter a non-negative cost."); return; }
    if (workRequest.WR_Type === "LJ" && (amount === undefined || amount < 750)) { setError("Long Jobs require an estimated cost of at least EUR 750."); return; }
    if (workRequest.WR_Type === "FJ" && amount !== undefined && amount >= 750) { setError("Fast Job estimated cost must be below EUR 750."); return; }
    if (JSON.stringify(base) !== JSON.stringify(workRequest)) { setError("The work request changed while this editor was open. Close and reopen it before saving."); return; }
    const now = new Date().toISOString();
    const next: BaseWorkRequest = { ...base, Description: description.trim(), TradeId: trade || undefined, TradeName: trade || undefined,
      EstimatedCostEur: amount, CostType: costType === "Fixed" || costType === "Ceiling" ? costType : undefined,
      DueDate: due === base.DueDate?.slice(0, 10) ? base.DueDate : due || undefined,
      MarginDate: margin === base.MarginDate?.slice(0, 10) ? base.MarginDate : margin || undefined,
      AssignedCraftpersonIds: craft, CraftpersonAssignments: base.CraftpersonAssignments?.filter((item) => craft.includes(item.craftpersonId) && base.AssignedCraftpersonIds.includes(item.craftpersonId)), EquipmentCodes: codes,
      bl_id: location.building.bl_id, LevelName: location.floor?.LevelName, RoomCode: location.room?.RoomCode,
      ProblemLocation: [location.building.bl_id, location.floor?.LevelName, location.room?.RoomCode].filter(Boolean).join(" / "),
      UpdatedAt: now };
    const changes = (["Description", "TradeName", "EstimatedCostEur", "CostType", "DueDate", "MarginDate", "AssignedCraftpersonIds", "EquipmentCodes", "bl_id", "LevelName", "RoomCode"] as const)
      .filter((field) => JSON.stringify(base[field]) !== JSON.stringify(next[field]))
      .map((field) => `${field}: ${JSON.stringify(base[field] ?? null)} -> ${JSON.stringify(next[field] ?? null)}`);
    if (!changes.length) { setError("No changes to save."); return; }
    next.Activity = [...(base.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: activePerson,
      actorName: activePerson, actorRole: currentRole, createdAt: now, text: `Work request details edited by ${activePerson}: ${changes.join("; ")}` }];
    setData((state) => {
      const current = state.workRequests.find((item) => item.SiteId === site && item.WR_ID === base.WR_ID);
      if (JSON.stringify(current) !== JSON.stringify(base)) {
        queueMicrotask(() => setError("The work request changed. Close and reopen the editor before saving."));
        return state;
      }
      return { ...state, workRequests: state.workRequests.map((item) => item.SiteId === site && item.WR_ID === base.WR_ID ? next : item) };
    });
    setError("Save requested. Close and reopen the details popup before making further changes.");
  };
  const conflicts = getActiveFreezeConflictsForWR(workRequest, data.locationFreezes);
  return <>{conflicts.length > 0 && <div role="status" className="rounded border border-cyan-500 bg-cyan-50 p-3 text-sm"><strong>❄ Planned in Freeze Period</strong>{conflicts.map((item) => <p key={item.id}>{describeLocationFreeze(item)}</p>)}</div>}<details className="rounded border bg-white">
    <summary className="cursor-pointer bg-slate-50 p-3 font-semibold">Edit work request details</summary>
    <div className="space-y-3 p-3 text-sm">
      {error && <p role="status">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-3">
        <label>Description<input value={description} onChange={(e) => setDescription(e.target.value)} className="block w-full rounded border p-1" /></label>
        <label>Trade<select value={trade} onChange={(e) => setTrade(e.target.value)} className="block w-full rounded border p-1"><option value="">None</option>{trade && !CLASSICAL_TRADES.some((item) => item === trade) && <option>{trade}</option>}{CLASSICAL_TRADES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Estimated cost EUR<input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="block w-full rounded border p-1" /></label>
        <label>Cost type<select value={costType} onChange={(e) => setCostType(e.target.value)} className="block w-full rounded border p-1"><option value="">None</option><option>Fixed</option><option>Ceiling</option></select></label>
        <label>Due date<DateInputDDMMYYYY value={due} onValueChange={setDue} className="block w-full" aria-label="Due date" /></label>
        <label>Margin date<DateInputDDMMYYYY value={margin} onValueChange={setMargin} className="block w-full" aria-label="Margin date" /></label>
      </div>
      <label>Assigned craftspeople<select multiple value={craft} onChange={(e) => setCraft(Array.from(e.target.selectedOptions, (option) => option.value))} className="block w-full rounded border p-1">
        {data.craftspeople.filter((item) => item.SiteId === site).map((person) => <option key={person.id} value={person.id}>{person.Name} {person.LastName} · {person.Trade}</option>)}
      </select></label>
      <LocationEquipmentPickerGroup buildings={buildings} floors={floors} rooms={rooms} equipment={equipment} selectedBuilding={location.building}
        selectedFloor={location.floor} selectedRoom={location.room} selectedEquipmentCodes={codes} onEquipmentChange={setCodes}
        onLocationChange={(next) => {
          setLocation(next);
          setCodes((current) => current.filter((code) => equipment.some((item) => item.EquipmentCode === code &&
            item.bl_id === next.building?.bl_id && (!next.floor || item.LevelName === next.floor.LevelName) && (!next.room || item.RoomCode === next.room.RoomCode))));
        }} />
      <button type="button" onClick={save} className="rounded bg-blue-700 px-3 py-2 text-white">Save details</button>
    </div>
  </details></>;
}
