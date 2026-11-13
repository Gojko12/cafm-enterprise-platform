"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Download, Loader2, Upload, X,
} from "lucide-react";
import type { BaseWorkRequest, Building } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { fetchBimModels, type BimModelInfo } from "@/components/common/LocateInBim";
import {
  fetchIfcBuffer, loadBimModel, type BimElement, type BimModelIndex, type LoadedBimModel,
} from "@/lib/ifc-cafm-bridge";
import { PMWorkRequestPopup } from "./PMWorkRequestPopup";
import { FJWorkRequestPopup } from "./FJWorkRequestPopup";
import { LJWorkRequestPopup } from "./LJWorkRequestPopup";
import { FastJobModal, type FastJobData } from "./FastJobModal";
import { BimRightSidebar } from "./bim/BimRightSidebar";
import { BimViewportOverlays } from "./bim/BimViewportOverlays";
import { UploadIfcModal } from "./bim/UploadIfcModal";
import {
  ALL_STOREYS, SAFE_BOUNDS, elementMapOf, spaceMapOf, boxIsFinite, clipPercentForWorldY,
  DEFAULT_DISCIPLINE_VISIBILITY, DEFAULT_STATUS_COLOR_VISIBILITY, EQ_FLY_DIRECTION,
  type BimTab, type DisciplineVisibility, type FloorIsolation, type MeshOriginal, type ColorMode, type StatusColorVisibility,
} from "./bim/bim-viewport-math";
import { useBimDerivedData } from "./bim/useBimDerivedData";
import { useBimMutations } from "./bim/useBimMutations";
import { useBimCamera } from "./bim/useBimCamera";
import { useBimSceneEffects } from "./bim/useBimSceneEffects";
import { useBimSpotPins } from "./bim/useBimSpotPins";
import { useBimDeepLinks } from "./bim/useBimDeepLinks";
import { pickAtModel } from "./bim/bim-scene-helpers";


export function BIMViewer() {
  const { data, setData } = useCafmStore();
  const { permissions, profile } = useActiveUserPermissions();
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
  const [statusColorVisibility, setStatusColorVisibility] = useState<StatusColorVisibility>({ ...DEFAULT_STATUS_COLOR_VISIBILITY });
  const [disciplineVisibility, setDisciplineVisibility] = useState<DisciplineVisibility>({ ...DEFAULT_DISCIPLINE_VISIBILITY });
  const [multiSelection, setMultiSelection] = useState<number[]>([]);
  const [ghostRest, setGhostRest] = useState(false);
  const [floorIsolation, setFloorIsolation] = useState<FloorIsolation>(null);

  // ---- Sidebar ----
  const [tab, setTab] = useState<BimTab>("linked");
  const [search, setSearch] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignQuery, setAssignQuery] = useState("");
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
  const activeClippingPlanesRef = useRef<THREE.Plane[]>([]);
  const explodeGapRef = useRef(0);
  explodeGapRef.current = explodeGap;
  const measureGroupRef = useRef<THREE.Group | null>(null);
  const roomHelperGroupRef = useRef<THREE.Group | null>(null);
  const overlayElsRef = useRef(new Map<string, HTMLElement>());
  const overlayAnchorsRef = useRef(new Map<string, THREE.Vector3>());
  const overlaysDirtyRef = useRef(true);
  const sidebarListRef = useRef<HTMLDivElement | null>(null);
  const setOverlayEl = useCallback((key: string, element: HTMLElement | null) => {
    if (element) overlayElsRef.current.set(key, element);
    else overlayElsRef.current.delete(key);
    overlaysDirtyRef.current = true;
  }, []);

  const {
    siteEquipment, links, missing, statusColorByCode, roomHealth, issuePins,
    classificationByExpressId, disciplineByExpressId, fjSpotPins,
    linkedRows, unassignedRows, roomRows, selectedElement, selectedSpace, selectedRoomHealth,
    roomElements, roomSchedules, selectedLink, selectedEquipment, selectedOpenWRs, selectedSchedules,
    assignCandidates,
  } = useBimDerivedData({
    data, activeSiteId, buildingId, index, storeyFilter, search, selection, roomSelection, assignQuery, pinsOn,
  });

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
    const cancelFly = () => { flyRef.current = null; };
    controls.addEventListener("start", cancelFly);
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
    const viewProjection = new THREE.Matrix4();
    const previousViewProjection = new THREE.Matrix4();
    let hasPreviousViewProjection = false;
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
      camera.updateMatrixWorld();
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      let matrixChanged = !hasPreviousViewProjection;
      if (!matrixChanged) {
        const current = viewProjection.elements;
        const previous = previousViewProjection.elements;
        matrixChanged = current.some((value, index) => value !== previous[index]);
      }
      if (matrixChanged) {
        previousViewProjection.copy(viewProjection);
        hasPreviousViewProjection = true;
      }
      renderer.render(scene, camera);
      if (matrixChanged || overlaysDirtyRef.current) {
        const width = container.clientWidth, height = container.clientHeight;
        for (const [key, element] of overlayElsRef.current) {
          const anchor = overlayAnchorsRef.current.get(key);
          if (!anchor) { element.style.visibility = "hidden"; continue; }
          projected.copy(anchor).project(camera);
          const onScreen = projected.z < 1 && Math.abs(projected.x) <= 1.1 && Math.abs(projected.y) <= 1.1;
          element.style.visibility = onScreen ? "visible" : "hidden";
          if (onScreen) element.style.transform = `translate(${(projected.x * 0.5 + 0.5) * width}px, ${(-projected.y * 0.5 + 0.5) * height}px) translate(-50%, -100%)`;
        }
        overlaysDirtyRef.current = false;
      }
    };
    frame = requestAnimationFrame(animate);

    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      overlaysDirtyRef.current = true;
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener("start", cancelFly);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  const {
    fitCameraToBox, storeyOffset, elementWorldBox, spaceWorldBox, flyToElement, flyToRoom,
    explodedModelBox, resetCamera, setCameraView,
  } = useBimCamera({
    cameraRef, controlsRef, flyRef, modelBoxRef, loadedRef, explodeGapRef, rendererRef, sceneRef,
  });

  // ---- Model catalogue ----
  const refreshModels = useCallback(async (force = true) => {
    const list = await fetchBimModels(activeSiteId, force);
    setModels(list);
    return list;
  }, [activeSiteId]);
  const { busy, assignExisting, unassign, createNewEquipment, syncMissingToCafm, downloadIfc, createFastJob, syncIfcSpecs } = useBimMutations({
    data,
    setData,
    activeSiteId,
    buildingId,
    activePerson,
    index,
    missing,
    siteEquipment,
    canCreateFastJob: !!permissions?.canCreateFJ,
    actor: {
      userId: currentUser?.UserId,
      displayName: profile?.fullName ?? activePerson,
      role: String(profile?.primaryRole ?? ""),
      personId: profile?.id,
    },
    setIndex,
    setError,
    setNotice,
    setAssignOpen,
    setAssignQuery,
    setFastJobOpen,
    refreshModels,
  });

  const { pinFjMode, setPinFjMode, fastJobPrefill, openFastJob, pickSpot, submitFastJob, closeFastJob } = useBimSpotPins({
    index, data, buildingId, links, storeyOffset, createFastJob, setPinsOn, setFastJobLocation, setFastJobOpen,
  });

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
        setMultiSelection([]);
        setGhostRest(false);
        setFloorIsolation(null);
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

  useBimSceneEffects({
    refs: {
      sceneRef, loadedRef, modelBoxRef, clipPlaneRef, rendererRef, activeClippingPlanesRef,
      selectionHelperRef, roomHelperGroupRef, measureGroupRef, overlayAnchorsRef, overlaysDirtyRef,
    },
    loaded, index, explodeGap, measurePoints, setMeasurePoints, clipEnabled, clipPercent, links,
    selection, roomSelection, storeyFilter, xray, xrayOpacity, colorMode, showSpaces,
    statusColorByCode, roomHealth, isolate, isolatePadding, elementWorldBox, spaceWorldBox, issuePins,
    statusColorVisibility, disciplineVisibility, disciplineByExpressId, multiSelection, ghostRest,
    fjSpotPins, storeyOffset,
  });

  // ---- Picking ----
  const onPointerDown = (event: React.PointerEvent) => {
    pointerRef.current = { x: event.clientX, y: event.clientY };
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
      const { point } = pickAtModel(raycaster, model, activeClippingPlanesRef.current, xray, "measure");
      if (point) setMeasurePoints((previous) => previous.length === 1 ? [previous[0], point] : [point]);
      return;
    }
    if (pinFjMode) {
      pickSpot(raycaster, model, activeClippingPlanesRef.current, xray);
      return;
    }
    const { result } = pickAtModel(raycaster, model, activeClippingPlanesRef.current, xray, "select");
    // Ctrl/Cmd+Click toggles the element in the Smart Filter multi-selection.
    if ((event.ctrlKey || event.metaKey) && result?.kind === "element") {
      setMultiSelection((current) => current.includes(result.expressId)
        ? current.filter((id) => id !== result.expressId)
        : [...current, result.expressId]);
      return;
    }
    if (result?.kind === "element") {
      selectAndFly(result.expressId);
    } else if (result?.kind === "space") {
      selectRoom(result.expressId, true);
    } else {
      setSelection(null);
      setRoomSelection(null);
    }
  };

  const buildingName = (id: string) => data.buildings.find((entry) => entry.bl_id === id && entry.SiteId === activeSiteId)?.Name;

  /**
   * EQ selected: restore the storey filter if the EQ's floor was hidden, slice the
   * ceiling just above the EQ, and fly in along an elevated downward diagonal.
   */
  const selectAndFly = (expressId: number) => {
    setSelection(expressId);
    setRoomSelection(null);
    setFloorIsolation(null);
    setAssignOpen(false);
    const element = index ? elementMapOf(index).get(expressId) : undefined;
    if (element && storeyFilter !== ALL_STOREYS && element.storeyName !== storeyFilter) setStoreyFilter(ALL_STOREYS);
    const box = elementWorldBox(expressId);
    if (box) {
      const eqHeight = Math.max(box.max.y - box.min.y, 0.01);
      setClipEnabled(true);
      setClipPercent(clipPercentForWorldY(modelBoxRef.current, box.max.y + Math.max(0.35, eqHeight * 0.25)));
    }
    flyToElement(expressId, EQ_FLY_DIRECTION.clone());
  };

  /**
   * Room selected (Rooms tab, 3D click, or URL): isolate its floor, clip 0.20 m
   * below the room's ceiling when it is taller than 1.8 m, and frame the room.
   */
  function selectRoom(expressId: number, fly = true) {
    setSelection(null);
    setRoomSelection(expressId);
    setTab("rooms");
    setAssignOpen(false);
    const space = index ? spaceMapOf(index).get(expressId) : undefined;
    if (space?.storeyName) {
      setStoreyFilter(space.storeyName);
      setFloorIsolation({ storeyName: space.storeyName, roomCode: space.code });
    }
    const box = spaceWorldBox(expressId);
    if (box && box.max.y - box.min.y > 1.8) {
      setClipEnabled(true);
      setClipPercent(clipPercentForWorldY(modelBoxRef.current, box.max.y - 0.2));
    }
    if (fly) flyToRoom(expressId);
  }

  const showAllFloors = () => {
    setStoreyFilter(ALL_STOREYS);
    setFloorIsolation(null);
  };

  /** 🎯 Fit Selected (N): union box of the multi-selection + clip 0.5 m above the group. */
  const fitMultiSelection = () => {
    const union = new THREE.Box3();
    for (const expressId of multiSelection) {
      const box = elementWorldBox(expressId);
      if (box) union.union(box);
    }
    if (union.isEmpty()) return;
    setClipEnabled(true);
    setClipPercent(clipPercentForWorldY(modelBoxRef.current, union.max.y + 0.5));
    fitCameraToBox(union.clone().expandByScalar(1), true);
  };

  useBimDeepLinks({
    searchParams, index, loaded, links, buildingId, data, activeSiteId,
    storeyOffset, fitCameraToBox, flyToElement, selectRoom, selectAndFly, setXray, setSelection, setTab, setPinsOn,
  });

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

          <BimViewportOverlays
            viewportHealth={viewportHealth}
            index={index}
            selection={selection}
            roomSelection={roomSelection}
            isolate={isolate}
            setIsolate={setIsolate}
            isolatePadding={isolatePadding}
            setIsolatePadding={setIsolatePadding}
            measureMode={measureMode}
            setMeasureMode={setMeasureMode}
            measurePoints={measurePoints}
            setMeasurePoints={setMeasurePoints}
            pinsOn={pinsOn}
            setPinsOn={setPinsOn}
            issuePins={issuePins}
            fjSpotPins={fjSpotPins}
            onOpenFjPin={setWrPopup}
            pinFjMode={pinFjMode}
            setPinFjMode={setPinFjMode}
            canCreateFastJob={!!permissions?.canCreateFJ}
            floorIsolation={floorIsolation}
            onShowAllFloors={showAllFloors}
            setOverlayEl={setOverlayEl}
            setCameraView={setCameraView}
            resetCamera={resetCamera}
            flyToElement={flyToElement}
            flyToRoom={flyToRoom}
            selectAndFly={selectAndFly}
            selectRoom={selectRoom}
            storeyFilter={storeyFilter}
            setStoreyFilter={setStoreyFilter}
            xray={xray}
            setXray={setXray}
            xrayOpacity={xrayOpacity}
            setXrayOpacity={setXrayOpacity}
            explodeGap={explodeGap}
            setExplodeGap={setExplodeGap}
            clipEnabled={clipEnabled}
            setClipEnabled={setClipEnabled}
            clipPercent={clipPercent}
            setClipPercent={setClipPercent}
            colorMode={colorMode}
            setColorMode={setColorMode}
            showSpaces={showSpaces}
            setShowSpaces={setShowSpaces}
            statusColorVisibility={statusColorVisibility}
            setStatusColorVisibility={setStatusColorVisibility}
            disciplineVisibility={disciplineVisibility}
            setDisciplineVisibility={setDisciplineVisibility}
          />
        </div>

        <BimRightSidebar
          selection={selection}
          setSelection={setSelection}
          roomSelection={roomSelection}
          setRoomSelection={setRoomSelection}
          isolate={isolate}
          setIsolate={setIsolate}
          tab={tab}
          setTab={setTab}
          search={search}
          setSearch={setSearch}
          sidebarListRef={sidebarListRef}
          linkedRows={linkedRows}
          unassignedRows={unassignedRows}
          roomRows={roomRows}
          links={links}
          statusColorByCode={statusColorByCode}
          roomHealth={roomHealth}
          selectedElement={selectedElement}
          selectedSpace={selectedSpace}
          selectedRoomHealth={selectedRoomHealth}
          selectedLink={selectedLink}
          selectedEquipment={selectedEquipment}
          selectedOpenWRs={selectedOpenWRs}
          selectedSchedules={selectedSchedules}
          roomElements={roomElements}
          roomSchedules={roomSchedules}
          assignOpen={assignOpen}
          setAssignOpen={setAssignOpen}
          assignQuery={assignQuery}
          setAssignQuery={setAssignQuery}
          assignCandidates={assignCandidates}
          busy={busy}
          data={data}
          buildingId={buildingId}
          router={router}
          setWrPopup={setWrPopup}
          openFastJob={openFastJob}
          index={index}
          missing={missing}
          classificationByExpressId={classificationByExpressId}
          multiSelection={multiSelection}
          setMultiSelection={setMultiSelection}
          ghostRest={ghostRest}
          setGhostRest={setGhostRest}
          fitMultiSelection={fitMultiSelection}
          syncIfcSpecs={syncIfcSpecs}
          spaceWorldBox={spaceWorldBox}
          flyToRoom={flyToRoom}
          selectAndFly={selectAndFly}
          selectRoom={selectRoom}
          isolateTarget={isolateTarget}
          assignExisting={assignExisting}
          unassign={unassign}
          createNewEquipment={createNewEquipment}
        />
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
      <FastJobModal isOpen={fastJobOpen} onClose={closeFastJob} onSubmit={submitFastJob} initialLocation={fastJobLocation} prefill={fastJobPrefill} />
    </div>
  );
}
