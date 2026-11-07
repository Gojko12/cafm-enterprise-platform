import type { Equipment, Floor, Room, SiteId } from "@cafm/shared-schema";

export type EquipmentLocationQuery = { building: string; floor: string; room: string; equipment: string };

export function resolveEquipmentLocation(
  query: EquipmentLocationQuery,
  site: SiteId,
  data: { equipment: Equipment[]; floors: Floor[]; rooms: Room[] },
) {
  const equipment = data.equipment.find((item) => item.SiteId === site && item.EquipmentCode === query.equipment &&
    item.bl_id === query.building && item.LevelName === query.floor && item.RoomCode === query.room);
  const floor = data.floors.find((item) => item.SiteId === site && item.bl_id === query.building && item.LevelName === query.floor);
  const room = data.rooms.find((item) => item.SiteId === site && item.bl_id === query.building &&
    item.LevelName === query.floor && item.RoomCode === query.room && item.Polygon);
  return equipment && floor && room ? { equipment, floor, room } : null;
}
