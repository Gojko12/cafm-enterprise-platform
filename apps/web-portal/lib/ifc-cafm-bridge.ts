"use client";

/**
 * Client-side OpenBIM bridge between web-ifc and the CAFM domain model.
 *
 * - Initialises the `IfcAPI` strictly in the browser with WASM served from `/wasm/`
 *   so Next.js SSR builds never try to bundle WebAssembly.
 * - Parses IFCBUILDING / IFCBUILDINGSTOREY / IFCSPACE and every physical element,
 *   distinguishing the architectural shell from MEP / assignable equipment.
 * - Builds Three.js geometry per element for picking, X-Ray, slicing, and overlays.
 * - Caches downloaded `.ifc` buffers in IndexedDB keyed by (siteId, buildingId, updatedAt).
 */

import * as THREE from "three";
import * as WebIFC from "web-ifc";
import type { Equipment } from "@cafm/shared-schema";
import type { BimElementLink } from "./cafm-data";

export interface BimStorey {
  expressId: number;
  globalId: string;
  name: string;
  /** Model units (millimetres in Revit exports). */
  elevation: number;
}

export interface BimBox {
  min: [number, number, number];
  max: [number, number, number];
}

export interface BimSpace {
  expressId: number;
  globalId: string;
  /** Room code, e.g. `S01-B1-L0-R1` (Revit Number / IfcSpace Name). */
  code: string;
  /** Human-readable room name, e.g. `Chiller Room`. */
  longName: string;
  storeyName: string;
  bbox: BimBox | null;
}

export interface BimElement {
  expressId: number;
  globalId: string;
  name: string;
  typeName: string;
  ifcType: string;
  category: string;
  mark: string;
  storeyName: string;
  roomCode: string;
  isShell: boolean;
  isAssignable: boolean;
  bbox: BimBox | null;
  center: [number, number, number];
}

export interface BimModelIndex {
  buildingGlobalId: string;
  buildingName: string;
  storeys: BimStorey[];
  spaces: BimSpace[];
  elements: BimElement[];
}

export interface LoadedBimModel {
  index: BimModelIndex;
  /** Root group already rotated from IFC Z-up into Three.js Y-up. */
  group: THREE.Group;
  /** All pickable meshes of physical elements, keyed by expressID. */
  elementMeshes: Map<number, THREE.Mesh[]>;
  /** Translucent IfcSpace volumes (hidden by default), keyed by space expressID. */
  spaceMeshes: Map<number, THREE.Mesh[]>;
  dispose: () => void;
}

const SHELL_TYPES = new Set([
  "IFCWALL", "IFCWALLSTANDARDCASE", "IFCWALLELEMENTEDCASE", "IFCSLAB", "IFCCOVERING",
  "IFCDOOR", "IFCWINDOW", "IFCROOF", "IFCCOLUMN", "IFCBEAM", "IFCSTAIR", "IFCSTAIRFLIGHT",
  "IFCRAILING", "IFCCURTAINWALL", "IFCPLATE", "IFCMEMBER", "IFCFOOTING", "IFCRAMP",
  "IFCRAMPFLIGHT", "IFCCHIMNEY", "IFCSHADINGDEVICE",
]);

const ASSIGNABLE_TYPES = new Set([
  "IFCBUILDINGELEMENTPROXY", "IFCDISTRIBUTIONELEMENT", "IFCDISTRIBUTIONCONTROLELEMENT",
  "IFCDISTRIBUTIONFLOWELEMENT", "IFCENERGYCONVERSIONDEVICE", "IFCFURNISHINGELEMENT",
  "IFCTRANSPORTELEMENT", "IFCUNITARYEQUIPMENT", "IFCELECTRICAPPLIANCE", "IFCPUMP",
  "IFCFAN", "IFCVALVE", "IFCDAMPER", "IFCBOILER", "IFCCHILLER", "IFCSANITARYTERMINAL",
]);

const MEP_CATEGORY_HINTS = [
  "mechanical equipment", "electrical equipment", "duct accessories", "duct", "plumbing fixtures",
  "pipe accessories", "pipe", "fire alarm", "fire protection", "sprinklers", "air terminals",
  "lighting fixtures", "specialty equipment", "generic models", "communication devices",
  "data devices", "electrical fixtures", "security devices",
];

let ifcApiPromise: Promise<WebIFC.IfcAPI> | null = null;

/** Lazily initialises a shared IfcAPI instance. Must only be called in the browser. */
export function getIfcApi(): Promise<WebIFC.IfcAPI> {
  if (typeof window === "undefined") return Promise.reject(new Error("The IFC engine is browser-only."));
  if (!ifcApiPromise) {
    ifcApiPromise = (async () => {
      const api = new WebIFC.IfcAPI();
      api.SetWasmPath("/wasm/", true);
      await api.Init();
      return api;
    })().catch((error: unknown) => {
      ifcApiPromise = null;
      throw error;
    });
  }
  return ifcApiPromise;
}

function vectorToArray(vector: WebIFC.Vector<number>): number[] {
  const result: number[] = [];
  for (let index = 0; index < vector.size(); index++) result.push(vector.get(index));
  return result;
}

function text(value: unknown): string {
  if (value && typeof value === "object" && "value" in value) return String((value as { value: unknown }).value ?? "");
  return value === null || value === undefined ? "" : String(value);
}

function numeric(value: unknown): number {
  if (value && typeof value === "object" && "value" in value) return Number((value as { value: unknown }).value ?? 0);
  return Number(value ?? 0);
}

/** Collects single-value properties (Mark, Category, CAFM_Code, ...) per element. */
function collectElementProperties(api: WebIFC.IfcAPI, modelID: number): Map<number, Record<string, string>> {
  const properties = new Map<number, Record<string, string>>();
  const psetCache = new Map<number, Record<string, string>>();
  const relations = api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
  for (const relationId of vectorToArray(relations)) {
    const relation = api.GetLine(modelID, relationId);
    const definitionId: number | undefined = relation?.RelatingPropertyDefinition?.value;
    if (!definitionId) continue;
    let values = psetCache.get(definitionId);
    if (!values) {
      values = {};
      const pset = api.GetLine(modelID, definitionId);
      if (Array.isArray(pset?.HasProperties)) {
        for (const handle of pset.HasProperties) {
          if (!handle?.value) continue;
          const property = api.GetLine(modelID, handle.value);
          const name = text(property?.Name);
          if (name) values[name] = text(property?.NominalValue);
        }
      }
      psetCache.set(definitionId, values);
    }
    if (!Array.isArray(relation?.RelatedObjects)) continue;
    for (const related of relation.RelatedObjects) {
      if (!related?.value) continue;
      const existing = properties.get(related.value) ?? {};
      properties.set(related.value, { ...existing, ...values });
    }
  }
  return properties;
}

/** Maps element expressID -> containing spatial structure expressID (storey or space). */
function collectSpatialContainment(api: WebIFC.IfcAPI, modelID: number): Map<number, number> {
  const containment = new Map<number, number>();
  const relations = api.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
  for (const relationId of vectorToArray(relations)) {
    const relation = api.GetLine(modelID, relationId);
    const structureId: number | undefined = relation?.RelatingStructure?.value;
    if (!structureId || !Array.isArray(relation?.RelatedElements)) continue;
    for (const related of relation.RelatedElements) {
      if (related?.value) containment.set(related.value, structureId);
    }
  }
  return containment;
}

function buildBufferGeometry(api: WebIFC.IfcAPI, modelID: number, placed: WebIFC.PlacedGeometry): THREE.BufferGeometry {
  const geometry = api.GetGeometry(modelID, placed.geometryExpressID);
  const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
  const indices = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
  const positions = new Float32Array(vertices.length / 2);
  const normals = new Float32Array(vertices.length / 2);
  for (let index = 0; index < vertices.length; index += 6) {
    const target = index / 2;
    positions[target] = vertices[index];
    positions[target + 1] = vertices[index + 1];
    positions[target + 2] = vertices[index + 2];
    normals[target] = vertices[index + 3];
    normals[target + 1] = vertices[index + 4];
    normals[target + 2] = vertices[index + 5];
  }
  const buffer = new THREE.BufferGeometry();
  buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  buffer.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  buffer.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  const matrix = new THREE.Matrix4().fromArray(placed.flatTransformation);
  buffer.applyMatrix4(matrix);
  return buffer;
}

function toBimBox(box: THREE.Box3 | null): BimBox | null {
  if (!box || box.isEmpty()) return null;
  return { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] };
}

function pointInBox(point: [number, number, number], box: BimBox, marginXY = 1): boolean {
  return point[0] >= box.min[0] - marginXY && point[0] <= box.max[0] + marginXY &&
    point[1] >= box.min[1] - marginXY && point[1] <= box.max[1] + marginXY &&
    point[2] >= box.min[2] && point[2] <= box.max[2];
}

function pointInBoxXY(point: [number, number, number], box: BimBox, marginXY = 1): boolean {
  return point[0] >= box.min[0] - marginXY && point[0] <= box.max[0] + marginXY &&
    point[1] >= box.min[1] - marginXY && point[1] <= box.max[1] + marginXY;
}

/**
 * Loads a full IFC model: metadata index + Three.js render groups.
 * Must only run in the browser (web-ifc WASM).
 */
export async function loadBimModel(data: Uint8Array): Promise<LoadedBimModel> {
  const api = await getIfcApi();
  const modelID = api.OpenModel(data, { COORDINATE_TO_ORIGIN: false });
  try {
    // ---- Metadata ----
    let buildingGlobalId = "";
    let buildingName = "";
    for (const id of vectorToArray(api.GetLineIDsWithType(modelID, WebIFC.IFCBUILDING))) {
      const line = api.GetLine(modelID, id);
      buildingGlobalId = text(line?.GlobalId);
      buildingName = text(line?.Name) || text(line?.LongName);
      break;
    }

    const storeys: BimStorey[] = vectorToArray(api.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY)).map((id) => {
      const line = api.GetLine(modelID, id);
      return { expressId: id, globalId: text(line?.GlobalId), name: text(line?.Name) || text(line?.LongName), elevation: numeric(line?.Elevation) };
    }).sort((a, b) => a.elevation - b.elevation);
    const storeyNameById = new Map(storeys.map((storey) => [storey.expressId, storey.name]));

    const containment = collectSpatialContainment(api, modelID);
    const elementProperties = collectElementProperties(api, modelID);

    // ---- Geometry ----
    const group = new THREE.Group();
    group.name = "ifc-model";
    group.rotation.x = -Math.PI / 2; // IFC is Z-up; Three.js is Y-up.
    const elementMeshes = new Map<number, THREE.Mesh[]>();
    const spaceMeshes = new Map<number, THREE.Mesh[]>();
    const modelBoxes = new Map<number, THREE.Box3>();
    const disposables: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];

    const addMesh = (expressID: number, placed: WebIFC.PlacedGeometry, isSpace: boolean) => {
      const geometry = buildBufferGeometry(api, modelID, placed);
      const color = new THREE.Color(placed.color.x, placed.color.y, placed.color.z);
      const material = new THREE.MeshLambertMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: isSpace || placed.color.w < 1,
        opacity: isSpace ? 0.14 : placed.color.w < 1 ? placed.color.w : 1,
        depthWrite: !isSpace && placed.color.w >= 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.expressId = expressID;
      mesh.userData.isSpace = isSpace;
      group.add(mesh);
      disposables.push({ geometry, material });
      const target = isSpace ? spaceMeshes : elementMeshes;
      const list = target.get(expressID) ?? [];
      list.push(mesh);
      target.set(expressID, list);
      geometry.computeBoundingBox();
      if (geometry.boundingBox) {
        const box = modelBoxes.get(expressID) ?? new THREE.Box3();
        box.union(geometry.boundingBox);
        modelBoxes.set(expressID, box);
      }
    };

    api.StreamAllMeshes(modelID, (mesh: WebIFC.FlatMesh) => {
      for (let index = 0; index < mesh.geometries.size(); index++) {
        addMesh(mesh.expressID, mesh.geometries.get(index), false);
      }
    });
    api.StreamAllMeshesWithTypes(modelID, [WebIFC.IFCSPACE], (mesh: WebIFC.FlatMesh) => {
      for (let index = 0; index < mesh.geometries.size(); index++) {
        addMesh(mesh.expressID, mesh.geometries.get(index), true);
      }
    });
    for (const meshes of spaceMeshes.values()) for (const mesh of meshes) mesh.visible = false;

    // ---- Spaces ----
    const spaces: BimSpace[] = vectorToArray(api.GetLineIDsWithType(modelID, WebIFC.IFCSPACE)).map((id) => {
      const line = api.GetLine(modelID, id);
      const containerId = containment.get(id);
      const box = toBimBox(modelBoxes.get(id) ?? null);
      // Revit relates spaces to storeys through IfcRelAggregates; fall back to elevation.
      let storeyName = containerId ? storeyNameById.get(containerId) ?? "" : "";
      if (!storeyName && box) {
        const zMin = box.min[2];
        const candidates = storeys.filter((storey) => storey.elevation <= zMin + 10);
        storeyName = (candidates.length ? candidates[candidates.length - 1] : storeys[0])?.name ?? "";
      }
      return { expressId: id, globalId: text(line?.GlobalId), code: text(line?.Name), longName: text(line?.LongName), storeyName, bbox: box };
    });

    const resolveStorey = (expressId: number, center: [number, number, number]): string => {
      const containerId = containment.get(expressId);
      if (containerId && storeyNameById.has(containerId)) return storeyNameById.get(containerId) ?? "";
      const candidates = storeys.filter((storey) => storey.elevation <= center[2] + 10);
      return (candidates.length ? candidates[candidates.length - 1] : storeys[0])?.name ?? "";
    };

    const resolveRoom = (expressId: number, center: [number, number, number]): string => {
      const containerId = containment.get(expressId);
      const containedSpace = spaces.find((space) => space.expressId === containerId);
      if (containedSpace) return containedSpace.code;
      // 3D point-in-box: an above-ceiling fire damper still resolves to the room below it.
      const inside = spaces.filter((space) => space.bbox && pointInBox(center, space.bbox));
      if (inside.length) return inside[0].code;
      const sameColumn = spaces.filter((space) => space.bbox && pointInBoxXY(center, space.bbox));
      if (!sameColumn.length) return "";
      sameColumn.sort((a, b) => {
        const distance = (space: BimSpace) => Math.min(Math.abs(center[2] - space.bbox!.min[2]), Math.abs(center[2] - space.bbox!.max[2]));
        return distance(a) - distance(b);
      });
      return sameColumn[0].code;
    };

    // ---- Elements ----
    const elements: BimElement[] = [];
    for (const [expressId] of elementMeshes) {
      const line = api.GetLine(modelID, expressId);
      const typeCode = api.GetLineType(modelID, expressId);
      const ifcType = String(api.GetNameFromTypeCode(Number(typeCode)) ?? "").toUpperCase();
      if (ifcType === "IFCSPACE" || ifcType === "IFCOPENINGELEMENT" || ifcType === "IFCSITE" || ifcType === "IFCBUILDING" || ifcType === "IFCBUILDINGSTOREY") continue;
      const props = elementProperties.get(expressId) ?? {};
      const box = toBimBox(modelBoxes.get(expressId) ?? null);
      const center: [number, number, number] = box
        ? [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2]
        : [0, 0, 0];
      const category = props.Category ?? "";
      const categoryLower = category.toLowerCase();
      const isShell = SHELL_TYPES.has(ifcType);
      const isAssignable = !isShell && (
        ASSIGNABLE_TYPES.has(ifcType) || ifcType.startsWith("IFCFLOW") ||
        ifcType.startsWith("IFCDISTRIBUTION") || ifcType.startsWith("IFCENERGY") ||
        MEP_CATEGORY_HINTS.some((hint) => categoryLower.includes(hint))
      );
      elements.push({
        expressId,
        globalId: text(line?.GlobalId),
        name: text(line?.Name),
        typeName: text(line?.ObjectType) || text(line?.Name),
        ifcType,
        category,
        mark: (props.Mark ?? props.CAFM_Code ?? "").trim(),
        storeyName: resolveStorey(expressId, center),
        roomCode: resolveRoom(expressId, center),
        isShell,
        isAssignable,
        bbox: box,
        center,
      });
    }

    const index: BimModelIndex = { buildingGlobalId, buildingName, storeys, spaces, elements };
    const dispose = () => {
      for (const entry of disposables) {
        entry.geometry.dispose();
        entry.material.dispose();
      }
    };
    return { index, group, elementMeshes, spaceMeshes, dispose };
  } finally {
    api.CloseModel(modelID);
  }
}

// ---------------------------------------------------------------------------
// IndexedDB cache for downloaded .ifc buffers, keyed by (siteId, buildingId, updatedAt).
// ---------------------------------------------------------------------------

const BIM_DB_NAME = "cafm-bim-models";
const BIM_STORE = "models";

function openBimDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BIM_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BIM_STORE)) request.result.createObjectStore(BIM_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB is unavailable."));
  });
}

async function readCachedModel(key: string): Promise<{ updatedAt: string; buffer: ArrayBuffer } | null> {
  try {
    const database = await openBimDatabase();
    return await new Promise((resolve) => {
      const request = database.transaction(BIM_STORE, "readonly").objectStore(BIM_STORE).get(key);
      request.onsuccess = () => resolve((request.result as { updatedAt: string; buffer: ArrayBuffer } | undefined) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeCachedModel(key: string, updatedAt: string, buffer: ArrayBuffer): Promise<void> {
  try {
    const database = await openBimDatabase();
    await new Promise<void>((resolve) => {
      const transaction = database.transaction(BIM_STORE, "readwrite");
      transaction.objectStore(BIM_STORE).put({ updatedAt, buffer }, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  } catch {
    // Cache misses are non-fatal; the viewer falls back to the network copy.
  }
}

/** Downloads a model (or reuses the IndexedDB copy when `updatedAt` matches). */
export async function fetchIfcBuffer(siteId: string, buildingId: string, updatedAt: string): Promise<Uint8Array> {
  const key = `${siteId}__${buildingId}`;
  const cached = await readCachedModel(key);
  if (cached && cached.updatedAt === updatedAt) return new Uint8Array(cached.buffer);
  const response = await fetch(`/api/bim-models?siteId=${encodeURIComponent(siteId)}&buildingId=${encodeURIComponent(buildingId)}&download=1`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not download the .ifc model for ${buildingId}.`);
  const buffer = await response.arrayBuffer();
  const stamp = response.headers.get("X-BIM-Updated-At") ?? updatedAt;
  await writeCachedModel(key, stamp, buffer);
  return new Uint8Array(buffer);
}

// ---------------------------------------------------------------------------
// CAFM linkage helpers
// ---------------------------------------------------------------------------

export function bimLinkKey(buildingId: string, ifcGlobalId: string): string {
  return `${buildingId}:${ifcGlobalId}`;
}

export interface ResolvedBimLink {
  element: BimElement;
  equipmentCode: string;
  source: "manual" | "mark";
}

/**
 * Resolves the effective EQ ID per IFC element: a manual in-app assignment from
 * `bimElementLinks` always wins; otherwise a Revit `Mark` matching an existing
 * site EquipmentCode binds automatically.
 */
export function resolveElementLinks(
  elements: BimElement[],
  buildingId: string,
  equipment: Equipment[],
  bimElementLinks: Record<string, BimElementLink> | undefined,
): Map<number, ResolvedBimLink> {
  const equipmentCodes = new Set(equipment.map((asset) => asset.EquipmentCode));
  const links = new Map<number, ResolvedBimLink>();
  for (const element of elements) {
    const manual = bimElementLinks?.[bimLinkKey(buildingId, element.globalId)];
    if (manual && equipmentCodes.has(manual.equipmentCode)) {
      links.set(element.expressId, { element, equipmentCode: manual.equipmentCode, source: "manual" });
      continue;
    }
    if (element.mark && equipmentCodes.has(element.mark)) {
      links.set(element.expressId, { element, equipmentCode: element.mark, source: "mark" });
    }
  }
  return links;
}

export interface MissingSyncItems {
  floors: BimStorey[];
  rooms: BimSpace[];
  taggedAssets: BimElement[];
}

/** Floors / IfcSpace rooms / Mark-coded elements present in the IFC but absent from CAFM. */
export function findMissingSyncItems(
  index: BimModelIndex,
  buildingId: string,
  data: { floors: { bl_id: string; LevelName: string }[]; rooms: { bl_id: string; RoomCode: string }[]; equipment: Equipment[] },
): MissingSyncItems {
  const floorNames = new Set(data.floors.filter((floor) => floor.bl_id === buildingId).map((floor) => floor.LevelName));
  const roomCodes = new Set(data.rooms.filter((room) => room.bl_id === buildingId).map((room) => room.RoomCode));
  const equipmentCodes = new Set(data.equipment.map((asset) => asset.EquipmentCode));
  return {
    floors: index.storeys.filter((storey) => storey.name && !floorNames.has(storey.name)),
    rooms: index.spaces.filter((space) => space.code && !roomCodes.has(space.code)),
    taggedAssets: index.elements.filter((element) => element.mark && !equipmentCodes.has(element.mark)),
  };
}

/** Auto-generates the next sequential 10-digit EquipmentCode (`0000000001`+). */
export function nextSequentialEquipmentCode(equipment: { EquipmentCode: string }[]): string {
  let max = 0;
  for (const asset of equipment) {
    if (/^\d{10}$/.test(asset.EquipmentCode)) max = Math.max(max, Number(asset.EquipmentCode));
  }
  return String(max + 1).padStart(10, "0");
}

/** Best-effort mapping from a Revit category / IFC type to a CAFM equipment Category code. */
export function suggestEquipmentCategory(element: BimElement): "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "K" | "L" | "M" | "O" | "P" | "Q" | undefined {
  const haystack = `${element.category} ${element.typeName} ${element.name}`.toLowerCase();
  if (/(fire|damper|sprinkler|smoke)/.test(haystack)) return "F";
  if (/(chiller|cooling|cool)/.test(haystack)) return "C";
  if (/(ahu|air handling|hvac|vent|air cond|heat pump)/.test(haystack)) return "A";
  if (/(boiler|heating|radiator)/.test(haystack)) return "H";
  if (/(ups|electrical|generator|panel|switch)/.test(haystack)) return "E";
  if (/(drain|sewer|water|plumb|sanitary)/.test(haystack)) return "D";
  if (/(lift|elevator|escalator|transport)/.test(haystack)) return "L";
  if (/(pump|compress)/.test(haystack)) return element.category.toLowerCase().includes("compressed") ? "P" : "M";
  if (/(kitchen|catering)/.test(haystack)) return "K";
  return element.isAssignable ? "M" : undefined;
}

/** Suggested trade for a new CAFM equipment created from an IFC element. */
export function suggestEquipmentTrade(element: BimElement): string {
  const haystack = `${element.category} ${element.typeName} ${element.name}`.toLowerCase();
  if (/(electrical|ups|generator|lighting|panel|data|communication)/.test(haystack)) return "Electrical";
  if (/(wall|slab|door|window|roof|ceiling|civil)/.test(haystack)) return "Civil";
  return "Mechanical";
}
