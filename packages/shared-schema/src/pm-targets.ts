export type PMTargetType = "equipment" | "building" | "floor" | "room";
export type PMTarget = {
  targetType?: PMTargetType; equipmentCode?: string; EquipmentCode?: string; EquipmentCodes?: string[];
  bl_id?: string; LevelName?: string; RoomCode?: string; levelName?: string; roomCode?: string;
};
export function pmTargetType(target: PMTarget): PMTargetType {
  return target.targetType ?? (target.equipmentCode || target.EquipmentCode || target.EquipmentCodes?.length ? "equipment" :
    target.roomCode || target.RoomCode ? "room" : target.levelName || target.LevelName ? "floor" : "building");
}
export function pmTargetKey(target: PMTarget): string {
  const type = pmTargetType(target);
  const code = target.equipmentCode ?? target.EquipmentCode ?? target.EquipmentCodes?.[0];
  if (type === "equipment") {
    if (!code) throw new Error("Equipment target requires an equipment code.");
    return `EQ:${code}`;
  }
  const floor = target.levelName ?? target.LevelName, room = target.roomCode ?? target.RoomCode;
  if (!target.bl_id || ((type === "floor" || type === "room") && !floor) || (type === "room" && !room))
    throw new Error("Location target requires its building, floor and room parents.");
  return type === "building" ? `BL:${target.bl_id}` : type === "floor" ? `FL:${target.bl_id}|${floor}` : `RM:${target.bl_id}|${floor}|${room}`;
}
export function pmTargetLabel(target: PMTarget): string {
  const type = pmTargetType(target);
  if (type === "equipment") return target.equipmentCode ?? target.EquipmentCode ?? target.EquipmentCodes?.join(", ") ?? "";
  const location = type === "building" ? target.bl_id : type === "floor" ?
    `${target.bl_id} / ${target.levelName ?? target.LevelName}` : target.roomCode ?? target.RoomCode;
  return `📍 ${type[0].toUpperCase()}${type.slice(1)} ${location}`;
}
