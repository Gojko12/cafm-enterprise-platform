"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Box, Crosshair, Download, Loader2, Plus, RefreshCw, Search, Upload, X,
} from "lucide-react";
import { formatDateDDMMYYYY, WR_Statuses } from "@cafm/shared-schema";
import type { BaseWorkRequest, Building, Equipment, Floor, LocationFreeze, Room } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { getUnfavourableStepCount } from "@/lib/wr-signals";
import { formatFreezePeriodWindow, freezeLocations, localNowIso } from "@/lib/location-freezes";
import { fetchBimModels, type BimModelInfo } from "@/components/common/LocateInBim";
import {
  bimLinkKey, expressIdFromBatchedHit, fetchIfcBuffer, findMissingSyncItems, gunzipBytes, gzipBytes,
  loadBimModel, nextSequentialEquipmentCode, resolveElementLinks, suggestEquipmentCategory, suggestEquipmentTrade,
  type BimElement, type BimModelIndex, type BimSpace, type LoadedBimModel,
} from "@/lib/ifc-cafm-bridge";
import { PMWorkRequestPopup } from "./PMWorkRequestPopup";
import { FJWorkRequestPopup } from "./FJWorkRequestPopup";
import { LJWorkRequestPopup } from "./LJWorkRequestPopup";
import { FastJobModal, type FastJobData } from "./FastJobModal";

const COLOR_RED = 0xdc2626;
const COLOR_AMBER = 0xf59e0b;
const COLOR_CYAN = 0x06b6d4;
const COLOR_EMERALD = 0x10b981;
const COLOR_VIOLET = 0x8b5cf6;
const COLOR_HIGHLIGHT = 0x1d4ed8;
const ALL_STOREYS = "All Storeys";
const SAFE_BOUNDS = { min: [-10, 0, -10] as [number, number, number], max: [10, 15, 10] as [number, number, number] };

interface MeshOriginal {
  color: number;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

type ColorMode = "bim" | "status" | "heatmap";
type RoomLevel = "red" | "amber" | "cyan" | "clear";
const ROOM_LEVEL_COLOR: Record<RoomLevel, number> = { red: COLOR_RED, amber: COLOR_AMBER, cyan: COLOR_CYAN, clear: COLOR_EMERALD };
const COLOR_ROOM_HIGHLIGHT = 0x22d3ee;

interface RoomHealth {
  level: RoomLevel;
  wrs: BaseWorkRequest[];
  freezes: LocationFreeze[];
}

type PickResult =
  | { kind: "element"; expressId: number }
  | { kind: "space"; expressId: number }
  | null;

const elementMapCache = new WeakMap<BimModelIndex, Map<number, BimElement>>();
const spaceMapCache = new WeakMap<BimModelIndex, Map<number, BimSpace>>();
function elementMapOf(index: BimModelIndex): Map<number, BimElement> {
  let map = elementMapCache.get(index);
  if (!map) { map = new Map(index.elements.map((element) => [element.expressId, element])); elementMapCache.set(index, map); }
  return map;
}
function spaceMapOf(index: BimModelIndex): Map<number, BimSpace> {
  let map = spaceMapCache.get(index);
  if (!map) { map = new Map(index.spaces.map((space) => [space.expressId, space])); spaceMapCache.set(index, map); }
  return map;
}

function isFullyVisible(object: THREE.Object3D): boolean {
  for (let cursor: THREE.Object3D | null = object; cursor; cursor = cursor.parent) if (!cursor.visible) return false;
  return true;
}

function boxIsFinite(box: THREE.Box3): boolean {
  return !box.isEmpty() && [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite);
}

function displayName(element: BimElement): string {
  const name = element.name.split(":")[0]?.trim();
  return name || element.typeName || element.ifcType;
}

export function BIMViewer() {
  const { data, setData } = useCafmStore();
  const { permissions } = useActiveUserPermissions();
  const { activeSiteId, activePerson, currentUser } = useSiteContext();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ---- Model catalogue + selection ----
  const [models, setModels] = useState<BimModelInfo[] | null>(null);
  const [buildingId, setBuildingId] = useState<string>("");
  const [status, setStatus] = useState<string>("Loading model catalogue…");
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [loaded, setLoaded] = useState<LoadedBimModel | null>(null);
  const [index, setIndex] = useState<BimModelIndex | null>(null);
  const loadedRef = useRef<LoadedBimModel | null>(null);

  // ---- Viewport controls ----
  const [selection, setSelection] = useState<number | null>(null);
  const [storeyFilter, setStoreyFilter] = useState<string>(ALL_STOREYS);
  const [xray, setXray] = useState(false);
  const [xrayOpacity, setXrayOpacity] = useState(15);
  const [explodeGap, setExplodeGap] = useState(0);
  const [clipEnabled, setClipEnabled] = useState(false);
  const [clipPercent, setClipPercent] = useState(100);
  const [viewportHealth, setViewportHealth] = useState<{ buildingId: string; meshCount: number; size: [number, number, number]; warning: string } | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("bim");
  const [showSpaces, setShowSpaces] = useState(false);
  const [roomSelection, setRoomSelection] = useState<number | null>(null);
  const [isolate, setIsolate] = useState<{ kind: "element" | "room"; expressId: number; label: string } | null>(null);
  const [isolatePadding, setIsolatePadding] = useState(1.5);
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);
  const [pinsOn, setPinsOn] = useState(false);
  const [fastJobLocation, setFastJobLocation] = useState<{ bl_id: string; levelName: string; roomCode: string } | null>(null);

  // ---- Sidebar ----
  const [tab, setTab] = useState<"linked" | "unassigned" | "rooms">("linked");
  const [search, setSearch] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignQuery, setAssignQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [wrPopup, setWrPopup] = useState<BaseWorkRequest | null>(null);
  const [fastJobOpen, setFastJobOpen] = useState(false);

  // ---- Three.js refs ----
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const modelBoxRef = useRef<THREE.Box3 | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const selectionHelperRef = useRef<THREE.Box3Helper | null>(null);
  const clipPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, -1, 0), 0));
  const flyRef = useRef<{ fromPos: THREE.Vector3; toPos: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; start: number; duration: number } | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const consumedDeepLink = useRef<string>("");
  const activeClippingPlanesRef = useRef<THREE.Plane[]>([]);
  const explodeGapRef = useRef(0);
  explodeGapRef.current = explodeGap;
  const measureGroupRef = useRef<THREE.Group | null>(null);
  const roomHelperGroupRef = useRef<THREE.Group | null>(null);
  const overlayElsRef = useRef(new Map<string, HTMLElement>());
  const overlayAnchorsRef = useRef(new Map<string, THREE.Vector3>());
  const sidebarListRef = useRef<HTMLDivElement | null>(null);
  const setOverlayEl = useCallback((key: string, element: HTMLElement | null) => {
    if (element) overlayElsRef.current.set(key, element);
    else overlayElsRef.current.delete(key);
  }, []);

  const siteEquipment = useMemo(() => data.equipment.filter((asset) => asset.SiteId === activeSiteId), [data.equipment, activeSiteId]);
  const equipmentByCode = useMemo(() => new Map(siteEquipment.map((asset) => [asset.EquipmentCode, asset])), [siteEquipment]);

  const links = useMemo(() => {
    if (!index || !buildingId) return new Map<number, { element: BimElement; equipmentCode: string; source: "manual" | "mark" }>();
    return resolveElementLinks(index.elements, buildingId, siteEquipment, data.bimElementLinks);
  }, [index, buildingId, siteEquipment, data.bimElementLinks]);

  const missing = useMemo(() => {
    if (!index || !buildingId) return null;
    const result = findMissingSyncItems(index, buildingId, { floors: data.floors as { bl_id: string; LevelName: string }[], rooms: data.rooms as { bl_id: string; RoomCode: string }[], equipment: siteEquipment });
    return result.floors.length || result.rooms.length || result.taggedAssets.length ? result : null;
  }, [index, buildingId, data.floors, data.rooms, siteEquipment]);

  // ---- Live maintenance status per linked EquipmentCode ----
  const statusColorByCode = useMemo(() => {
    const map = new Map<string, number>();
    const nowLocal = localNowIso();
    const today = new Date().toISOString().slice(0, 10);
    for (const link of links.values()) {
      const code = link.equipmentCode;
      if (map.has(code)) continue;
      const asset = equipmentByCode.get(code);
      const requests = data.workRequests.filter((wr) => wr.SiteId === activeSiteId && wr.EquipmentCodes.includes(code));
      const open = requests.filter((wr) => wr.Percentage === 50 || wr.Percentage === 55);
      const overdue = open.some((wr) => wr.DueDate && wr.DueDate < today);
      const unfavourable = requests.some((wr) => wr.Percentage < 100 && getUnfavourableStepCount(wr, data) > 0);
      const frozen = asset && (data.locationFreezes ?? []).some((freeze) => {
        if (freeze.siteId !== activeSiteId || !(freeze.startDateTime <= nowLocal && nowLocal <= freeze.endDateTime)) return false;
        const locations = freezeLocations(freeze);
        return locations.buildings.includes(asset.bl_id) || locations.floors.includes(asset.LevelName) || locations.rooms.includes(asset.RoomCode);
      });
      map.set(code, overdue || unfavourable ? COLOR_RED : open.length ? COLOR_AMBER : frozen ? COLOR_CYAN : COLOR_EMERALD);
    }
    return map;
  }, [links, data, activeSiteId, equipmentByCode]);

  // ---- Live room health (drives sidebar dots, Room Heatmap and Issue Pins) ----
  const roomHealth = useMemo(() => {
    const result = new Map<number, RoomHealth>();
    if (!index) return result;
    const nowLocal = localNowIso();
    const today = new Date().toISOString().slice(0, 10);
    const activeFreezes = (data.locationFreezes ?? []).filter((freeze) =>
      freeze.siteId === activeSiteId && freeze.startDateTime <= nowLocal && nowLocal <= freeze.endDateTime);
    const wrsByRoom = new Map<string, BaseWorkRequest[]>();
    for (const wr of data.workRequests) {
      if (wr.SiteId !== activeSiteId || wr.Percentage >= 100) continue;
      if (wr.bl_id && wr.bl_id !== buildingId) continue;
      const roomCodes = new Set<string>();
      if (wr.RoomCode) roomCodes.add(wr.RoomCode);
      for (const code of wr.EquipmentCodes) {
        const asset = equipmentByCode.get(code);
        if (asset && asset.bl_id === buildingId && asset.RoomCode) roomCodes.add(asset.RoomCode);
      }
      for (const roomCode of roomCodes) wrsByRoom.set(roomCode, [...(wrsByRoom.get(roomCode) ?? []), wr]);
    }
    for (const space of index.spaces) {
      const wrs = wrsByRoom.get(space.code) ?? [];
      const freezes = activeFreezes.filter((freeze) => {
        const locations = freezeLocations(freeze);
        return locations.buildings.includes(buildingId) || locations.floors.includes(space.storeyName) || locations.rooms.includes(space.code);
      });
      const overdue = wrs.some((wr) => (wr.Percentage === 50 || wr.Percentage === 55) && !!wr.DueDate && wr.DueDate < today);
      const unfavourable = wrs.some((wr) => getUnfavourableStepCount(wr, data) > 0);
      const level: RoomLevel = overdue || unfavourable ? "red" : wrs.length ? "amber" : freezes.length ? "cyan" : "clear";
      result.set(space.expressId, { level, wrs, freezes });
    }
    return result;
  }, [index, data, activeSiteId, buildingId, equipmentByCode]);

  // ---- Three.js scene bootstrap ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827);
    // Models are centred near the origin with minY = 0 in Y-up meters.
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 5000);
    camera.position.set(30, 22, 30);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(1, 2, 1.5);
    scene.add(sun);
    const grid = new THREE.GridHelper(60, 60, 0x374151, 0x1f2937);
    grid.position.y = -0.02;
    scene.add(grid);
    gridRef.current = grid;
    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;

    let frame = 0;
    const projected = new THREE.Vector3();
    const animate = (time: number) => {
      frame = requestAnimationFrame(animate);
      const fly = flyRef.current;
      if (fly) {
        const progress = Math.min((time - fly.start) / fly.duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        camera.position.lerpVectors(fly.fromPos, fly.toPos, eased);
        controls.target.lerpVectors(fly.fromTarget, fly.toTarget, eased);
        if (progress >= 1) flyRef.current = null;
      }
      controls.update();
      renderer.render(scene, camera);
      // Project HTML overlays (issue pins, measurement badge) onto the canvas.
      const width = container.clientWidth, height = container.clientHeight;
      for (const [key, element] of overlayElsRef.current) {
        const anchor = overlayAnchorsRef.current.get(key);
        if (!anchor) { element.style.visibility = "hidden"; continue; }
        projected.copy(anchor).project(camera);
        const onScreen = projected.z < 1 && Math.abs(projected.x) <= 1.1 && Math.abs(projected.y) <= 1.1;
        element.style.visibility = onScreen ? "visible" : "hidden";
        if (onScreen) element.style.transform = `translate(${(projected.x * 0.5 + 0.5) * width}px, ${(-projected.y * 0.5 + 0.5) * height}px) translate(-50%, -100%)`;
      }
    };
    frame = requestAnimationFrame(animate);

    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

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
    // Dynamic near/far/orbit limits keep both 12m demo buildings and 67MB towers jitter-free.
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
  }, []);


  const storeyOffset = useCallback((storeyName: string): number => {
    const storeys = loadedRef.current?.index.storeys;
    if (!storeys) return 0;
    return Math.max(storeys.findIndex((storey) => storey.name === storeyName), 0) * explodeGapRef.current;
  }, []);

  const elementWorldBox = useCallback((expressId: number): THREE.Box3 | null => {
    // Element bboxes live in the parsed model space; the group only translates (no rotation/scale),
    // so world = bbox + group.position + storey explode offset. This also covers elements inside batched meshes.
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
  }, [storeyOffset]);

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
  }, [storeyOffset]);

  const flyToElement = useCallback((expressId: number) => {
    const box = elementWorldBox(expressId);
    if (box) fitCameraToBox(box, true, true);
  }, [elementWorldBox, fitCameraToBox]);

  const flyToRoom = useCallback((expressId: number) => {
    const box = spaceWorldBox(expressId);
    if (box) fitCameraToBox(box, true, true);
  }, [spaceWorldBox, fitCameraToBox]);

  /** Model framing box including the vertical growth from Exploded Storeys. */
  const explodedModelBox = useCallback((): THREE.Box3 => {
    const base = modelBoxRef.current;
    const box = base && boxIsFinite(base) ? base.clone() : new THREE.Box3(new THREE.Vector3(...SAFE_BOUNDS.min), new THREE.Vector3(...SAFE_BOUNDS.max));
    const storeyCount = loadedRef.current?.index.storeys.length ?? 0;
    box.max.y += Math.max(storeyCount - 1, 0) * explodeGapRef.current;
    return box;
  }, []);

  const resetCamera = useCallback(() => {
    fitCameraToBox(explodedModelBox(), true);
  }, [fitCameraToBox, explodedModelBox]);

  const setCameraView = useCallback((view: "iso" | "top" | "front" | "right") => {
    const directions = {
      iso: new THREE.Vector3(1, 0.75, 1),
      top: new THREE.Vector3(0, 1, 0.001),
      front: new THREE.Vector3(0, 0.12, 1),
      right: new THREE.Vector3(1, 0.12, 0),
    };
    fitCameraToBox(explodedModelBox(), true, false, directions[view]);
  }, [fitCameraToBox, explodedModelBox]);

  // ---- Model catalogue ----
  const refreshModels = useCallback(async (force = true) => {
    const list = await fetchBimModels(activeSiteId, force);
    setModels(list);
    return list;
  }, [activeSiteId]);

  useEffect(() => {
    let active = true;
    setModels(null);
    setBuildingId("");
    fetchBimModels(activeSiteId).then((list) => {
      if (!active) return;
      setModels(list);
      const requested = searchParams.get("building");
      const preferred = requested && list.some((model) => model.buildingId === requested) ? requested
        : list.some((model) => model.buildingId === "S01-BL-1") ? "S01-BL-1"
          : list[0]?.buildingId ?? "";
      setBuildingId(preferred);
      if (!list.length) setStatus("No .ifc models are available yet. Upload one to get started.");
    }).catch(() => {
      if (active) { setModels([]); setError("Could not load the BIM model catalogue."); }
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  // React to navigation while already mounted (e.g. `Locate in 3D BIM` from a popup).
  useEffect(() => {
    const requested = searchParams.get("building");
    if (requested && models?.some((model) => model.buildingId === requested) && requested !== buildingId) {
      setBuildingId(requested);
    }
    consumedDeepLink.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, models]);

  // ---- Model loading ----
  useEffect(() => {
    if (!buildingId || !models) return;
    const meta = models.find((model) => model.buildingId === buildingId);
    if (!meta) return;
    let active = true;
    (async () => {
      try {
        setError("");
        setSelection(null);
        setClipEnabled(false);
        setClipPercent(100);
        setRoomSelection(null);
        setIsolate(null);
        setMeasurePoints([]);
        setViewportHealth(null);
        setStoreyFilter(ALL_STOREYS);
        setStatus("Downloading BIM archive…");
        const buffer = await fetchIfcBuffer(activeSiteId, buildingId, meta.updatedAt, (stage) => { if (active) setStatus(stage); });
        if (!active) return;
        setStatus("Decompressing & parsing IFC…");
        const model = await loadBimModel(buffer, (stage) => { if (active) setStatus(stage); });
        if (!active) { model.dispose(); return; }
        // Remember per-mesh originals for X-Ray / status overlays.
        for (const meshes of [...model.elementMeshes.values(), ...model.spaceMeshes.values()]) {
          for (const mesh of meshes) {
            const material = mesh.material as THREE.MeshLambertMaterial;
            mesh.userData.original = {
              color: material.color.getHex(), opacity: material.opacity,
              transparent: material.transparent, depthWrite: material.depthWrite,
            } satisfies MeshOriginal;
          }
        }
        for (const mesh of model.batchedMeshes) {
          const material = mesh.material as THREE.MeshLambertMaterial;
          mesh.userData.original = {
            color: material.color.getHex(), opacity: material.opacity,
            transparent: material.transparent, depthWrite: material.depthWrite,
          } satisfies MeshOriginal;
        }
        const scene = sceneRef.current;
        if (modelRootRef.current && scene) scene.remove(modelRootRef.current);
        loadedRef.current?.dispose();
        scene?.add(model.group);
        model.group.updateMatrixWorld(true);
        const bounds = model.framingBounds;
        const framing = new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max));
        const framingValid = !framing.isEmpty() &&
          [...bounds.min, ...bounds.max].every(Number.isFinite);
        const box = framingValid ? framing : new THREE.Box3(new THREE.Vector3(...SAFE_BOUNDS.min), new THREE.Vector3(...SAFE_BOUNDS.max));
        modelBoxRef.current = box;
        modelRootRef.current = model.group;
        loadedRef.current = model;
        setClipEnabled(false);
        setClipPercent(100);
        setViewportHealth({
          buildingId, meshCount: model.meshCount,
          size: box.getSize(new THREE.Vector3()).toArray() as [number, number, number],
          warning: model.meshCount === 0 ? "No 3D geometry could be built for this model."
            : !model.batched ? "Batching failed; showing individual meshes (slower)." : "",
        });
        // Resize the ground grid to the model footprint (the model sits at Y = 0).
        if (scene) {
          if (gridRef.current) scene.remove(gridRef.current);
          const size = box.getSize(new THREE.Vector3());
          const span = Math.ceil(Math.max(size.x, size.z, 20) * 1.6 / 10) * 10;
          const grid = new THREE.GridHelper(span, Math.min(100, Math.max(20, Math.round(span / 2))), 0x374151, 0x1f2937);
          grid.position.y = -0.02;
          scene.add(grid);
          gridRef.current = grid;
        }
        setLoaded(model);
        setIndex(model.index);
        fitCameraToBox(box, false);
        setStatus("");
      } catch (loadError) {
        console.error("Could not load the BIM model", loadError);
        if (active) {
          setStatus("");
          const message = loadError instanceof Error ? loadError.message : "Could not load the BIM model.";
          setError(message);
          setViewportHealth({ buildingId, meshCount: 0, size: [0, 0, 0], warning: `3D build failed: ${message}` });
        }
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId, models, activeSiteId]);

  // Dispose the model on unmount.
  useEffect(() => () => { loadedRef.current?.dispose(); }, []);

  // ---- Deep link: ?building=…&eq=… → X-Ray + highlight + fly ----
  useEffect(() => {
    const eq = searchParams.get("eq");
    if (!eq || !index || !loaded) return;
    const requestedBuilding = searchParams.get("building");
    if (requestedBuilding && requestedBuilding !== buildingId) return;
    const key = `${buildingId}:${eq}`;
    if (consumedDeepLink.current === key) return;
    const entry = [...links.values()].find((link) => link.equipmentCode === eq);
    if (!entry) return;
    consumedDeepLink.current = key;
    setXray(true);
    setSelection(entry.element.expressId);
    setTab("linked");
    // Fly after the render pass so world matrices exist.
    requestAnimationFrame(() => flyToElement(entry.element.expressId));
  }, [searchParams, index, loaded, links, buildingId, flyToElement]);

  // ---- Exploded storeys: offset every mesh by its storey rank (scene-graph transform, no rebuild) ----
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
  }, [explodeGap, index, loaded]);

  // ---- Visual state application (visibility, X-Ray, slicing, overlays, clipping, isolation) ----
  useEffect(() => {
    const model = loadedRef.current;
    if (!model || !index) return;
    const plane = clipPlaneRef.current;
    const modelBox = modelBoxRef.current;
    if (modelBox && !modelBox.isEmpty()) {
      plane.constant = modelBox.min.y + (clipPercent / 100) * (modelBox.max.y + 0.5 - modelBox.min.y);
    }
    const clipping = clipEnabled ? [plane] : null;

    // Revit-style 6-plane selection box (±X, ±Y, ±Z) applied globally on the renderer.
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
    activeClippingPlanesRef.current = [...(clipEnabled ? [plane] : []), ...isolatePlanes];

    const ghostOpacity = xrayOpacity / 100;
    const elementById = elementMapOf(model.index);
    for (const [expressId, meshes] of model.elementMeshes) {
      const element = elementById.get(expressId);
      const link = links.get(expressId);
      const inFilter = !element || storeyFilter === ALL_STOREYS || element.storeyName === storeyFilter;
      const ghost = xray && !!element && (element.isShell || (!element.isAssignable && !link));
      const selected = selection === expressId;
      for (const mesh of meshes) {
        mesh.visible = inFilter && !(ghost && !selected && xrayOpacity === 0);
        const material = mesh.material as THREE.MeshLambertMaterial;
        const original = mesh.userData.original as MeshOriginal | undefined;
        if (!original) continue;
        material.clippingPlanes = clipping;
        let color = original.color;
        if (colorMode === "status" && element && !element.isShell) {
          if (link) color = statusColorByCode.get(link.equipmentCode) ?? COLOR_EMERALD;
          else if (element.isAssignable) color = COLOR_VIOLET;
        }
        material.color.setHex(color);
        if (selected) {
          material.emissive.setHex(COLOR_HIGHLIGHT);
          material.emissiveIntensity = 0.85;
          material.opacity = 1;
          material.transparent = false;
          material.depthWrite = true;
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
        material.needsUpdate = true;
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
        const original = mesh.userData.original as MeshOriginal | undefined;
        material.clippingPlanes = clipping;
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
        material.needsUpdate = true;
      }
    }
    // Batched shell / passive-distribution meshes: storey slicing, adjustable X-Ray ghosting, clipping.
    for (const mesh of model.batchedMeshes) {
      const storeyName = mesh.userData.storeyName as string;
      const inFilter = storeyFilter === ALL_STOREYS || storeyName === storeyFilter;
      mesh.visible = inFilter && !(xray && xrayOpacity === 0);
      const material = mesh.material as THREE.MeshLambertMaterial;
      const original = mesh.userData.original as MeshOriginal | undefined;
      if (!original) continue;
      material.clippingPlanes = clipping;
      if (xray && xrayOpacity > 0) {
        material.opacity = ghostOpacity;
        material.transparent = true;
        material.depthWrite = false;
      } else {
        material.opacity = original.opacity;
        material.transparent = original.transparent;
        material.depthWrite = original.depthWrite;
      }
      material.needsUpdate = true;
    }
  }, [index, links, selection, roomSelection, storeyFilter, xray, xrayOpacity, clipEnabled, clipPercent, colorMode, showSpaces, statusColorByCode, roomHealth, isolate, isolatePadding, explodeGap, loaded, elementWorldBox, spaceWorldBox]);

  // ---- Selection outline (works for individual AND batched elements) ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (selectionHelperRef.current) {
      scene.remove(selectionHelperRef.current);
      selectionHelperRef.current.dispose();
      selectionHelperRef.current = null;
    }
    if (selection === null || !loaded) return;
    const box = elementWorldBox(selection);
    if (!box) return;
    const helper = new THREE.Box3Helper(box.expandByScalar(0.05), new THREE.Color(COLOR_HIGHLIGHT));
    scene.add(helper);
    selectionHelperRef.current = helper;
    return () => {
      if (selectionHelperRef.current) {
        scene.remove(selectionHelperRef.current);
        selectionHelperRef.current.dispose();
        selectionHelperRef.current = null;
      }
    };
  }, [selection, loaded, elementWorldBox, explodeGap]);

  // ---- Room highlight: cyan outline (+ fallback translucent box when the IfcSpace has no mesh) ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !loaded || roomSelection === null) return;
    const box = spaceWorldBox(roomSelection);
    if (!box) return;
    const group = new THREE.Group();
    group.add(new THREE.Box3Helper(box.clone().expandByScalar(0.03), new THREE.Color(COLOR_ROOM_HIGHLIGHT)));
    if (!loaded.spaceMeshes.get(roomSelection)?.length) {
      const size = box.getSize(new THREE.Vector3());
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        new THREE.MeshBasicMaterial({ color: COLOR_ROOM_HIGHLIGHT, transparent: true, opacity: 0.2, depthWrite: false }),
      );
      fallback.position.copy(box.getCenter(new THREE.Vector3()));
      group.add(fallback);
    }
    scene.add(group);
    roomHelperGroupRef.current = group;
    return () => {
      scene.remove(group);
      group.traverse((child) => {
        const object = child as THREE.Mesh;
        object.geometry?.dispose();
        const material = object.material as THREE.Material | undefined;
        material?.dispose();
      });
      roomHelperGroupRef.current = null;
    };
  }, [roomSelection, loaded, spaceWorldBox, explodeGap]);

  // ---- Laser measure markers, dashed line ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !measurePoints.length) {
      overlayAnchorsRef.current.delete("measure");
      return;
    }
    const group = new THREE.Group();
    const modelBox = modelBoxRef.current;
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
      overlayAnchorsRef.current.set("measure", measurePoints[0].clone().add(measurePoints[1]).multiplyScalar(0.5));
    } else {
      overlayAnchorsRef.current.delete("measure");
    }
    scene.add(group);
    measureGroupRef.current = group;
    return () => {
      scene.remove(group);
      group.traverse((child) => {
        const object = child as THREE.Mesh;
        object.geometry?.dispose();
        (object.material as THREE.Material | undefined)?.dispose();
      });
      measureGroupRef.current = null;
    };
  }, [measurePoints]);

  // ---- Issue pins: top 15 critical items (overdue equipment / rooms, frozen rooms) ----
  const issuePins = useMemo(() => {
    if (!pinsOn || !index) return [];
    const inView = (storeyName: string) => storeyFilter === ALL_STOREYS || storeyName === storeyFilter;
    const pins: { key: string; label: string; color: number; kind: "element" | "space"; expressId: number }[] = [];
    for (const element of index.elements) {
      const link = links.get(element.expressId);
      if (!link || !inView(element.storeyName) || statusColorByCode.get(link.equipmentCode) !== COLOR_RED) continue;
      pins.push({ key: `eq-${element.expressId}`, label: link.equipmentCode, color: COLOR_RED, kind: "element", expressId: element.expressId });
    }
    for (const level of ["red", "cyan"] as const) {
      for (const space of index.spaces) {
        if (!inView(space.storeyName) || roomHealth.get(space.expressId)?.level !== level) continue;
        pins.push({ key: `room-${space.expressId}`, label: space.code, color: ROOM_LEVEL_COLOR[level], kind: "space", expressId: space.expressId });
      }
    }
    return pins.slice(0, 15);
  }, [pinsOn, index, links, statusColorByCode, roomHealth, storeyFilter]);

  useEffect(() => {
    const anchors = overlayAnchorsRef.current;
    for (const key of [...anchors.keys()]) if (key !== "measure") anchors.delete(key);
    if (!loaded) return;
    for (const pin of issuePins) {
      const box = pin.kind === "element" ? elementWorldBox(pin.expressId) : spaceWorldBox(pin.expressId);
      if (!box) continue;
      const center = box.getCenter(new THREE.Vector3());
      anchors.set(pin.key, new THREE.Vector3(center.x, box.max.y, center.z));
    }
  }, [issuePins, loaded, explodeGap, elementWorldBox, spaceWorldBox]);

  // ---- Picking ----
  const onPointerDown = (event: React.PointerEvent) => {
    pointerRef.current = { x: event.clientX, y: event.clientY };
  };

  /**
   * Raycasts only what the user can actually see: hidden meshes and hit points clipped away by the
   * Section plane / Selection Box are discarded, ghosted shell batches are transparent to clicks
   * (X-Ray), and opaque shell hits block the ray. Room volumes yield to equipment inside the room.
   */
  const pickAt = (raycaster: THREE.Raycaster, model: LoadedBimModel, purpose: "select" | "measure"): { result: PickResult; point: THREE.Vector3 | null } => {
    const pickables: THREE.Object3D[] = [];
    for (const meshes of model.elementMeshes.values()) for (const mesh of meshes) pickables.push(mesh);
    for (const mesh of model.batchedMeshes) pickables.push(mesh);
    if (purpose === "select") for (const meshes of model.spaceMeshes.values()) for (const mesh of meshes) pickables.push(mesh);
    const planes = activeClippingPlanesRef.current;
    const elements = elementMapOf(model.index);
    const spaces = spaceMapOf(model.index);
    let spaceHit: { expressId: number; point: THREE.Vector3 } | null = null;
    for (const hit of raycaster.intersectObjects(pickables, false)) {
      const mesh = hit.object as THREE.Mesh;
      if (!isFullyVisible(mesh)) continue;
      if (!planes.every((plane) => plane.distanceToPoint(hit.point) >= -1e-4)) continue;
      if (purpose === "measure") return { result: null, point: hit.point.clone() };
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
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const container = containerRef.current;
    const camera = cameraRef.current;
    const model = loadedRef.current;
    if (!container || !camera || !model) return;
    const bounds = container.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    model.group.updateMatrixWorld(true);
    // Raycast only on clean clicks (<5px movement), never on hover/mousemove.
    if (measureMode) {
      const { point } = pickAt(raycaster, model, "measure");
      if (point) setMeasurePoints((previous) => previous.length === 1 ? [previous[0], point] : [point]);
      return;
    }
    const { result } = pickAt(raycaster, model, "select");
    if (result?.kind === "element") {
      setSelection(result.expressId);
      setRoomSelection(null);
      setAssignOpen(false);
    } else if (result?.kind === "space") {
      selectRoom(result.expressId, false);
    } else {
      setSelection(null);
      setRoomSelection(null);
    }
  };

  // ---- Mutations ----
  const patchMark = useCallback(async (element: BimElement, equipmentCode: string) => {
    const response = await fetch("/api/bim-models", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: activeSiteId, buildingId, ifcGlobalId: element.globalId, expressId: element.expressId, equipmentCode }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body ? String(body.error) : "Could not write the Mark into the .ifc file.";
      throw new Error(message);
    }
    await refreshModels();
  }, [activeSiteId, buildingId, refreshModels]);

  const applyLocalMark = useCallback((expressId: number, mark: string) => {
    setIndex((previous) => previous
      ? { ...previous, elements: previous.elements.map((element) => element.expressId === expressId ? { ...element, mark } : element) }
      : previous);
  }, []);

  const clearBimFields = (asset: Equipment): Equipment => ({
    ...asset, bimGlobalId: undefined, bimExpressId: undefined, bimBuildingId: undefined, bimCategory: undefined, bimTypeName: undefined,
  });

  const assignExisting = async (element: BimElement, equipmentCode: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await patchMark(element, equipmentCode);
      const stamp = new Date().toISOString();
      setData((current) => ({
        ...current,
        equipment: current.equipment.map((asset) => {
          if (asset.SiteId !== activeSiteId) return asset;
          if (asset.EquipmentCode === equipmentCode) {
            return {
              ...asset, bimGlobalId: element.globalId, bimExpressId: element.expressId, bimBuildingId: buildingId,
              bimCategory: element.category || undefined, bimTypeName: element.typeName || undefined, UpdatedAt: stamp,
            };
          }
          return asset.bimGlobalId === element.globalId && asset.bimBuildingId === buildingId ? clearBimFields(asset) : asset;
        }),
        bimElementLinks: {
          ...(current.bimElementLinks ?? {}),
          [bimLinkKey(buildingId, element.globalId)]: { equipmentCode, buildingId, updatedAt: stamp, updatedBy: activePerson },
        },
      }));
      applyLocalMark(element.expressId, equipmentCode);
      setAssignOpen(false);
      setAssignQuery("");
      setNotice(`Linked ${equipmentCode} and wrote Mark='${equipmentCode}' into the .ifc file.`);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "The EQ ID assignment failed.");
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (element: BimElement) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await patchMark(element, "");
      setData((current) => {
        const nextLinks = { ...(current.bimElementLinks ?? {}) };
        delete nextLinks[bimLinkKey(buildingId, element.globalId)];
        return {
          ...current,
          equipment: current.equipment.map((asset) =>
            asset.SiteId === activeSiteId && asset.bimGlobalId === element.globalId && asset.bimBuildingId === buildingId ? clearBimFields(asset) : asset),
          bimElementLinks: nextLinks,
        };
      });
      applyLocalMark(element.expressId, "");
      setNotice("The EQ ID was unassigned and the Mark was cleared in the .ifc file.");
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Unassigning the EQ ID failed.");
    } finally {
      setBusy(false);
    }
  };

  const createNewEquipment = async (element: BimElement) => {
    if (busy || !index) return;
    setBusy(true);
    setError("");
    try {
      const code = nextSequentialEquipmentCode(siteEquipment);
      const level = element.storeyName || index.storeys[0]?.name || "Level 0";
      const space = index.spaces.find((entry) => entry.code === element.roomCode)
        ?? index.spaces.find((entry) => entry.storeyName === level);
      const room = element.roomCode || space?.code || `${buildingId}-GEN`;
      await patchMark(element, code);
      const stamp = new Date().toISOString();
      setData((current) => {
        const hasBuilding = current.buildings.some((entry) => entry.bl_id === buildingId && entry.SiteId === activeSiteId);
        const hasFloor = current.floors.some((entry) => entry.bl_id === buildingId && entry.LevelName === level && entry.SiteId === activeSiteId);
        const hasRoom = current.rooms.some((entry) => entry.bl_id === buildingId && entry.RoomCode === room && entry.SiteId === activeSiteId);
        const newBuilding: Building = { bl_id: buildingId, SiteId: activeSiteId, Name: index.buildingName || buildingId, Address: "Imported from IFC model", IsActive: true };
        const newFloor: Floor = { bl_id: buildingId, SiteId: activeSiteId, LevelName: level, FloorNumber: Math.max(index.storeys.findIndex((storey) => storey.name === level), 0), IsActive: true };
        const newRoom: Room = { bl_id: buildingId, SiteId: activeSiteId, LevelName: level, RoomCode: room, Name: space?.longName || room, IsDeskReservable: false, IsActive: true };
        const newAsset: Equipment = {
          EquipmentCode: code,
          EquipmentName: displayName(element),
          Category: suggestEquipmentCategory(element),
          HierarchyLevel: "Installation",
          IsInstallation: true,
          Status: "In Service",
          TechnicalSpecifications: {},
          bl_id: buildingId,
          SiteId: activeSiteId,
          LevelName: level,
          RoomCode: room,
          PrimaryTradeId: suggestEquipmentTrade(element),
          bimGlobalId: element.globalId,
          bimExpressId: element.expressId,
          bimBuildingId: buildingId,
          bimCategory: element.category || undefined,
          bimTypeName: element.typeName || undefined,
          CreatedAt: stamp,
          UpdatedAt: stamp,
        };
        return {
          ...current,
          buildings: hasBuilding ? current.buildings : [...current.buildings, newBuilding],
          floors: hasFloor ? current.floors : [...current.floors, newFloor],
          rooms: hasRoom ? current.rooms : [...current.rooms, newRoom],
          equipment: [...current.equipment, newAsset],
          bimElementLinks: {
            ...(current.bimElementLinks ?? {}),
            [bimLinkKey(buildingId, element.globalId)]: { equipmentCode: code, buildingId, updatedAt: stamp, updatedBy: activePerson },
          },
        };
      });
      applyLocalMark(element.expressId, code);
      setNotice(`Created CAFM equipment ${code} from the IFC element and wrote its Mark into the .ifc file.`);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Creating the equipment failed.");
    } finally {
      setBusy(false);
    }
  };

  const syncMissingToCafm = () => {
    if (!index || !missing) return;
    const stamp = new Date().toISOString();
    setData((current) => {
      const hasBuilding = current.buildings.some((entry) => entry.bl_id === buildingId && entry.SiteId === activeSiteId);
      const buildings = hasBuilding ? current.buildings : [...current.buildings, {
        bl_id: buildingId, SiteId: activeSiteId, Name: index.buildingName || buildingId, Address: "Imported from IFC model", IsActive: true,
      } satisfies Building];
      const floors = [...current.floors];
      for (const storey of missing.floors) {
        if (!floors.some((entry) => entry.bl_id === buildingId && entry.LevelName === storey.name && entry.SiteId === activeSiteId)) {
          floors.push({ bl_id: buildingId, SiteId: activeSiteId, LevelName: storey.name, FloorNumber: Math.max(index.storeys.findIndex((item) => item.name === storey.name), 0), IsActive: true } satisfies Floor);
        }
      }
      const rooms = [...current.rooms];
      for (const space of missing.rooms) {
        if (!rooms.some((entry) => entry.bl_id === buildingId && entry.RoomCode === space.code && entry.SiteId === activeSiteId)) {
          rooms.push({ bl_id: buildingId, SiteId: activeSiteId, LevelName: space.storeyName || index.storeys[0]?.name || "Level 0", RoomCode: space.code, Name: space.longName || space.code, IsDeskReservable: false, IsActive: true } satisfies Room);
        }
      }
      const equipment = [...current.equipment];
      for (const element of missing.taggedAssets) {
        if (equipment.some((asset) => asset.EquipmentCode === element.mark && asset.SiteId === activeSiteId)) continue;
        const level = element.storeyName || index.storeys[0]?.name || "Level 0";
        const space = index.spaces.find((entry) => entry.code === element.roomCode) ?? index.spaces.find((entry) => entry.storeyName === level);
        equipment.push({
          EquipmentCode: element.mark,
          EquipmentName: displayName(element),
          Category: suggestEquipmentCategory(element),
          HierarchyLevel: "Installation",
          IsInstallation: true,
          Status: "In Service",
          TechnicalSpecifications: {},
          bl_id: buildingId,
          SiteId: activeSiteId,
          LevelName: level,
          RoomCode: element.roomCode || space?.code || `${buildingId}-GEN`,
          PrimaryTradeId: suggestEquipmentTrade(element),
          bimGlobalId: element.globalId,
          bimExpressId: element.expressId,
          bimBuildingId: buildingId,
          bimCategory: element.category || undefined,
          bimTypeName: element.typeName || undefined,
          CreatedAt: stamp,
          UpdatedAt: stamp,
        } satisfies Equipment);
      }
      return { ...current, buildings, floors, rooms, equipment };
    });
    setNotice("The missing floors, rooms, and tagged assets were synced to CAFM.");
  };

  const downloadIfc = async () => {
    try {
      // rawIfc=1: users always download a standard uncompressed .ifc with their EQ IDs.
      const response = await fetch(`/api/bim-models?siteId=${encodeURIComponent(activeSiteId)}&buildingId=${encodeURIComponent(buildingId)}&download=1&rawIfc=1`, { cache: "no-store" });
      if (!response.ok) throw new Error("The download failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${buildingId}.ifc`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "The download failed.");
    }
  };

  const createFastJob = (job: FastJobData) => {
    if (!permissions?.canCreateFJ) { alert("Permission required to create a Fast Job."); return; }
    const createdAt = new Date().toISOString();
    const issuedStatus = WR_Statuses.find((entry) => entry.Percentage === 50 && entry.ESAWorkType === "Corrective Maintenance");
    if (!issuedStatus) throw new Error("Issued status configuration is missing.");
    const newWR: BaseWorkRequest = {
      WR_ID: `FJ-${Date.now()}`,
      JobID: `JOB-${Date.now()}`,
      WR_Type: "FJ",
      ESAWorkType: "Corrective Maintenance",
      Description: job.description,
      ProblemLocation: `${job.bl_id} / ${job.levelName} / ${job.roomCode}`,
      CreatedDate: createdAt.slice(0, 10),
      WorkRequestStatus: issuedStatus.WorkRequestStatus,
      WorkRequestSubstatus: issuedStatus.WorkRequestSubstatus,
      Percentage: issuedStatus.Percentage,
      SiteId: activeSiteId,
      bl_id: job.bl_id,
      LevelName: job.levelName,
      RoomCode: job.roomCode,
      AssignedCraftpersonIds: [],
      AssignedUserIds: [],
      CreatedBy: currentUser?.UserId ?? "current-user",
      IsFrozen: false,
      EquipmentCodes: job.equipmentCode ? [job.equipmentCode] : [],
      TotalTimeMinutes: job.timeSpentMinutes,
      StartDateTBD: false,
      RequiresSAT: false,
      RequiresDrawingUpdate: false,
      RequiresInventoryUpdate: false,
      AcceptanceGates: [],
      UpdatedAt: createdAt,
      Attachments: job.photoUrl ? [{ id: crypto.randomUUID(), name: job.photoName ?? "fast-job-photo", type: job.photoType || "image/unknown", dataUrl: job.photoUrl }] : [],
      Activity: [{
        id: crypto.randomUUID(), kind: "log", actorId: currentUser?.UserId ?? "current-user",
        actorName: activePerson, actorRole: "", createdAt, text: "Fast Job created from the 3D BIM viewer.",
      }],
    };
    setData((current) => ({ ...current, workRequests: [...current.workRequests, newWR] }));
    setFastJobOpen(false);
    setNotice(`Fast Job ${newWR.WR_ID} was created.`);
  };

  // ---- Derived sidebar rows ----
  const query = search.trim().toLowerCase();
  const inStorey = (storeyName: string) => storeyFilter === ALL_STOREYS || storeyName === storeyFilter;
  const matches = (haystack: string) => !query || haystack.toLowerCase().includes(query);
  const linkedRows = useMemo(() => index
    ? index.elements.filter((element) => links.has(element.expressId) && inStorey(element.storeyName) &&
        matches(`${links.get(element.expressId)?.equipmentCode} ${displayName(element)} ${element.category} ${element.roomCode}`))
    : [], [index, links, storeyFilter, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const unassignedRows = useMemo(() => index
    ? index.elements.filter((element) => element.isAssignable && !links.has(element.expressId) && inStorey(element.storeyName) &&
        matches(`${displayName(element)} ${element.category} ${element.roomCode} ${element.ifcType}`))
    : [], [index, links, storeyFilter, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const roomRows = useMemo(() => index
    ? index.spaces.filter((space) => inStorey(space.storeyName) && matches(`${space.code} ${space.longName}`))
    : [], [index, storeyFilter, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedElement = selection !== null && index ? index.elements.find((element) => element.expressId === selection) ?? null : null;
  const selectedSpace = roomSelection !== null && index ? index.spaces.find((space) => space.expressId === roomSelection) ?? null : null;
  const selectedRoomHealth = selectedSpace ? roomHealth.get(selectedSpace.expressId) ?? null : null;
  const roomElements = useMemo(() => selectedSpace && index
    ? index.elements.filter((element) => element.roomCode === selectedSpace.code && element.storeyName === selectedSpace.storeyName &&
        (links.has(element.expressId) || element.isAssignable))
    : [], [selectedSpace, index, links]);
  const roomSchedules = useMemo(() => {
    const codes = new Set(roomElements.map((element) => links.get(element.expressId)?.equipmentCode).filter((code): code is string => !!code));
    return codes.size ? data.schedules.filter((schedule) => schedule.SiteId === activeSiteId && schedule.EquipmentCodes.some((code) => codes.has(code))) : [];
  }, [roomElements, links, data.schedules, activeSiteId]);

  useEffect(() => { if (selection !== null) setRoomSelection(null); }, [selection]);
  useEffect(() => {
    if (roomSelection === null || tab !== "rooms") return;
    sidebarListRef.current?.querySelector(`[data-room-id="${roomSelection}"]`)?.scrollIntoView({ block: "nearest" });
  }, [roomSelection, tab]);
  const selectedLink = selection !== null ? links.get(selection) ?? null : null;
  const selectedEquipment = selectedLink ? equipmentByCode.get(selectedLink.equipmentCode) ?? null : null;
  const selectedOpenWRs = selectedLink
    ? data.workRequests.filter((wr) => wr.SiteId === activeSiteId && wr.EquipmentCodes.includes(selectedLink.equipmentCode) && wr.Percentage < 100)
    : [];
  const selectedSchedules = selectedLink
    ? data.schedules.filter((schedule) => schedule.SiteId === activeSiteId && schedule.EquipmentCodes.includes(selectedLink.equipmentCode))
    : [];
  const assignCandidates = assignQuery.trim()
    ? siteEquipment.filter((asset) => `${asset.EquipmentCode} ${asset.EquipmentName}`.toLowerCase().includes(assignQuery.trim().toLowerCase()))
    : siteEquipment;
  const buildingName = (id: string) => data.buildings.find((entry) => entry.bl_id === id && entry.SiteId === activeSiteId)?.Name;

  const selectAndFly = (expressId: number) => {
    setSelection(expressId);
    setRoomSelection(null);
    setAssignOpen(false);
    flyToElement(expressId);
  };

  function selectRoom(expressId: number, fly: boolean) {
    setSelection(null);
    setRoomSelection(expressId);
    setTab("rooms");
    setAssignOpen(false);
    if (fly) flyToRoom(expressId);
  }

  const isolateTarget = (kind: "element" | "room", expressId: number, label: string) => {
    if (isolate && isolate.kind === kind && isolate.expressId === expressId) { setIsolate(null); return; }
    const box = kind === "room" ? spaceWorldBox(expressId) : elementWorldBox(expressId);
    setIsolate({ kind, expressId, label });
    if (box) fitCameraToBox(box.clone().expandByScalar(isolatePadding), true);
  };

  const actualPopupWr = wrPopup ? data.workRequests.find((wr) => wr.WR_ID === wrPopup.WR_ID && wr.SiteId === wrPopup.SiteId) ?? wrPopup : null;
  const navigatePopup = (id: string) => {
    const target = data.workRequests.find((wr) => wr.WR_ID === id && wr.SiteId === activeSiteId);
    if (target) setWrPopup(target);
    else alert(`Work request ${id} is not available at this site.`);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">3D BIM Model Viewer</h1>
            <p className="text-xs text-gray-600">Live Three.js + web-ifc OpenBIM engine · {activeSiteId}</p>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs font-medium text-gray-600">Building</label>
            <select
              value={buildingId}
              onChange={(event) => setBuildingId(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm bg-white"
              aria-label="Building model selector"
            >
              {!models?.length && <option value="">No models available</option>}
              {models?.map((model) => (
                <option key={model.buildingId} value={model.buildingId}>
                  {model.buildingId}{buildingName(model.buildingId) ? ` · ${buildingName(model.buildingId)}` : ""}{model.source === "bundled" ? " (bundled)" : ""}
                </option>
              ))}
            </select>
            <button onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
              <Upload size={15} /> Upload .IFC Model
            </button>
            <button onClick={() => void downloadIfc()} disabled={!buildingId} className="inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-50">
              <Download size={15} /> Download .IFC (with EQ IDs)
            </button>
          </div>
        </div>
        {missing && (
          <div className="mt-2 flex items-center gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            <span>
              This model contains {missing.floors.length} floor(s), {missing.rooms.length} room(s), and {missing.taggedAssets.length} Mark-tagged asset(s) that do not exist in CAFM yet.
            </span>
            <button onClick={syncMissingToCafm} className="ml-auto whitespace-nowrap rounded bg-amber-600 px-2 py-1 font-semibold text-white hover:bg-amber-700">
              Sync Missing Floors / Rooms / Tagged Assets to CAFM
            </button>
          </div>
        )}
        {error && <p role="alert" className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-800">{error}</p>}
        {notice && !error && (
          <p role="status" className="mt-2 flex items-center rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
            {notice}
            <button className="ml-auto" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={13} /></button>
          </p>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-3 p-3 overflow-hidden">
        {/* 3D Viewport */}
        <div className="flex-1 relative rounded-lg border border-gray-300 overflow-hidden shadow-lg bg-gray-900">
          <div ref={containerRef} className={`absolute inset-0 ${measureMode ? "cursor-crosshair" : ""}`} onPointerDown={onPointerDown} onPointerUp={onPointerUp} />
          {status && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/70 text-gray-200 text-sm gap-2 pointer-events-none">
              <Loader2 className="animate-spin" size={18} /> {status}
            </div>
          )}

          {viewportHealth && (
            <div className="absolute bottom-3 left-3 max-w-[70%] space-y-1 pointer-events-none">
              {viewportHealth.warning && (
                <div role="alert" className="rounded border border-amber-400 bg-amber-100/95 px-2 py-1 text-[11px] font-medium text-amber-900">
                  {viewportHealth.warning}
                </div>
              )}
              <div className="inline-block rounded-full bg-gray-900/80 px-2.5 py-1 text-[10px] text-gray-200 border border-gray-600">
                {viewportHealth.buildingId} · {viewportHealth.meshCount} meshes · {viewportHealth.size[0].toFixed(1)}×{viewportHealth.size[2].toFixed(1)}×{viewportHealth.size[1].toFixed(1)}m
              </div>
            </div>
          )}

          {/* Camera presets, Laser Measure, Issue Pins */}
          <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1 rounded-lg border border-gray-600 bg-gray-900/85 p-1 text-[11px] text-gray-100 shadow-lg">
            {([["iso", "3D Iso"], ["top", "Top Plan"], ["front", "Front"], ["right", "Right"]] as const).map(([view, label]) => (
              <button key={view} onClick={() => setCameraView(view)} className="rounded px-2 py-1 hover:bg-gray-700">{label}</button>
            ))}
            <span className="mx-0.5 h-4 w-px bg-gray-600" />
            <button onClick={() => { setMeasureMode((value) => !value); setMeasurePoints([]); }} aria-pressed={measureMode}
              className={`rounded px-2 py-1 ${measureMode ? "bg-yellow-500 text-gray-900 font-semibold" : "hover:bg-gray-700"}`}>Measure</button>
            <button onClick={() => setPinsOn((value) => !value)} aria-pressed={pinsOn}
              className={`rounded px-2 py-1 ${pinsOn ? "bg-red-600 text-white font-semibold" : "hover:bg-gray-700"}`}>Issue Pins</button>
            {measurePoints.length > 0 && <button onClick={() => setMeasurePoints([])} className="rounded px-2 py-1 hover:bg-gray-700">Clear</button>}
          </div>

          {isolate && (
            <div className="absolute top-14 left-3 flex items-center gap-2 rounded-full border border-cyan-500 bg-gray-900/90 px-3 py-1 text-[11px] text-cyan-100 shadow-lg">
              <span>Isolated: {isolate.label}</span>
              <label className="flex items-center gap-1">Padding {isolatePadding.toFixed(1)}m
                <input type="range" min={0.5} max={4} step={0.5} value={isolatePadding} onChange={(event) => setIsolatePadding(Number(event.target.value))} className="h-1 w-20 cursor-pointer" />
              </label>
              <button onClick={() => setIsolate(null)} className="font-semibold hover:text-white">× Clear</button>
            </div>
          )}

          {measurePoints.length === 2 && (() => {
            const delta = measurePoints[1].clone().sub(measurePoints[0]);
            const dist = delta.length();
            const horiz = Math.hypot(delta.x, delta.z);
            return (
              <div ref={(el) => setOverlayEl("measure", el)} className="absolute left-0 top-0 z-10 invisible -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-yellow-400 px-2 py-1 text-[11px] font-semibold text-gray-900 shadow-lg">
                {dist.toFixed(2)} m ({Math.round(dist * 1000)} mm) · ΔXY {horiz.toFixed(2)}m · ΔH {Math.abs(delta.y).toFixed(2)}m
                <button onClick={() => setMeasurePoints([])} className="ml-2 underline">Clear</button>
              </div>
            );
          })()}

          {pinsOn && issuePins.map((pin) => (
            <button key={pin.key} ref={(el) => setOverlayEl(pin.key, el)}
              onClick={() => (pin.kind === "element" ? selectAndFly(pin.expressId) : selectRoom(pin.expressId, true))}
              className="absolute left-0 top-0 z-10 invisible -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg ring-1 ring-white/70"
              style={{ background: `#${pin.color.toString(16).padStart(6, "0")}` }}>
              ● {pin.label}
            </button>
          ))}

          {/* Viewport Controls Overlay */}
          <div className="absolute top-3 right-3 w-56 max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-gray-300 bg-white/95 p-3 shadow-lg space-y-2 text-xs">
            <div className="font-semibold text-gray-700 border-b pb-1.5">Viewport Controls</div>
            <div className="flex gap-1.5">
              <button onClick={resetCamera} className="flex-1 inline-flex items-center justify-center gap-1 rounded border border-gray-300 px-2 py-1 hover:bg-gray-100">
                <RefreshCw size={12} /> Reset Camera
              </button>
              <button onClick={() => { if (selection !== null) flyToElement(selection); else if (roomSelection !== null) flyToRoom(roomSelection); }} disabled={selection === null && roomSelection === null} className="flex-1 inline-flex items-center justify-center gap-1 rounded border border-gray-300 px-2 py-1 hover:bg-gray-100 disabled:opacity-40">
                <Crosshair size={12} /> Fit Selected
              </button>
            </div>
            <label className="block font-medium text-gray-700">
              Storey Filter
              <select value={storeyFilter} onChange={(event) => setStoreyFilter(event.target.value)} className="mt-1 w-full rounded border border-gray-300 px-1.5 py-1 bg-white">
                <option value={ALL_STOREYS}>{ALL_STOREYS}</option>
                {index?.storeys.map((storey) => <option key={storey.expressId} value={storey.name}>{storey.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-700">
              <input type="checkbox" checked={xray} onChange={(event) => setXray(event.target.checked)} className="rounded border-gray-300" />
              X-Ray Shell Mode
            </label>
            {xray && (
              <div>
                <label className="text-gray-600">Shell opacity: {xrayOpacity}%</label>
                <input type="range" min={0} max={85} step={5} value={xrayOpacity} onChange={(event) => setXrayOpacity(Number(event.target.value))} className="w-full h-1.5 cursor-pointer" />
              </div>
            )}
            <div>
              <label className="font-medium text-gray-700">Explode Storeys: {explodeGap}m</label>
              <input type="range" min={0} max={14} step={1} value={explodeGap} onChange={(event) => setExplodeGap(Number(event.target.value))} className="w-full h-1.5 cursor-pointer" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-700">
              <input type="checkbox" checked={clipEnabled} onChange={(event) => setClipEnabled(event.target.checked)} className="rounded border-gray-300" />
              Clipping Plane
            </label>
            {clipEnabled && (
              <div>
                <label className="text-gray-600">Section height: {clipPercent}%</label>
                <input type="range" min={0} max={100} value={clipPercent} onChange={(event) => setClipPercent(Number(event.target.value))} className="w-full h-1.5 cursor-pointer" />
              </div>
            )}
            <div className="font-medium text-gray-700">
              Color Mode
              <div className="mt-1 flex rounded border border-gray-300 overflow-hidden">
                <button onClick={() => setColorMode("bim")} aria-pressed={colorMode === "bim"} className={`flex-1 px-1.5 py-1 ${colorMode === "bim" ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"}`}>BIM Default</button>
                <button onClick={() => setColorMode("status")} aria-pressed={colorMode === "status"} className={`flex-1 px-1.5 py-1 ${colorMode === "status" ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"}`}>Live Status</button>
                <button onClick={() => { setColorMode("heatmap"); setXray(true); }} aria-pressed={colorMode === "heatmap"} className={`flex-1 px-1.5 py-1 ${colorMode === "heatmap" ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"}`}>Room Heatmap</button>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-700">
              <input type="checkbox" checked={showSpaces} onChange={(event) => setShowSpaces(event.target.checked)} className="rounded border-gray-300" />
              Show Room Volumes (IfcSpace)
            </label>
            {colorMode === "heatmap" && (
              <div className="border-t pt-1.5 space-y-0.5 text-[11px] text-gray-600">
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#dc2626" }} /> Overdue WR / Audit in room</p>
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#f59e0b" }} /> Open WR in room</p>
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#06b6d4" }} /> Active Freeze Period</p>
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#10b981" }} /> Healthy / Clear</p>
              </div>
            )}
            {colorMode === "status" && (
              <div className="border-t pt-1.5 space-y-0.5 text-[11px] text-gray-600">
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#dc2626" }} /> Overdue WR / Unfavourable finding</p>
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#f59e0b" }} /> Open 50% / 55% WR</p>
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#06b6d4" }} /> Active Freeze Period</p>
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#10b981" }} /> Linked &amp; Healthy</p>
                <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#8b5cf6" }} /> Unassigned MEP element</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-[26rem] flex flex-col rounded-lg border border-gray-300 bg-white shadow-lg overflow-hidden">
          <div className="border-b border-gray-200 p-2 space-y-2">
            <div className="flex rounded border border-gray-300 overflow-hidden text-xs font-medium">
              <button onClick={() => setTab("linked")} aria-pressed={tab === "linked"} className={`flex-1 px-2 py-1.5 ${tab === "linked" ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"}`}>Linked EQ ({linkedRows.length})</button>
              <button onClick={() => setTab("unassigned")} aria-pressed={tab === "unassigned"} className={`flex-1 px-2 py-1.5 ${tab === "unassigned" ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"}`}>Unassigned IFC ({unassignedRows.length})</button>
              <button onClick={() => setTab("rooms")} aria-pressed={tab === "rooms"} className={`flex-1 px-2 py-1.5 ${tab === "rooms" ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"}`}>Rooms ({roomRows.length})</button>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search elements, EQ IDs, rooms…" className="w-full rounded border border-gray-300 pl-7 pr-2 py-1.5 text-xs" />
            </div>
          </div>

          {/* Element list */}
          <div ref={sidebarListRef} className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {tab === "linked" && linkedRows.map((element) => {
              const link = links.get(element.expressId)!;
              const color = statusColorByCode.get(link.equipmentCode) ?? COLOR_EMERALD;
              return (
                <button key={element.expressId} onClick={() => selectAndFly(element.expressId)}
                  className={`block w-full px-3 py-2 text-left text-xs hover:bg-blue-50 ${selection === element.expressId ? "bg-blue-100" : ""}`}>
                  <span className="font-semibold text-gray-900 flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: `#${color.toString(16).padStart(6, "0")}` }} />
                    {link.equipmentCode} · {displayName(element)}
                  </span>
                  <span className="text-gray-500">{element.storeyName}{element.roomCode ? ` · ${element.roomCode}` : ""}{link.source === "mark" ? " · Revit Mark" : " · In-app link"}</span>
                </button>
              );
            })}
            {tab === "unassigned" && unassignedRows.map((element) => (
              <button key={element.expressId} onClick={() => selectAndFly(element.expressId)}
                className={`block w-full px-3 py-2 text-left text-xs hover:bg-violet-50 ${selection === element.expressId ? "bg-violet-100" : ""}`}>
                <span className="font-semibold text-gray-900">{displayName(element)}</span>
                <span className="block text-gray-500">{element.ifcType}{element.category ? ` · ${element.category}` : ""} · {element.storeyName}{element.roomCode ? ` · ${element.roomCode}` : ""}</span>
              </button>
            ))}
            {tab === "rooms" && roomRows.map((space) => {
              const level = roomHealth.get(space.expressId)?.level ?? "clear";
              const dot = level === "clear" ? "#10b981" : `#${ROOM_LEVEL_COLOR[level].toString(16).padStart(6, "0")}`;
              const active = roomSelection === space.expressId;
              return (
                <button key={space.expressId} data-room-id={space.expressId} onClick={() => selectRoom(space.expressId, true)}
                  aria-pressed={active}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                    event.preventDefault();
                    const sibling = (event.key === "ArrowDown" ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling) as HTMLElement | null;
                    sibling?.focus();
                  }}
                  className={`block w-full px-3 py-2 text-left text-xs hover:bg-cyan-50 focus:outline-none focus:bg-cyan-50 ${active ? "bg-cyan-100 border-l-4 border-cyan-600" : ""}`}>
                  <span className="font-semibold text-gray-900 flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />
                    {space.code}
                  </span>
                  <span className="block text-gray-500">{space.longName} · {space.storeyName}</span>
                </button>
              );
            })}
            {tab === "linked" && !linkedRows.length && <p className="p-3 text-xs text-gray-500">No linked equipment in this view.</p>}
            {tab === "unassigned" && !unassignedRows.length && <p className="p-3 text-xs text-gray-500">Every MEP element has an EQ ID. 🎉</p>}
            {tab === "rooms" && !roomRows.length && <p className="p-3 text-xs text-gray-500">No IfcSpace rooms detected.</p>}
          </div>

          {/* Selected Element Action Card */}
          {selectedElement && (
            <div className="border-t border-gray-300 bg-gray-50 p-3 space-y-2 text-xs max-h-[45%] overflow-y-auto">
              <div className="flex items-start justify-between">
                <strong className="text-sm text-gray-900">{selectedLink ? `${selectedLink.equipmentCode} · ` : ""}{displayName(selectedElement)}</strong>
                <button aria-label="Clear selection" onClick={() => setSelection(null)}><X size={14} /></button>
              </div>
              <p className="text-gray-600">
                {selectedElement.ifcType}{selectedElement.category ? ` · ${selectedElement.category}` : ""}<br />
                {selectedEquipment
                  ? <>Location: {selectedEquipment.bl_id} &gt; {selectedEquipment.LevelName} &gt; {selectedEquipment.RoomCode}</>
                  : <>Storey: {selectedElement.storeyName || "—"} · Room: {selectedElement.roomCode || "—"}</>}<br />
                IfcGlobalId: <span className="font-mono">{selectedElement.globalId}</span>
              </p>
              <button onClick={() => isolateTarget("element", selectedElement.expressId, selectedLink?.equipmentCode ?? displayName(selectedElement))}
                aria-pressed={isolate?.kind === "element" && isolate.expressId === selectedElement.expressId}
                className={`w-full rounded border px-2 py-1.5 font-semibold ${isolate?.kind === "element" && isolate.expressId === selectedElement.expressId ? "border-cyan-600 bg-cyan-600 text-white" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100"}`}>
                {isolate?.kind === "element" && isolate.expressId === selectedElement.expressId ? "Clear Isolation Box" : "Isolate Box"}
              </button>

              {!selectedLink && selectedElement.isAssignable && (
                <div className="space-y-1.5">
                  {!assignOpen
                    ? (
                      <div className="flex gap-1.5">
                        <button onClick={() => setAssignOpen(true)} disabled={busy} className="flex-1 rounded bg-blue-600 px-2 py-1.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                          Assign Existing EQ ID
                        </button>
                        <button onClick={() => void createNewEquipment(selectedElement)} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-emerald-600 px-2 py-1.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                          <Plus size={12} /> Create New CAFM Equipment
                        </button>
                      </div>
                    )
                    : (
                      <div className="rounded border border-blue-300 bg-white p-2 space-y-1.5">
                        <input autoFocus value={assignQuery} onChange={(event) => setAssignQuery(event.target.value)} placeholder="Search equipment code or name…" className="w-full rounded border border-gray-300 px-2 py-1" />
                        <div className="max-h-28 overflow-y-auto divide-y divide-gray-100">
                          {assignCandidates.slice(0, 50).map((asset) => (
                            <button key={asset.EquipmentCode} onClick={() => void assignExisting(selectedElement, asset.EquipmentCode)} disabled={busy}
                              className="block w-full px-1.5 py-1 text-left hover:bg-blue-50 disabled:opacity-50">
                              <span className="font-semibold">{asset.EquipmentCode}</span> · {asset.EquipmentName}
                            </button>
                          ))}
                          {!assignCandidates.length && <p className="px-1.5 py-1 text-gray-500">No equipment matches.</p>}
                        </div>
                        <button onClick={() => setAssignOpen(false)} className="text-gray-600 underline">Cancel</button>
                      </div>
                    )}
                </div>
              )}

              {selectedLink && (
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    <button onClick={() => { setAssignOpen(true); }} disabled={busy} className="flex-1 rounded border border-blue-400 bg-white px-2 py-1.5 font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                      Change EQ ID
                    </button>
                    <button onClick={() => void unassign(selectedElement)} disabled={busy} className="flex-1 rounded border border-red-300 bg-white px-2 py-1.5 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                      Unassign EQ ID
                    </button>
                  </div>
                  {assignOpen && (
                    <div className="rounded border border-blue-300 bg-white p-2 space-y-1.5">
                      <input autoFocus value={assignQuery} onChange={(event) => setAssignQuery(event.target.value)} placeholder="Search equipment code or name…" className="w-full rounded border border-gray-300 px-2 py-1" />
                      <div className="max-h-28 overflow-y-auto divide-y divide-gray-100">
                        {assignCandidates.slice(0, 50).map((asset) => (
                          <button key={asset.EquipmentCode} onClick={() => void assignExisting(selectedElement, asset.EquipmentCode)} disabled={busy}
                            className="block w-full px-1.5 py-1 text-left hover:bg-blue-50 disabled:opacity-50">
                            <span className="font-semibold">{asset.EquipmentCode}</span> · {asset.EquipmentName}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setAssignOpen(false)} className="text-gray-600 underline">Cancel</button>
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-gray-800">Open WRs ({selectedOpenWRs.length})</p>
                    {selectedOpenWRs.length
                      ? selectedOpenWRs.map((wr) => (
                        <button key={wr.WR_ID} onClick={() => setWrPopup(wr)} className="block w-full rounded px-1.5 py-1 text-left hover:bg-blue-50">
                          <span className="font-medium text-blue-700 underline">{wr.WR_ID}</span> · {wr.WR_Type} · {wr.Percentage}% · Due {formatDateDDMMYYYY(wr.DueDate) || "—"}
                        </button>
                      ))
                      : <p className="text-gray-500">No open work requests.</p>}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">SmartPM Schedules ({selectedSchedules.length})</p>
                    {selectedSchedules.length
                      ? selectedSchedules.map((schedule) => (
                        <p key={schedule.ScheduleId} className="px-1.5 py-0.5 text-gray-700">
                          PMS {schedule.ScheduleId} · {schedule.ChecklistCode} · Next Occurrence {formatDateDDMMYYYY(schedule.NextDueDate) || "—"}
                        </p>
                      ))
                      : <p className="text-gray-500">No SmartPM schedules target this equipment.</p>}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => { setFastJobLocation(null); setFastJobOpen(true); }} className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-amber-600 px-2 py-1.5 font-semibold text-white hover:bg-amber-700">
                      <Plus size={12} /> Create Fast Job
                    </button>
                    <button onClick={() => router.push(`/equipment?eq=${encodeURIComponent(selectedLink.equipmentCode)}`)} className="flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 font-semibold text-gray-800 hover:bg-gray-100">
                      Open in Equipment Registry
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Selected Room Inspector Card */}
          {selectedSpace && !selectedElement && (() => {
            const box = spaceWorldBox(selectedSpace.expressId);
            const size = box ? box.getSize(new THREE.Vector3()) : null;
            const cafmRoom = data.rooms.find((room) => room.bl_id === buildingId && room.RoomCode === selectedSpace.code);
            const isolated = isolate?.kind === "room" && isolate.expressId === selectedSpace.expressId;
            const freezes = selectedRoomHealth?.freezes ?? [];
            const openWrs = selectedRoomHealth?.wrs ?? [];
            return (
              <div className="border-t border-gray-300 bg-gray-50 p-3 space-y-2 text-xs max-h-[55%] overflow-y-auto">
                <div className="flex items-start justify-between">
                  <strong className="text-sm text-gray-900">{selectedSpace.code}{selectedSpace.longName ? ` · ${selectedSpace.longName}` : ""}</strong>
                  <button aria-label="Clear room selection" onClick={() => { setRoomSelection(null); if (isolate?.kind === "room") setIsolate(null); }}><X size={14} /></button>
                </div>
                <p className="text-gray-600">
                  Storey: {selectedSpace.storeyName || "—"}<br />
                  {size
                    ? <>Dimensions: {size.x.toFixed(1)} × {size.z.toFixed(1)} × {size.y.toFixed(1)} m · Est. floor area {(size.x * size.z).toFixed(1)} m²<br /></>
                    : <>Dimensions: —<br /></>}
                  IfcGlobalId: <span className="font-mono">{selectedSpace.globalId}</span>
                </p>
                {freezes.map((freeze) => (
                  <span key={freeze.id ?? freeze.title} className="block rounded border border-cyan-400 bg-cyan-50 px-2 py-1 font-medium text-cyan-900">
                    ❄ Active Freeze: {freeze.title} · {formatFreezePeriodWindow(freeze.startDateTime, freeze.endDateTime)}
                  </span>
                ))}
                <div className="flex gap-1.5">
                  <button onClick={() => isolateTarget("room", selectedSpace.expressId, selectedSpace.code)} aria-pressed={isolated}
                    className={`flex-1 rounded border px-2 py-1.5 font-semibold ${isolated ? "border-cyan-600 bg-cyan-600 text-white" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100"}`}>
                    {isolated ? "Clear Room Box" : "Isolate Room Box"}
                  </button>
                  <button onClick={() => flyToRoom(selectedSpace.expressId)} className="flex-1 inline-flex items-center justify-center gap-1 rounded border border-gray-300 bg-white px-2 py-1.5 font-semibold text-gray-800 hover:bg-gray-100">
                    <Crosshair size={12} /> Fit Room
                  </button>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Equipment in Room ({roomElements.length})</p>
                  <div className="max-h-24 overflow-y-auto divide-y divide-gray-100 rounded border border-gray-200 bg-white">
                    {roomElements.map((element) => {
                      const link = links.get(element.expressId);
                      return (
                        <button key={element.expressId} onClick={() => selectAndFly(element.expressId)} className="block w-full px-1.5 py-1 text-left hover:bg-blue-50">
                          <span className="font-semibold">{link ? link.equipmentCode : "Unassigned"}</span> · {displayName(element)}
                        </button>
                      );
                    })}
                    {!roomElements.length && <p className="px-1.5 py-1 text-gray-500">No equipment located in this room.</p>}
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Open WRs &amp; Schedules in Room ({openWrs.length + roomSchedules.length})</p>
                  {openWrs.map((wr) => (
                    <button key={wr.WR_ID} onClick={() => setWrPopup(wr)} className="block w-full rounded px-1.5 py-1 text-left hover:bg-blue-50">
                      <span className="font-medium text-blue-700 underline">{wr.WR_ID}</span> · {wr.WR_Type} · {wr.Percentage}% · Due {formatDateDDMMYYYY(wr.DueDate) || "—"}
                    </button>
                  ))}
                  {roomSchedules.map((schedule) => (
                    <p key={schedule.ScheduleId} className="px-1.5 py-0.5 text-gray-700">
                      PMS {schedule.ScheduleId} · {schedule.ChecklistCode} · Next {formatDateDDMMYYYY(schedule.NextDueDate) || "—"}
                    </p>
                  ))}
                  {!openWrs.length && !roomSchedules.length && <p className="text-gray-500">No open work requests or schedules.</p>}
                </div>
                <button
                  onClick={() => {
                    setFastJobLocation({ bl_id: buildingId, levelName: cafmRoom?.LevelName ?? selectedSpace.storeyName, roomCode: selectedSpace.code });
                    setFastJobOpen(true);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1 rounded bg-amber-600 px-2 py-1.5 font-semibold text-white hover:bg-amber-700">
                  <Plus size={12} /> Create Room Fast Job
                </button>
              </div>
            );
          })()}
        </div>
      </div>

      {uploadOpen && (
        <UploadIfcModal
          siteId={activeSiteId}
          buildings={data.buildings.filter((entry) => entry.SiteId === activeSiteId)}
          onClose={() => setUploadOpen(false)}
          onImported={async (importedBuildingId, buildingNameFromIfc) => {
            const list = await refreshModels();
            setModels(list);
            setData((current) => current.buildings.some((entry) => entry.bl_id === importedBuildingId && entry.SiteId === activeSiteId)
              ? current
              : { ...current, buildings: [...current.buildings, { bl_id: importedBuildingId, SiteId: activeSiteId, Name: buildingNameFromIfc || importedBuildingId, Address: "Imported from IFC model", IsActive: true } satisfies Building] });
            setUploadOpen(false);
            setBuildingId(importedBuildingId);
            setNotice(`The .ifc model for ${importedBuildingId} was imported.`);
          }}
        />
      )}

      {actualPopupWr && actualPopupWr.WR_Type === "PM" && (
        <PMWorkRequestPopup workRequest={actualPopupWr} onClose={() => setWrPopup(null)} onNavigate={navigatePopup}
          onEscalateToLJ={() => alert("Open the Work Requests page to escalate this PM to a Long Job.")} />
      )}
      {actualPopupWr && actualPopupWr.WR_Type === "FJ" && (
        <FJWorkRequestPopup workRequest={actualPopupWr} onClose={() => setWrPopup(null)} onNavigate={navigatePopup}
          onEscalateToLJ={() => alert("Open the Work Requests page to escalate this Fast Job to a Long Job.")} />
      )}
      {actualPopupWr && actualPopupWr.WR_Type === "LJ" && (
        <LJWorkRequestPopup workRequest={actualPopupWr} onClose={() => setWrPopup(null)} onNavigate={navigatePopup} />
      )}
      <FastJobModal isOpen={fastJobOpen} onClose={() => setFastJobOpen(false)} onSubmit={createFastJob} initialLocation={fastJobLocation} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload .IFC Model modal
// ---------------------------------------------------------------------------

interface UploadPreview {
  buildingName: string;
  storeys: string[];
  spaces: BimSpace[];
  taggedCount: number;
  untaggedAssignableCount: number;
  elementCount: number;
}

function UploadIfcModal({ siteId, buildings, onClose, onImported }: {
  siteId: string;
  buildings: Building[];
  onClose: () => void;
  onImported: (buildingId: string, buildingNameFromIfc: string) => Promise<void> | void;
}) {
  const [targetBuildingId, setTargetBuildingId] = useState<string>("__new__");
  const [fileName, setFileName] = useState("");
  const [stepBytes, setStepBytes] = useState<Uint8Array | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const handleFile = async (file: File) => {
    setError("");
    setPreview(null);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".ifc") && !lower.endsWith(".ifc.gz")) { setError("Choose a .ifc or .ifc.gz file."); return; }
    setParsing(true);
    try {
      let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
      if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzipBytes(bytes);
      const header = new TextDecoder().decode(bytes.slice(0, 64)).trimStart();
      if (!header.startsWith("ISO-10303-21")) throw new Error("The file is not a valid IFC STEP (ISO-10303-21) file.");
      setFileName(file.name);
      setStepBytes(bytes);
      const model = await loadBimModel(bytes);
      try {
        setPreview({
          buildingName: model.index.buildingName,
          storeys: model.index.storeys.map((storey) => storey.name),
          spaces: model.index.spaces,
          taggedCount: model.index.elements.filter((element) => element.mark).length,
          untaggedAssignableCount: model.index.elements.filter((element) => element.isAssignable && !element.mark).length,
          elementCount: model.index.elements.length,
        });
      } finally {
        model.dispose();
      }
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Could not parse the .ifc file.");
      setStepBytes(null);
      setFileName("");
    } finally {
      setParsing(false);
    }
  };

  const sanitizeId = (value: string) => value.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");

  const importModel = async () => {
    if (!stepBytes || !preview) { setError("Choose and parse a .ifc file first."); return; }
    const buildingId = targetBuildingId === "__new__" ? sanitizeId(preview.buildingName) : targetBuildingId;
    if (!buildingId) { setError("The IFCBUILDING has no usable name; choose an existing target building."); return; }
    setImporting(true);
    setError("");
    try {
      // Gzip client-side so a 67MB .ifc uploads as a ~7-15MB .ifc.gz archive.
      const gz = await gzipBytes(stepBytes);
      const payload = gz ?? stepBytes;
      const form = new FormData();
      form.set("siteId", siteId);
      form.set("buildingId", buildingId);
      form.set("file", new Blob([payload as BlobPart], { type: gz ? "application/gzip" : "application/x-step" }), gz ? `${buildingId}.ifc.gz` : `${buildingId}.ifc`);
      const response = await fetch("/api/bim-models", { method: "POST", body: form });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body && typeof body === "object" && "error" in body ? String(body.error) : "The upload failed.");
      }
      await onImported(buildingId, preview.buildingName);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "The upload failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Upload IFC model">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <strong className="text-sm">Upload .IFC Model</strong>
          <button aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="space-y-3 p-4 text-xs">
          <label className="block font-medium text-gray-700">
            Target Building
            <select value={targetBuildingId} onChange={(event) => setTargetBuildingId(event.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 bg-white">
              <option value="__new__">— Create new Building from IFCBUILDING —</option>
              {buildings.map((building) => <option key={building.bl_id} value={building.bl_id}>{building.bl_id} · {building.Name}</option>)}
            </select>
          </label>
          <div
            onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={`rounded border-2 border-dashed p-5 text-center ${dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
          >
            <Box className="mx-auto mb-1 text-gray-400" size={22} />
            <p className="text-gray-600">{fileName || "Drag & drop a .ifc / .ifc.gz file here, or"}</p>
            <label className="mt-1 inline-block cursor-pointer rounded bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700">
              Browse…
              <input type="file" accept=".ifc,.gz" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); }} />
            </label>
          </div>
          {parsing && <p className="flex items-center gap-1.5 text-gray-600"><Loader2 className="animate-spin" size={13} /> Parsing the IFC model…</p>}
          {preview && (
            <div className="rounded border border-emerald-300 bg-emerald-50 p-2.5 space-y-1 text-emerald-900">
              <p><strong>IFCBUILDING:</strong> {preview.buildingName || "—"}</p>
              <p><strong>Storeys ({preview.storeys.length}):</strong> {preview.storeys.join(", ") || "—"}</p>
              <p><strong>IfcSpace Rooms ({preview.spaces.length}):</strong> {preview.spaces.map((space) => space.code).join(", ") || "—"}</p>
              <p><strong>Elements:</strong> {preview.elementCount} total · {preview.taggedCount} Mark-tagged · {preview.untaggedAssignableCount} untagged assignable</p>
            </div>
          )}
          {error && <p role="alert" className="rounded border border-red-300 bg-red-50 px-2 py-1.5 text-red-800">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-100">Cancel</button>
          <button onClick={() => void importModel()} disabled={!preview || importing || parsing}
            className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {importing ? <Loader2 className="animate-spin" size={13} /> : <Upload size={13} />} Import Model
          </button>
        </div>
      </div>
    </div>
  );
}
