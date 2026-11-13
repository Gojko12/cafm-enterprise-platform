"use client";

import { useCallback, type MutableRefObject } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LoadedBimModel } from "@/lib/ifc-cafm-bridge";
import { SAFE_BOUNDS, boxIsFinite, elementMapOf, spaceMapOf, type CameraView } from "./bim-viewport-math";

interface CameraFly {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  start: number;
  duration: number;
}

export function useBimCamera({
  cameraRef,
  controlsRef,
  flyRef,
  modelBoxRef,
  loadedRef,
  explodeGapRef,
  rendererRef,
  sceneRef,
}: {
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  flyRef: MutableRefObject<CameraFly | null>;
  modelBoxRef: MutableRefObject<THREE.Box3 | null>;
  loadedRef: MutableRefObject<LoadedBimModel | null>;
  explodeGapRef: MutableRefObject<number>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
}) {
  const fitCameraToBox = useCallback((inputBox: THREE.Box3, animated: boolean, isElement = false, viewDirection?: THREE.Vector3) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const finiteBox = (candidate: THREE.Box3 | null | undefined) => !!candidate && boxIsFinite(candidate);
    const box = finiteBox(inputBox) ? inputBox : new THREE.Box3(new THREE.Vector3(...SAFE_BOUNDS.min), new THREE.Vector3(...SAFE_BOUNDS.max));
    const sceneBox = finiteBox(modelBoxRef.current) ? modelBoxRef.current! : box;
    const center = box.getCenter(new THREE.Vector3());
    const targetRadius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.5);
    const sceneRadius = Math.max(sceneBox.getSize(new THREE.Vector3()).length() / 2, targetRadius);
    const cameraDistance = isElement ? Math.max(targetRadius * 2.8, 2) : Math.max(targetRadius * 2.4, 8);
    const direction = (viewDirection ?? new THREE.Vector3(1, 0.75, 1)).clone().normalize();
    const targetPos = center.clone().add(direction.multiplyScalar(cameraDistance));
    camera.near = Math.max(0.05, Math.min(0.25, targetRadius * 0.02));
    camera.far = Math.max(5000, sceneRadius * 25, cameraDistance * 12);
    camera.updateProjectionMatrix();
    controls.maxDistance = Math.max(500, sceneRadius * 10);
    if (animated) {
      flyRef.current = {
        fromPos: camera.position.clone(), toPos: targetPos,
        fromTarget: controls.target.clone(), toTarget: center.clone(),
        start: performance.now(), duration: 750,
      };
    } else {
      camera.position.copy(targetPos);
      controls.target.copy(center);
      flyRef.current = null;
    }
    controls.update();
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (renderer && scene) renderer.render(scene, camera);
  }, [cameraRef, controlsRef, flyRef, modelBoxRef, rendererRef, sceneRef]);

  const storeyOffset = useCallback((storeyName: string): number => {
    const storeys = loadedRef.current?.index.storeys;
    if (!storeys) return 0;
    return Math.max(storeys.findIndex((storey) => storey.name === storeyName), 0) * explodeGapRef.current;
  }, [loadedRef, explodeGapRef]);

  const elementWorldBox = useCallback((expressId: number): THREE.Box3 | null => {
    const model = loadedRef.current;
    if (!model) return null;
    const element = elementMapOf(model.index).get(expressId);
    const offset = model.group.position;
    if (element?.bbox) {
      const lift = offset.y + storeyOffset(element.storeyName);
      const box = new THREE.Box3(
        new THREE.Vector3(element.bbox.min[0] + offset.x, element.bbox.min[1] + lift, element.bbox.min[2] + offset.z),
        new THREE.Vector3(element.bbox.max[0] + offset.x, element.bbox.max[1] + lift, element.bbox.max[2] + offset.z),
      );
      if (boxIsFinite(box)) return box;
    }
    const meshes = model.elementMeshes.get(expressId);
    if (!meshes?.length) return null;
    const box = new THREE.Box3();
    for (const mesh of meshes) box.expandByObject(mesh);
    return box.isEmpty() ? null : box;
  }, [loadedRef, storeyOffset]);

  const spaceWorldBox = useCallback((expressId: number): THREE.Box3 | null => {
    const model = loadedRef.current;
    if (!model) return null;
    const space = spaceMapOf(model.index).get(expressId);
    if (!space?.bbox) return null;
    const offset = model.group.position;
    const lift = offset.y + storeyOffset(space.storeyName);
    const box = new THREE.Box3(
      new THREE.Vector3(space.bbox.min[0] + offset.x, space.bbox.min[1] + lift, space.bbox.min[2] + offset.z),
      new THREE.Vector3(space.bbox.max[0] + offset.x, space.bbox.max[1] + lift, space.bbox.max[2] + offset.z),
    );
    return boxIsFinite(box) ? box : null;
  }, [loadedRef, storeyOffset]);

  const flyToElement = useCallback((expressId: number) => {
    const box = elementWorldBox(expressId);
    if (box) fitCameraToBox(box, true, true);
  }, [elementWorldBox, fitCameraToBox]);

  const flyToRoom = useCallback((expressId: number) => {
    const box = spaceWorldBox(expressId);
    if (box) fitCameraToBox(box, true, true);
  }, [spaceWorldBox, fitCameraToBox]);

  const explodedModelBox = useCallback((): THREE.Box3 => {
    const base = modelBoxRef.current;
    const box = base && boxIsFinite(base) ? base.clone() : new THREE.Box3(new THREE.Vector3(...SAFE_BOUNDS.min), new THREE.Vector3(...SAFE_BOUNDS.max));
    const storeyCount = loadedRef.current?.index.storeys.length ?? 0;
    box.max.y += Math.max(storeyCount - 1, 0) * explodeGapRef.current;
    return box;
  }, [modelBoxRef, loadedRef, explodeGapRef]);

  const resetCamera = useCallback(() => {
    fitCameraToBox(explodedModelBox(), true);
  }, [fitCameraToBox, explodedModelBox]);

  const setCameraView = useCallback((view: CameraView) => {
    const directions: Record<CameraView, THREE.Vector3> = {
      iso: new THREE.Vector3(1, 0.75, 1),
      top: new THREE.Vector3(0, 1, 0.001),
      front: new THREE.Vector3(0, 0.12, 1),
      right: new THREE.Vector3(1, 0.12, 0),
    };
    fitCameraToBox(explodedModelBox(), true, false, directions[view]);
  }, [fitCameraToBox, explodedModelBox]);

  return {
    fitCameraToBox,
    storeyOffset,
    elementWorldBox,
    spaceWorldBox,
    flyToElement,
    flyToRoom,
    explodedModelBox,
    resetCamera,
    setCameraView,
  };
}
