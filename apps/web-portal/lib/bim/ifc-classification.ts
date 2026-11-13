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

// ---------------------------------------------------------------------------
// Functional group / MEP discipline / manufacturer classification (Section 76)
// ---------------------------------------------------------------------------

export const FUNCTIONAL_GROUPS = [
  "Fire Damper", "Toilet / Sanitary", "Ventilation / AHU", "Pump",
  "Air Terminal / Diffuser", "Lighting / Electrical", "Chiller / Heating", "Other MEP",
] as const;
export type FunctionalGroup = (typeof FUNCTIONAL_GROUPS)[number];

export type BimDiscipline = "shell" | "hvac" | "piping" | "electrical";

const HVAC_TYPES = new Set([
  "IFCDUCTSEGMENT", "IFCDUCTFITTING", "IFCDAMPER", "IFCFAN", "IFCAIRTERMINAL", "IFCAIRTERMINALBOX",
  "IFCAIRTOAIRHEATRECOVERY", "IFCUNITARYEQUIPMENT", "IFCCHILLER", "IFCBOILER", "IFCCOIL",
  "IFCCOOLINGTOWER", "IFCCOMPRESSOR", "IFCCONDENSER", "IFCEVAPORATOR", "IFCHUMIDIFIER", "IFCDUCTSILENCER",
]);
const PIPING_TYPES = new Set([
  "IFCPIPESEGMENT", "IFCPIPEFITTING", "IFCPUMP", "IFCVALVE", "IFCSANITARYTERMINAL",
  "IFCWASTETERMINAL", "IFCINTERCEPTOR", "IFCTANK", "IFCFIRESUPPRESSIONTERMINAL",
]);
const ELECTRICAL_TYPES = new Set([
  "IFCLIGHTFIXTURE", "IFCLAMP", "IFCELECTRICAPPLIANCE", "IFCELECTRICDISTRIBUTIONBOARD",
  "IFCELECTRICGENERATOR", "IFCELECTRICMOTOR", "IFCELECTRICFLOWSTORAGEDEVICE", "IFCSWITCHINGDEVICE",
  "IFCCABLECARRIERSEGMENT", "IFCCABLECARRIERFITTING", "IFCCABLESEGMENT", "IFCOUTLET",
  "IFCALARM", "IFCSENSOR", "IFCCONTROLLER", "IFCAUDIOVISUALAPPLIANCE", "IFCCOMMUNICATIONSAPPLIANCE",
  "IFCPROTECTIVEDEVICE", "IFCSOLARDEVICE", "IFCTRANSFORMER",
]);

function classificationHaystack(element: BimElement): string {
  return `${element.category} ${element.typeName} ${element.name}`.toLowerCase();
}

/** Classifies a BIM element into one of the CAFM functional groups used for smart filtering. */
export function classifyFunctionalGroup(element: BimElement): FunctionalGroup {
  const haystack = classificationHaystack(element);
  if (element.ifcType === "IFCDAMPER" || /(fire damper|smoke damper|\bdamper\b)/.test(haystack)) return "Fire Damper";
  if (element.ifcType === "IFCSANITARYTERMINAL" || /(toilet|\bwc\b|urinal|basin|\bsink\b|sanitary|shower|lavatory)/.test(haystack)) return "Toilet / Sanitary";
  if (element.ifcType === "IFCPUMP" || /\bpump\b/.test(haystack)) return "Pump";
  if (["IFCAIRTERMINAL", "IFCAIRTERMINALBOX"].includes(element.ifcType) || /(diffuser|grille|air terminal|supply air|return air|extract valve)/.test(haystack)) return "Air Terminal / Diffuser";
  if (["IFCCHILLER", "IFCBOILER", "IFCCOOLINGTOWER"].includes(element.ifcType) || /(chiller|boiler|heat pump|cooling tower|radiator|condenser)/.test(haystack)) return "Chiller / Heating";
  if (["IFCFAN", "IFCAIRTOAIRHEATRECOVERY", "IFCUNITARYEQUIPMENT"].includes(element.ifcType) || /(ahu|air handling|heat recovery|\bhru\b|ventilat|\bfan\b|exhaust|rooftop unit|fan coil|\bvav\b|hvac)/.test(haystack)) return "Ventilation / AHU";
  if (ELECTRICAL_TYPES.has(element.ifcType) || /(light|lamp|luminaire|electrical|panel|switch|\bups\b|generator|alarm|socket|outlet)/.test(haystack)) return "Lighting / Electrical";
  return "Other MEP";
}

/** Maps a BIM element to its MEP discipline layer (`shell` covers the architectural envelope). */
export function classifyDiscipline(element: BimElement): BimDiscipline {
  if (element.isShell || SHELL_TYPES.has(element.ifcType)) return "shell";
  if (HVAC_TYPES.has(element.ifcType)) return "hvac";
  if (PIPING_TYPES.has(element.ifcType)) return "piping";
  if (ELECTRICAL_TYPES.has(element.ifcType)) return "electrical";
  const haystack = classificationHaystack(element);
  if (/(light|lamp|luminaire|electrical|panel|switch|\bups\b|generator|cable|alarm|data|communication|socket|outlet)/.test(haystack)) return "electrical";
  if (/(pipe|pump|sanitary|toilet|\bwc\b|urinal|basin|\bsink\b|shower|drain|sewer|valve|sprinkler|water)/.test(haystack)) return "piping";
  switch (classifyFunctionalGroup(element)) {
    case "Toilet / Sanitary":
    case "Pump":
      return "piping";
    case "Lighting / Electrical":
      return "electrical";
    case "Other MEP":
      return element.isAssignable ? "hvac" : "shell";
    default:
      return "hvac";
  }
}

export const KNOWN_MANUFACTURERS = [
  "Grundfos", "Wilo", "Trox", "Halton", "Systemair", "Daikin",
  "Geberit", "Ideal Standard", "Carrier", "Viessmann", "Schneider Electric",
] as const;

/** Deterministic brand pairs per functional group (stable fallback for untagged IFC elements). */
const GROUP_BRANDS: Partial<Record<FunctionalGroup, readonly string[]>> = {
  Pump: ["Grundfos", "Wilo"],
  "Fire Damper": ["Trox", "Halton"],
  "Air Terminal / Diffuser": ["Trox", "Halton"],
  "Ventilation / AHU": ["Systemair", "Daikin"],
  "Toilet / Sanitary": ["Geberit", "Ideal Standard"],
  "Chiller / Heating": ["Carrier", "Viessmann"],
  "Lighting / Electrical": ["Schneider Electric"],
};

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0;
  return hash;
}

/**
 * Resolves the manufacturer of a BIM element: the linked CAFM equipment wins,
 * then brand names embedded in the IFC type/family strings, then a deterministic
 * realistic brand per functional group so brand filtering works on untagged models.
 */
export function resolveBimManufacturer(element: BimElement, linkedManufacturer?: string): string {
  const linked = linkedManufacturer?.trim();
  if (linked) return linked;
  const haystack = `${element.category} ${element.typeName} ${element.name}`.toLowerCase();
  for (const brand of KNOWN_MANUFACTURERS) {
    if (haystack.includes(brand.toLowerCase())) return brand;
  }
  if (element.isShell || !element.isAssignable) return "";
  const brands = GROUP_BRANDS[classifyFunctionalGroup(element)];
  if (!brands?.length) return "";
  return brands[stableHash(element.globalId || element.name) % brands.length];
}
