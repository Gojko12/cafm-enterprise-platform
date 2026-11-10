"use client";

import React, { useEffect, useState } from "react";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_STATUSES, EquipmentSchema, EquipmentStatusSchema, TechnicalSpecificationsSchema } from "@cafm/shared-schema";
import type { BaseWorkRequest, Equipment } from "@cafm/shared-schema";
import { OverviewTable } from "@/components/common/TableColumns";
import { LocationEquipmentPickerGroup } from "@/components/common/LocationEquipmentPickerGroup";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { resolveEquipmentLocation } from "@/lib/equipment-locator";
import { equipmentChangeDescriptions } from "@/lib/equipment-activity";
import { newestFirst } from "@/lib/history-order";
import { SuppressionLog } from "./SuppressionWorkspace";
import { PMWorkRequestPopup } from "./PMWorkRequestPopup";
import { FJWorkRequestPopup } from "./FJWorkRequestPopup";
import { LJWorkRequestPopup } from "./LJWorkRequestPopup";

const columns = [
  { id: "code", label: "EQ ID", value: (eq: Equipment) => eq.EquipmentCode },
  { id: "name", label: "Name", value: (eq: Equipment) => eq.EquipmentName },
  { id: "local", label: "Local name", value: (eq: Equipment) => eq.EquipmentNameLocal },
  { id: "category", label: "Category", value: (eq: Equipment) => eq.Category ? `${eq.Category} - ${EQUIPMENT_CATEGORIES[eq.Category]}` : undefined },
  { id: "level", label: "Hierarchy Level", value: (eq: Equipment) => eq.HierarchyLevel, render: (eq: Equipment) => <span className={`rounded border px-1 ${eq.HierarchyLevel === "Installation" ? "border-indigo-300 bg-indigo-100 text-indigo-800" : eq.HierarchyLevel === "SubEquipment" ? "border-sky-300 bg-sky-100 text-sky-800" : "border-emerald-300 bg-emerald-100 text-emerald-800"}`}>{eq.HierarchyLevel ?? "—"}</span> },
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
  const [statuses, setStatuses] = useState<string[]>(["In Service"]);
  const statusFilter = (label: string) => <details className="relative text-left text-xs"><summary aria-label={label} className="cursor-pointer truncate rounded border bg-white px-2 py-1">Status: {statuses.length ? statuses.join(", ") : "All Statuses"}</summary>
    <div className="absolute z-20 w-48 rounded border bg-white p-2 shadow">
      <button onClick={() => setStatuses([])} className="block underline">All Statuses</button>
      {EQUIPMENT_STATUSES.map((status) => <label key={status} className="block py-1"><input type="checkbox" checked={statuses.includes(status)} onChange={(event) => setStatuses((current) => event.target.checked ? [...current, status] : current.filter((entry) => entry !== status))} /> {status}</label>)}
    </div></details>;
  useEffect(() => { setSelected(null); setExpanded([]); }, [activeSiteId]);
  const equipment = data.equipment.filter((item) => item.SiteId === activeSiteId);
  const item = equipment.find((eq) => eq.EquipmentCode === selected);
  const shown = (tree ? equipment.filter((eq) => {
    if (!eq.ParentEquipmentCode) return true;
    const parent = equipment.find((candidate) => candidate.EquipmentCode === eq.ParentEquipmentCode);
    const ancestor = parent?.ParentEquipmentCode && equipment.find((candidate) => candidate.EquipmentCode === parent.ParentEquipmentCode);
    const visibleByStatus = (candidate: Equipment | undefined) => candidate && (!statuses.length || statuses.includes(candidate.Status));
    return (!visibleByStatus(parent) || expanded.includes(eq.ParentEquipmentCode)) &&
      (!ancestor || !visibleByStatus(ancestor) || expanded.includes(ancestor.EquipmentCode));
  }) : equipment).filter((eq) => !statuses.length || statuses.includes(eq.Status));
  const filterColumns = columns.map((column) => column.id === "status" ? { ...column, renderFilter: () => statusFilter("Filter Status") } : column);
  const treeColumns = filterColumns.map((column) => column.id !== "code" ? column : {
    ...column, render: (eq: Equipment) => <span className="whitespace-nowrap" style={{ paddingLeft: eq.HierarchyLevel === "Component" ? 32 : eq.HierarchyLevel === "SubEquipment" ? 16 : 0 }}>
      {equipment.some((child) => child.ParentEquipmentCode === eq.EquipmentCode) && <button aria-expanded={expanded.includes(eq.EquipmentCode)}
        onClick={(event) => { event.stopPropagation(); setExpanded((current) => current.includes(eq.EquipmentCode) ? current.filter((code) => code !== eq.EquipmentCode) : [...current, eq.EquipmentCode]); }}>{expanded.includes(eq.EquipmentCode) ? "▼" : "▶"}</button>} {eq.EquipmentCode}</span>,
  });
  return <div className="space-y-3 p-6">
    <h1 className="text-xl font-semibold">Equipment Registry</h1>
    <div className="flex items-start gap-3"><button className="rounded border bg-white px-2 py-1 text-xs" aria-pressed={tree} onClick={() => setTree((current) => !current)}>{tree ? "Tree view" : "Flat view"}</button>
      {statusFilter("Equipment status filter")}</div>
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className={`min-w-0 transition-all ${item ? "lg:w-1/2" : "w-full"}`}>
        <OverviewTable preferenceKey="equipment" columns={tree ? treeColumns : filterColumns} rows={shown} rowKey={(eq) => eq.EquipmentCode} onRow={(eq) => setSelected(eq.EquipmentCode)}
          rowClassName={(eq) => eq.EquipmentCode === selected ? "bg-blue-100 border-l-4 border-l-blue-600 font-semibold" : eq.HierarchyLevel === "Installation" ? "bg-indigo-50/30" : eq.HierarchyLevel === "SubEquipment" ? "bg-sky-50/20" : "bg-emerald-50/15"} />
      </div>
      {item && <EquipmentDetails key={`${activeSiteId}:${item.EquipmentCode}`} item={item} onClose={() => setSelected(null)} />}
    </div>
  </div>;
}

function EquipmentDetails({ item, onClose }: { item: Equipment; onClose: () => void }) {
  const { data, setData } = useCafmStore();
  const { permissions } = useActiveUserPermissions();
  const { activePerson } = useSiteContext();
  const [tab, setTab] = useState<"General" | "Details" | "WRs" | "Attached Documents" | "KPIs" | "Comments">("General");
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<"All" | "Human Comments Only" | "Automatic Logs Only">("All");
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
  const mappedRoom = resolveEquipmentLocation({ building: item.bl_id, floor: item.LevelName, room: item.RoomCode, equipment: item.EquipmentCode }, item.SiteId, data);
  const locator = mappedRoom ? `/floor-plans?${new URLSearchParams({ buildingId: item.bl_id, floorId: item.LevelName, roomId: item.RoomCode, eqId: item.EquipmentCode })}` : null;
  const actual = openWR && data.workRequests.find((wr) => wr.SiteId === openWR.SiteId && wr.WR_ID === openWR.WR_ID);
  const submitComment = () => {
    const text = comment.trim();
    if (!text) { setError("Enter a comment."); return; }
    const now = new Date().toISOString();
    const activity = baseline.Activity ?? [];
    if (editing && !activity.some((entry) => entry.id === editing && entry.kind === "comment" && entry.actorId === activePerson)) {
      setError("Only your own comments can be edited."); return;
    }
    const nextActivity = editing ? activity.map((entry) => entry.id === editing
      ? { ...entry, text, editedAt: now, editHistory: [...(entry.editHistory ?? []), { text: entry.text, timestamp: entry.editedAt ?? entry.createdAt }] }
      : entry) : [...activity, { id: crypto.randomUUID(), kind: "comment" as const, actorId: activePerson, actorName: activePerson, actorRole: "", createdAt: now, text }];
    const next = { ...baseline, Activity: nextActivity };
    setData((state) => {
      const current = state.equipment.find((eq) => eq.SiteId === item.SiteId && eq.EquipmentCode === item.EquipmentCode);
      if (JSON.stringify(current) !== JSON.stringify(baseline)) { queueMicrotask(() => setError("Equipment changed; reopen the details panel.")); return state; }
      queueMicrotask(() => { setBaseline(next); setDraft((draftItem) => ({ ...draftItem, Activity: nextActivity })); setComment(""); setEditing(null); setError(""); });
      return { ...state, equipment: state.equipment.map((eq) => eq.SiteId === item.SiteId && eq.EquipmentCode === item.EquipmentCode ? next : eq) };
    });
  };
  const requestColumns = [
    { id: "id", label: "WR ID", value: (wr: BaseWorkRequest) => wr.WR_ID },
    { id: "type", label: "Type", value: (wr: BaseWorkRequest) => wr.WR_Type },
    { id: "title", label: "Title / Description", value: (wr: BaseWorkRequest) => wr.Description },
    { id: "status", label: "Status", value: (wr: BaseWorkRequest) => wr.WorkRequestStatus },
    { id: "percentage", label: "Substatus %", value: (wr: BaseWorkRequest) => wr.Percentage },
    { id: "due", label: "Due Date", value: (wr: BaseWorkRequest) => wr.DueDate },
    { id: "cost", label: "Cost (EUR)", value: (wr: BaseWorkRequest) => wr.EstimatedCostEur },
    { id: "action", label: "Action", value: () => "Open / Edit", render: (wr: BaseWorkRequest) => <button className="text-blue-700 underline" onClick={() => setOpenWR(wr)}>Open / Edit</button> },
  ];
  const save = () => {
    if (!permissions?.canManageEquipment) { setError("Permission required: Manage Equipment."); return; }
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
      if (!current) { queueMicrotask(() => setError("Equipment no longer exists.")); return state; }
      const descriptions = equipmentChangeDescriptions(current, parsed.data, activePerson);
      const now = new Date().toISOString();
      const next = { ...parsed.data, Activity: [...(current?.Activity ?? []), ...descriptions.map((text) => ({ id: crypto.randomUUID(), kind: "log" as const, actorId: activePerson, actorName: activePerson, actorRole: "", createdAt: now, text }))] };
      queueMicrotask(() => { setBaseline(next); setDraft(next); });
      return { ...state, equipment: state.equipment.map((eq) => eq.SiteId === item.SiteId && eq.EquipmentCode === item.EquipmentCode ? next : eq) };
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
    <div className="flex flex-wrap justify-between gap-2"><strong>{item.EquipmentCode} · {item.EquipmentName}</strong><div className="flex gap-2 text-xs">{locator ? <a href={locator} className="text-blue-700 underline">Find in 2D Floor Plan</a> : <span title="No room polygon is available">2D N/A</span>}<span title="IFC rendering and selection are not available">BIM N/A</span><button aria-label="Close equipment details" onClick={onClose}>✕</button></div></div>
    <nav className="flex flex-wrap gap-1">{(["General", "Details", "WRs", "Attached Documents", "KPIs", "Comments"] as const).map((name) =>
      <button key={name} onClick={() => setTab(name)} aria-pressed={tab === name} className={`rounded border px-2 py-1 text-xs ${tab === name ? "bg-blue-100" : ""}`}>{name}</button>)}</nav>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!permissions?.canManageEquipment && <p role="status" className="text-sm text-amber-800">Read-only: Manage Equipment permission is required to save changes.</p>}
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
        <label className="text-xs">Operational status<select value={draft.Status} onChange={(e) => { const value = EquipmentStatusSchema.safeParse(e.target.value); if (value.success) setDraft({ ...draft, Status: value.data }); }} className="block w-full rounded border p-1">{EQUIPMENT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="text-xs">Criticality<select value={draft.Criticality ?? ""} onChange={(e) => { const value = e.target.value; if (value === "") setDraft({ ...draft, Criticality: undefined }); else if (value === "Low" || value === "Medium" || value === "High" || value === "Critical") setDraft({ ...draft, Criticality: value }); }} className="block w-full rounded border p-1"><option value="">None</option><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label>
      </div>
      <p className="text-xs">Direct children: {siteEquipment.filter((eq) => eq.ParentEquipmentCode === item.EquipmentCode).map((eq) => `${eq.EquipmentCode} ${eq.EquipmentName}`).join(", ") || "None"}</p>
      <LocationEquipmentPickerGroup buildings={buildings} floors={floors} rooms={rooms} showEquipment={false}
        selectedBuilding={location.building} selectedFloor={location.floor} selectedRoom={location.room}
        onLocationChange={(next) => { setError(""); setLocation(next); }} />
      <button disabled={!permissions?.canManageEquipment} onClick={save} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-40">Save</button>
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
      <button disabled={!permissions?.canManageEquipment} onClick={save} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-40">Save</button></div>}
    {tab === "WRs" && <div className="space-y-2"><div className="flex gap-2">{(["All", "PM", "FJ", "LJ"] as const).map((value) => <button key={value} aria-pressed={type === value} onClick={() => setType(value)} className="rounded border px-2">{value}</button>)}</div>
      <OverviewTable preferenceKey="equipment-work-requests" columns={requestColumns} rows={requests.filter((wr) => type === "All" || wr.WR_Type === type)} rowKey={(wr) => wr.WR_ID} />
      <h3 className="font-semibold">Suppressed Cycles · Compliance History</h3><SuppressionLog entries={(data.suppressedPmOccurrences ?? []).filter((entry) => entry.siteId === item.SiteId && entry.equipmentCode === item.EquipmentCode)} onOpen={(id) => setOpenWR(data.workRequests.find((wr) => wr.SiteId === item.SiteId && wr.WR_ID === id) ?? null)} /></div>}
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
      <button disabled={!permissions?.canManageEquipment} onClick={save} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-40">Save documents</button>
    </div>}
    {tab === "KPIs" && <dl className="space-y-1 text-sm">
      <div>Total Maintenance Cost: {requests.some((wr) => wr.ActualCostEur !== undefined) ? `${requests.reduce((sum, wr) => sum + (wr.ActualCostEur ?? 0), 0).toFixed(2)} EUR (recorded costs)` : "Not recorded"}</div>
      <div>PM Compliance: {requests.some((wr) => wr.WR_Type === "PM") ? `${Math.round(requests.filter((wr) => wr.WR_Type === "PM" && wr.Percentage === 100).length / requests.filter((wr) => wr.WR_Type === "PM").length * 100)}% (closed PMs)` : "Not available"}</div>
      <div>Reactive work requests: {requests.filter((wr) => wr.WR_Type !== "PM").length}</div>
      <div>MTBF / MTTR / Availability / Health score: Not available (insufficient reliable operating and breakdown data).</div>
    </dl>}
    {tab === "Comments" && <div className="space-y-3 text-xs">
      <div className="flex flex-wrap gap-2">{(["All", "Human Comments Only", "Automatic Logs Only"] as const).map((filter) => <button key={filter} aria-pressed={activityFilter === filter} className={`rounded border px-2 py-1 ${activityFilter === filter ? "bg-blue-100" : ""}`} onClick={() => setActivityFilter(filter)}>{filter}</button>)}</div>
      <label className="block">Comment<textarea className="block w-full rounded border p-2" value={comment} onChange={(event) => setComment(event.target.value)} /></label>
      <button className="rounded bg-blue-700 px-3 py-1 text-white" onClick={submitComment}>{editing ? "Save edit" : "Add comment"}</button>
      {editing && <button className="ml-2 underline" onClick={() => { setEditing(null); setComment(""); }}>Cancel edit</button>}
      {newestFirst((item.Activity ?? []).filter((entry) => activityFilter === "All" || (activityFilter === "Human Comments Only" ? entry.kind === "comment" : entry.kind === "log")), (entry) => entry.createdAt).map((entry) => <article key={entry.id} className="border-t py-2">
        <div className="font-semibold">{entry.actorName} · {entry.kind === "log" ? "Automatic log" : "Comment"} · {entry.createdAt}</div><p className="whitespace-pre-wrap">{entry.text}</p>
        {entry.kind === "comment" && entry.actorId === activePerson && <button className="text-blue-700 underline" onClick={() => { setEditing(entry.id); setComment(entry.text); }}>Edit</button>}
        {!!entry.editHistory?.length && <details><summary className="cursor-pointer">Edited - View Previous Versions</summary>{newestFirst(entry.editHistory, (version) => version.timestamp).map((version, index) => <p key={`${version.timestamp}-${index}`}>{version.timestamp}: {version.text}</p>)}</details>}
      </article>)}
    </div>}
    {actual?.WR_Type === "PM" && <PMWorkRequestPopup workRequest={actual} onClose={() => setOpenWR(null)} onNavigate={(id) => setOpenWR(data.workRequests.find((wr) => wr.SiteId === item.SiteId && wr.WR_ID === id) ?? null)} onEscalateToLJ={() => { setOpenWR(null); setError("Create the Long Job from the work request overview."); }} />}
    {actual?.WR_Type === "FJ" && <FJWorkRequestPopup workRequest={actual} onClose={() => setOpenWR(null)} onNavigate={(id) => setOpenWR(data.workRequests.find((wr) => wr.SiteId === item.SiteId && wr.WR_ID === id) ?? null)} onEscalateToLJ={() => { setOpenWR(null); setError("Create the Long Job from the work request overview."); }} />}
    {actual?.WR_Type === "LJ" && <LJWorkRequestPopup workRequest={actual} onClose={() => setOpenWR(null)} onNavigate={(id) => setOpenWR(data.workRequests.find((wr) => wr.SiteId === item.SiteId && wr.WR_ID === id) ?? null)} />}
  </aside>;
}
