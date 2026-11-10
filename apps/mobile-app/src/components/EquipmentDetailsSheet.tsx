import React, { useEffect, useMemo, useState } from "react";
import { loadEquipmentDetails, type EquipmentDetailPack } from "../lib/equipment-details";

type Tab = "Specs" | "Docs" | "Floor Plan" | "BIM";
const tabs: Tab[] = ["Specs", "Docs", "Floor Plan", "BIM"];

type Ring = number[][];
const ringOf = (polygon: { coordinates: number[][][] } | null | undefined): Ring => polygon?.coordinates?.[0] ?? [];

function bounds(rings: Ring[]) {
  const points = rings.flat();
  if (!points.length) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, width: Math.max(maxX - minX, 1e-6), height: Math.max(maxY - minY, 1e-6) };
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 text-xs">
    <span className="text-slate-500">{label}</span>
    <span className="text-right font-medium text-slate-900 break-words min-w-0">{value ?? "\u2014"}</span>
  </div>
);

function FloorPlan({ pack }: { pack: EquipmentDetailPack }) {
  const plan = pack.floorPlan;
  const box = bounds(plan.rooms.map((room) => ringOf(room.Polygon)).filter((ring) => ring.length));
  if (!box) return <p className="text-xs text-slate-500">No room polygons are available for {plan.bl_id} / {plan.LevelName}.</p>;
  const scale = 300 / Math.max(box.width, box.height);
  const px = (x: number) => (x - box.minX) * scale + 10;
  const py = (y: number) => (box.height - (y - box.minY)) * scale + 10;
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${box.width * scale + 20} ${box.height * scale + 20}`} className="w-full rounded-xl border border-slate-200 bg-slate-50" role="img" aria-label="Floor plan">
        {plan.rooms.map((room) => {
          const ring = ringOf(room.Polygon);
          if (!ring.length) return null;
          const active = room.RoomCode === plan.highlightRoomCode;
          return (
            <polygon key={room.RoomCode} points={ring.map((p) => `${px(p[0])},${py(p[1])}`).join(" ")}
              fill={active ? "#bfdbfe" : "#f1f5f9"} stroke={active ? "#2563eb" : "#94a3b8"} strokeWidth={active ? 2 : 1} />
          );
        })}
        {plan.pin && <circle cx={px(plan.pin.x)} cy={py(plan.pin.y)} r={6} fill="#dc2626" stroke="#fff" strokeWidth={2} />}
      </svg>
      <p className="text-[11px] text-slate-500">{plan.bl_id} {"\u00b7"} {plan.LevelName} {"\u00b7"} room {plan.highlightRoomCode} highlighted {"\u00b7"} {plan.assetsOnFloor} assets on this floor</p>
    </div>
  );
}

function Bim({ pack }: { pack: EquipmentDetailPack }) {
  const { bim } = pack;
  const box = bounds([ringOf(bim.room.Polygon)]);
  const w = 120;
  const d = box ? Math.min(120, Math.max(40, (box.height / box.width) * 120)) : 80;
  const h = 50;
  const iso = (x: number, y: number, z: number) => `${150 + (x - y) * 0.866},${150 + (x + y) * 0.5 - z}`;
  const face = (points: [number, number, number][]) => points.map((p) => iso(...p)).join(" ");
  const assetW = Math.min(w * 0.4, ((bim.dimensionsCm.width ?? 80) / 100) * 20 + 10);
  const assetH = Math.min(h * 0.8, ((bim.dimensionsCm.height ?? 100) / 100) * 15 + 8);
  const ax = w / 2 - assetW / 2, ay = d / 2 - assetW / 2;
  const dims = bim.dimensionsCm;
  const hasDims = [dims.length, dims.width, dims.height].some((value) => value !== null);
  return (
    <div className="space-y-3">
      <svg viewBox="0 0 300 260" className="w-full rounded-xl border border-slate-200 bg-slate-50" role="img" aria-label="BIM isometric preview">
        <polygon points={face([[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0]])} fill="#e2e8f0" stroke="#64748b" />
        <polygon points={face([[0, 0, 0], [0, 0, h], [w, 0, h], [w, 0, 0]])} fill="#f8fafc" stroke="#94a3b8" fillOpacity={0.6} />
        <polygon points={face([[0, 0, 0], [0, 0, h], [0, d, h], [0, d, 0]])} fill="#f1f5f9" stroke="#94a3b8" fillOpacity={0.6} />
        <polygon points={face([[ax, ay, 0], [ax + assetW, ay, 0], [ax + assetW, ay + assetW, 0], [ax, ay + assetW, 0]])} fill="#93c5fd" stroke="#1d4ed8" />
        <polygon points={face([[ax, ay, assetH], [ax + assetW, ay, assetH], [ax + assetW, ay + assetW, assetH], [ax, ay + assetW, assetH]])} fill="#60a5fa" stroke="#1d4ed8" />
        <polygon points={face([[ax + assetW, ay, 0], [ax + assetW, ay + assetW, 0], [ax + assetW, ay + assetW, assetH], [ax + assetW, ay, assetH]])} fill="#3b82f6" stroke="#1d4ed8" />
        <polygon points={face([[ax, ay + assetW, 0], [ax + assetW, ay + assetW, 0], [ax + assetW, ay + assetW, assetH], [ax, ay + assetW, assetH]])} fill="#2563eb" stroke="#1d4ed8" />
      </svg>
      <div>
        <Row label="IFC GlobalId" value={bim.ifcGlobalId} />
        <Row label="IFC class" value={bim.ifcClass} />
        <Row label="Discipline" value={bim.discipline} />
        <Row label="Elevation" value={bim.elevation === null ? null : `${bim.elevation} m`} />
        <Row label="Dimensions (L x W x H)" value={hasDims ? `${dims.length ?? "\u2014"} \u00d7 ${dims.width ?? "\u2014"} \u00d7 ${dims.height ?? "\u2014"} cm` : null} />
        <Row label="Weight" value={bim.weightKg === null ? null : `${bim.weightKg} kg`} />
        <Row label="System loop" value={bim.systemLoop} />
        <Row label="Room net area" value={bim.room.NetAreaM2 === null ? null : `${bim.room.NetAreaM2} m\u00b2`} />
      </div>
    </div>
  );
}

export const EquipmentDetailsSheet: React.FC<{ siteId: string; equipmentCode: string; equipmentName: string; onClose: () => void }> = ({ siteId, equipmentCode, equipmentName, onClose }) => {
  const [tab, setTab] = useState<Tab>("Specs");
  const [pack, setPack] = useState<EquipmentDetailPack | null>(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<EquipmentDetailPack["documents"][number] | null>(null);

  useEffect(() => {
    let active = true;
    setPack(null);
    setError(null);
    loadEquipmentDetails(siteId, equipmentCode)
      .then((result) => { if (active) { setPack(result.pack); setCached(result.cached); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load equipment details."); });
    return () => { active = false; };
  }, [siteId, equipmentCode]);

  const specs = pack?.specs;
  const technical = useMemo(() => Object.entries(specs?.technical ?? {}).filter(([, value]) => value !== undefined && value !== null && typeof value !== "object"), [specs]);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/50 flex items-end sm:items-center justify-center">
      <section role="dialog" aria-modal="true" aria-label="Equipment details" className="w-full max-w-xl max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white overflow-hidden shadow-2xl">
        <header className="shrink-0 px-4 py-3 border-b flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold">{equipmentName}</h3>
            <p className="text-xs text-slate-500">{equipmentCode}</p>
          </div>
          <div className="flex items-center gap-2">
            {cached && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Cached offline {"\u00b7"} 7d</span>}
            <button type="button" onClick={onClose} aria-label="Close details" className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600">{"\u2715"}</button>
          </div>
        </header>
        <nav className="shrink-0 flex border-b" role="tablist">
          {tabs.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)}
              className={`flex-1 py-2 text-xs font-medium ${tab === name ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500"}`}>{name}</button>
          ))}
        </nav>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          {error && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
          {!pack && !error && <p className="py-8 text-center text-xs text-slate-500">Loading details{"\u2026"}</p>}
          {pack && specs && tab === "Specs" && (
            <div>
              <Row label="Category" value={specs.category} />
              <Row label="Hierarchy" value={specs.hierarchyLevel} />
              <Row label="Status" value={specs.status} />
              <Row label="Manufacturer / Model" value={[specs.manufacturer, specs.model].filter(Boolean).join(" ") || null} />
              <Row label="Serial" value={specs.serialNumber} />
              <Row label="Install year" value={specs.installYear} />
              <Row label="Warranty" value={specs.warrantyExpiry ? `${specs.warrantyExpiry}${specs.warrantyActive === false ? " (expired)" : ""}` : null} />
              <Row label="Criticality" value={specs.criticality} />
              <Row label="Trade" value={specs.primaryTrade} />
              <Row label="Classification (KGR)" value={[specs.classification.standardId, specs.classification.standard].filter(Boolean).join(" \u2014 ") || null} />
              <Row label="System" value={specs.classification.system} />
              <Row label="Parent" value={specs.parent ? `${specs.parent.EquipmentCode} \u00b7 ${specs.parent.EquipmentName}` : null} />
              <Row label="Sub-equipment" value={specs.children.length ? specs.children.map((c) => `${c.EquipmentCode} \u00b7 ${c.EquipmentName}`).join(", ") : null} />
              {technical.map(([key, value]) => <Row key={key} label={key} value={String(value)} />)}
              {specs.sophia && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                  <p className="font-semibold text-slate-800">Latest Sophia condition</p>
                  <p>Score: <b>{specs.sophia.conditionScore ?? "\u2014"}</b>{specs.sophia.urgency ? ` \u00b7 ${specs.sophia.urgency}` : ""}</p>
                  {specs.sophia.checkpoint && <p>Checkpoint: {specs.sophia.checkpoint}</p>}
                  {specs.sophia.summary && <p className="text-slate-600">{specs.sophia.summary}</p>}
                  {specs.sophia.lastInspectedAt && <p className="text-slate-500">Last inspected {specs.sophia.lastInspectedAt.slice(0, 10)}</p>}
                </div>
              )}
            </div>
          )}
          {pack && tab === "Docs" && (
            <ul className="space-y-1.5">
              {pack.documents.map((doc) => (
                <li key={doc.id}>
                  <button type="button" onClick={() => setPreview(doc)} className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 flex items-center justify-between gap-2 hover:bg-slate-50">
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{doc.name}</span><span className="text-[11px] uppercase text-slate-500">{doc.type}</span></span>
                    <span className="text-xs text-blue-700">{doc.url ? "Open" : "Preview"}</span>
                  </button>
                </li>
              ))}
              {preview && (
                <li className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
                  <p className="font-semibold">{preview.name}</p>
                  {preview.url ? (
                    <a href={preview.url} target="_blank" rel="noreferrer" download={preview.name} className="inline-block rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white">Open / download</a>
                  ) : (
                    <p className="text-slate-600">This register entry has no file attached yet. Upload it from the web portal equipment record to make it available offline.</p>
                  )}
                </li>
              )}
            </ul>
          )}
          {pack && tab === "Floor Plan" && <FloorPlan pack={pack} />}
          {pack && tab === "BIM" && <Bim pack={pack} />}
        </div>
      </section>
    </div>
  );
};
