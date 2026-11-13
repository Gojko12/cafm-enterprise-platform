import type { Equipment } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";

/**
 * Idempotent manufacturer enrichment across every ESA site (01-ESTEC … 05-ESAC).
 * Only fills BLANK `Manufacturer` fields — a user-entered or previously seeded
 * value is never overwritten — using deterministic realistic brands per
 * equipment family so brand filtering in the BIM Smart Filter has live data.
 */

const BRAND_RULES: readonly { pattern: RegExp; brands: readonly string[] }[] = [
  { pattern: /(fire damper|smoke damper|\bdamper\b)/i, brands: ["Trox", "Halton"] },
  { pattern: /(diffuser|grille|air terminal)/i, brands: ["Trox", "Halton"] },
  { pattern: /\bpump\b/i, brands: ["Grundfos", "Wilo"] },
  { pattern: /(toilet|\bwc\b|urinal|basin|\bsink\b|sanitary|shower|lavatory)/i, brands: ["Geberit", "Ideal Standard"] },
  { pattern: /(chiller|cooling tower|condenser)/i, brands: ["Carrier"] },
  { pattern: /(boiler|heating|radiator|heat pump)/i, brands: ["Viessmann"] },
  { pattern: /(ahu|air handling|heat recovery|\bhru\b|ventilat|\bfan\b|exhaust|rooftop unit|fan coil|\bvav\b|hvac)/i, brands: ["Systemair", "Daikin"] },
  { pattern: /(light|lamp|luminaire|electrical|panel|switchboard|\bups\b|generator|alarm|socket|outlet|\be-panel\b)/i, brands: ["Schneider Electric"] },
];

const CATEGORY_BRANDS: Partial<Record<string, readonly string[]>> = {
  A: ["Systemair", "Daikin"], // Air Conditioning / Heat Pumps
  C: ["Carrier"], // Cooling Water Systems
  D: ["Geberit", "Ideal Standard"], // Drain / Sewer / Domestic Water
  E: ["Schneider Electric"], // Energy / Electrical / E-Panels
  F: ["Trox", "Halton"], // Fire Detection / Fighting
  H: ["Viessmann"], // Heating Systems
  P: ["Grundfos", "Wilo"], // Compressed Air Systems
};

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0;
  return hash;
}

/** Deterministic realistic brand for one equipment record, or `undefined` when no family matches. */
export function suggestManufacturer(asset: Equipment): string | undefined {
  const haystack = `${asset.EquipmentName} ${asset.EquipmentStandardDescription ?? ""} ${asset.bimTypeName ?? ""} ${asset.bimCategory ?? ""}`;
  const rule = BRAND_RULES.find((candidate) => candidate.pattern.test(haystack));
  const brands = rule?.brands ?? (asset.Category ? CATEGORY_BRANDS[asset.Category] : undefined);
  if (!brands?.length) return undefined;
  return brands[stableHash(asset.EquipmentCode) % brands.length];
}

/** Fills blank `Manufacturer` fields deterministically; returns the input when nothing changes. */
export function withManufacturerSeed(data: DemoData): DemoData {
  let changed = false;
  const equipment = data.equipment.map((asset) => {
    if (asset.Manufacturer?.trim()) return asset;
    const manufacturer = suggestManufacturer(asset);
    if (!manufacturer) return asset;
    changed = true;
    return { ...asset, Manufacturer: manufacturer };
  });
  return changed ? { ...data, equipment } : data;
}
