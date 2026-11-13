"use client";

import { useEffect, useMemo, type MutableRefObject } from "react";
import * as THREE from "three";
import type { LoadedBimModel, BimModelIndex } from "@/lib/ifc-cafm-bridge";
import {
  applyBimVisualState,
  buildMeasureGroup,
  buildRoomHighlightGroup,
  buildSelectionOutline,
  disposeSceneGroup,
} from "./bim-scene-helpers";
import {
  elementMapOf,
  spaceMapOf,
  type BimLinkMap,
  type ColorMode,
  type IsolateTarget,
  type IssuePin,
  type RoomHealth,
  type SetState,
} from "./bim-viewport-math";

interface SceneRefs {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  loadedRef: MutableRefObject<LoadedBimModel | null>;
  modelBoxRef: MutableRefObject<THREE.Box3 | null>;
  clipPlaneRef: MutableRefObject<THREE.Plane>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  activeClippingPlanesRef: MutableRefObject<THREE.Plane[]>;
  selectionHelperRef: MutableRefObject<THREE.Box3Helper | null>;
  roomHelperGroupRef: MutableRefObject<THREE.Group | null>;
  measureGroupRef: MutableRefObject<THREE.Group | null>;
  overlayAnchorsRef: MutableRefObject<Map<string, THREE.Vector3>>;
  overlaysDirtyRef: MutableRefObject<boolean>;
}

export function useBimSceneEffects({
  refs,
  loaded,
  index,
  explodeGap,
  measurePoints,
  setMeasurePoints,
  clipEnabled,
  clipPercent,
  links,
  selection,
  roomSelection,
  storeyFilter,
  xray,
  xrayOpacity,
  colorMode,
  showSpaces,
  statusColorByCode,
  roomHealth,
  isolate,
  isolatePadding,
  elementWorldBox,
  spaceWorldBox,
  issuePins,
}: {
  refs: SceneRefs;
  loaded: LoadedBimModel | null;
  index: BimModelIndex | null;
  explodeGap: number;
  measurePoints: THREE.Vector3[];
  setMeasurePoints: SetState<THREE.Vector3[]>;
  clipEnabled: boolean;
  clipPercent: number;
  links: BimLinkMap;
  selection: number | null;
  roomSelection: number | null;
  storeyFilter: string;
  xray: boolean;
  xrayOpacity: number;
  colorMode: ColorMode;
  showSpaces: boolean;
  statusColorByCode: Map<string, number>;
  roomHealth: Map<number, RoomHealth>;
  isolate: IsolateTarget;
  isolatePadding: number;
  elementWorldBox: (expressId: number) => THREE.Box3 | null;
  spaceWorldBox: (expressId: number) => THREE.Box3 | null;
  issuePins: IssuePin[];
}) {
  const {
    sceneRef, loadedRef, modelBoxRef, clipPlaneRef, rendererRef, activeClippingPlanesRef,
    selectionHelperRef, roomHelperGroupRef, measureGroupRef, overlayAnchorsRef, overlaysDirtyRef,
  } = refs;

  useEffect(() => {
    const model = loadedRef.current;
    if (!model || !index) return;
    const rank = new Map(model.index.storeys.map((storey, position) => [storey.name, position]));
    const lift = (storeyName: string) => (rank.get(storeyName) ?? 0) * explodeGap;
    const elements = elementMapOf(model.index);
    const spaces = spaceMapOf(model.index);
    for (const [expressId, meshes] of model.elementMeshes) {
      const offset = lift(elements.get(expressId)?.storeyName ?? "");
      for (const mesh of meshes) mesh.position.y = offset;
    }
    for (const [expressId, meshes] of model.spaceMeshes) {
      const offset = lift(spaces.get(expressId)?.storeyName ?? "");
      for (const mesh of meshes) mesh.position.y = offset;
    }
    for (const mesh of model.batchedMeshes) mesh.position.y = lift(mesh.userData.storeyName as string);
    model.group.updateMatrixWorld(true);
    setMeasurePoints([]);
  }, [explodeGap, index, loaded, loadedRef, setMeasurePoints]);

  const clippingPlanes = useMemo<THREE.Plane[] | null>(
    () => clipEnabled ? [clipPlaneRef.current] : null,
    [clipEnabled, loaded, clipPlaneRef],
  );

  useEffect(() => {
    if (!loaded || !index) return;
    const modelBox = modelBoxRef.current;
    if (!modelBox || modelBox.isEmpty()) return;
    clipPlaneRef.current.constant = modelBox.min.y + (clipPercent / 100) * (modelBox.max.y + 0.5 - modelBox.min.y);
  }, [clipPercent, loaded, index, modelBoxRef, clipPlaneRef]);

  useEffect(() => {
    const model = loadedRef.current;
    if (!model || !index) return;
    const isolatePlanes: THREE.Plane[] = [];
    if (isolate) {
      const target = isolate.kind === "room" ? spaceWorldBox(isolate.expressId) : elementWorldBox(isolate.expressId);
      if (target) {
        const min = target.min.clone().subScalar(isolatePadding);
        const max = target.max.clone().addScalar(isolatePadding);
        isolatePlanes.push(
          new THREE.Plane(new THREE.Vector3(1, 0, 0), -min.x), new THREE.Plane(new THREE.Vector3(-1, 0, 0), max.x),
          new THREE.Plane(new THREE.Vector3(0, 1, 0), -min.y), new THREE.Plane(new THREE.Vector3(0, -1, 0), max.y),
          new THREE.Plane(new THREE.Vector3(0, 0, 1), -min.z), new THREE.Plane(new THREE.Vector3(0, 0, -1), max.z),
        );
      }
    }
    if (rendererRef.current) rendererRef.current.clippingPlanes = isolatePlanes;
    activeClippingPlanesRef.current = [...(clipEnabled ? [clipPlaneRef.current] : []), ...isolatePlanes];
    applyBimVisualState(model, {
      clippingPlanes, links, selection, roomSelection, storeyFilter, xray, xrayOpacity,
      colorMode, showSpaces, statusColorByCode, roomHealth,
    });
  }, [index, links, selection, roomSelection, storeyFilter, xray, xrayOpacity, clipEnabled, colorMode,
    showSpaces, statusColorByCode, roomHealth, isolate, isolatePadding, explodeGap, loaded,
    elementWorldBox, spaceWorldBox, clippingPlanes, loadedRef, rendererRef, activeClippingPlanesRef, clipPlaneRef]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (selectionHelperRef.current && scene) {
      scene.remove(selectionHelperRef.current);
      disposeSceneGroup(selectionHelperRef.current);
      selectionHelperRef.current = null;
    }
    if (selection === null || !loaded) return;
    const box = elementWorldBox(selection);
    if (!scene || !box) return;
    const helper = buildSelectionOutline(box);
    scene.add(helper);
    selectionHelperRef.current = helper;
    return () => { scene.remove(helper); disposeSceneGroup(helper); selectionHelperRef.current = null; };
  }, [selection, loaded, elementWorldBox, explodeGap, sceneRef, selectionHelperRef]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !loaded || roomSelection === null) return;
    const box = spaceWorldBox(roomSelection);
    if (!box) return;
    const group = buildRoomHighlightGroup(box, !!loaded.spaceMeshes.get(roomSelection)?.length);
    scene.add(group);
    roomHelperGroupRef.current = group;
    return () => { scene.remove(group); disposeSceneGroup(group); roomHelperGroupRef.current = null; };
  }, [roomSelection, loaded, spaceWorldBox, explodeGap, sceneRef, roomHelperGroupRef]);

  useEffect(() => {
    const scene = sceneRef.current;
    overlaysDirtyRef.current = true;
    if (!scene || !measurePoints.length) {
      overlayAnchorsRef.current.delete("measure");
      return;
    }
    const { group, anchor } = buildMeasureGroup(measurePoints, modelBoxRef.current);
    if (anchor) overlayAnchorsRef.current.set("measure", anchor);
    else overlayAnchorsRef.current.delete("measure");
    scene.add(group);
    measureGroupRef.current = group;
    return () => { scene.remove(group); disposeSceneGroup(group); measureGroupRef.current = null; };
  }, [measurePoints, sceneRef, modelBoxRef, measureGroupRef, overlayAnchorsRef, overlaysDirtyRef]);

  useEffect(() => {
    const anchors = overlayAnchorsRef.current;
    for (const key of [...anchors.keys()]) if (key !== "measure") anchors.delete(key);
    overlaysDirtyRef.current = true;
    if (!loaded) return;
    for (const pin of issuePins) {
      const box = pin.kind === "element" ? elementWorldBox(pin.expressId) : spaceWorldBox(pin.expressId);
      if (!box) continue;
      const center = box.getCenter(new THREE.Vector3());
      anchors.set(pin.key, new THREE.Vector3(center.x, box.max.y, center.z));
    }
    overlaysDirtyRef.current = true;
  }, [issuePins, loaded, explodeGap, elementWorldBox, spaceWorldBox, overlayAnchorsRef, overlaysDirtyRef]);
}
