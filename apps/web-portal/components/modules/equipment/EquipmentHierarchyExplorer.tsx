import type { Equipment } from "@cafm/shared-schema";
import type { EquipmentAssociation } from "@/lib/cafm-data";
import { KIND_LABEL } from "./EquipmentAssociations";

// V78 (Section 128): MS Teams-style centered graph explorer for the
// equipment hierarchy. The Equipment Tree shows the whole site at once;
// this view centers ONE equipment and shows only its neighbourhood: the
// parent chain above, the children below with connector lines, and the
// shared links (V76 associations) as amber chips. Clicking any node or chip
// re-centers the explorer on that equipment, so you can walk the whole
// structure step by step, exactly like clicking through people in an org
// chart. Pure CSS connectors with fixed node widths, no measuring, no
// external chart library.

const NODE_W = 176;
const Stub = ({ h = 12 }: { h?: number }) => <div aria-hidden className="mx-auto w-px bg-slate-300" style={{ height: h }} />;

function Node({ eq, center, onSelect }: { eq: Equipment; center?: boolean; onSelect: (code: string) => void }) {
  return (
    <button type="button" onClick={() => onSelect(eq.EquipmentCode)} style={{ width: NODE_W }}
      title={`${eq.EquipmentCode} · ${eq.EquipmentName}${eq.HierarchyLevel ? ` · ${eq.HierarchyLevel}` : ""}${eq.Status ? ` · ${eq.Status}` : ""}`}
      className={`block rounded-lg border px-2 py-1.5 text-left shadow-sm transition-colors ${center
        ? "border-blue-600 bg-blue-50 ring-2 ring-blue-200"
        : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"}`}>
      <span className="block truncate font-mono text-[11px] font-semibold text-slate-900">{eq.EquipmentCode}</span>
      <span className={`block truncate text-xs ${center ? "font-semibold text-blue-900" : "text-slate-700"}`}>{eq.EquipmentName}</span>
      <span className="block truncate text-[10px] text-slate-500">{[eq.HierarchyLevel, eq.Status].filter(Boolean).join(" · ")}</span>
    </button>
  );
}

export function EquipmentHierarchyExplorer({ equipment, associations, centerCode, onSelect }:
  { equipment: Equipment[]; associations: EquipmentAssociation[]; centerCode: string | null; onSelect: (code: string) => void }) {
  const byCode = new Map(equipment.map((eq) => [eq.EquipmentCode, eq]));
  const roots = equipment.filter((eq) => !eq.ParentEquipmentCode);
  const center = centerCode ? byCode.get(centerCode) : undefined;
  if (!center) {
    return (
      <div className="rounded-lg border bg-white p-4">
        <h3 className="text-sm font-semibold">Graph explorer</h3>
        <p className="mt-1 text-xs text-slate-500">Pick an installation to center the explorer, then click any node to move around.</p>
        <div className="mt-3 flex flex-wrap gap-2">{roots.map((eq) => <Node key={eq.EquipmentCode} eq={eq} onSelect={onSelect} />)}</div>
        {roots.length === 0 && <p className="mt-2 text-xs text-slate-400">No equipment at this site.</p>}
      </div>
    );
  }
  // Parent chain above the center, capped at 3 visible rows with an ellipsis.
  const chain: Equipment[] = [];
  let cursor = center.ParentEquipmentCode ? byCode.get(center.ParentEquipmentCode) : undefined;
  let guard = 0;
  while (cursor && guard++ < 10) { chain.unshift(cursor); cursor = cursor.ParentEquipmentCode ? byCode.get(cursor.ParentEquipmentCode) : undefined; }
  const hiddenAbove = Math.max(0, chain.length - 3);
  const ancestors = chain.slice(-3);
  const children = equipment.filter((eq) => eq.ParentEquipmentCode === center.EquipmentCode)
    .sort((a, b) => (a.LocalEquipmentCode ?? a.EquipmentCode).localeCompare(b.LocalEquipmentCode ?? b.EquipmentCode));
  const sharedOut = associations.filter((entry) => entry.fromCode === center.EquipmentCode)
    .map((entry) => ({ entry, other: byCode.get(entry.toCode) }));
  const sharedIn = associations.filter((entry) => entry.toCode === center.EquipmentCode)
    .map((entry) => ({ entry, other: byCode.get(entry.fromCode) }));
  const busWidth = children.length > 1 ? (children.length - 1) * (NODE_W + 8) : 0;
  return (
    <div className="rounded-lg border bg-white p-4" aria-label="Equipment graph explorer">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Graph explorer</h3>
        <p className="text-xs text-slate-500">Click any node to center it · current: <span className="font-mono">{center.EquipmentCode}</span></p>
      </div>
      <div className="mt-4">
        {hiddenAbove > 0 && <p className="text-center text-[10px] text-slate-400">⋯ {hiddenAbove} more level(s) above</p>}
        {ancestors.map((eq, index) => (
          <div key={eq.EquipmentCode}>
            {(index > 0 || hiddenAbove > 0) && <Stub />}
            <div className="flex justify-center"><Node eq={eq} onSelect={onSelect} /></div>
          </div>
        ))}
        {ancestors.length > 0 && <Stub h={16} />}
        <div className="flex justify-center"><Node eq={center} center onSelect={onSelect} /></div>
        {children.length > 0 && <>
          <Stub h={16} />
          {busWidth > 0 && <div aria-hidden className="mx-auto h-px bg-slate-300" style={{ width: busWidth }} />}
          <div className="overflow-x-auto">
            <div className="mx-auto flex w-fit gap-2 py-0">
              {children.map((child) => (
                <div key={child.EquipmentCode} style={{ width: NODE_W }}>
                  <Stub h={16} />
                  <Node eq={child} onSelect={onSelect} />
                </div>
              ))}
            </div>
          </div>
        </>}
        {children.length === 0 && <p className="mt-2 text-center text-xs text-slate-400">No sub-equipment below this item.</p>}
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shared links</h4>
        {sharedOut.length === 0 && sharedIn.length === 0
          ? <p className="mt-1 text-xs text-slate-400">No shared links at this item.</p>
          : <div className="mt-2 flex flex-wrap gap-2">
            {sharedOut.map(({ entry, other }) => other && (
              <button key={entry.id} type="button" onClick={() => onSelect(other.EquipmentCode)}
                title={`Open ${other.EquipmentName}${entry.note ? ` · ${entry.note}` : ""}`}
                className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-800 hover:bg-amber-100">
                ⛓ {KIND_LABEL[entry.kind]} <strong>{other.EquipmentName}</strong></button>
            ))}
            {sharedIn.map(({ entry, other }) => other && (
              <button key={entry.id} type="button" onClick={() => onSelect(other.EquipmentCode)}
                title={`Open ${other.EquipmentName}${entry.note ? ` · ${entry.note}` : ""}`}
                className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100">
                ⛓ <strong>{other.EquipmentName}</strong> {KIND_LABEL[entry.kind]} this</button>
            ))}
          </div>}
        <p className="mt-2 text-[10px] text-slate-400">Manage shared links from the Hierarchy tab of the details panel.</p>
      </div>
    </div>
  );
}
