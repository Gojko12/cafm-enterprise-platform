"use client";

import React, { useMemo, useState } from "react";
import { Crosshair, Ghost, X } from "lucide-react";
import type { BimModelIndex, FunctionalGroup } from "@/lib/ifc-cafm-bridge";
import { FUNCTIONAL_GROUPS } from "@/lib/ifc-cafm-bridge";
import {
  displayName,
  type BimElementClassification, type BimLinkMap, type SetState,
} from "./bim-viewport-math";

const ALL = "All";

const QUICK_CHIPS: readonly { label: string; group: FunctionalGroup }[] = [
  { label: "🔥 Fire Dampers", group: "Fire Damper" },
  { label: "🚽 Toilets", group: "Toilet / Sanitary" },
  { label: "🌀 Ventilation", group: "Ventilation / AHU" },
  { label: "💧 Pumps", group: "Pump" },
  { label: "💡 Lighting", group: "Lighting / Electrical" },
];

export interface BimFilterPanelProps {
  index: BimModelIndex | null;
  classificationByExpressId: Map<number, BimElementClassification>;
  links: BimLinkMap;
  multiSelection: number[];
  setMultiSelection: SetState<number[]>;
  ghostRest: boolean;
  setGhostRest: SetState<boolean>;
  fitMultiSelection: () => void;
  selectAndFly: (expressId: number) => void;
}

/**
 * Multi-EQ Smart Filter: 1-click chips, functional-group / manufacturer dropdowns
 * with live counts, row checkboxes, Select All, Ghost Rest, and Fit Selected.
 * CAFM EQ creation / `.ifc` Mark assignment stay strictly single-element —
 * this panel only selects, highlights, and frames.
 */
export function BimFilterPanel({
  index, classificationByExpressId, links, multiSelection, setMultiSelection,
  ghostRest, setGhostRest, fitMultiSelection, selectAndFly,
}: BimFilterPanelProps) {
  const [group, setGroup] = useState<string>(ALL);
  const [manufacturer, setManufacturer] = useState<string>(ALL);
  const [includeUnassigned, setIncludeUnassigned] = useState(false);

  // MEP candidates: linked equipment always; unassigned assignable elements on demand.
  const candidates = useMemo(() => index
    ? index.elements.filter((element) =>
      links.has(element.expressId) || (includeUnassigned && element.isAssignable))
    : [], [index, links, includeUnassigned]);

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const element of candidates) {
      const entry = classificationByExpressId.get(element.expressId);
      if (!entry) continue;
      counts.set(entry.functionalGroup, (counts.get(entry.functionalGroup) ?? 0) + 1);
    }
    return counts;
  }, [candidates, classificationByExpressId]);

  const manufacturerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const element of candidates) {
      const entry = classificationByExpressId.get(element.expressId);
      if (!entry?.manufacturer) continue;
      if (group !== ALL && entry.functionalGroup !== group) continue;
      counts.set(entry.manufacturer, (counts.get(entry.manufacturer) ?? 0) + 1);
    }
    return counts;
  }, [candidates, classificationByExpressId, group]);

  const rows = useMemo(() => candidates.filter((element) => {
    const entry = classificationByExpressId.get(element.expressId);
    if (!entry) return false;
    if (group !== ALL && entry.functionalGroup !== group) return false;
    if (manufacturer !== ALL && entry.manufacturer !== manufacturer) return false;
    return true;
  }), [candidates, classificationByExpressId, group, manufacturer]);

  const selected = useMemo(() => new Set(multiSelection), [multiSelection]);

  const toggleRow = (expressId: number) => {
    setMultiSelection((current) => current.includes(expressId)
      ? current.filter((id) => id !== expressId)
      : [...current, expressId]);
  };

  const applyChip = (chipGroup: FunctionalGroup) => {
    setGroup(chipGroup);
    setManufacturer(ALL);
    // 1-click: immediately multi-select every matching element.
    setMultiSelection(candidates
      .filter((element) => classificationByExpressId.get(element.expressId)?.functionalGroup === chipGroup)
      .map((element) => element.expressId));
  };

  const clearAll = () => {
    setMultiSelection([]);
    setGhostRest(false);
    setGroup(ALL);
    setManufacturer(ALL);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col text-xs">
      <div className="border-b border-gray-200 p-2 space-y-2">
        <div className="flex flex-wrap gap-1" aria-label="Smart filter chips">
          {QUICK_CHIPS.map((chip) => (
            <button key={chip.group} onClick={() => applyChip(chip.group)} aria-pressed={group === chip.group}
              className={`rounded-full border px-2 py-0.5 ${group === chip.group ? "border-pink-500 bg-pink-50 font-semibold text-pink-800" : "border-gray-300 bg-white hover:bg-gray-100"}`}>
              {chip.label} ({groupCounts.get(chip.group) ?? 0})
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="font-medium text-gray-700">Functional Group
            <select value={group} onChange={(event) => { setGroup(event.target.value); setManufacturer(ALL); }} className="mt-0.5 w-full rounded border border-gray-300 px-1 py-1 bg-white">
              <option value={ALL}>All ({candidates.length})</option>
              {FUNCTIONAL_GROUPS.map((entry) => (
                <option key={entry} value={entry}>{entry} ({groupCounts.get(entry) ?? 0})</option>
              ))}
            </select>
          </label>
          <label className="font-medium text-gray-700">Manufacturer
            <select value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} className="mt-0.5 w-full rounded border border-gray-300 px-1 py-1 bg-white">
              <option value={ALL}>All brands</option>
              {[...manufacturerCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([brand, count]) => (
                <option key={brand} value={brand}>{brand} ({count})</option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-gray-700">
          <input type="checkbox" checked={includeUnassigned} onChange={(event) => setIncludeUnassigned(event.target.checked)} className="rounded border-gray-300" />
          Include Unassigned BIM elements
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setMultiSelection(rows.map((element) => element.expressId))} disabled={!rows.length}
            className="rounded border border-gray-300 bg-white px-2 py-1 font-semibold hover:bg-gray-100 disabled:opacity-40">
            ☑ Select All ({rows.length})
          </button>
          <button onClick={() => setGhostRest((value) => !value)} aria-pressed={ghostRest} disabled={!multiSelection.length && !ghostRest}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 font-semibold disabled:opacity-40 ${ghostRest ? "border-pink-500 bg-pink-600 text-white" : "border-gray-300 bg-white hover:bg-gray-100"}`}>
            <Ghost size={11} /> Ghost Rest
          </button>
          <button onClick={fitMultiSelection} disabled={!multiSelection.length}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 font-semibold hover:bg-gray-100 disabled:opacity-40">
            <Crosshair size={11} /> 🎯 Fit Selected ({multiSelection.length})
          </button>
          <button onClick={clearAll} disabled={!multiSelection.length && group === ALL && manufacturer === ALL && !ghostRest}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 font-semibold hover:bg-gray-100 disabled:opacity-40">
            <X size={11} /> Clear
          </button>
        </div>
        <p className="text-[10px] text-gray-500">Tip: Ctrl/Cmd+Click elements in 3D to add or remove them from the multi-selection.</p>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {rows.map((element) => {
          const entry = classificationByExpressId.get(element.expressId)!;
          const link = links.get(element.expressId);
          const checked = selected.has(element.expressId);
          return (
            <div key={element.expressId} className={`flex items-center gap-2 px-2 py-1.5 ${checked ? "bg-pink-50" : "hover:bg-gray-50"}`}>
              <input type="checkbox" checked={checked} onChange={() => toggleRow(element.expressId)}
                aria-label={`Select ${link ? link.equipmentCode : displayName(element)}`} className="rounded border-gray-300" />
              <button onClick={() => selectAndFly(element.expressId)} className="flex-1 min-w-0 text-left">
                <span className="block truncate font-semibold text-gray-900">
                  {link ? `${link.equipmentCode} · ` : ""}{displayName(element)}
                </span>
                <span className="block truncate text-gray-500">
                  {entry.functionalGroup}{entry.manufacturer ? ` · ${entry.manufacturer}` : ""} · {element.storeyName}{element.roomCode ? ` · ${element.roomCode}` : ""}
                </span>
              </button>
            </div>
          );
        })}
        {!rows.length && <p className="p-3 text-gray-500">No MEP elements match the current filters.</p>}
      </div>
    </div>
  );
}
