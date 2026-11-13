"use client";

import { useEffect, useRef } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import * as THREE from "three";
import type { BimModelIndex, LoadedBimModel } from "@/lib/ifc-cafm-bridge";
import type { BimLinkMap, BimTab, CafmData, SetState } from "./bim-viewport-math";

/**
 * Deep links into the 3D viewer:
 * - `?building=…&eq={equipmentCode}`: X-Ray + highlight + fly to the linked element.
 * - `?building=…&room={roomCode}`: select the room (floor isolation + ceiling clip + fly).
 * - `?building=…&wr={wrId}`: fly straight to the WR's pinned 3D spot, linked EQ, or room.
 */
export function useBimDeepLinks({
  searchParams,
  index,
  loaded,
  links,
  buildingId,
  data,
  activeSiteId,
  storeyOffset,
  fitCameraToBox,
  flyToElement,
  selectRoom,
  selectAndFly,
  setXray,
  setSelection,
  setTab,
  setPinsOn,
}: {
  searchParams: ReadonlyURLSearchParams;
  index: BimModelIndex | null;
  loaded: LoadedBimModel | null;
  links: BimLinkMap;
  buildingId: string;
  data: CafmData;
  activeSiteId: string;
  storeyOffset: (storeyName: string) => number;
  fitCameraToBox: (box: THREE.Box3, animated: boolean, isElement?: boolean) => void;
  flyToElement: (expressId: number) => void;
  selectRoom: (expressId: number, fly?: boolean) => void;
  selectAndFly: (expressId: number) => void;
  setXray: SetState<boolean>;
  setSelection: SetState<number | null>;
  setTab: SetState<BimTab>;
  setPinsOn: SetState<boolean>;
}) {
  const consumed = useRef("");
  useEffect(() => { consumed.current = ""; }, [searchParams]);

  // ---- ?building=…&eq=… → X-Ray + highlight + fly ----
  useEffect(() => {
    const eq = searchParams.get("eq");
    if (!eq || !index || !loaded) return;
    const requestedBuilding = searchParams.get("building");
    if (requestedBuilding && requestedBuilding !== buildingId) return;
    const key = `${buildingId}:eq=${eq}`;
    if (consumed.current === key) return;
    const entry = [...links.values()].find((link) => link.equipmentCode === eq);
    if (!entry) return;
    consumed.current = key;
    setXray(true);
    setSelection(entry.element.expressId);
    setTab("linked");
    // Fly after the render pass so world matrices exist.
    requestAnimationFrame(() => flyToElement(entry.element.expressId));
  }, [searchParams, index, loaded, links, buildingId, flyToElement, setXray, setSelection, setTab]);

  // ---- ?building=…&room=… and ?building=…&wr=… ----
  useEffect(() => {
    const room = searchParams.get("room");
    const wrId = searchParams.get("wr");
    if ((!room && !wrId) || !index || !loaded) return;
    const requestedBuilding = searchParams.get("building");
    if (requestedBuilding && requestedBuilding !== buildingId) return;
    const key = `${buildingId}:room=${room ?? ""}:wr=${wrId ?? ""}`;
    if (consumed.current === key) return;
    if (room) {
      const space = index.spaces.find((entry) => entry.code === room);
      if (!space) return;
      consumed.current = key;
      requestAnimationFrame(() => selectRoom(space.expressId, true));
      return;
    }
    const wr = data.workRequests.find((entry) => entry.WR_ID === wrId && entry.SiteId === activeSiteId);
    if (!wr) return;
    consumed.current = key;
    if (wr.bimPin && wr.bimPin.buildingId === buildingId) {
      // Fly straight down to the pinned 3D spot and surface its ⚡ pin.
      setPinsOn(true);
      const anchorY = wr.bimPin.y + storeyOffset(wr.bimPin.storeyName ?? "");
      const spot = new THREE.Box3(
        new THREE.Vector3(wr.bimPin.x - 1.2, anchorY - 1.2, wr.bimPin.z - 1.2),
        new THREE.Vector3(wr.bimPin.x + 1.2, anchorY + 1.2, wr.bimPin.z + 1.2),
      );
      requestAnimationFrame(() => fitCameraToBox(spot, true, true));
      return;
    }
    const linked = [...links.values()].find((link) => wr.EquipmentCodes.includes(link.equipmentCode));
    if (linked) {
      requestAnimationFrame(() => selectAndFly(linked.element.expressId));
      return;
    }
    if (wr.RoomCode) {
      const space = index.spaces.find((entry) => entry.code === wr.RoomCode);
      if (space) requestAnimationFrame(() => selectRoom(space.expressId, true));
    }
  }, [searchParams, index, loaded, links, buildingId, data.workRequests, activeSiteId,
    storeyOffset, fitCameraToBox, selectRoom, selectAndFly, setPinsOn]);
}
