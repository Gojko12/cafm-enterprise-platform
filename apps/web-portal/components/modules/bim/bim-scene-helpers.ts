import * as THREE from "three";
import { expressIdFromBatchedHit, type BimSpace, type LoadedBimModel } from "@/lib/ifc-cafm-bridge";
import {
  ALL_STOREYS,
  COLOR_EMERALD,
  COLOR_HIGHLIGHT,
  COLOR_MULTI_HIGHLIGHT,
  COLOR_ROOM_HIGHLIGHT,
  COLOR_VIOLET,
  ROOM_LEVEL_COLOR,
  STATUS_BUCKET_BY_COLOR,
  elementMapOf,
  isFullyVisible,
  spaceMapOf,
  type ColorMode,
  type DisciplineVisibility,
  type RoomHealth,
  type MeshOriginal,
  type PickResult,
  type StatusColorVisibility,
} from "./bim-viewport-math";
import type { BimDiscipline } from "@/lib/ifc-cafm-bridge";

export function pickAtModel(
  raycaster: THREE.Raycaster,
  model: LoadedBimModel,
  activeClippingPlanes: THREE.Plane[],
  xray: boolean,
  purpose: "select" | "measure" | "pin-fj",
): { result: PickResult; point: THREE.Vector3 | null } {
  const pickables: THREE.Object3D[] = [];
  for (const meshes of model.elementMeshes.values()) for (const mesh of meshes) pickables.push(mesh);
  for (const mesh of model.batchedMeshes) pickables.push(mesh);
  if (purpose === "select") for (const meshes of model.spaceMeshes.values()) for (const mesh of meshes) pickables.push(mesh);
  const elements = elementMapOf(model.index);
  const spaces = spaceMapOf(model.index);
  let spaceHit: { expressId: number; point: THREE.Vector3 } | null = null;
  for (const hit of raycaster.intersectObjects(pickables, false)) {
    const mesh = hit.object as THREE.Mesh;
    if (!isFullyVisible(mesh)) continue;
    if (!activeClippingPlanes.every((plane) => plane.distanceToPoint(hit.point) >= -1e-4)) continue;
    if (purpose === "measure") return { result: null, point: hit.point.clone() };
    if (purpose === "pin-fj") {
      // Pin mode hits any visible surface: floors, ceilings, walls, lamps, toilets, or equipment.
      const expressId = mesh.userData.batched
        ? expressIdFromBatchedHit(mesh, hit.faceIndex ?? 0)
        : (mesh.userData.expressId as number);
      const element = expressId === null ? undefined : elements.get(expressId);
      return { result: element ? { kind: "element", expressId: element.expressId } : null, point: hit.point.clone() };
    }
    if (mesh.userData.isSpace) {
      spaceHit ??= { expressId: mesh.userData.expressId as number, point: hit.point };
      continue;
    }
    const expressId = mesh.userData.batched
      ? expressIdFromBatchedHit(mesh, hit.faceIndex ?? 0)
      : (mesh.userData.expressId as number);
    const element = expressId === null ? undefined : elements.get(expressId);
    if (!element) continue;
    if (element.isShell) {
      if (xray) continue;
      break;
    }
    if (spaceHit) {
      const room = spaces.get(spaceHit.expressId);
      if (!room || element.roomCode !== room.code) break;
    }
    return { result: { kind: "element", expressId: element.expressId }, point: hit.point.clone() };
  }
  return spaceHit
    ? { result: { kind: "space", expressId: spaceHit.expressId }, point: spaceHit.point.clone() }
    : { result: null, point: null };
}

/** Resolves the IfcSpace room containing (or nearest to) a world-space point, explode-aware. */
export function resolveSpaceAtWorldPoint(
  model: LoadedBimModel,
  point: THREE.Vector3,
  storeyOffset: (storeyName: string) => number,
): BimSpace | null {
  const offset = model.group.position;
  let nearest: { space: BimSpace; gap: number } | null = null;
  for (const space of model.index.spaces) {
    if (!space.bbox) continue;
    const lift = offset.y + storeyOffset(space.storeyName);
    const minY = space.bbox.min[1] + lift, maxY = space.bbox.max[1] + lift;
    const inXZ = point.x >= space.bbox.min[0] + offset.x - 0.05 && point.x <= space.bbox.max[0] + offset.x + 0.05
      && point.z >= space.bbox.min[2] + offset.z - 0.05 && point.z <= space.bbox.max[2] + offset.z + 0.05;
    if (!inXZ) continue;
    if (point.y >= minY - 0.3 && point.y <= maxY + 0.3) return space;
    const gap = Math.min(Math.abs(point.y - minY), Math.abs(point.y - maxY));
    if (!nearest || gap < nearest.gap) nearest = { space, gap };
  }
  return nearest?.space ?? null;
}

export interface BimVisualStateParams {
  clippingPlanes: THREE.Plane[] | null;
  links: Map<number, { equipmentCode: string }>;
  selection: number | null;
  roomSelection: number | null;
  storeyFilter: string;
  xray: boolean;
  xrayOpacity: number;
  colorMode: ColorMode;
  showSpaces: boolean;
  statusColorByCode: Map<string, number>;
  roomHealth: Map<number, RoomHealth>;
  statusColorVisibility: StatusColorVisibility;
  disciplineVisibility: DisciplineVisibility;
  disciplineByExpressId: Map<number, BimDiscipline>;
  multiSelection: ReadonlySet<number>;
  ghostRest: boolean;
}

function finishMaterialState(
  material: THREE.MeshLambertMaterial,
  previousTransparent: boolean,
  previousDepthWrite: boolean,
  previousClippingPlanes: THREE.Plane[] | null,
  clippingPlanes: THREE.Plane[] | null,
): void {
  material.clippingPlanes = clippingPlanes;
  if (
    material.transparent !== previousTransparent
    || material.depthWrite !== previousDepthWrite
    || previousClippingPlanes !== clippingPlanes
  ) material.needsUpdate = true;
}

export function applyBimVisualState(model: LoadedBimModel, params: BimVisualStateParams): void {
  const {
    clippingPlanes, links, selection, roomSelection, storeyFilter, xray, xrayOpacity,
    colorMode, showSpaces, statusColorByCode, roomHealth,
    statusColorVisibility, disciplineVisibility, disciplineByExpressId, multiSelection, ghostRest,
  } = params;
  const ghostOpacity = xrayOpacity / 100;
  const ghostRestActive = ghostRest && multiSelection.size > 0;
  const elementById = elementMapOf(model.index);
  for (const [expressId, meshes] of model.elementMeshes) {
    const element = elementById.get(expressId);
    const link = links.get(expressId);
    const discipline = disciplineByExpressId.get(expressId) ?? "hvac";
    const inFilter = (!element || storeyFilter === ALL_STOREYS || element.storeyName === storeyFilter)
      && disciplineVisibility[discipline];
    const ghost = xray && !!element && (element.isShell || (!element.isAssignable && !link));
    const selected = selection === expressId;
    const multiSelected = multiSelection.has(expressId);
    const ghostedByRest = ghostRestActive && !multiSelected && !selected;
    for (const mesh of meshes) {
      mesh.visible = inFilter && !(ghost && !selected && !multiSelected && xrayOpacity === 0);
      const material = mesh.material as THREE.MeshLambertMaterial;
      const previousTransparent = material.transparent;
      const previousDepthWrite = material.depthWrite;
      const previousClippingPlanes = material.clippingPlanes;
      const original = mesh.userData.original as MeshOriginal | undefined;
      if (!original) {
        finishMaterialState(material, previousTransparent, previousDepthWrite, previousClippingPlanes, clippingPlanes);
        continue;
      }
      let color = original.color;
      if (colorMode === "status" && element && !element.isShell) {
        const statusColor = link ? statusColorByCode.get(link.equipmentCode) ?? COLOR_EMERALD : element.isAssignable ? COLOR_VIOLET : null;
        // Toggled-off status rows keep the element 100% visible in its original BIM material.
        if (statusColor !== null && statusColorVisibility[STATUS_BUCKET_BY_COLOR.get(statusColor) ?? "healthy"]) color = statusColor;
      }
      material.color.setHex(color);
      if (selected || multiSelected) {
        material.emissive.setHex(multiSelected && !selected ? COLOR_MULTI_HIGHLIGHT : COLOR_HIGHLIGHT);
        material.emissiveIntensity = 0.85;
        material.opacity = 1;
        material.transparent = false;
        material.depthWrite = true;
      } else if (ghostedByRest) {
        material.emissive.setHex(0x000000);
        material.opacity = 0.08;
        material.transparent = true;
        material.depthWrite = false;
      } else if (ghost) {
        material.emissive.setHex(0x000000);
        material.opacity = ghostOpacity;
        material.transparent = true;
        material.depthWrite = false;
      } else {
        material.emissive.setHex(0x000000);
        material.opacity = original.opacity;
        material.transparent = original.transparent;
        material.depthWrite = original.depthWrite;
      }
      finishMaterialState(material, previousTransparent, previousDepthWrite, previousClippingPlanes, clippingPlanes);
    }
  }

  const spaceById = spaceMapOf(model.index);
  for (const [expressId, meshes] of model.spaceMeshes) {
    const space = spaceById.get(expressId);
    const selectedRoom = roomSelection === expressId;
    const heat = colorMode === "heatmap" ? roomHealth.get(expressId) : undefined;
    const inFilter = !space || storeyFilter === ALL_STOREYS || space.storeyName === storeyFilter;
    for (const mesh of meshes) {
      mesh.visible = selectedRoom || (inFilter && (showSpaces || colorMode === "heatmap"));
      const material = mesh.material as THREE.MeshLambertMaterial;
      const previousTransparent = material.transparent;
      const previousDepthWrite = material.depthWrite;
      const previousClippingPlanes = material.clippingPlanes;
      const original = mesh.userData.original as MeshOriginal | undefined;
      if (selectedRoom) {
        material.color.setHex(COLOR_ROOM_HIGHLIGHT);
        material.emissive.setHex(0x0891b2);
        material.emissiveIntensity = 0.6;
        material.opacity = 0.34;
        material.transparent = true;
        material.depthWrite = false;
      } else if (heat) {
        material.color.setHex(ROOM_LEVEL_COLOR[heat.level]);
        material.emissive.setHex(ROOM_LEVEL_COLOR[heat.level]);
        material.emissiveIntensity = 0.35;
        material.opacity = 0.45;
        material.transparent = true;
        material.depthWrite = false;
      } else if (original) {
        material.color.setHex(original.color);
        material.emissive.setHex(0x000000);
        material.opacity = original.opacity;
        material.transparent = original.transparent;
        material.depthWrite = original.depthWrite;
      }
      finishMaterialState(material, previousTransparent, previousDepthWrite, previousClippingPlanes, clippingPlanes);
    }
  }

  for (const mesh of model.batchedMeshes) {
    const storeyName = mesh.userData.storeyName as string;
    // Batched shell / passive-distribution meshes map to the `shell` discipline layer.
    const inFilter = (storeyFilter === ALL_STOREYS || storeyName === storeyFilter) && disciplineVisibility.shell;
    mesh.visible = inFilter && !(xray && xrayOpacity === 0);
    const material = mesh.material as THREE.MeshLambertMaterial;
    const previousTransparent = material.transparent;
    const previousDepthWrite = material.depthWrite;
    const previousClippingPlanes = material.clippingPlanes;
    const original = mesh.userData.original as MeshOriginal | undefined;
    if (!original) {
      finishMaterialState(material, previousTransparent, previousDepthWrite, previousClippingPlanes, clippingPlanes);
      continue;
    }
    if (ghostRestActive) {
      material.opacity = 0.08;
      material.transparent = true;
      material.depthWrite = false;
    } else if (xray && xrayOpacity > 0) {
      material.opacity = ghostOpacity;
      material.transparent = true;
      material.depthWrite = false;
    } else {
      material.opacity = original.opacity;
      material.transparent = original.transparent;
      material.depthWrite = original.depthWrite;
    }
    finishMaterialState(material, previousTransparent, previousDepthWrite, previousClippingPlanes, clippingPlanes);
  }
}

export function buildSelectionOutline(box: THREE.Box3): THREE.Box3Helper {
  return new THREE.Box3Helper(box.expandByScalar(0.05), new THREE.Color(COLOR_HIGHLIGHT));
}

/** One shared group of vivid outline boxes for every multi-selected element. */
export function buildMultiSelectionGroup(boxes: THREE.Box3[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "bim-multi-selection";
  for (const box of boxes) {
    group.add(new THREE.Box3Helper(box.clone().expandByScalar(0.04), new THREE.Color(COLOR_MULTI_HIGHLIGHT)));
  }
  return group;
}

export function buildRoomHighlightGroup(box: THREE.Box3, hasSpaceMesh: boolean): THREE.Group {
  const group = new THREE.Group();
  group.add(new THREE.Box3Helper(box.clone().expandByScalar(0.03), new THREE.Color(COLOR_ROOM_HIGHLIGHT)));
  if (!hasSpaceMesh) {
    const size = box.getSize(new THREE.Vector3());
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshBasicMaterial({ color: COLOR_ROOM_HIGHLIGHT, transparent: true, opacity: 0.2, depthWrite: false }),
    );
    fallback.position.copy(box.getCenter(new THREE.Vector3()));
    group.add(fallback);
  }
  return group;
}

export function buildMeasureGroup(
  measurePoints: THREE.Vector3[],
  modelBox: THREE.Box3 | null,
): { group: THREE.Group; anchor: THREE.Vector3 | null } {
  const group = new THREE.Group();
  const radius = Math.max(0.08, (modelBox ? modelBox.getSize(new THREE.Vector3()).length() : 20) * 0.006);
  for (const point of measurePoints) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, depthTest: false, transparent: true }),
    );
    marker.position.copy(point);
    marker.renderOrder = 999;
    group.add(marker);
  }
  if (measurePoints.length === 2) {
    const geometry = new THREE.BufferGeometry().setFromPoints(measurePoints);
    const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: 0xfacc15, dashSize: radius * 3, gapSize: radius * 2, depthTest: false }));
    line.computeLineDistances();
    line.renderOrder = 998;
    group.add(line);
    return { group, anchor: measurePoints[0].clone().add(measurePoints[1]).multiplyScalar(0.5) };
  }
  return { group, anchor: null };
}

export function disposeSceneGroup(group: THREE.Object3D): void {
  group.traverse((child) => {
    const disposable = child as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    disposable.geometry?.dispose();
    if (Array.isArray(disposable.material)) disposable.material.forEach((material) => material.dispose());
    else disposable.material?.dispose();
  });
}
