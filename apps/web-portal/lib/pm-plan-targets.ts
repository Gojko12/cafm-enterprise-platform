import { pmTargetKey, pmTargetLabel } from "@cafm/shared-schema";
import type { PMTarget, SiteId } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";

export type PMPlanTarget = PMTarget & { SiteId: SiteId; id: string; label: string };
export function pmPlanTargets(data: DemoData, site: SiteId, buildings?: string[]): PMPlanTarget[] {
  const allowed = (id: string) => !buildings?.length || buildings.includes(id);
  const target = (item: PMTarget & { SiteId: SiteId }, label?: string): PMPlanTarget => ({ ...item, id: pmTargetKey(item), label: label ?? pmTargetLabel(item) });
  return [
    ...data.equipment.filter((item) => item.SiteId === site && allowed(item.bl_id)).map((item) => target({ ...item, targetType: "equipment" }, `${item.EquipmentCode} · ${item.EquipmentName}`)),
    ...data.buildings.filter((item) => item.SiteId === site && allowed(item.bl_id)).map((item) => target({ SiteId: site, targetType: "building", bl_id: item.bl_id })),
    ...data.floors.filter((item) => item.SiteId === site && allowed(item.bl_id)).map((item) => target({ SiteId: site, targetType: "floor", bl_id: item.bl_id, LevelName: item.LevelName })),
    ...data.rooms.filter((item) => item.SiteId === site && allowed(item.bl_id)).map((item) => target({ SiteId: site, targetType: "room", bl_id: item.bl_id, LevelName: item.LevelName, RoomCode: item.RoomCode })),
  ];
}
