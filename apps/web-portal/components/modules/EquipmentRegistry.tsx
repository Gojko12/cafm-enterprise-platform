"use client";

import React, { useEffect, useState } from "react";
import { EQUIPMENT_CATEGORIES, EquipmentSchema, TechnicalSpecificationsSchema } from "@cafm/shared-schema";
import type { BaseWorkRequest, Equipment } from "@cafm/shared-schema";
import { OverviewTable } from "@/components/common/TableColumns";
import { LocationEquipmentPickerGroup } from "@/components/common/LocationEquipmentPickerGroup";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { PMWorkRequestPopup } from "./PMWorkRequestPopup";
import { FJWorkRequestPopup } from "./FJWorkRequestPopup";
import { LJWorkRequestPopup } from "./LJWorkRequestPopup";

const columns = [
  { id: "code", label: "EQ ID", value: (eq: Equipment) => eq.EquipmentCode },
  { id: "name", label: "Name", value: (eq: Equipment) => eq.EquipmentName },
  { id: "local", label: "Local name", value: (eq: Equipment) => eq.EquipmentNameLocal },
  { id: "category", label: "Category", value: (eq: Equipment) => eq.Category ? `${eq.Category} - ${EQUIPMENT_CATEGORIES[eq.Category]}` : undefined },
  { id: "level", label: "Hierarchy Level", value: (eq: Equipment) => eq.HierarchyLevel },
  { id: "parent", label: "Parent", value: (eq: Equipment) => eq.ParentEquipmentCode },
  { id: "building", label: "Building", value: (eq: Equipment) => eq.bl_id },
  { id: "floor", label: "Floor", value: (eq: Equipment) => eq.LevelName },
  { id: "room", label: "Room", value: (eq: Equipment) => eq.RoomCode },
  { id: "status", label: "Status", value: (eq: Equipment) => eq.Status },
  { id: "criticality", label: "Criticality", value: (eq: Equipment) => eq.Criticality },
];

export function EquipmentRegistry() {
  const { data } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const [selected, setSelected] = useState<string | null>(null);
  const [tree, setTree] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  useEffect(() => { setSelected(null); setExpanded([]); }, [activeSiteId]);
  const equipment = data.equipment.filter((item) => item.SiteId === activeSiteId);
  const item = equipment.find((eq) => eq.EquipmentCode === selected);
  const shown = tree ? equipment.filter((eq) => {
    if (!eq.ParentEquipmentCode) return true;
    const parent = equipment.find((candidate) => candidate.EquipmentCode === eq.ParentEquipmentCode);
    return expanded.includes(eq.ParentEquipmentCode) && (!parent?.ParentEquipmentCode || expanded.includes(parent.ParentEquipmentCode));
  }) : equipment;
  const treeColumns = columns.map((column) => column.id !== "code" ? column : {
    ...column, render: (eq: Equipment) => <span className="whitespace-nowrap" style={{ paddingLeft: eq.HierarchyLevel === "Component" ? 32 : eq.HierarchyLevel === "SubEquipment" ? 16 : 0 }}>
      {equipment.some((child) => child.ParentEquipmentCode === eq.EquipmentCode) && <button aria-expanded={expanded.includes(eq.EquipmentCode)}
        onClick={(event) => { event.stopPropagation(); setExpanded((current) => current.includes(eq.EquipmentCode) ? current.filter((code) => code !== eq.EquipmentCode) : [...current, eq.EquipmentCode]); }}>{expanded.includes(eq.EquipmentCode) ? "▼" : "▶"}</button>} {eq.EquipmentCode}</span>,
  });
  return <div className="space-y-3 p-6">
    <h1 className="text-xl font-semibold">Equipment Registry</h1>
    <button className="rounded border bg-white px-2 py-1 text-xs" aria-pressed={tree} onClick={() => setTree((current) => !current)}>{tree ? "Tree view" : "Flat view"}</button>
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className={`min-w-0 transition-all ${item ? "lg:w-1/2" : "w-full"}`}>
        <OverviewTable preferenceKey="equipment" columns={tree ? treeColumns : columns} rows={shown} rowKey={(eq) => eq.EquipmentCode} onRow={(eq) => setSelected(eq.EquipmentCode)} />
      </div>
      {item && <EquipmentDetails key={`${activeSiteId}:${item.EquipmentCode}`} item={item} onClose={() => setSelected(null)} />}
    </div>
  </div>;
}

function EquipmentDetails({ item, onClose }: { item: Equipment; onClose: () => void }) {
  const { data, setData } = useCafmStore();
  const [tab, setTab] = useState<"General" | "Details" | "WRs" | "Attached Documents" | "KPIs">("General");
  const [draft, setDraft] = useState(item);
  const [baseline, setBaseline] = useState(item);
  const [specifications, setSpecifications] = useState(JSON.stringify(item.TechnicalSpecifications, null, 2));
  const [error, setError] = useState("");
  const [type, setType] = useState<"All" | "PM" | "FJ" | "LJ">("All");
  const [openWR, setOpenWR] = useState<BaseWorkRequest | null>(null);
  const siteEquipment = data.equipment.filter((eq) => eq.SiteId === item.SiteId);
  const buildings = data.buildings.filter((entry) => entry.SiteId === item.SiteId);
  const floors = data.floors.filter((entry) => entry.SiteId === item.SiteId);
  const rooms = data.rooms.filter((entry) => entry.SiteId === item.SiteId);
  const [location, setLocation] = useState({
    building: buildings.find((entry) => entry.bl_id === item.bl_id) ?? null,
    floor: floors.find((entry) => entry.bl_id === item.bl_id && entry.LevelName === item.LevelName) ?? null,
    room: rooms.find((entry) => entry.bl_id === item.bl_id && entry.LevelName === item.LevelName && entry.RoomCode === item.RoomCode) ?? null,
  });
  const requests = data.workRequests.filter((wr) => wr.SiteId === item.SiteId && wr.EquipmentCodes.includes(item.EquipmentCode));
  const actual = openWR && data.workRequests.find((wr) => wr.SiteId === openWR.SiteId && wr.WR_ID === openWR.WR_ID);
  const save = () => {
    if (!draft.EquipmentName.trim()) { setError("Equipment name is required."); return; }
    if (!location.building || !location.floor || !location.room) { setError("Select a building, floor and room."); return; }
    if (!draft.Category || !draft.HierarchyLevel) { setError("Select a category and hierarchy level."); return; }
    const parent = siteEquipment.find((eq) => eq.EquipmentCode === draft.ParentEquipmentCode);
    if ((draft.HierarchyLevel === "Installation" && draft.ParentEquipmentCode) ||
      (draft.HierarchyLevel === "SubEquipment" && parent?.HierarchyLevel !== "Installation") ||
      (draft.HierarchyLevel === "Component" && parent?.HierarchyLevel !== "SubEquipment") || parent?.EquipmentCode === item.EquipmentCode) {
      setError("Select an appropriate parent: Installation → SubEquipment → Component."); return;
    }
    const children = siteEquipment.filter((eq) => eq.ParentEquipmentCode === item.EquipmentCode);
    if (children.some((eq) => (draft.HierarchyLevel === "Installation" ? eq.HierarchyLevel !== "SubEquipment" :
      draft.HierarchyLevel === "SubEquipment" ? eq.HierarchyLevel !== "Component" : true))) {
      setError("This level is incompatible with existing children."); return;
    }
    let specs: unknown;
    try { specs = JSON.parse(specifications); } catch { setError("Technical specifications must be valid JSON."); return; }
    const validatedSpecs = TechnicalSpecificationsSchema.safeParse(specs);
    if (!validatedSpecs.success) { setError("Technical specifications must be an object with string, number, boolean or string-array values."); return; }
    const parsed = EquipmentSchema.safeParse({ ...draft, TechnicalSpecifications: validatedSpecs.data, bl_id: location.building.bl_id, LevelName: location.floor.LevelName,
      RoomCode: location.room.RoomCode, IsInstallation: draft.HierarchyLevel === "Installation" });
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")); return; }
    if (JSON.stringify(baseline) !== JSON.stringify(data.equipment.find((eq) => eq.SiteId === item.SiteId && eq.EquipmentCode === item.EquipmentCode))) {
      setError("Equipment changed; reopen the details panel."); return;
    }
    setData((state) => {
      const current = state.equipment.find((eq) => eq.SiteId === item.SiteId && eq.EquipmentCode === item.EquipmentCode);
      if (JSON.stringify(current) !== JSON.stringify(baseline)) { queueMicrotask(() => setError("Equipment changed; reopen the details panel.")); return state; }
      const currentParent = state.equipment.find((eq) => eq.SiteId === item.SiteId && eq.EquipmentCode === parsed.data.ParentEquipmentCode);
      if ((parsed.data.HierarchyLevel === "SubEquipment" && currentParent?.HierarchyLevel !== "Installation") ||
          (parsed.data.HierarchyLevel === "Component" && currentParent?.HierarchyLevel !== "SubEquipment") ||
          state.equipment.some((eq) => eq.SiteId === item.SiteId && eq.ParentEquipmentCode === item.EquipmentCode &&
            (parsed.data.HierarchyLevel === "Installation" ? eq.HierarchyLevel !== "SubEquipment" : parsed.data.HierarchyLevel === "SubEquipment" ? eq.HierarchyLevel !== "Component" : true))) {
        queueMicrotask(() => setError("Equipment hierarchy changed; reload before saving.")); return state;
      }
      queueMicrotask(() => setBaseline(parsed.data));
      return { ...state, equipment: state.equipment.map((eq) => eq.SiteId === item.SiteId && eq.EquipmentCode === item.EquipmentCode ? parsed.data : eq) };
    });
    setError("");
  };
  const text = (label: string, value: string | undefined, change: (value: string) => void, inputType = "text") =>
    <label className="text-xs">{label}<input type={inputType} value={value ?? ""} onChange={(event) => change(event.target.value)} className="mt-1 block w-full rounded border p-1 text-sm" /></label>;
  const number = (label: string, key: "LengthCm" | "WidthCm" | "HeightCm" | "WeightKg" | "ReplacementCostEur") =>
    <label className="text-xs">{label}<input type="number" min="0" value={draft[key] ?? ""} onChange={(event) => {
      const raw = event.target.value; setDraft((current) => ({ ...current, [key]: raw === "" ? undefined : Number(raw) }));
    }} className="mt-1 block w-full rounded border p-1 text-sm" /></label>;
  return <aside className="min-w-0 space-y-3 rounded border bg-white p-3 lg:w-1/2">
    <div className="flex justify-between"><strong>{item.EquipmentCode} · {item.EquipmentName}</strong><button aria-label="Close equipment details" onClick={onClose}>✕</button></div>
    <nav className="flex flex-wrap gap-1">{(["General", "Details", "WRs", "Attached Documents", "KPIs"] as const).map((name) =>
      <button key={name} onClick={() => setTab(name)} aria-pressed={tab === name} className={`rounded border px-2 py-1 text-xs ${tab === name ? "bg-blue-100" : ""}`}>{name}</button>)}</nav>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {tab === "General" && <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {text("EQ Name (English)", draft.EquipmentName, (value) => setDraft({ ...draft, EquipmentName: value }))}
        {text("EQ Name (Local Language)", draft.EquipmentNameLocal, (value) => setDraft({ ...draft, EquipmentNameLocal: value }))}
        <label className="text-xs">Category<select value={draft.Category ?? ""} onChange={(e) => {
          const value = e.target.value; const category = Object.keys(EQUIPMENT_CATEGORIES).find((key) => key === value);
          if (category && category in EQUIPMENT_CATEGORIES) setDraft({ ...draft, Category: category as keyof typeof EQUIPMENT_CATEGORIES });
        }} className="block w-full rounded border p-1"><option value="">Select</option>{Object.entries(EQUIPMENT_CATEGORIES).map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</select></label>
        <label className="text-xs">Hierarchy Level<select value={draft.HierarchyLevel ?? ""} onChange={(e) => {
          const value = e.target.value;
          if (value === "Installation" || value === "SubEquipment" || value === "Component") setDraft({ ...draft, HierarchyLevel: value, ParentEquipmentCode: undefined });
        }} className="block w-full rounded border p-1"><option value="">Select</option><option>Installation</option><option>SubEquipment</option><option>Component</option></select></label>
        <label className="text-xs">Subcomponent of<select value={draft.ParentEquipmentCode ?? ""} onChange={(e) => setDraft({ ...draft, ParentEquipmentCode: e.target.value || undefined })} className="block w-full rounded border p-1"><option value="">None</option>{siteEquipment.filter((eq) => eq.EquipmentCode !== item.EquipmentCode && eq.HierarchyLevel === (draft.HierarchyLevel === "SubEquipment" ? "Installation" : draft.HierarchyLevel === "Component" ? "SubEquipment" : "")).map((eq) => <option key={eq.EquipmentCode} value={eq.EquipmentCode}>{eq.EquipmentCode} · {eq.EquipmentName}</option>)}</select></label>
        {text("Installation date", draft.InstallationDate?.slice(0, 10), (value) => setDraft({ ...draft, InstallationDate: value || undefined }), "date")}
        <label className="text-xs">Operational status<select value={draft.Status} onChange={(e) => { const value = e.target.value; if (value === "Active" || value === "Decommissioned" || value === "Under Repair") setDraft({ ...draft, Status: value }); }} className="block w-full rounded border p-1"><option>Active</option><option>Under Repair</option><option>Decommissioned</option></select></label>
        <label className="text-xs">Criticality<select value={draft.Criticality ?? ""} onChange={(e) => { const value = e.target.value; if (value === "") setDraft({ ...draft, Criticality: undefined }); else if (value === "Low" || value === "Medium" || value === "High" || value === "Critical") setDraft({ ...draft, Criticality: value }); }} className="block w-full rounded border p-1"><option value="">None</option><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label>
      </div>
      <p className="text-xs">Direct children: {siteEquipment.filter((eq) => eq.ParentEquipmentCode === item.EquipmentCode).map((eq) => `${eq.EquipmentCode} ${eq.EquipmentName}`).join(", ") || "None"}</p>
      <LocationEquipmentPickerGroup buildings={buildings} floors={floors} rooms={rooms} showEquipment={false}
        selectedBuilding={location.building} selectedFloor={location.floor} selectedRoom={location.room}
        onLocationChange={(next) => { setError(""); setLocation(next); }} />
      <button onClick={save} className="rounded bg-blue-700 px-3 py-1 text-white">Save</button>
    </div>}
    {tab === "Details" && <div className="space-y-3"><div className="grid grid-cols-2 gap-2">
      {number("Length (cm)", "LengthCm")}{number("Width (cm)", "WidthCm")}{number("Height (cm)", "HeightCm")}{number("Weight (kg)", "WeightKg")}
      {number("Replacement cost (EUR)", "ReplacementCostEur")}
      {text("Manufacturer", draft.Manufacturer, (value) => setDraft({ ...draft, Manufacturer: value }))}
      {text("Manufacturer article ID", draft.ManufacturerArticleId, (value) => setDraft({ ...draft, ManufacturerArticleId: value }))}
      {text("Model", draft.Model, (value) => setDraft({ ...draft, Model: value }))}
      {text("Serial number", draft.SerialNumber, (value) => setDraft({ ...draft, SerialNumber: value }))}
      {text("Documentation URL", draft.DocumentationUrl, (value) => setDraft({ ...draft, DocumentationUrl: value || undefined }), "url")}
    </div>
      {draft.DocumentationUrl && /^https?:\/\//i.test(draft.DocumentationUrl) && <a className="text-blue-700 underline" href={draft.DocumentationUrl} target="_blank" rel="noreferrer">Open documentation</a>}
      <label className="block text-xs">Power / Technical Specs (JSON)<textarea value={specifications} onChange={(event) => setSpecifications(event.target.value)} rows={5} className="block w-full rounded border p-2 font-mono" /></label>
      <button onClick={save} className="rounded bg-blue-700 px-3 py-1 text-white">Save</button></div>}
    {tab === "WRs" && <div className="space-y-2"><div className="flex gap-2">{(["All", "PM", "FJ", "LJ"] as const).map((value) => <button key={value} aria-pressed={type === value} onClick={() => setType(value)} className="rounded border px-2">{value}</button>)}</div>
      {requests.filter((wr) => type === "All" || wr.WR_Type === type).map((wr) => <div key={wr.WR_ID} className="border-b py-1 text-xs">{wr.WR_ID} · {wr.WR_Type} · {wr.WorkRequestStatus} {wr.Percentage}% · {wr.DueDate ?? "—"} · {wr.EstimatedCostEur ?? "—"} EUR <button className="text-blue-700 underline" onClick={() => setOpenWR(wr)}>Open</button></div>)}</div>}
    {tab === "Attached Documents" && <div className="space-y-2">
      <label className="text-sm">Upload document<input type="file" className="block" onChange={(event) => {
        const file = event.target.files?.[0]; if (!file) return;
        if (file.size > 5 * 1024 * 1024) { setError("Document must be 5 MB or less."); return; }
        const reader = new FileReader();
        reader.onerror = () => setError("Could not read the selected document.");
        reader.onload = () => { if (typeof reader.result === "string") setDraft((current) => ({ ...current, Documents: [...(current.Documents ?? []), { id: crypto.randomUUID(), name: file.name, type: file.type, dataUrl: reader.result as string }] })); };
        reader.readAsDataURL(file);
      }} /></label>
      {(draft.Documents ?? []).map((document) => <div key={document.id} className="flex gap-3 text-xs"><a className="text-blue-700 underline" href={document.dataUrl} download={document.name}>{document.name}</a><button onClick={() => setDraft({ ...draft, Documents: draft.Documents?.filter((entry) => entry.id !== document.id) })}>Delete</button></div>)}
      <button onClick={save} className="rounded bg-blue-700 px-3 py-1 text-white">Save documents</button>
    </div>}
    {tab === "KPIs" && <dl className="space-y-1 text-sm">
      <div>Total Maintenance Cost: {requests.some((wr) => wr.ActualCostEur !== undefined) ? `${requests.reduce((sum, wr) => sum + (wr.ActualCostEur ?? 0), 0).toFixed(2)} EUR (recorded costs)` : "Not recorded"}</div>
      <div>PM Compliance: {requests.some((wr) => wr.WR_Type === "PM") ? `${Math.round(requests.filter((wr) => wr.WR_Type === "PM" && wr.Percentage === 100).length / requests.filter((wr) => wr.WR_Type === "PM").length * 100)}% (closed PMs)` : "Not available"}</div>
      <div>Reactive work requests: {requests.filter((wr) => wr.WR_Type !== "PM").length}</div>
      <div>MTBF / MTTR / Availability / Health score: Not available (insufficient reliable operating and breakdown data).</div>
    </dl>}
    {actual?.WR_Type === "PM" && <PMWorkRequestPopup workRequest={actual} onClose={() => setOpenWR(null)} onNavigate={(id) => setOpenWR(data.workRequests.find((wr) => wr.SiteId === item.SiteId && wr.WR_ID === id) ?? null)} onEscalateToLJ={() => { setOpenWR(null); setError("Create the Long Job from the work request overview."); }} />}
    {actual?.WR_Type === "FJ" && <FJWorkRequestPopup workRequest={actual} onClose={() => setOpenWR(null)} onNavigate={(id) => setOpenWR(data.workRequests.find((wr) => wr.SiteId === item.SiteId && wr.WR_ID === id) ?? null)} onEscalateToLJ={() => { setOpenWR(null); setError("Create the Long Job from the work request overview."); }} />}
    {actual?.WR_Type === "LJ" && <LJWorkRequestPopup workRequest={actual} onClose={() => setOpenWR(null)} onNavigate={(id) => setOpenWR(data.workRequests.find((wr) => wr.SiteId === item.SiteId && wr.WR_ID === id) ?? null)} />}
  </aside>;
}
