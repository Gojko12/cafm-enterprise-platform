"use client";

import { useCallback, useState } from "react";
import type * as THREE from "three";
import type { BimModelIndex, LoadedBimModel } from "@/lib/ifc-cafm-bridge";
import type { FastJobData } from "@/lib/fj-factory";
import { pickAtModel, resolveSpaceAtWorldPoint } from "./bim-scene-helpers";
import {
  displayName, elementMapOf,
  type BimLinkMap, type CafmData, type FastJobLocation, type FastJobPrefill, type SetState,
} from "./bim-viewport-math";

/**
 * `⚡ + Fast Job at Spot` click-to-pin mode: picks any visible surface (floors,
 * ceilings, walls, lamps, toilets, equipment), resolves the containing / nearest
 * IfcSpace room plus the clicked element, and prefills a 50% Issued Fast Job
 * carrying an exact `bimPin` with un-exploded base Y.
 */
export function useBimSpotPins({
  index,
  data,
  buildingId,
  links,
  storeyOffset,
  createFastJob,
  setPinsOn,
  setFastJobLocation,
  setFastJobOpen,
}: {
  index: BimModelIndex | null;
  data: CafmData;
  buildingId: string;
  links: BimLinkMap;
  storeyOffset: (storeyName: string) => number;
  createFastJob: (job: FastJobData) => void;
  setPinsOn: SetState<boolean>;
  setFastJobLocation: SetState<FastJobLocation>;
  setFastJobOpen: SetState<boolean>;
}) {
  const [pinFjMode, setPinFjMode] = useState(false);
  const [fastJobPrefill, setFastJobPrefill] = useState<FastJobPrefill>(null);

  const openFastJob = useCallback((prefill: FastJobPrefill, location: FastJobLocation) => {
    setFastJobPrefill(prefill);
    setFastJobLocation(location);
    setFastJobOpen(true);
  }, [setFastJobLocation, setFastJobOpen]);

  const pickSpot = useCallback((
    raycaster: THREE.Raycaster,
    model: LoadedBimModel,
    activeClippingPlanes: THREE.Plane[],
    xray: boolean,
  ) => {
    const { result, point } = pickAtModel(raycaster, model, activeClippingPlanes, xray, "pin-fj");
    if (!point || !index) return;
    const element = result?.kind === "element" ? elementMapOf(index).get(result.expressId) : undefined;
    const space = resolveSpaceAtWorldPoint(model, point, storeyOffset)
      ?? (element?.roomCode ? index.spaces.find((entry) => entry.code === element.roomCode) ?? null : null);
    const storeyName = space?.storeyName || element?.storeyName || "";
    const roomCode = space?.code || element?.roomCode || "";
    const cafmRoom = roomCode ? data.rooms.find((room) => room.bl_id === buildingId && room.RoomCode === roomCode) : undefined;
    const equipmentCode = element ? links.get(element.expressId)?.equipmentCode : undefined;
    const spotLabel = equipmentCode && element ? `${equipmentCode} · ${displayName(element)}`
      : element ? displayName(element)
        : roomCode ? `Room ${roomCode}` : "3D spot";
    openFastJob({
      equipmentCode,
      spotLabel,
      bimPin: {
        buildingId,
        storeyName: storeyName || undefined,
        roomCode: roomCode || undefined,
        x: point.x,
        // Un-exploded base Y so the pin shifts smoothly with the Explode Storeys slider.
        y: point.y - storeyOffset(storeyName),
        z: point.z,
        globalId: element?.globalId,
        spotLabel,
      },
    }, roomCode ? { bl_id: buildingId, levelName: cafmRoom?.LevelName ?? storeyName, roomCode } : null);
    setPinFjMode(false);
  }, [index, data.rooms, buildingId, links, storeyOffset, openFastJob]);

  const submitFastJob = useCallback((job: FastJobData) => {
    createFastJob(job);
    // Auto-enable Issue Pins so the freshly created 3D spot pin is immediately visible.
    if (job.bimPin) setPinsOn(true);
    setFastJobPrefill(null);
  }, [createFastJob, setPinsOn]);

  const closeFastJob = useCallback(() => {
    setFastJobOpen(false);
    setFastJobPrefill(null);
  }, [setFastJobOpen]);

  return { pinFjMode, setPinFjMode, fastJobPrefill, openFastJob, pickSpot, submitFastJob, closeFastJob };
}
