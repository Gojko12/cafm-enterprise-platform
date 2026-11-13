import type React from "react";
import * as THREE from "three";
import type { BaseWorkRequest, LocationFreeze, WorkRequestBimPin } from "@cafm/shared-schema";
import type { useCafmStore } from "@/lib/cafm-store";
import type { BimDiscipline, BimElement, BimModelIndex, BimSpace, FunctionalGroup, resolveElementLinks } from "@/lib/ifc-cafm-bridge";

export const COLOR_RED = 0xdc2626;
export const COLOR_AMBER = 0xf59e0b;
export const COLOR_CYAN = 0x06b6d4;
export const COLOR_EMERALD = 0x10b981;
export const COLOR_VIOLET = 0x8b5cf6;
export const COLOR_HIGHLIGHT = 0x1d4ed8;
export const ALL_STOREYS = "All Storeys";
export const SAFE_BOUNDS = { min: [-10, 0, -10] as [number, number, number], max: [10, 15, 10] as [number, number, number] };

export interface MeshOriginal {
  color: number;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

export type ColorMode = "bim" | "status" | "heatmap";
export type RoomLevel = "red" | "amber" | "cyan" | "clear";
export const ROOM_LEVEL_COLOR: Record<RoomLevel, number> = { red: COLOR_RED, amber: COLOR_AMBER, cyan: COLOR_CYAN, clear: COLOR_EMERALD };
export const COLOR_ROOM_HIGHLIGHT = 0x22d3ee;

export interface RoomHealth {
  level: RoomLevel;
  wrs: BaseWorkRequest[];
  freezes: LocationFreeze[];
}

export type PickResult =
  | { kind: "element"; expressId: number }
  | { kind: "space"; expressId: number }
  | null;

export const elementMapCache = new WeakMap<BimModelIndex, Map<number, BimElement>>();
export const spaceMapCache = new WeakMap<BimModelIndex, Map<number, BimSpace>>();
export function elementMapOf(index: BimModelIndex): Map<number, BimElement> {
  let map = elementMapCache.get(index);
  if (!map) { map = new Map(index.elements.map((element) => [element.expressId, element])); elementMapCache.set(index, map); }
  return map;
}
export function spaceMapOf(index: BimModelIndex): Map<number, BimSpace> {
  let map = spaceMapCache.get(index);
  if (!map) { map = new Map(index.spaces.map((space) => [space.expressId, space])); spaceMapCache.set(index, map); }
  return map;
}

export function isFullyVisible(object: THREE.Object3D): boolean {
  for (let cursor: THREE.Object3D | null = object; cursor; cursor = cursor.parent) if (!cursor.visible) return false;
  return true;
}

export function boxIsFinite(box: THREE.Box3): boolean {
  return !box.isEmpty() && [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite);
}

export function displayName(element: BimElement): string {
  const name = element.name.split(":")[0]?.trim();
  return name || element.typeName || element.ifcType;
}

export type CafmData = ReturnType<typeof useCafmStore>["data"];
export type BimLinkMap = ReturnType<typeof resolveElementLinks>;
export type SetState<T> = React.Dispatch<React.SetStateAction<T>>;
export type IsolateTarget = { kind: "element" | "room"; expressId: number; label: string } | null;
export type FastJobLocation = { bl_id: string; levelName: string; roomCode: string } | null;
export type CameraView = "iso" | "top" | "front" | "right";
export type ViewportHealth = { buildingId: string; meshCount: number; size: [number, number, number]; warning: string } | null;
export interface IssuePin { key: string; label: string; color: number; kind: "element" | "space"; expressId: number }
export type BimTab = "linked" | "unassigned" | "rooms" | "filter" | "audit";

// ---- Section 76: live status color toggles, MEP discipline layers, multi-select & FJ spot pins ----

export const COLOR_MULTI_HIGHLIGHT = 0xec4899;
export const EQ_FLY_DIRECTION = new THREE.Vector3(1, 0.95, 1);

export type StatusBucket = "overdue" | "openWr" | "freeze" | "healthy" | "unassigned";
export type StatusColorVisibility = Record<StatusBucket, boolean>;
/** `Unassigned MEP element` stays uncolored (normal BIM material) by default. */
export const DEFAULT_STATUS_COLOR_VISIBILITY: StatusColorVisibility = Object.freeze({
  overdue: true, openWr: true, freeze: true, healthy: true, unassigned: false,
});
export const STATUS_BUCKET_BY_COLOR = new Map<number, StatusBucket>([
  [COLOR_RED, "overdue"], [COLOR_AMBER, "openWr"], [COLOR_CYAN, "freeze"],
  [COLOR_EMERALD, "healthy"], [COLOR_VIOLET, "unassigned"],
]);

export type DisciplineVisibility = Record<BimDiscipline, boolean>;
export const DEFAULT_DISCIPLINE_VISIBILITY: DisciplineVisibility = Object.freeze({
  shell: true, hvac: true, piping: true, electrical: true,
});

export interface BimElementClassification {
  functionalGroup: FunctionalGroup;
  discipline: BimDiscipline;
  manufacturer: string;
}

export type FloorIsolation = { storeyName: string; roomCode: string } | null;
export type FastJobPrefill = { equipmentCode?: string; bimPin?: WorkRequestBimPin; spotLabel?: string } | null;

/** Open Fast Job carrying an exact `(x, yBase, z)` 3D spot pin. */
export interface FjSpotPin { key: string; wr: BaseWorkRequest; pin: WorkRequestBimPin }

/** Converts a world-space Y into the 0–100 `clipPercent` slider domain of the section plane. */
export function clipPercentForWorldY(modelBox: THREE.Box3 | null, worldY: number): number {
  if (!modelBox || modelBox.isEmpty()) return 100;
  const span = modelBox.max.y + 0.5 - modelBox.min.y;
  if (span <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round(((worldY - modelBox.min.y) / span) * 100)));
}
