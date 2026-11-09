import type { BaseWorkRequest, Equipment } from "@cafm/shared-schema";

const norm = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value).trim().toLowerCase() : "");

function wrEquipmentKeys(wr: BaseWorkRequest): Set<string> {
  const loose = wr as unknown as Record<string, unknown>;
  const keys = new Set<string>();
  for (const field of ["EquipmentCode", "equipmentId", "eq_id", "EquipmentId"]) {
    const key = norm(loose[field]);
    if (key) keys.add(key);
  }
  for (const field of ["EquipmentCodes", "EquipmentIds", "equipmentIds"]) {
    const list = loose[field];
    if (Array.isArray(list)) for (const item of list) { const key = norm(item); if (key) keys.add(key); }
  }
  return keys;
}

export function wrMatchesEquipment(wr: BaseWorkRequest, equipment: Pick<Equipment, "EquipmentCode"> & { id?: unknown }): boolean {
  const keys = wrEquipmentKeys(wr);
  const code = norm(equipment.EquipmentCode);
  const id = norm(equipment.id);
  return (!!code && keys.has(code)) || (!!id && keys.has(id));
}

export function isHistoricalWR(wr: BaseWorkRequest): boolean {
  const status = norm((wr as unknown as Record<string, unknown>).Status);
  return Number(wr.Percentage) >= 78 || status === "completed" || status === "closed";
}

export function classifyEquipmentWRs(equipment: Equipment, wrs: BaseWorkRequest[]) {
  const matching = wrs.filter((wr) => wrMatchesEquipment(wr, equipment as Equipment & { id?: unknown }));
  const byUpdate = (a: BaseWorkRequest, b: BaseWorkRequest) => (b.UpdatedAt ?? b.CreatedDate ?? "").localeCompare(a.UpdatedAt ?? a.CreatedDate ?? "");
  return {
    activeWRs: matching.filter((wr) => !isHistoricalWR(wr)).sort(byUpdate),
    historicalWRs: matching.filter(isHistoricalWR).sort(byUpdate),
  };
}
