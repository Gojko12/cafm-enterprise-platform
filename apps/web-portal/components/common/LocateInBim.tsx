"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box } from "lucide-react";

export interface BimModelInfo {
  siteId: string;
  buildingId: string;
  fileName: string;
  updatedAt: string;
  sizeBytes: number;
  /** Uncompressed STEP size when the stored file is a gzip archive. */
  uncompressedBytes?: number;
  compressed?: boolean;
  source: "uploaded" | "bundled";
}

const modelCache = new Map<string, Promise<BimModelInfo[]>>();

/** Lists the `.ifc` models available for a site (memoised per site; `force` busts the cache). */
export function fetchBimModels(siteId: string, force = false): Promise<BimModelInfo[]> {
  if (force || !modelCache.has(siteId)) {
    const request = fetch(`/api/bim-models?siteId=${encodeURIComponent(siteId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not list the BIM models.");
        const body: unknown = await response.json();
        const models = body && typeof body === "object" && "models" in body ? body.models : [];
        return Array.isArray(models) ? (models as BimModelInfo[]) : [];
      })
      .catch((error: unknown) => {
        modelCache.delete(siteId);
        throw error;
      });
    modelCache.set(siteId, request);
  }
  return modelCache.get(siteId)!;
}

export function useBimModels(siteId: string): BimModelInfo[] | null {
  const [models, setModels] = useState<BimModelInfo[] | null>(null);
  useEffect(() => {
    let active = true;
    fetchBimModels(siteId).then((result) => { if (active) setModels(result); }).catch(() => { if (active) setModels([]); });
    return () => { active = false; };
  }, [siteId]);
  return models;
}

interface LocateInBimButtonProps {
  siteId: string;
  buildingId: string;
  /** `Equipment.bimBuildingId` fallback when the equipment was linked under another model. */
  bimBuildingId?: string;
  equipmentCode?: string;
  hasBimLink?: boolean;
  className?: string;
}

/**
 * `Locate in 3D BIM` deep-link: shown whenever the target building has an `.ifc`
 * model (or the equipment already carries a BIM link). Opens the viewer with
 * X-Ray mode enabled, highlights the element, and flies the camera to it.
 */
export function LocateInBimButton({ siteId, buildingId, bimBuildingId, equipmentCode, hasBimLink, className }: LocateInBimButtonProps) {
  const router = useRouter();
  const models = useBimModels(siteId);
  const targetBuilding = models?.some((model) => model.buildingId === buildingId)
    ? buildingId
    : bimBuildingId && models?.some((model) => model.buildingId === bimBuildingId)
      ? bimBuildingId
      : hasBimLink && bimBuildingId
        ? bimBuildingId
        : null;
  if (!targetBuilding) return null;
  const query = new URLSearchParams({ building: targetBuilding, ...(equipmentCode ? { eq: equipmentCode } : {}) });
  return (
    <button
      type="button"
      onClick={() => router.push(`/bim-viewer?${query.toString()}`)}
      className={className ?? "inline-flex items-center gap-1 rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100"}
      title="Open the 3D BIM viewer, enable X-Ray mode, and fly to this location"
    >
      <Box size={13} /> Locate in 3D BIM
    </button>
  );
}

interface OpenRoomInBimButtonProps {
  siteId: string;
  buildingId: string;
  roomCode?: string;
  /** Work request deep link (`?wr=…`) used when the WR carries an exact 3D `bimPin`. */
  wrId?: string;
  hasPin?: boolean;
  className?: string;
}

/**
 * `Open Room in 3D BIM` deep link for 2D floor plans and WR popups: jumps to
 * `/bim-viewer?building=…&wr=…` when the WR has an exact 3D spot pin, otherwise
 * `…&room=…` to isolate and frame the room. Hidden when no `.ifc` model exists.
 */
export function OpenRoomInBimButton({ siteId, buildingId, roomCode, wrId, hasPin, className }: OpenRoomInBimButtonProps) {
  const router = useRouter();
  const models = useBimModels(siteId);
  if (!models?.some((model) => model.buildingId === buildingId)) return null;
  const usePin = !!wrId && !!hasPin;
  if (!usePin && !roomCode) return null;
  const query = new URLSearchParams({ building: buildingId, ...(usePin ? { wr: wrId! } : { room: roomCode! }) });
  return (
    <button
      type="button"
      onClick={() => router.push(`/bim-viewer?${query.toString()}`)}
      className={className ?? "inline-flex items-center gap-1 rounded border border-cyan-300 bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-800 hover:bg-cyan-100"}
      title={usePin ? "Fly to the exact pinned 3D spot in the BIM viewer" : "Isolate this room's floor and frame it in the 3D BIM viewer"}
    >
      <Box size={13} /> {usePin ? "Open Pinned Spot in 3D BIM" : "Open Room in 3D BIM"}
    </button>
  );
}
