"use client";

import React, { useMemo } from "react";
import { Link2 } from "lucide-react";
import type { BimElement, BimModelIndex, MissingSyncItems } from "@/lib/ifc-cafm-bridge";
import { displayName, type BimLinkMap, type CafmData } from "./bim-viewport-math";

export interface BimHandoverAuditPanelProps {
  data: CafmData;
  buildingId: string;
  index: BimModelIndex | null;
  links: BimLinkMap;
  missing: MissingSyncItems | null;
  selectedElement: BimElement | null;
  selectedIsLinked: boolean;
  busy: boolean;
  assignExisting: (element: BimElement, equipmentCode: string) => Promise<void>;
  selectAndFly: (expressId: number) => void;
}

/**
 * Bidirectional BIM handover audit: building BIM coverage %, CAFM equipment
 * still lacking a 3D link (with 1-click linking against the currently selected
 * unassigned 3D element), and IFC floors/rooms missing from CAFM.
 */
export function BimHandoverAuditPanel({
  data, buildingId, index, links, missing, selectedElement, selectedIsLinked, busy, assignExisting, selectAndFly,
}: BimHandoverAuditPanelProps) {
  const buildingEquipment = useMemo(
    () => data.equipment.filter((asset) => asset.bl_id === buildingId),
    [data.equipment, buildingId],
  );
  const linkedCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const link of links.values()) codes.add(link.equipmentCode);
    return codes;
  }, [links]);
  const unlinked = useMemo(
    () => buildingEquipment.filter((asset) => !linkedCodes.has(asset.EquipmentCode)),
    [buildingEquipment, linkedCodes],
  );
  const linkedCount = buildingEquipment.length - unlinked.length;
  const coverage = buildingEquipment.length ? Math.round((linkedCount / buildingEquipment.length) * 100) : 0;
  const canQuickLink = !!selectedElement && !selectedIsLinked && selectedElement.isAssignable;
  const coverageTone = coverage >= 80 ? "text-emerald-700" : coverage >= 40 ? "text-amber-700" : "text-red-700";

  if (!index) return <p className="p-3 text-xs text-gray-500">Load a BIM model to audit the handover.</p>;

  return (
    <div className="flex-1 min-h-0 flex flex-col text-xs">
      <div className="border-b border-gray-200 p-3 space-y-2">
        <div className="rounded border border-gray-200 bg-gray-50 p-2">
          <p className="font-semibold text-gray-800">Building BIM Coverage</p>
          <p className={`text-2xl font-bold ${coverageTone}`}>{coverage}%</p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-gray-200">
            <div className="h-full rounded bg-emerald-500" style={{ width: `${coverage}%` }} />
          </div>
          <p className="mt-1 text-gray-600">{linkedCount} of {buildingEquipment.length} CAFM equipment in {buildingId} have a 3D BIM link.</p>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded border border-gray-200 bg-white p-1.5">
            <p className="text-base font-bold text-gray-900">{missing?.floors.length ?? 0}</p>
            <p className="text-gray-500">IFC floors missing in CAFM</p>
          </div>
          <div className="rounded border border-gray-200 bg-white p-1.5">
            <p className="text-base font-bold text-gray-900">{missing?.rooms.length ?? 0}</p>
            <p className="text-gray-500">IFC rooms missing in CAFM</p>
          </div>
          <div className="rounded border border-gray-200 bg-white p-1.5">
            <p className="text-base font-bold text-gray-900">{missing?.taggedAssets.length ?? 0}</p>
            <p className="text-gray-500">Tagged assets missing in CAFM</p>
          </div>
        </div>
        {canQuickLink && selectedElement && (
          <p className="rounded border border-blue-300 bg-blue-50 px-2 py-1.5 text-blue-900">
            3D element <strong>{displayName(selectedElement)}</strong> is selected and unassigned — use a <strong>Link</strong> button below to bind it.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        <p className="px-3 pt-2 pb-1 font-semibold text-gray-800">Unlinked CAFM Equipment ({unlinked.length})</p>
        {unlinked.map((asset) => (
          <div key={asset.EquipmentCode} className="flex items-center gap-2 px-3 py-1.5">
            <div className="flex-1 min-w-0">
              <span className="block truncate font-semibold text-gray-900">{asset.EquipmentCode} · {asset.EquipmentName}</span>
              <span className="block truncate text-gray-500">{asset.LevelName} · {asset.RoomCode}{asset.Manufacturer ? ` · ${asset.Manufacturer}` : ""}</span>
            </div>
            {canQuickLink && selectedElement && (
              <button onClick={() => void assignExisting(selectedElement, asset.EquipmentCode)} disabled={busy}
                className="inline-flex shrink-0 items-center gap-1 rounded bg-blue-600 px-2 py-1 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                <Link2 size={11} /> Link to Selected 3D Element
              </button>
            )}
          </div>
        ))}
        {!unlinked.length && <p className="px-3 py-2 text-gray-500">Every CAFM equipment in this building has a 3D BIM link. 🎉</p>}

        {!!missing?.taggedAssets.length && (
          <>
            <p className="px-3 pt-2 pb-1 font-semibold text-gray-800">Mark-tagged IFC elements missing in CAFM ({missing.taggedAssets.length})</p>
            {missing.taggedAssets.slice(0, 30).map((element) => (
              <button key={element.expressId} onClick={() => selectAndFly(element.expressId)} className="block w-full px-3 py-1.5 text-left hover:bg-blue-50">
                <span className="block truncate font-semibold text-gray-900">{element.mark} · {displayName(element)}</span>
                <span className="block truncate text-gray-500">{element.storeyName}{element.roomCode ? ` · ${element.roomCode}` : ""}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
