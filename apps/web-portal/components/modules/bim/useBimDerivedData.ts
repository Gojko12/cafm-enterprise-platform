"use client";

import { useMemo } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { getUnfavourableStepCount } from "@/lib/wr-signals";
import { freezeLocations, localNowIso } from "@/lib/location-freezes";
import { classifyDiscipline, classifyFunctionalGroup, findMissingSyncItems, resolveBimManufacturer, resolveElementLinks, type BimDiscipline, type BimElement, type BimModelIndex } from "@/lib/ifc-cafm-bridge";
import {
  ALL_STOREYS,
  COLOR_AMBER,
  COLOR_CYAN,
  COLOR_EMERALD,
  COLOR_RED,
  ROOM_LEVEL_COLOR,
  displayName,
  type BimElementClassification,
  type CafmData,
  type FjSpotPin,
  type IssuePin,
  type RoomHealth,
} from "./bim-viewport-math";

export function useBimDerivedData({
  data,
  activeSiteId,
  buildingId,
  index,
  storeyFilter,
  search,
  selection,
  roomSelection,
  assignQuery,
  pinsOn,
}: {
  data: CafmData;
  activeSiteId: string;
  buildingId: string;
  index: BimModelIndex | null;
  storeyFilter: string;
  search: string;
  selection: number | null;
  roomSelection: number | null;
  assignQuery: string;
  pinsOn: boolean;
}) {
  const siteEquipment = useMemo(
    () => data.equipment.filter((asset) => asset.SiteId === activeSiteId),
    [data.equipment, activeSiteId],
  );
  const equipmentByCode = useMemo(
    () => new Map(siteEquipment.map((asset) => [asset.EquipmentCode, asset])),
    [siteEquipment],
  );
  const links = useMemo(() => {
    if (!index || !buildingId) return new Map<number, { element: BimElement; equipmentCode: string; source: "manual" | "mark" }>();
    return resolveElementLinks(index.elements, buildingId, siteEquipment, data.bimElementLinks);
  }, [index, buildingId, siteEquipment, data.bimElementLinks]);
  const missing = useMemo(() => {
    if (!index || !buildingId) return null;
    const result = findMissingSyncItems(index, buildingId, {
      floors: data.floors as { bl_id: string; LevelName: string }[],
      rooms: data.rooms as { bl_id: string; RoomCode: string }[],
      equipment: siteEquipment,
    });
    return result.floors.length || result.rooms.length || result.taggedAssets.length ? result : null;
  }, [index, buildingId, data.floors, data.rooms, siteEquipment]);

  /** functionalGroup / discipline / manufacturer per element (CAFM equipment data wins). */
  const classificationByExpressId = useMemo(() => {
    const map = new Map<number, BimElementClassification>();
    if (!index) return map;
    for (const element of index.elements) {
      const link = links.get(element.expressId);
      const asset = link ? equipmentByCode.get(link.equipmentCode) : undefined;
      map.set(element.expressId, {
        functionalGroup: classifyFunctionalGroup(element),
        discipline: classifyDiscipline(element),
        manufacturer: resolveBimManufacturer(element, asset?.Manufacturer),
      });
    }
    return map;
  }, [index, links, equipmentByCode]);

  const disciplineByExpressId = useMemo(() => {
    const map = new Map<number, BimDiscipline>();
    for (const [expressId, entry] of classificationByExpressId) map.set(expressId, entry.discipline);
    return map;
  }, [classificationByExpressId]);

  /** Open Fast Jobs pinned to an exact 3D spot inside the loaded building. */
  const fjSpotPins = useMemo<FjSpotPin[]>(() => {
    if (!buildingId) return [];
    return data.workRequests
      .filter((wr) => wr.SiteId === activeSiteId && wr.Percentage < 100 && wr.bimPin?.buildingId === buildingId)
      .map((wr) => ({ key: `fj-${wr.WR_ID}`, wr, pin: wr.bimPin! }));
  }, [data.workRequests, activeSiteId, buildingId]);

  const statusColorByCode = useMemo(() => {
    const map = new Map<string, number>();
    const workRequestsByEquipment = new Map<string, BaseWorkRequest[]>();
    for (const wr of data.workRequests) {
      if (wr.SiteId !== activeSiteId) continue;
      for (const code of new Set(wr.EquipmentCodes)) {
        const requests = workRequestsByEquipment.get(code);
        if (requests) requests.push(wr);
        else workRequestsByEquipment.set(code, [wr]);
      }
    }

    const nowLocal = localNowIso();
    const today = new Date().toISOString().slice(0, 10);
    for (const link of links.values()) {
      const code = link.equipmentCode;
      if (map.has(code)) continue;
      const asset = equipmentByCode.get(code);
      const requests = workRequestsByEquipment.get(code) ?? [];
      const open = requests.filter((wr) => wr.Percentage === 50 || wr.Percentage === 55);
      const overdue = open.some((wr) => wr.DueDate && wr.DueDate < today);
      const unfavourable = requests.some((wr) => wr.Percentage < 100 && getUnfavourableStepCount(wr, data) > 0);
      const frozen = asset && (data.locationFreezes ?? []).some((freeze) => {
        if (freeze.siteId !== activeSiteId || !(freeze.startDateTime <= nowLocal && nowLocal <= freeze.endDateTime)) return false;
        const locations = freezeLocations(freeze);
        return locations.buildings.includes(asset.bl_id) || locations.floors.includes(asset.LevelName) || locations.rooms.includes(asset.RoomCode);
      });
      map.set(code, overdue || unfavourable ? COLOR_RED : open.length ? COLOR_AMBER : frozen ? COLOR_CYAN : COLOR_EMERALD);
    }
    return map;
  }, [links, data, activeSiteId, equipmentByCode]);

  const roomHealth = useMemo(() => {
    const result = new Map<number, RoomHealth>();
    if (!index) return result;
    const nowLocal = localNowIso();
    const today = new Date().toISOString().slice(0, 10);
    const activeFreezes = (data.locationFreezes ?? []).filter((freeze) =>
      freeze.siteId === activeSiteId && freeze.startDateTime <= nowLocal && nowLocal <= freeze.endDateTime);
    const wrsByRoom = new Map<string, BaseWorkRequest[]>();
    for (const wr of data.workRequests) {
      if (wr.SiteId !== activeSiteId || wr.Percentage >= 100) continue;
      if (wr.bl_id && wr.bl_id !== buildingId) continue;
      const roomCodes = new Set<string>();
      if (wr.RoomCode) roomCodes.add(wr.RoomCode);
      for (const code of wr.EquipmentCodes) {
        const asset = equipmentByCode.get(code);
        if (asset && asset.bl_id === buildingId && asset.RoomCode) roomCodes.add(asset.RoomCode);
      }
      for (const roomCode of roomCodes) {
        const roomRequests = wrsByRoom.get(roomCode);
        if (roomRequests) roomRequests.push(wr);
        else wrsByRoom.set(roomCode, [wr]);
      }
    }
    for (const space of index.spaces) {
      const wrs = wrsByRoom.get(space.code) ?? [];
      const freezes = activeFreezes.filter((freeze) => {
        const locations = freezeLocations(freeze);
        return locations.buildings.includes(buildingId) || locations.floors.includes(space.storeyName) || locations.rooms.includes(space.code);
      });
      const overdue = wrs.some((wr) => (wr.Percentage === 50 || wr.Percentage === 55) && !!wr.DueDate && wr.DueDate < today);
      const unfavourable = wrs.some((wr) => getUnfavourableStepCount(wr, data) > 0);
      const level: RoomHealth["level"] = overdue || unfavourable ? "red" : wrs.length ? "amber" : freezes.length ? "cyan" : "clear";
      result.set(space.expressId, { level, wrs, freezes });
    }
    return result;
  }, [index, data, activeSiteId, buildingId, equipmentByCode]);

  const query = search.trim().toLowerCase();
  const linkedRows = useMemo(() => index
    ? index.elements.filter((element) =>
      links.has(element.expressId)
      && (storeyFilter === ALL_STOREYS || element.storeyName === storeyFilter)
      && (!query || `${links.get(element.expressId)?.equipmentCode} ${displayName(element)} ${element.category} ${element.roomCode}`.toLowerCase().includes(query)))
    : [], [index, links, storeyFilter, query]);
  const unassignedRows = useMemo(() => index
    ? index.elements.filter((element) =>
      element.isAssignable && !links.has(element.expressId)
      && (storeyFilter === ALL_STOREYS || element.storeyName === storeyFilter)
      && (!query || `${displayName(element)} ${element.category} ${element.roomCode} ${element.ifcType}`.toLowerCase().includes(query)))
    : [], [index, links, storeyFilter, query]);
  const roomRows = useMemo(() => index
    ? index.spaces.filter((space) =>
      (storeyFilter === ALL_STOREYS || space.storeyName === storeyFilter)
      && (!query || `${space.code} ${space.longName}`.toLowerCase().includes(query)))
    : [], [index, storeyFilter, query]);

  const selectedElement = selection !== null && index ? index.elements.find((element) => element.expressId === selection) ?? null : null;
  const selectedSpace = roomSelection !== null && index ? index.spaces.find((space) => space.expressId === roomSelection) ?? null : null;
  const selectedRoomHealth = selectedSpace ? roomHealth.get(selectedSpace.expressId) ?? null : null;
  const roomElements = useMemo(() => selectedSpace && index
    ? index.elements.filter((element) =>
      element.roomCode === selectedSpace.code && element.storeyName === selectedSpace.storeyName
      && (links.has(element.expressId) || element.isAssignable))
    : [], [selectedSpace, index, links]);
  const roomSchedules = useMemo(() => {
    const codes = new Set(roomElements.map((element) => links.get(element.expressId)?.equipmentCode).filter((code): code is string => !!code));
    return codes.size ? data.schedules.filter((schedule) => schedule.SiteId === activeSiteId && schedule.EquipmentCodes.some((code) => codes.has(code))) : [];
  }, [roomElements, links, data.schedules, activeSiteId]);
  const selectedLink = selection !== null ? links.get(selection) ?? null : null;
  const selectedEquipment = selectedLink ? equipmentByCode.get(selectedLink.equipmentCode) ?? null : null;
  const selectedOpenWRs = selectedLink
    ? data.workRequests.filter((wr) => wr.SiteId === activeSiteId && wr.EquipmentCodes.includes(selectedLink.equipmentCode) && wr.Percentage < 100)
    : [];
  const selectedSchedules = selectedLink
    ? data.schedules.filter((schedule) => schedule.SiteId === activeSiteId && schedule.EquipmentCodes.includes(selectedLink.equipmentCode))
    : [];
  const assignCandidates = assignQuery.trim()
    ? siteEquipment.filter((asset) => `${asset.EquipmentCode} ${asset.EquipmentName}`.toLowerCase().includes(assignQuery.trim().toLowerCase()))
    : siteEquipment;

  const issuePins = useMemo(() => {
    if (!pinsOn || !index) return [] as IssuePin[];
    const pins: IssuePin[] = [];
    for (const element of index.elements) {
      const link = links.get(element.expressId);
      if (!link || (storeyFilter !== ALL_STOREYS && element.storeyName !== storeyFilter) || statusColorByCode.get(link.equipmentCode) !== COLOR_RED) continue;
      pins.push({ key: `eq-${element.expressId}`, label: link.equipmentCode, color: COLOR_RED, kind: "element", expressId: element.expressId });
    }
    for (const level of ["red", "cyan"] as const) {
      for (const space of index.spaces) {
        if ((storeyFilter !== ALL_STOREYS && space.storeyName !== storeyFilter) || roomHealth.get(space.expressId)?.level !== level) continue;
        pins.push({ key: `room-${space.expressId}`, label: space.code, color: ROOM_LEVEL_COLOR[level], kind: "space", expressId: space.expressId });
      }
    }
    return pins.slice(0, 15);
  }, [pinsOn, index, links, statusColorByCode, roomHealth, storeyFilter]);

  return {
    siteEquipment, equipmentByCode, links, missing, statusColorByCode, roomHealth, issuePins,
    classificationByExpressId, disciplineByExpressId, fjSpotPins,
    linkedRows, unassignedRows, roomRows, selectedElement, selectedSpace, selectedRoomHealth,
    roomElements, roomSchedules, selectedLink, selectedEquipment, selectedOpenWRs, selectedSchedules,
    assignCandidates,
  };
}
