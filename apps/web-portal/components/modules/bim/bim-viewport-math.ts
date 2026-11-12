import type React from "react";
import * as THREE from "three";
import type { BaseWorkRequest, LocationFreeze } from "@cafm/shared-schema";
import type { useCafmStore } from "@/lib/cafm-store";
import type { BimElement, BimModelIndex, BimSpace, resolveElementLinks } from "@/lib/ifc-cafm-bridge";

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
export type BimTab = "linked" | "unassigned" | "rooms";
