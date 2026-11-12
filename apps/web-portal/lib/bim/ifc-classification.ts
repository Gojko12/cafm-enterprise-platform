/**
 * IFC classification & matching helpers: assignable / shell / passive type sets,
 * property (Mark / Category / CAFM_Code) and spatial-containment collection,
 * room point-in-box matching and CAFM category / trade suggestions.
 * Re-exported (where public) from `../ifc-cafm-bridge` so callers never change.
 */
import * as WebIFC from "web-ifc";
import type { BimBox, BimElement } from "../ifc-cafm-bridge";

export const SHELL_TYPES = new Set([
  "IFCWALL", "IFCWALLSTANDARDCASE", "IFCWALLELEMENTEDCASE", "IFCSLAB", "IFCCOVERING",
  "IFCDOOR", "IFCWINDOW", "IFCROOF", "IFCCOLUMN", "IFCBEAM", "IFCSTAIR", "IFCSTAIRFLIGHT",
  "IFCRAILING", "IFCCURTAINWALL", "IFCPLATE", "IFCMEMBER", "IFCFOOTING", "IFCRAMP",
  "IFCRAMPFLIGHT", "IFCCHIMNEY", "IFCSHADINGDEVICE",
]);

export const ASSIGNABLE_TYPES = new Set([
  "IFCDISTRIBUTIONELEMENT", "IFCDISTRIBUTIONCONTROLELEMENT", "IFCDISTRIBUTIONFLOWELEMENT",
  "IFCENERGYCONVERSIONDEVICE", "IFCTRANSPORTELEMENT", "IFCUNITARYEQUIPMENT",
  "IFCELECTRICAPPLIANCE", "IFCPUMP", "IFCFAN", "IFCVALVE", "IFCDAMPER", "IFCBOILER",
  "IFCCHILLER", "IFCSANITARYTERMINAL", "IFCAIRTERMINAL", "IFCAIRTERMINALBOX",
  "IFCFLOWTERMINAL", "IFCFLOWMOVINGDEVICE", "IFCFLOWCONTROLLER",
  "IFCAIRTOAIRHEATRECOVERY", "IFCCOOLINGTOWER", "IFCCOIL", "IFCCOMPRESSOR",
]);

/** Passive distribution runs are batched, never individually assignable. */
export const PASSIVE_DISTRIBUTION_TYPES = new Set([
  "IFCDUCTSEGMENT", "IFCDUCTFITTING", "IFCPIPESEGMENT", "IFCPIPEFITTING",
  "IFCCABLECARRIERSEGMENT", "IFCCABLECARRIERFITTING", "IFCCABLESEGMENT",
  "IFCFLOWSEGMENT", "IFCFLOWFITTING",
]);

/** Elements whose centre lies further than this from the core P5–P95 cluster are dropped. */
export const OUTLIER_DISTANCE_M = 500;

export const MEP_CATEGORY_HINTS = [
  "mechanical equipment", "electrical equipment", "duct accessories", "plumbing fixtures",
  "pipe accessories", "fire alarm", "fire protection", "sprinklers", "air terminals",
  "lighting fixtures", "specialty equipment", "communication devices",
  "data devices", "electrical fixtures", "security devices",
];

/** Generic proxies only count as assignable equipment when they look like plant/MEP. */
export const PROXY_EQUIPMENT_NAME = /(chiller|ahu|air handling|heat recovery|hru|pump|boiler|fan coil|\bfan\b|vav|generator|\bups\b|damper|hood|compressor|drain|extraction|crane|lift controller|hvac|heat pump|condenser|cooling tower|unit heater|water heater|rooftop unit|exhaust)/i;

export function vectorToArray(vector: WebIFC.Vector<number>): number[] {
  const result: number[] = [];
  for (let index = 0; index < vector.size(); index++) result.push(vector.get(index));
  return result;
}

export function text(value: unknown): string {
  if (value && typeof value === "object" && "value" in value) return String((value as { value: unknown }).value ?? "");
  return value === null || value === undefined ? "" : String(value);
}

export function numeric(value: unknown): number {
  if (value && typeof value === "object" && "value" in value) return Number((value as { value: unknown }).value ?? 0);
  return Number(value ?? 0);
}

/**
 * Scale factor converting raw IFC length attribute values (e.g. storey Elevation)
 * into meters. Geometry from web-ifc is already meter-scaled; this is only for
 * raw attributes. Supports SI prefixes (mm/cm/dm) and imperial FOOT/INCH units.
 */
export function lengthUnitScale(api: WebIFC.IfcAPI, modelID: number): number {
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
export function collectElementProperties(api: WebIFC.IfcAPI, modelID: number): Map<number, Record<string, string>> {
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
export function collectSpatialContainment(api: WebIFC.IfcAPI, modelID: number): Map<number, number> {
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
export function collectAggregates(api: WebIFC.IfcAPI, modelID: number): Map<number, number> {
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

/** 3D containment in upright Y-up meters: X/Z are the ground plane, Y is height. */
export function pointInBox(point: [number, number, number], box: BimBox, marginXZ = 0.05): boolean {
  return point[0] >= box.min[0] - marginXZ && point[0] <= box.max[0] + marginXZ &&
    point[2] >= box.min[2] - marginXZ && point[2] <= box.max[2] + marginXZ &&
    point[1] >= box.min[1] - 0.01 && point[1] <= box.max[1] + 0.01;
}

export function pointInBoxXZ(point: [number, number, number], box: BimBox, marginXZ = 0.05): boolean {
  return point[0] >= box.min[0] - marginXZ && point[0] <= box.max[0] + marginXZ &&
    point[2] >= box.min[2] - marginXZ && point[2] <= box.max[2] + marginXZ;
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
