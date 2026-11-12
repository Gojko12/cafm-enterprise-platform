"use client";

import React, { useEffect, useMemo, useState } from "react";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_STATUSES, EquipmentSchema, EquipmentStatusSchema, formatDateDDMMYYYY, formatDateTimeDDMMYYYY, TechnicalSpecificationsSchema } from "@cafm/shared-schema";
import type { BaseWorkRequest, Building, Equipment, Floor, Room } from "@cafm/shared-schema";
import { OverviewTable } from "@/components/common/TableColumns";
import { DateInputDDMMYYYY } from "@/components/common/DateInputDDMMYYYY";
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
import { LocateInBimButton } from "@/components/common/LocateInBim";

const columns = [
  { id: "code", label: "EQ ID", value: (eq: Equipment) => eq.EquipmentCode, render: (eq: Equipment) => <span className="font-mono font-semibold">{eq.EquipmentCode}</span> },
  { id: "name", label: "Name", value: (eq: Equipment) => eq.EquipmentName },
  { id: "local", label: "Local name", value: (eq: Equipment) => eq.EquipmentNameLocal },
  { id: "category", label: "Category", value: (eq: Equipment) => eq.Category ? `${eq.Category} - ${EQUIPMENT_CATEGORIES[eq.Category]}` : undefined },
  { id: "level", label: "Hierarchy Level", value: (eq: Equipment) => eq.HierarchyLevel, render: (eq: Equipment) => <LevelPill level={eq.HierarchyLevel} /> },
  { id: "parent", label: "Parent", value: (eq: Equipment) => eq.ParentEquipmentCode },
  { id: "building", label: "Building", value: (eq: Equipment) => eq.bl_id },
  { id: "floor", label: "Floor", value: (eq: Equipment) => eq.LevelName },
  { id: "room", label: "Room", value: (eq: Equipment) => eq.RoomCode },
  { id: "status", label: "Status", value: (eq: Equipment) => eq.Status },
  { id: "criticality", label: "Criticality", value: (eq: Equipment) => eq.Criticality },
];

type ViewMode = "equipment" | "location" | "flat";
type Level = "Installation" | "SubEquipment" | "Component";

const LEVEL_STYLE: Record<Level, string> = {
  Installation: "border-indigo-300 bg-indigo-100 text-indigo-800",
  SubEquipment: "border-cyan-300 bg-cyan-100 text-cyan-800",
  Component: "border-emerald-300 bg-emerald-100 text-emerald-800",
};

const statusStyle = (status: string) => status === "In Service" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
  : status === "Repair" || status === "Out Of Service" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-100 text-slate-600";

function LevelPill({ level }: { level?: string }) {
  return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${level ? LEVEL_STYLE[level as Level] ?? "" : ""}`}>{level ?? "—"}</span>;
}

interface TreeRow { eq: Equipment; depth: number; prefix: string; childCount: number; open: boolean }

// Keeps a node when it matches or has a matching descendant; filtered branches are always expanded.
function buildTreeRows(equipment: Equipment[], matches: (eq: Equipment) => boolean, filtering: boolean, collapsed: Set<string>) {
  const codes = new Set(equipment.map((eq) => eq.EquipmentCode));
  const children = new Map<string, Equipment[]>();
  const roots: Equipment[] = [];
  for (const eq of equipment) {
    const parent = eq.ParentEquipmentCode;
    if (parent && parent !== eq.EquipmentCode && codes.has(parent)) children.set(parent, [...(children.get(parent) ?? []), eq]);
    else roots.push(eq);
  }
  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();
  const hit = (eq: Equipment): boolean => {
    const cached = memo.get(eq.EquipmentCode);
    if (cached !== undefined) return cached;
    if (visiting.has(eq.EquipmentCode)) return false;
    visiting.add(eq.EquipmentCode);
    const result = matches(eq) || (children.get(eq.EquipmentCode) ?? []).some(hit);
    visiting.delete(eq.EquipmentCode);
    memo.set(eq.EquipmentCode, result);
    return result;
  };
  const rows: TreeRow[] = [];
  const parentCodes: string[] = [];
  const walk = (eq: Equipment, depth: number, trail: boolean[], isLast: boolean) => {
    const all = children.get(eq.EquipmentCode) ?? [];
    const visible = all.filter(hit);
    const open = visible.length > 0 && (filtering || !collapsed.has(eq.EquipmentCode));
    if (all.length) parentCodes.push(eq.EquipmentCode);
    const prefix = trail.map((last) => last ? "   " : "│  ").join("") + (depth > 0 ? (isLast ? "└─ " : "├─ ") : "");
    rows.push({ eq, depth, prefix, childCount: all.length, open });
    if (!open || depth >= 5) return;
    const nextTrail = depth > 0 ? [...trail, isLast] : [];
    visible.forEach((child, index) => walk(child, depth + 1, nextTrail, index === visible.length - 1));
  };
  roots.filter(hit).forEach((root, index, list) => walk(root, 0, [], index === list.length - 1));
  return { rows, parentCodes };
}

const TREE_GRID = "grid grid-cols-[minmax(12rem,1.4fr)_minmax(8rem,2fr)_6.5rem_6rem_6.5rem_3.5rem_2rem] items-center gap-2";

export function EquipmentRegistry() {
  const { data } = useCafmStore();
  const { permissions } = useActiveUserPermissions();
  const { activeSiteId } = useSiteContext();
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("equipment");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const statusFilter = <details className="relative text-left text-xs"><summary aria-label="Equipment status filter" className="cursor-pointer truncate rounded-lg border bg-white px-3 py-1.5">Status: {statuses.length ? statuses.join(", ") : "All Statuses"}</summary>
    <div className="absolute z-20 w-48 rounded border bg-white p-2 shadow">
      <button onClick={() => setStatuses([])} className="block underline">All Statuses</button>
      {EQUIPMENT_STATUSES.map((status) => <label key={status} className="block py-1"><input type="checkbox" checked={statuses.includes(status)} onChange={(event) => setStatuses((current) => event.target.checked ? [...current, status] : current.filter((entry) => entry !== status))} /> {status}</label>)}
    </div></details>;
  useEffect(() => { setSelected(null); setCollapsed(new Set()); }, [activeSiteId]);
  // Deep link from the 3D BIM viewer: /equipment?eq=0000000001 preselects the equipment.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("eq");
    if (code && data.equipment.some((eq) => eq.SiteId === activeSiteId && eq.EquipmentCode === code)) setSelected(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const equipment = useMemo(() => data.equipment.filter((entry) => entry.SiteId === activeSiteId), [data.equipment, activeSiteId]);
  const item = equipment.find((eq) => eq.EquipmentCode === selected);
  const openWrs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const wr of data.workRequests) {
      if (wr.SiteId !== activeSiteId || wr.Percentage >= 100) continue;
      for (const code of new Set(wr.EquipmentCodes)) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return counts;
  }, [data.workRequests, activeSiteId]);
  const query = search.trim().toLowerCase();
  const filtering = !!query || statuses.length > 0;
  const matches = (eq: Equipment) => (!statuses.length || statuses.includes(eq.Status)) && (!query ||
    [eq.EquipmentCode, eq.EquipmentName, eq.EquipmentNameLocal, eq.Category, eq.PrimaryTradeId, eq.bl_id, eq.LevelName, eq.RoomCode, eq.ParentEquipmentCode].some((value) => value?.toLowerCase().includes(query)));
  const tree = useMemo(() => buildTreeRows(equipment, matches, filtering, collapsed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [equipment, query, statuses, collapsed]);
  const flat = equipment.filter(matches);
  const locationRows = useMemo(() => {
    const rows: { key: string; depth: number; kind: "building" | "floor" | "room" | "eq"; label: string; count: number; eq?: Equipment; open: boolean }[] = [];
    const groupKeys: string[] = [];
    const shown = equipment.filter(matches);
    for (const bl of [...new Set(shown.map((eq) => eq.bl_id))].sort()) {
      const inBuilding = shown.filter((eq) => eq.bl_id === bl);
      const bKey = `b:${bl}`; groupKeys.push(bKey);
      const bOpen = filtering || !collapsed.has(bKey);
      rows.push({ key: bKey, depth: 0, kind: "building", label: `🏢 ${data.buildings.find((entry) => entry.SiteId === activeSiteId && entry.bl_id === bl)?.Name ?? bl}`, count: inBuilding.length, open: bOpen });
      if (!bOpen) continue;
      for (const level of [...new Set(inBuilding.map((eq) => eq.LevelName))].sort()) {
        const inFloor = inBuilding.filter((eq) => eq.LevelName === level);
        const fKey = `f:${bl}|${level}`; groupKeys.push(fKey);
        const fOpen = filtering || !collapsed.has(fKey);
        rows.push({ key: fKey, depth: 1, kind: "floor", label: `▤ ${level}`, count: inFloor.length, open: fOpen });
        if (!fOpen) continue;
        for (const room of [...new Set(inFloor.map((eq) => eq.RoomCode))].sort()) {
          const inRoom = inFloor.filter((eq) => eq.RoomCode === room);
          const rKey = `r:${bl}|${level}|${room}`; groupKeys.push(rKey);
          const rOpen = filtering || !collapsed.has(rKey);
          rows.push({ key: rKey, depth: 2, kind: "room", label: `◫ Room ${room}`, count: inRoom.length, open: rOpen });
          if (!rOpen) continue;
          const order: Record<string, number> = { Installation: 0, SubEquipment: 1, Component: 2 };
          for (const eq of [...inRoom].sort((a, b) => (order[a.HierarchyLevel ?? ""] ?? 3) - (order[b.HierarchyLevel ?? ""] ?? 3) || a.EquipmentCode.localeCompare(b.EquipmentCode))) {
            rows.push({ key: `e:${eq.EquipmentCode}`, depth: 3 + (order[eq.HierarchyLevel ?? ""] ?? 0), kind: "eq", label: eq.EquipmentName, count: 0, eq, open: false });
          }
        }
      }
    }
    return { rows, groupKeys };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipment, query, statuses, collapsed, data.buildings, activeSiteId]);
  const toggle = (key: string) => setCollapsed((current) => { const next = new Set(current); if (!next.delete(key)) next.add(key); return next; });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(view === "location" ? locationRows.groupKeys : tree.parentCodes));
  const kpis: [string, string | number, string][] = [
    ["Total Equipment", equipment.length, "text-slate-800"],
    ["Installations / SubEq / Components", `${equipment.filter((eq) => eq.HierarchyLevel === "Installation").length} / ${equipment.filter((eq) => eq.HierarchyLevel === "SubEquipment").length} / ${equipment.filter((eq) => eq.HierarchyLevel === "Component").length}`, "text-indigo-700"],
    ["In Service", equipment.filter((eq) => eq.Status === "In Service").length, "text-emerald-700"],
    ["Assets with Open WRs", equipment.filter((eq) => openWrs.has(eq.EquipmentCode)).length, "text-amber-700"],
    ["Linked in 3D BIM", equipment.filter((eq) => eq.bimGlobalId).length, "text-cyan-700"],
  ];
  const cells = (eq: Equipment) => <>
    <span className="truncate text-slate-800" title={eq.EquipmentName}>{eq.EquipmentName}</span>
    <LevelPill level={eq.HierarchyLevel} />
    <span className="truncate rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-center text-[11px] text-slate-600" title={eq.PrimaryTradeId}>{eq.PrimaryTradeId ?? "—"}</span>
    <span className={`truncate rounded-full border px-2 py-0.5 text-center text-[11px] ${statusStyle(eq.Status)}`}>{eq.Status}</span>
    <span>{openWrs.get(eq.EquipmentCode) ? <span title="Open work requests" className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{openWrs.get(eq.EquipmentCode)} WR</span> : <span className="text-slate-300">—</span>}</span>
    <span title={eq.bimGlobalId ? "Linked in 3D BIM" : "Not linked in 3D BIM"} className={eq.bimGlobalId ? "text-cyan-600" : "text-slate-300"}>⬡</span>
  </>;
  const rowTone = (eq: Equipment) => eq.EquipmentCode === selected ? "border-l-4 border-l-blue-600 bg-blue-100" : "border-l-4 border-l-transparent hover:bg-slate-50";
  const header = <div className={`${TREE_GRID} border-b bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500`}>
    <span>EQ ID</span><span>Name</span><span>Level</span><span>Trade</span><span>Status</span><span>WRs</span><span>3D</span></div>;
  const segment = (mode: ViewMode, label: string) => <button key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}
    className={`px-3 py-1.5 text-xs font-medium ${view === mode ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>;
  return <div className="space-y-3 p-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-semibold">Equipment Registry</h1>
      <button disabled={!permissions?.canManageEquipment} title={permissions?.canManageEquipment ? undefined : "Manage Equipment permission required"} onClick={() => setAdding(true)}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">+ Add Equipment</button>
    </div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">{kpis.map(([label, value, tone]) => <div key={label} className="rounded-lg border bg-white px-3 py-2">
      <div className={`text-lg font-semibold ${tone}`}>{value}</div><div className="text-[11px] text-slate-500">{label}</div></div>)}</div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-lg border" role="group" aria-label="Registry view">
        {segment("equipment", "🌳 Equipment Tree")}{segment("location", "🏢 Location Tree")}{segment("flat", "☰ Flat Table")}</div>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code, name, trade, room…" aria-label="Search equipment" className="min-w-[14rem] flex-1 rounded-lg border px-3 py-1.5 text-sm" />
      {statusFilter}
      {view !== "flat" && <><button onClick={expandAll} className="rounded-lg border bg-white px-3 py-1.5 text-xs">Expand All</button>
        <button onClick={collapseAll} className="rounded-lg border bg-white px-3 py-1.5 text-xs">Collapse All</button></>}
    </div>
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className={`min-w-0 transition-all ${item ? "lg:w-1/2" : "w-full"}`}>
        {view === "flat" && <OverviewTable preferenceKey="equipment" columns={columns} rows={flat} rowKey={(eq) => eq.EquipmentCode} onRow={(eq) => setSelected(eq.EquipmentCode)}
          rowClassName={(eq) => eq.EquipmentCode === selected ? "bg-blue-100 border-l-4 border-l-blue-600 font-semibold" : ""} />}
        {view === "equipment" && <div className="overflow-x-auto rounded-lg border bg-white"><div className="min-w-[44rem]">{header}
          {tree.rows.length === 0 && <p className="p-4 text-sm text-slate-500">No equipment matches the current filters.</p>}
          {tree.rows.map(({ eq, prefix, childCount, open }) => <div key={eq.EquipmentCode} role="row" onClick={() => setSelected(eq.EquipmentCode)} className={`${TREE_GRID} cursor-pointer border-b px-3 py-1.5 text-sm ${rowTone(eq)}`}>
            <span className="flex items-center whitespace-nowrap font-mono text-xs"><span className="whitespace-pre text-slate-300">{prefix}</span>
              {childCount > 0 ? <button aria-expanded={open} aria-label={open ? "Collapse" : "Expand"} className="mr-1 w-4 text-slate-500" onClick={(event) => { event.stopPropagation(); toggle(eq.EquipmentCode); }}>{open ? "▾" : "▸"}</button> : <span className="mr-1 inline-block w-4" />}
              <span className="font-semibold text-slate-900">{eq.EquipmentCode}</span>
              {childCount > 0 && <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-700">{childCount}</span>}</span>
            {cells(eq)}</div>)}</div></div>}
        {view === "location" && <div className="overflow-x-auto rounded-lg border bg-white"><div className="min-w-[44rem]">
          {locationRows.rows.length === 0 && <p className="p-4 text-sm text-slate-500">No equipment matches the current filters.</p>}
          {locationRows.rows.map((row) => row.eq ? <div key={row.key} role="row" onClick={() => setSelected(row.eq!.EquipmentCode)} className={`${TREE_GRID} cursor-pointer border-b px-3 py-1.5 text-sm ${rowTone(row.eq)}`}>
            <span className="font-mono text-xs font-semibold" style={{ paddingLeft: row.depth * 14 }}>{row.eq.EquipmentCode}</span>{cells(row.eq)}</div>
            : <button key={row.key} aria-expanded={row.open} onClick={() => toggle(row.key)} className="flex w-full items-center gap-2 border-b bg-slate-50 px-3 py-1.5 text-left text-sm font-medium text-slate-700" style={{ paddingLeft: 12 + row.depth * 14 }}>
              <span className="w-3 text-slate-500">{row.open ? "▾" : "▸"}</span>{row.label}<span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold">{row.count}</span></button>)}
        </div></div>}
      </div>
      {item && <EquipmentDetails key={`${activeSiteId}:${item.EquipmentCode}`} item={item} onClose={() => setSelected(null)} onSelect={setSelected} />}
    </div>
    {adding && <AddEquipmentModal siteId={activeSiteId} onClose={() => setAdding(false)} onCreated={(code) => { setAdding(false); setSelected(code); }} />}
  </div>;
}

function AddEquipmentModal({ siteId, onClose, onCreated }: { siteId: Equipment["SiteId"]; onClose: () => void; onCreated: (code: string) => void }) {
  const { data, setData } = useCafmStore();
  const { permissions } = useActiveUserPermissions();
  const { activePerson } = useSiteContext();
  const siteEquipment = data.equipment.filter((eq) => eq.SiteId === siteId);
  const buildings = data.buildings.filter((entry) => entry.SiteId === siteId);
  const floors = data.floors.filter((entry) => entry.SiteId === siteId);
  const rooms = data.rooms.filter((entry) => entry.SiteId === siteId);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState<Level>("Installation");
  const [parent, setParent] = useState("");
  const [trade, setTrade] = useState("");
  const [location, setLocation] = useState<{ building: Building | null; floor: Floor | null; room: Room | null }>({ building: null, floor: null, room: null });
  const [error, setError] = useState("");
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
      EquipmentCode: code, EquipmentName: name.trim(), Category: category, HierarchyLevel: level, IsInstallation: level === "Installation",
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

function HierarchyCard({ item, equipment, onSelect }: { item: Equipment; equipment: Equipment[]; onSelect: (code: string) => void }) {
  const byCode = new Map(equipment.map((eq) => [eq.EquipmentCode, eq]));
  const ancestors: Equipment[] = [];
  for (let cursor = item.ParentEquipmentCode ? byCode.get(item.ParentEquipmentCode) : undefined; cursor && ancestors.length < 5 && cursor.EquipmentCode !== item.EquipmentCode; cursor = cursor.ParentEquipmentCode ? byCode.get(cursor.ParentEquipmentCode) : undefined) ancestors.unshift(cursor);
  const node = (eq: Equipment, depth: number): React.ReactNode => <div key={eq.EquipmentCode}>
    <button onClick={() => onSelect(eq.EquipmentCode)} aria-current={eq.EquipmentCode === item.EquipmentCode} style={{ marginLeft: depth * 16 }}
      className={`my-0.5 flex items-center gap-2 rounded border px-2 py-1 text-left text-xs hover:bg-blue-50 ${eq.EquipmentCode === item.EquipmentCode ? "border-blue-500 bg-blue-50 font-semibold" : "bg-white"}`}>
      <span className="font-mono">{eq.EquipmentCode}</span><span>{eq.EquipmentName}</span><LevelPill level={eq.HierarchyLevel} /></button>
    {depth < 5 && equipment.filter((child) => child.ParentEquipmentCode === eq.EquipmentCode && child.EquipmentCode !== eq.EquipmentCode).map((child) => node(child, depth + 1))}
  </div>;
  return <div className="rounded-lg border bg-slate-50 p-3">
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Component Tree</h3>
    {ancestors.length === 0 && !item.ParentEquipmentCode && <p className="mb-1 text-xs text-slate-500">Top-level installation.</p>}
    {ancestors.length > 0 && <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">{ancestors.map((eq) => <button key={eq.EquipmentCode} onClick={() => onSelect(eq.EquipmentCode)} className="rounded border bg-white px-2 py-0.5 text-blue-700 hover:bg-blue-50">↑ {eq.EquipmentCode} {eq.EquipmentName}</button>)}</div>}
    {node(item, 0)}
  </div>;
}

function EquipmentDetails({ item, onClose, onSelect }: { item: Equipment; onClose: () => void; onSelect: (code: string) => void }) {
  const { data, setData } = useCafmStore();
  const { permissions } = useActiveUserPermissions();
  const { activePerson } = useSiteContext();
  const [tab, setTab] = useState<"General" | "Details" | "Hierarchy" | "WRs" | "SmartPM" | "Attached Documents" | "KPIs" | "Comments">("General");
  const [showPicker, setShowPicker] = useState(false);
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
  const schedules = data.schedules.filter((schedule) => schedule.SiteId === item.SiteId && (schedule.EquipmentCodes.includes(item.EquipmentCode) || schedule.equipmentCode === item.EquipmentCode));
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
    { id: "due", label: "Due Date", value: (wr: BaseWorkRequest) => wr.DueDate, render: (wr: BaseWorkRequest) => formatDateDDMMYYYY(wr.DueDate) || "—" },
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
    <label className="text-xs">{label}{inputType === "date"
      ? <DateInputDDMMYYYY aria-label={label} value={value ?? ""} onValueChange={change} className="mt-1 block w-full text-sm" />
      : <input type={inputType} value={value ?? ""} onChange={(event) => change(event.target.value)} className="mt-1 block w-full rounded border p-1 text-sm" />}</label>;
  const number = (label: string, key: "LengthCm" | "WidthCm" | "HeightCm" | "WeightKg" | "ReplacementCostEur") =>
    <label className="text-xs">{label}<input type="number" min="0" value={draft[key] ?? ""} onChange={(event) => {
      const raw = event.target.value; setDraft((current) => ({ ...current, [key]: raw === "" ? undefined : Number(raw) }));
    }} className="mt-1 block w-full rounded border p-1 text-sm" /></label>;
  return <aside className="min-w-0 space-y-3 rounded-lg border bg-white p-3 lg:w-1/2">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-mono text-xs text-slate-500">{item.EquipmentCode}</div><strong className="text-base">{item.EquipmentName}</strong>
      <div className="mt-1 flex gap-1"><LevelPill level={item.HierarchyLevel} /><span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusStyle(item.Status)}`}>{item.Status}</span></div></div>
      <div className="flex items-center gap-2 text-xs">
        {locator ? <a href={locator} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">2D Floor Plan</a> : <span title="No room polygon is available" className="rounded-full border px-3 py-1 text-slate-400">2D N/A</span>}
        <LocateInBimButton siteId={item.SiteId} buildingId={item.bl_id} bimBuildingId={item.bimBuildingId} equipmentCode={item.EquipmentCode} hasBimLink={!!item.bimGlobalId} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-700" />
        <button aria-label="Close equipment details" onClick={onClose} className="rounded-full border px-2 py-0.5 text-slate-500 hover:bg-slate-100">×</button></div></div>
    <nav className="flex flex-wrap gap-1">{([["General", "General"], ["Details", "Technical Details"], ["Hierarchy", "Hierarchy"], ["WRs", `WRs (${requests.length})`], ["SmartPM", `SmartPM (${schedules.length})`], ["Attached Documents", "Documents"], ["KPIs", "KPIs"], ["Comments", "Comments"]] as const).map(([name, label]) =>
      <button key={name} onClick={() => setTab(name)} aria-pressed={tab === name} className={`rounded-full border px-3 py-1 text-xs ${tab === name ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-slate-600"}`}>{label}</button>)}</nav>
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
      <div className="rounded-lg border bg-slate-50 p-2 text-xs"><div className="flex flex-wrap items-center justify-between gap-2">
        <span>📍 <strong>Location:</strong> {location.building && location.floor && location.room ? `${location.building.bl_id} · ${location.floor.LevelName} · Room ${location.room.RoomCode}` : "Not set"}</span>
        <span className="flex gap-2"><button className="rounded border bg-white px-2 py-0.5" onClick={() => setShowPicker((current) => !current)}>{showPicker ? "Done" : "Change Location"}</button>
          <button className="rounded border bg-white px-2 py-0.5" onClick={() => { setLocation({ building: null, floor: null, room: null }); setShowPicker(true); }}>Clear</button></span></div></div>
      {showPicker && <LocationEquipmentPickerGroup buildings={buildings} floors={floors} rooms={rooms} showEquipment={false}
        selectedBuilding={location.building} selectedFloor={location.floor} selectedRoom={location.room}
        onLocationChange={(next) => { setError(""); setLocation(next); }} />}
      <button disabled={!permissions?.canManageEquipment} onClick={save} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-40">Save</button>
    </div>}
    {tab === "Hierarchy" && <HierarchyCard item={item} equipment={siteEquipment} onSelect={onSelect} />}
    {tab === "SmartPM" && <div className="space-y-2 text-xs">{schedules.length === 0 ? <p className="text-slate-500">No SmartPM schedules cover this equipment.</p> :
      schedules.map((schedule) => <div key={schedule.ScheduleId} className="flex flex-wrap items-center gap-2 rounded-lg border p-2"><span className="font-mono font-semibold">PMS {schedule.ScheduleId}</span>
        <span>{schedule.Title ?? schedule.ChecklistCode}</span><span className="rounded-full bg-slate-100 px-2 py-0.5">{schedule.Frequency}</span>
        <span className={`rounded-full px-2 py-0.5 ${schedule.IsActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{schedule.IsActive ? "Active" : "Inactive"}</span></div>)}</div>}
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
        <div className="font-semibold">{entry.actorName} · {entry.kind === "log" ? "Automatic log" : "Comment"} · {formatDateTimeDDMMYYYY(entry.createdAt)}</div><p className="whitespace-pre-wrap">{entry.text}</p>
        {entry.kind === "comment" && entry.actorId === activePerson && <button className="text-blue-700 underline" onClick={() => { setEditing(entry.id); setComment(entry.text); }}>Edit</button>}
        {!!entry.editHistory?.length && <details><summary className="cursor-pointer">Edited - View Previous Versions</summary>{newestFirst(entry.editHistory, (version) => version.timestamp).map((version, index) => <p key={`${version.timestamp}-${index}`}>{formatDateTimeDDMMYYYY(version.timestamp)}: {version.text}</p>)}</details>}
      </article>)}
    </div>}
    {actual?.WR_Type === "PM" && <PMWorkRequestPopup workRequest={actual} onClose={() => setOpenWR(null)} onNavigate={(id) => setOpenWR(data.workRequests.find((wr) => wr.SiteId === item.SiteId && wr.WR_ID === id) ?? null)} onEscalateToLJ={() => { setOpenWR(null); setError("Create the Long Job from the work request overview."); }} />}
    {actual?.WR_Type === "FJ" && <FJWorkRequestPopup workRequest={actual} onClose={() => setOpenWR(null)} onNavigate={(id) => setOpenWR(data.workRequests.find((wr) => wr.SiteId === item.SiteId && wr.WR_ID === id) ?? null)} onEscalateToLJ={() => { setOpenWR(null); setError("Create the Long Job from the work request overview."); }} />}
    {actual?.WR_Type === "LJ" && <LJWorkRequestPopup workRequest={actual} onClose={() => setOpenWR(null)} onNavigate={(id) => setOpenWR(data.workRequests.find((wr) => wr.SiteId === item.SiteId && wr.WR_ID === id) ?? null)} />}
  </aside>;
}
