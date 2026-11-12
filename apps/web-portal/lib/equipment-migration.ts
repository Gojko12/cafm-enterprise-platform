import type { Equipment } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";

const TEN_DIGITS = /^\d{10}$/;

// Deterministic so every site-scoped state maps the same legacy code to the same 10-digit code.
function legacyCodeToTenDigits(legacy: string, taken: Set<string>): string {
  let hash = 2166136261;
  for (let index = 0; index < legacy.length; index++) hash = Math.imul(hash ^ legacy.charCodeAt(index), 16777619) >>> 0;
  let value = 9_000_000_000 + (hash % 99_000_000);
  while (taken.has(String(value))) value += 1;
  return String(value);
}

function rewrite(value: unknown, map: Map<string, string>, key?: string): unknown {
  if (typeof value === "string") {
    const exact = map.get(value);
    if (exact) return exact;
    if (key === "targetKey") {
      let next = value;
      for (const [from, to] of map) if (next.includes(from)) next = next.split(from).join(to);
      return next;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => rewrite(item, map));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([entryKey, item]) => [entryKey, rewrite(item, map, entryKey)]));
  }
  return value;
}

const untouchedSeedChild = (item: Equipment) => (item.Activity ?? []).every((entry) => entry.id === `${item.EquipmentCode}-log` || entry.id === `${item.EquipmentCode}-comment`);

// Idempotent: moves legacy alphanumeric equipment codes to 10-digit codes (rewriting every reference) and repairs seeded
// SubEquipment / Component records so they inherit the parent's location and are In Service.
export function withEquipmentRegistryMigration(data: DemoData): DemoData {
  let next = data;
  const legacy = data.equipment.filter((item) => !TEN_DIGITS.test(item.EquipmentCode));
  if (legacy.length) {
    const taken = new Set(data.equipment.map((item) => item.EquipmentCode));
    const map = new Map<string, string>();
    for (const item of legacy) {
      const code = legacyCodeToTenDigits(item.EquipmentCode, taken);
      taken.add(code);
      map.set(item.EquipmentCode, code);
    }
    next = rewrite(data, map) as DemoData;
  }
  const byCode = new Map(next.equipment.map((item) => [item.EquipmentCode, item]));
  let changed = false;
  const equipment = next.equipment.map((item) => {
    const parent = item.ParentEquipmentCode ? byCode.get(item.ParentEquipmentCode) : undefined;
    if (!parent || item.HierarchyLevel === "Installation" || !untouchedSeedChild(item)) return item;
    const inherits = item.bl_id !== parent.bl_id || item.LevelName !== parent.LevelName || item.RoomCode !== parent.RoomCode || item.SiteId !== parent.SiteId;
    if (!inherits && item.Status === "In Service") return item;
    changed = true;
    return { ...item, SiteId: parent.SiteId, bl_id: parent.bl_id, LevelName: parent.LevelName, RoomCode: parent.RoomCode, Status: "In Service" as const };
  });
  return changed ? { ...next, equipment } : next;
}
