"use client";

/**
 * Client-side OpenBIM bridge between web-ifc and the CAFM domain model.
 *
 * - Initialises the `IfcAPI` strictly in the browser with WASM served from `/wasm/`
 *   so Next.js SSR builds never try to bundle WebAssembly.
 * - web-ifc's `flatTransformation` matrices ALREADY convert IFC Z-up model
 *   coordinates into Three.js Y-up meters (verified against S01-BL-1.ifc: floor
 *   slabs stack at Y = 0 m / 4 m / 8 m / 12 m), so NO extra axis rotation is applied.
 * - Walks IFCRELAGGREGATES (Building -> Storey -> Space) and
 *   IFCRELCONTAINEDINSPATIALSTRUCTURE (Storey / Space -> Elements) first, then
 *   falls back to 3D point-in-box math in the same upright Y-up meter space.
 * - Converts raw IfcBuildingStorey.Elevation values through the project length
 *   unit (mm / ft / m) and cross-checks them against observed slab/space geometry.
 * - Batches architectural shell and passive duct/pipe distribution geometry per
 *   (storey, colour) so 67MB+ models render at 60 FPS, while MEP equipment and
 *   IfcSpace volumes stay individually pickable. Batched meshes carry a
 *   triangle-range -> expressID lookup for picking.
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
  /** World Y elevation in meters (unit-converted and geometry-cross-checked). */
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

export interface BatchRange {
  /** Start offset into the geometry index buffer. */
  start: number;
  count: number;
  expressId: number;
}

export interface LoadedBimModel {
  index: BimModelIndex;
  /** Root group, translated so the model is centred in X/Z with minY = 0. */
  group: THREE.Group;
  /** Individually pickable meshes of MEP / assignable elements, keyed by expressID. */
  elementMeshes: Map<number, THREE.Mesh[]>;
  /** Translucent IfcSpace volumes (hidden by default), keyed by space expressID. */
  spaceMeshes: Map<number, THREE.Mesh[]>;
  /** Merged shell / passive-distribution meshes with triangle-range lookups. */
  batchedMeshes: THREE.Mesh[];
  /** Shifted world-space bounds of the core building cluster (outliers excluded). */
  framingBounds: BimBox;
  /** Total meshes added to the group (batched + individual + spaces). */
  meshCount: number;
  /** Elements discarded as spatial outliers (>500 m from the core cluster). */
  discardedOutliers: number;
  /** False when batching threw and individual meshes were used instead. */
  batched: boolean;
  dispose: () => void;
}

const SHELL_TYPES = new Set([
  "IFCWALL", "IFCWALLSTANDARDCASE", "IFCWALLELEMENTEDCASE", "IFCSLAB", "IFCCOVERING",
  "IFCDOOR", "IFCWINDOW", "IFCROOF", "IFCCOLUMN", "IFCBEAM", "IFCSTAIR", "IFCSTAIRFLIGHT",
  "IFCRAILING", "IFCCURTAINWALL", "IFCPLATE", "IFCMEMBER", "IFCFOOTING", "IFCRAMP",
  "IFCRAMPFLIGHT", "IFCCHIMNEY", "IFCSHADINGDEVICE",
]);

const ASSIGNABLE_TYPES = new Set([
  "IFCDISTRIBUTIONELEMENT", "IFCDISTRIBUTIONCONTROLELEMENT", "IFCDISTRIBUTIONFLOWELEMENT",
  "IFCENERGYCONVERSIONDEVICE", "IFCTRANSPORTELEMENT", "IFCUNITARYEQUIPMENT",
  "IFCELECTRICAPPLIANCE", "IFCPUMP", "IFCFAN", "IFCVALVE", "IFCDAMPER", "IFCBOILER",
  "IFCCHILLER", "IFCSANITARYTERMINAL", "IFCAIRTERMINAL", "IFCAIRTERMINALBOX",
  "IFCFLOWTERMINAL", "IFCFLOWMOVINGDEVICE", "IFCFLOWCONTROLLER",
  "IFCAIRTOAIRHEATRECOVERY", "IFCCOOLINGTOWER", "IFCCOIL", "IFCCOMPRESSOR",
]);

/** Passive distribution runs are batched, never individually assignable. */
const PASSIVE_DISTRIBUTION_TYPES = new Set([
  "IFCDUCTSEGMENT", "IFCDUCTFITTING", "IFCPIPESEGMENT", "IFCPIPEFITTING",
  "IFCCABLECARRIERSEGMENT", "IFCCABLECARRIERFITTING", "IFCCABLESEGMENT",
  "IFCFLOWSEGMENT", "IFCFLOWFITTING",
]);

/** Elements whose centre lies further than this from the core P5–P95 cluster are dropped. */
const OUTLIER_DISTANCE_M = 500;

const MEP_CATEGORY_HINTS = [
  "mechanical equipment", "electrical equipment", "duct accessories", "plumbing fixtures",
  "pipe accessories", "fire alarm", "fire protection", "sprinklers", "air terminals",
  "lighting fixtures", "specialty equipment", "communication devices",
  "data devices", "electrical fixtures", "security devices",
];

/** Generic proxies only count as assignable equipment when they look like plant/MEP. */
const PROXY_EQUIPMENT_NAME = /(chiller|ahu|air handling|heat recovery|hru|pump|boiler|fan coil|\bfan\b|vav|generator|\bups\b|damper|hood|compressor|drain|extraction|crane|lift controller|hvac|heat pump|condenser|cooling tower|unit heater|water heater|rooftop unit|exhaust)/i;

let ifcApiPromise: Promise<WebIFC.IfcAPI> | null = null;

/** Lazily initialises a shared IfcAPI instance. Must only be called in the browser. */
export function getIfcApi(): Promise<WebIFC.IfcAPI> {
  if (typeof window === "undefined") return Promise.reject(new Error("The IFC engine is browser-only."));
  if (!ifcApiPromise) {
    ifcApiPromise = (async () => {
      const api = new WebIFC.IfcAPI();
      api.SetWasmPath("/wasm/", true);
      await api.Init();
      // Silence non-fatal geometry warnings (e.g. Model Lines without meshes) on big models.
      try { api.SetLogLevel(WebIFC.LogLevel.LOG_LEVEL_OFF); } catch { /* older web-ifc builds */ }
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

/**
 * Scale factor converting raw IFC length attribute values (e.g. storey Elevation)
 * into meters. Geometry from web-ifc is already meter-scaled; this is only for
 * raw attributes. Supports SI prefixes (mm/cm/dm) and imperial FOOT/INCH units.
 */
function lengthUnitScale(api: WebIFC.IfcAPI, modelID: number): number {
  let scale = 1;
  for (const id of vectorToArray(api.GetLineIDsWithType(modelID, WebIFC.IFCSIUNIT))) {
    const unit = api.GetLine(modelID, id);
    if (text(unit?.UnitType) !== "LENGTHUNIT") continue;
    const prefix = text(unit?.Prefix);
    scale = prefix === "MILLI" ? 0.001 : prefix === "CENTI" ? 0.01 : prefix === "DECI" ? 0.1 : 1;
  }
  for (const id of vectorToArray(api.GetLineIDsWithType(modelID, WebIFC.IFCCONVERSIONBASEDUNIT))) {
    const unit = api.GetLine(modelID, id);
    if (text(unit?.UnitType) !== "LENGTHUNIT") continue;
    const name = text(unit?.Name).toUpperCase();
    if (name.includes("FOOT") || name.includes("FEET")) scale = 0.3048;
    else if (name.includes("INCH")) scale = 0.0254;
  }
  return scale;
}

/** Collects single-value properties (Mark, Category, CAFM_Code, ...) per element. */
function collectElementProperties(api: WebIFC.IfcAPI, modelID: number): Map<number, Record<string, string>> {
  const properties = new Map<number, Record<string, string>>();
  const psetCache = new Map<number, Record<string, string>>();
  for (const relationId of vectorToArray(api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES))) {
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
          if (name === "Mark" || name === "CAFM_Code" || name === "Category") values[name] = text(property?.NominalValue);
        }
      }
      psetCache.set(definitionId, values);
    }
    if (!Object.keys(values).length || !Array.isArray(relation?.RelatedObjects)) continue;
    for (const related of relation.RelatedObjects) {
      if (!related?.value) continue;
      const existing = properties.get(related.value) ?? {};
      properties.set(related.value, { ...existing, ...values });
    }
  }
  return properties;
}

/** element -> containing spatial structure (storey or space), from explicit Revit links. */
function collectSpatialContainment(api: WebIFC.IfcAPI, modelID: number): Map<number, number> {
  const containment = new Map<number, number>();
  for (const relationId of vectorToArray(api.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE))) {
    const relation = api.GetLine(modelID, relationId);
    const structureId: number | undefined = relation?.RelatingStructure?.value;
    if (!structureId || !Array.isArray(relation?.RelatedElements)) continue;
    for (const related of relation.RelatedElements) {
      if (related?.value) containment.set(related.value, structureId);
    }
  }
  return containment;
}

/** child -> parent in the IfcProject/Site/Building/Storey/Space aggregation tree. */
function collectAggregates(api: WebIFC.IfcAPI, modelID: number): Map<number, number> {
  const parents = new Map<number, number>();
  for (const relationId of vectorToArray(api.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES))) {
    const relation = api.GetLine(modelID, relationId);
    const parent: number | undefined = relation?.RelatingObject?.value;
    if (!parent || !Array.isArray(relation?.RelatedObjects)) continue;
    for (const child of relation.RelatedObjects) {
      if (child?.value) parents.set(child.value, parent);
    }
  }
  return parents;
}

interface GeometryChunk {
  positions: Float32Array; // world-space (Y-up meters), transform already applied
  normals: Float32Array;
  indices: Uint32Array;
  colorKey: number;
  alpha: number;
  /** True when any source normal was zero / non-finite and must be recomputed. */
  needsNormals: boolean;
}

function extractChunk(api: WebIFC.IfcAPI, modelID: number, placed: WebIFC.PlacedGeometry): GeometryChunk | null {
  const m = placed.flatTransformation;
  if (!m || m.length < 16) return null;
  for (let i = 0; i < 16; i++) if (!Number.isFinite(m[i])) return null;
  const geometry = api.GetGeometry(modelID, placed.geometryExpressID);
  const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
  const sourceIndices = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
  const count = Math.floor(vertices.length / 6);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const valid = new Uint8Array(count);
  let needsNormals = false;
  for (let v = 0; v < count; v++) {
    const px = vertices[v * 6], py = vertices[v * 6 + 1], pz = vertices[v * 6 + 2];
    const nx = vertices[v * 6 + 3], ny = vertices[v * 6 + 4], nz = vertices[v * 6 + 5];
    const x = m[0] * px + m[4] * py + m[8] * pz + m[12];
    const y = m[1] * px + m[5] * py + m[9] * pz + m[13];
    const z = m[2] * px + m[6] * py + m[10] * pz + m[14];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    valid[v] = 1;
    positions[v * 3] = x;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = z;
    // Rigid placement matrices: the rotation part transforms normals directly.
    const wx = m[0] * nx + m[4] * ny + m[8] * nz;
    const wy = m[1] * nx + m[5] * ny + m[9] * nz;
    const wz = m[2] * nx + m[6] * ny + m[10] * nz;
    const length = Math.hypot(wx, wy, wz);
    if (!Number.isFinite(length) || length < 1e-9) {
      needsNormals = true;
      continue;
    }
    normals[v * 3] = wx / length;
    normals[v * 3 + 1] = wy / length;
    normals[v * 3 + 2] = wz / length;
  }
  const kept: number[] = [];
  for (let t = 0; t + 2 < sourceIndices.length; t += 3) {
    const a = sourceIndices[t], b = sourceIndices[t + 1], c = sourceIndices[t + 2];
    if (a >= count || b >= count || c >= count || !valid[a] || !valid[b] || !valid[c]) continue;
    kept.push(a, b, c);
  }
  if (!kept.length) return null;
  const color = new THREE.Color(placed.color.x, placed.color.y, placed.color.z);
  return { positions, normals, indices: Uint32Array.from(kept), colorKey: color.getHex(), alpha: placed.color.w, needsNormals };
}

/** Expands a box only with vertices actually referenced by the chunk's triangles. */
function expandBoxWithChunk(box: { min: number[]; max: number[] }, chunk: GeometryChunk) {
  for (let i = 0; i < chunk.indices.length; i++) {
    const base = chunk.indices[i] * 3;
    for (let axis = 0; axis < 3; axis++) {
      const value = chunk.positions[base + axis];
      if (value < box.min[axis]) box.min[axis] = value;
      if (value > box.max[axis]) box.max[axis] = value;
    }
  }
}

function freshBox() {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

function toBimBox(box: { min: number[]; max: number[] }): BimBox | null {
  if (!Number.isFinite(box.min[0]) || !Number.isFinite(box.max[0])) return null;
  return { min: [box.min[0], box.min[1], box.min[2]], max: [box.max[0], box.max[1], box.max[2]] };
}

/** 3D containment in upright Y-up meters: X/Z are the ground plane, Y is height. */
function pointInBox(point: [number, number, number], box: BimBox, marginXZ = 0.05): boolean {
  return point[0] >= box.min[0] - marginXZ && point[0] <= box.max[0] + marginXZ &&
    point[2] >= box.min[2] - marginXZ && point[2] <= box.max[2] + marginXZ &&
    point[1] >= box.min[1] - 0.01 && point[1] <= box.max[1] + 0.01;
}

function pointInBoxXZ(point: [number, number, number], box: BimBox, marginXZ = 0.05): boolean {
  return point[0] >= box.min[0] - marginXZ && point[0] <= box.max[0] + marginXZ &&
    point[2] >= box.min[2] - marginXZ && point[2] <= box.max[2] + marginXZ;
}

function mergeChunks(chunks: GeometryChunk[], withRanges?: number[]): { geometry: THREE.BufferGeometry; ranges: BatchRange[] } {
  let vertexTotal = 0, indexTotal = 0;
  for (const chunk of chunks) { vertexTotal += chunk.positions.length; indexTotal += chunk.indices.length; }
  const positions = new Float32Array(vertexTotal);
  const normals = new Float32Array(vertexTotal);
  const indices = new Uint32Array(indexTotal);
  const ranges: BatchRange[] = [];
  let vertexOffset = 0, indexOffset = 0;
  chunks.forEach((chunk, chunkIndex) => {
    positions.set(chunk.positions, vertexOffset);
    normals.set(chunk.normals, vertexOffset);
    const base = vertexOffset / 3;
    for (let i = 0; i < chunk.indices.length; i++) indices[indexOffset + i] = chunk.indices[i] + base;
    if (withRanges) {
      const expressId = withRanges[chunkIndex];
      const last = ranges[ranges.length - 1];
      if (last && last.expressId === expressId) last.count += chunk.indices.length;
      else ranges.push({ start: indexOffset, count: chunk.indices.length, expressId });
    }
    vertexOffset += chunk.positions.length;
    indexOffset += chunk.indices.length;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  // Always 32-bit indices: merged batches regularly exceed 65,535 vertices.
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  if (chunks.some((chunk) => chunk.needsNormals)) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, ranges };
}

/**
 * Loads a full IFC model: metadata index + batched Three.js render groups.
 * Must only run in the browser (web-ifc WASM).
 */
export async function loadBimModel(data: Uint8Array, onProgress?: (stage: string) => void): Promise<LoadedBimModel> {
  const api = await getIfcApi();
  onProgress?.("Decompressing & parsing IFC…");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const modelID = api.OpenModel(data, { COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true } as WebIFC.LoaderSettings);
  try {
    // ---- Metadata & spatial tree ----
    const unitScale = lengthUnitScale(api, modelID);
    let buildingGlobalId = "";
    let buildingName = "";
    for (const id of vectorToArray(api.GetLineIDsWithType(modelID, WebIFC.IFCBUILDING))) {
      const line = api.GetLine(modelID, id);
      if (!buildingGlobalId) {
        buildingGlobalId = text(line?.GlobalId);
        buildingName = text(line?.Name) || text(line?.LongName);
      }
    }

    // Raw storeys (large merged exports can contain duplicate storey sets; dedupe by name).
    const storeyById = new Map<number, { globalId: string; name: string; rawElevation: number }>();
    for (const id of vectorToArray(api.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY))) {
      const line = api.GetLine(modelID, id);
      storeyById.set(id, { globalId: text(line?.GlobalId), name: text(line?.Name) || text(line?.LongName), rawElevation: numeric(line?.Elevation) });
    }

    const aggregateParent = collectAggregates(api, modelID);
    const containment = collectSpatialContainment(api, modelID);
    const elementProperties = collectElementProperties(api, modelID);

    const storeyNameOfStructure = (structureId: number | undefined): string => {
      let cursor = structureId;
      for (let hops = 0; cursor !== undefined && hops < 8; hops++) {
        const storey = storeyById.get(cursor);
        if (storey) return storey.name;
        cursor = aggregateParent.get(cursor);
      }
      return "";
    };

    // ---- Geometry extraction (world Y-up meters, transforms baked in) ----
    onProgress?.("Building 3D scene…");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const elementChunks = new Map<number, GeometryChunk[]>();
    const spaceChunks = new Map<number, GeometryChunk[]>();
    const elementBoxes = new Map<number, { min: number[]; max: number[] }>();
    const spaceBoxes = new Map<number, { min: number[]; max: number[] }>();
    const overall = freshBox();

    api.StreamAllMeshes(modelID, (mesh: WebIFC.FlatMesh) => {
      const chunks: GeometryChunk[] = [];
      const box = elementBoxes.get(mesh.expressID) ?? freshBox();
      for (let index = 0; index < mesh.geometries.size(); index++) {
        const chunk = extractChunk(api, modelID, mesh.geometries.get(index));
        if (!chunk) continue;
        expandBoxWithChunk(box, chunk);
        chunks.push(chunk);
      }
      if (!chunks.length || !Number.isFinite(box.min[0] + box.max[0] + box.min[1] + box.max[1] + box.min[2] + box.max[2])) return;
      elementBoxes.set(mesh.expressID, box);
      elementChunks.set(mesh.expressID, [...(elementChunks.get(mesh.expressID) ?? []), ...chunks]);
    });
    api.StreamAllMeshesWithTypes(modelID, [WebIFC.IFCSPACE], (mesh: WebIFC.FlatMesh) => {
      const chunks: GeometryChunk[] = [];
      const box = spaceBoxes.get(mesh.expressID) ?? freshBox();
      for (let index = 0; index < mesh.geometries.size(); index++) {
        const chunk = extractChunk(api, modelID, mesh.geometries.get(index));
        if (!chunk) continue;
        expandBoxWithChunk(box, chunk);
        chunks.push(chunk);
      }
      if (!chunks.length || !Number.isFinite(box.min[0] + box.max[0] + box.min[1] + box.max[1] + box.min[2] + box.max[2])) return;
      spaceBoxes.set(mesh.expressID, box);
      spaceChunks.set(mesh.expressID, [...(spaceChunks.get(mesh.expressID) ?? []), ...chunks]);
    });

    // ---- Outlier-resistant core cluster: P5–P95 of element centres, padded by 500 m ----
    const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
    const centreOf = (box: { min: number[]; max: number[] }, axis: number) => (box.min[axis] + box.max[axis]) / 2;
    const clusterLow = [0, 0, 0], clusterHigh = [0, 0, 0];
    if (elementBoxes.size) {
      for (let axis = 0; axis < 3; axis++) {
        const sorted = [...elementBoxes.values()].map((box) => centreOf(box, axis)).sort((a, b) => a - b);
        clusterLow[axis] = percentile(sorted, 0.05) - OUTLIER_DISTANCE_M;
        clusterHigh[axis] = percentile(sorted, 0.95) + OUTLIER_DISTANCE_M;
      }
    }
    const inCluster = (box: { min: number[]; max: number[] }) =>
      [0, 1, 2].every((axis) => centreOf(box, axis) >= clusterLow[axis] && centreOf(box, axis) <= clusterHigh[axis]);
    let discardedOutliers = 0;
    for (const [expressId, box] of [...elementBoxes]) {
      if (inCluster(box)) continue;
      elementBoxes.delete(expressId);
      elementChunks.delete(expressId);
      discardedOutliers++;
    }
    for (const [expressId, box] of [...spaceBoxes]) {
      if (inCluster(box)) continue;
      spaceBoxes.delete(expressId);
      spaceChunks.delete(expressId);
    }
    for (const box of elementBoxes.values()) {
      for (let axis = 0; axis < 3; axis++) {
        overall.min[axis] = Math.min(overall.min[axis], box.min[axis]);
        overall.max[axis] = Math.max(overall.max[axis], box.max[axis]);
      }
    }

    // ---- Storey elevations in meters, cross-checked against assigned geometry ----
    const observedMin = new Map<string, number>();
    const observe = (name: string, minY: number) => {
      if (!name || !Number.isFinite(minY)) return;
      observedMin.set(name, Math.min(observedMin.get(name) ?? Infinity, minY));
    };
    for (const [spaceId, box] of spaceBoxes) observe(storeyNameOfStructure(aggregateParent.get(spaceId)), box.min[1]);
    for (const [elementId, structureId] of containment) {
      const storey = storeyById.get(structureId);
      if (!storey) continue;
      const box = elementBoxes.get(elementId);
      if (box) observe(storey.name, box.min[1]);
    }
    const storeyMap = new Map<string, BimStorey>();
    for (const [id, raw] of storeyById) {
      const scaled = raw.rawElevation * unitScale;
      const observed = observedMin.get(raw.name);
      const elevation = observed !== undefined && Math.abs(observed - scaled) > 1 ? observed : scaled;
      const existing = storeyMap.get(raw.name);
      if (!existing || elevation < existing.elevation) {
        storeyMap.set(raw.name, { expressId: id, globalId: raw.globalId, name: raw.name, elevation });
      }
    }
    const storeys = [...storeyMap.values()].sort((a, b) => a.elevation - b.elevation);

    // ---- Spaces ----
    const spaces: BimSpace[] = [];
    const spaceById = new Map<number, BimSpace>();
    for (const id of vectorToArray(api.GetLineIDsWithType(modelID, WebIFC.IFCSPACE))) {
      const line = api.GetLine(modelID, id);
      const box = spaceBoxes.get(id);
      let storeyName = storeyNameOfStructure(aggregateParent.get(id));
      if (!storeyName && box) {
        const below = storeys.filter((storey) => storey.elevation <= box.min[1] + 0.3);
        storeyName = (below.length ? below[below.length - 1] : storeys[0])?.name ?? "";
      }
      const space: BimSpace = {
        expressId: id, globalId: text(line?.GlobalId), code: text(line?.Name), longName: text(line?.LongName),
        storeyName, bbox: box ? toBimBox(box) : null,
      };
      spaces.push(space);
      spaceById.set(id, space);
    }

    const resolveStorey = (expressId: number, center: [number, number, number]): string => {
      const structureId = containment.get(expressId);
      if (structureId !== undefined) {
        const viaSpace = spaceById.get(structureId);
        if (viaSpace?.storeyName) return viaSpace.storeyName;
        const name = storeyNameOfStructure(structureId);
        if (name) return name;
      }
      const below = storeys.filter((storey) => storey.elevation <= center[1] + 0.3);
      return (below.length ? below[below.length - 1] : storeys[0])?.name ?? "";
    };

    const resolveRoom = (expressId: number, center: [number, number, number], storeyName: string): string => {
      const structureId = containment.get(expressId);
      const direct = structureId !== undefined ? spaceById.get(structureId) : undefined;
      if (direct) return direct.code;
      // 3D point-in-box in the same upright meter space (handles ceiling-void gear).
      const inside = spaces.filter((space) => space.bbox && pointInBox(center, space.bbox));
      if (inside.length) return (inside.find((space) => space.storeyName === storeyName) ?? inside[0]).code;
      const column = spaces.filter((space) => space.bbox && pointInBoxXZ(center, space.bbox));
      if (!column.length) return "";
      const gap = (space: BimSpace) => Math.min(Math.abs(center[1] - space.bbox!.min[1]), Math.abs(center[1] - space.bbox!.max[1]));
      const sameStorey = column.filter((space) => space.storeyName === storeyName);
      const pool = sameStorey.length ? sameStorey : column;
      pool.sort((a, b) => gap(a) - gap(b));
      return pool[0].code;
    };

    // ---- Element classification & index ----
    const elements: BimElement[] = [];
    const elementById = new Map<number, BimElement>();
    for (const [expressId] of elementChunks) {
      const typeCode = api.GetLineType(modelID, expressId);
      const ifcType = String(api.GetNameFromTypeCode(Number(typeCode)) ?? "").toUpperCase();
      if (["IFCSPACE", "IFCOPENINGELEMENT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY"].includes(ifcType)) continue;
      const line = api.GetLine(modelID, expressId);
      const props = elementProperties.get(expressId) ?? {};
      const box = elementBoxes.get(expressId)!;
      const center: [number, number, number] = [
        (box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2,
      ];
      const name = text(line?.Name);
      const typeName = text(line?.ObjectType) || name;
      const category = props.Category ?? "";
      const mark = (props.Mark ?? props.CAFM_Code ?? "").trim();
      const categoryLower = category.toLowerCase();
      const isShell = SHELL_TYPES.has(ifcType);
      const isPassive = PASSIVE_DISTRIBUTION_TYPES.has(ifcType);
      const hinted = MEP_CATEGORY_HINTS.some((hint) => categoryLower.includes(hint));
      const isAssignable = !isShell && !isPassive && (
        ifcType === "IFCBUILDINGELEMENTPROXY"
          ? Boolean(mark) || hinted || PROXY_EQUIPMENT_NAME.test(`${name} ${typeName}`)
          : ASSIGNABLE_TYPES.has(ifcType) || ifcType.startsWith("IFCENERGY") || hinted
      );
      const storeyName = resolveStorey(expressId, center);
      const element: BimElement = {
        expressId,
        globalId: text(line?.GlobalId),
        name,
        typeName,
        ifcType,
        category,
        mark,
        storeyName,
        roomCode: resolveRoom(expressId, center, storeyName),
        isShell,
        isAssignable,
        bbox: toBimBox(box),
        center,
      };
      elements.push(element);
      elementById.set(expressId, element);
    }

    // ---- Scene assembly: centre near origin with minY = 0 ----
    const group = new THREE.Group();
    group.name = "ifc-model";
    if (Number.isFinite(overall.min[0])) {
      group.position.set(
        -(overall.min[0] + overall.max[0]) / 2,
        -overall.min[1],
        -(overall.min[2] + overall.max[2]) / 2,
      );
    }
    const elementMeshes = new Map<number, THREE.Mesh[]>();
    const spaceMeshes = new Map<number, THREE.Mesh[]>();
    const batchedMeshes: THREE.Mesh[] = [];
    const disposables: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];

    const addIndividualMesh = (expressId: number, chunk: GeometryChunk, isSpace: boolean) => {
      const { geometry } = mergeChunks([chunk]);
      const material = new THREE.MeshLambertMaterial({
        color: chunk.colorKey,
        side: THREE.DoubleSide,
        transparent: isSpace || chunk.alpha < 1,
        opacity: isSpace ? 0.14 : chunk.alpha < 1 ? chunk.alpha : 1,
        depthWrite: !isSpace && chunk.alpha >= 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.expressId = expressId;
      mesh.userData.isSpace = isSpace;
      group.add(mesh);
      disposables.push({ geometry, material });
      const target = isSpace ? spaceMeshes : elementMeshes;
      target.set(expressId, [...(target.get(expressId) ?? []), mesh]);
    };

    // Batch shell + passive distribution per (storey, colour); keep equipment individual.
    const batches = new Map<string, { chunks: GeometryChunk[]; owners: number[]; colorKey: number; alpha: number; storeyName: string }>();
    for (const [expressId, chunks] of elementChunks) {
      const element = elementById.get(expressId);
      if (!element) continue;
      if (element.isAssignable) {
        for (const chunk of chunks) addIndividualMesh(expressId, chunk, false);
        continue;
      }
      for (const chunk of chunks) {
        const alphaKey = chunk.alpha < 1 ? "t" : "o";
        const key = `${element.storeyName}|${chunk.colorKey}|${alphaKey}`;
        const batch = batches.get(key) ?? { chunks: [], owners: [], colorKey: chunk.colorKey, alpha: chunk.alpha, storeyName: element.storeyName };
        batch.chunks.push(chunk);
        batch.owners.push(expressId);
        batches.set(key, batch);
      }
    }
    let batchingWorked = true;
    for (const batch of batches.values()) {
      try {
        const { geometry, ranges } = mergeChunks(batch.chunks, batch.owners);
        if (!geometry.boundingSphere || !Number.isFinite(geometry.boundingSphere.radius)) {
          geometry.dispose();
          throw new Error("Merged batch has a non-finite bounding sphere.");
        }
        const material = new THREE.MeshLambertMaterial({
          color: batch.colorKey,
          side: THREE.DoubleSide,
          transparent: batch.alpha < 1,
          opacity: batch.alpha < 1 ? batch.alpha : 1,
          depthWrite: batch.alpha >= 1,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.batched = true;
        mesh.userData.storeyName = batch.storeyName;
        mesh.userData.ranges = ranges;
        group.add(mesh);
        batchedMeshes.push(mesh);
        disposables.push({ geometry, material });
      } catch (batchError) {
        console.warn("BIM batching failed; falling back to individual meshes.", batchError);
        batchingWorked = false;
        batch.chunks.forEach((chunk, chunkIndex) => {
          try { addIndividualMesh(batch.owners[chunkIndex], chunk, false); } catch { /* skip unrenderable chunk */ }
        });
      }
    }
    for (const [expressId, chunks] of spaceChunks) {
      for (const chunk of chunks) addIndividualMesh(expressId, chunk, true);
    }
    for (const meshes of spaceMeshes.values()) for (const mesh of meshes) mesh.visible = false;
    elementChunks.clear();
    spaceChunks.clear();

    const meshCount = group.children.length;
    const framingBounds: BimBox = Number.isFinite(overall.min[0])
      ? {
        min: [overall.min[0] + group.position.x, overall.min[1] + group.position.y, overall.min[2] + group.position.z],
        max: [overall.max[0] + group.position.x, overall.max[1] + group.position.y, overall.max[2] + group.position.z],
      }
      : { min: [-10, 0, -10], max: [10, 15, 10] };

    const index: BimModelIndex = { buildingGlobalId, buildingName, storeys, spaces, elements };
    const dispose = () => {
      for (const entry of disposables) {
        entry.geometry.dispose();
        entry.material.dispose();
      }
    };
    return { index, group, elementMeshes, spaceMeshes, batchedMeshes, framingBounds, meshCount, discardedOutliers, batched: batchingWorked, dispose };
  } finally {
    api.CloseModel(modelID);
  }
}

/** Resolves a picked batched-mesh triangle back to its source element expressID. */
export function expressIdFromBatchedHit(mesh: THREE.Mesh, faceIndex: number): number | null {
  const ranges = mesh.userData.ranges as BatchRange[] | undefined;
  if (!ranges?.length) return null;
  const indexPosition = faceIndex * 3;
  let low = 0, high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const range = ranges[mid];
    if (indexPosition < range.start) high = mid - 1;
    else if (indexPosition >= range.start + range.count) low = mid + 1;
    else return range.expressId;
  }
  return null;
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

interface CachedModel {
  updatedAt: string;
  buffer: ArrayBuffer;
  compressed?: boolean;
}

async function readCachedModel(key: string): Promise<CachedModel | null> {
  try {
    const database = await openBimDatabase();
    return await new Promise((resolve) => {
      const request = database.transaction(BIM_STORE, "readonly").objectStore(BIM_STORE).get(key);
      request.onsuccess = () => resolve((request.result as CachedModel | undefined) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeCachedModel(key: string, value: CachedModel): Promise<void> {
  try {
    const database = await openBimDatabase();
    await new Promise<void>((resolve) => {
      const transaction = database.transaction(BIM_STORE, "readwrite");
      transaction.objectStore(BIM_STORE).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  } catch {
    // Cache misses are non-fatal; the viewer falls back to the network copy.
  }
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** Gunzips bytes with the browser-native DecompressionStream. */
export async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("DecompressionStream is unavailable.");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Gzips bytes with the browser-native CompressionStream (returns null when unsupported). */
export async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Downloads a model (reusing the IndexedDB copy when `updatedAt` matches) and
 * returns the UNCOMPRESSED STEP bytes. `.ifc.gz` transfers stay compressed on the
 * wire (~7MB instead of 67MB) and are inflated client-side via
 * `DecompressionStream('gzip')`, with a server-side `?gunzip=1` fallback.
 */
export async function fetchIfcBuffer(
  siteId: string,
  buildingId: string,
  updatedAt: string,
  onProgress?: (stage: string) => void,
): Promise<Uint8Array> {
  const key = `cafm-bim-v2:${siteId}__${buildingId}`;
  const cached = await readCachedModel(key);
  if (cached && cached.updatedAt === updatedAt) {
    const bytes = new Uint8Array(cached.buffer);
    if (cached.compressed || isGzip(bytes)) {
      onProgress?.("Decompressing & parsing IFC…");
      try { return await gunzipBytes(bytes); } catch { /* fall through to network */ }
    } else {
      return bytes;
    }
  }
  onProgress?.("Downloading BIM archive…");
  const base = `/api/bim-models?siteId=${encodeURIComponent(siteId)}&buildingId=${encodeURIComponent(buildingId)}&download=1`;
  const canInflate = typeof DecompressionStream !== "undefined";
  const response = await fetch(canInflate ? base : `${base}&gunzip=1`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not download the .ifc model for ${buildingId}.`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const stamp = response.headers.get("X-BIM-Updated-At") ?? updatedAt;
  const compressed = response.headers.get("X-BIM-Compressed") === "gzip" || isGzip(bytes);
  await writeCachedModel(key, { updatedAt: stamp, buffer, compressed });
  if (compressed) {
    onProgress?.("Decompressing & parsing IFC…");
    return gunzipBytes(bytes);
  }
  return bytes;
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
 * site EquipmentCode binds automatically. Equipment records whose `bimGlobalId`
 * was seeded directly also bind without a STEP `Mark`.
 */
export function resolveElementLinks(
  elements: BimElement[],
  buildingId: string,
  equipment: Equipment[],
  bimElementLinks: Record<string, BimElementLink> | undefined,
): Map<number, ResolvedBimLink> {
  const equipmentCodes = new Set(equipment.map((asset) => asset.EquipmentCode));
  const byGlobalId = new Map(equipment.filter((asset) => asset.bimGlobalId && asset.bimBuildingId === buildingId)
    .map((asset) => [asset.bimGlobalId!, asset.EquipmentCode]));
  const links = new Map<number, ResolvedBimLink>();
  for (const element of elements) {
    const manual = bimElementLinks?.[bimLinkKey(buildingId, element.globalId)];
    if (manual && equipmentCodes.has(manual.equipmentCode)) {
      links.set(element.expressId, { element, equipmentCode: manual.equipmentCode, source: "manual" });
      continue;
    }
    const seeded = byGlobalId.get(element.globalId);
    if (seeded) {
      links.set(element.expressId, { element, equipmentCode: seeded, source: "manual" });
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
  if (/(ahu|air handling|hvac|vent|air cond|heat pump|heat recovery|hru|diffuser|grille|air terminal)/.test(haystack)) return "A";
  if (/(boiler|heating|radiator)/.test(haystack)) return "H";
  if (/(ups|electrical|generator|panel|switch)/.test(haystack)) return "E";
  if (/(drain|sewer|water|plumb|sanitary|sink|toilet|shower)/.test(haystack)) return "D";
  if (/(lift|elevator|escalator|transport)/.test(haystack)) return "L";
  if (/(pump|compress)/.test(haystack)) return element.category.toLowerCase().includes("compressed") ? "P" : "M";
  if (/(kitchen|catering|hood|fryer|oven|range)/.test(haystack)) return "K";
  return element.isAssignable ? "M" : undefined;
}

/** Suggested trade for a new CAFM equipment created from an IFC element. */
export function suggestEquipmentTrade(element: BimElement): string {
  const haystack = `${element.category} ${element.typeName} ${element.name}`.toLowerCase();
  if (/(electrical|ups|generator|lighting|panel|data|communication)/.test(haystack)) return "Electrical";
  if (/(kitchen|catering|hood|fryer|oven|range)/.test(haystack)) return "Catering";
  if (/(wall|slab|door|window|roof|ceiling|civil)/.test(haystack)) return "Civil";
  return "Mechanical";
}
