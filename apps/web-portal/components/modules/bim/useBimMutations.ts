"use client";

import { useCallback, useState } from "react";
import type { Building, Equipment, Floor, Room, SiteId } from "@cafm/shared-schema";
import { buildFastJobWR } from "@/lib/fj-factory";
import { bimLinkKey, findMissingSyncItems, nextSequentialEquipmentCode, resolveBimManufacturer, suggestEquipmentCategory, suggestEquipmentTrade, type BimElement, type BimModelIndex } from "@/lib/ifc-cafm-bridge";
import type { BimModelInfo } from "@/components/common/LocateInBim";
import type { FastJobData } from "../FastJobModal";
import { displayName, type CafmData, type SetState } from "./bim-viewport-math";

type MissingItems = ReturnType<typeof findMissingSyncItems>;

export function useBimMutations({
  data,
  setData,
  activeSiteId,
  buildingId,
  activePerson,
  index,
  missing,
  siteEquipment,
  canCreateFastJob,
  actor,
  setIndex,
  setError,
  setNotice,
  setAssignOpen,
  setAssignQuery,
  setFastJobOpen,
  refreshModels,
}: {
  data: CafmData;
  setData: SetState<CafmData>;
  activeSiteId: SiteId;
  buildingId: string;
  activePerson: string;
  index: BimModelIndex | null;
  missing: MissingItems | null;
  siteEquipment: Equipment[];
  canCreateFastJob: boolean;
  actor: { userId?: string; displayName: string; role: string; personId?: string };
  setIndex: SetState<BimModelIndex | null>;
  setError: SetState<string>;
  setNotice: SetState<string>;
  setAssignOpen: SetState<boolean>;
  setAssignQuery: SetState<string>;
  setFastJobOpen: SetState<boolean>;
  refreshModels: (force?: boolean) => Promise<BimModelInfo[]>;
}) {
  const [busy, setBusy] = useState(false);

  const patchMark = useCallback(async (element: BimElement, equipmentCode: string) => {
    const response = await fetch("/api/bim-models", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: activeSiteId, buildingId, ifcGlobalId: element.globalId, expressId: element.expressId, equipmentCode }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body ? String(body.error) : "Could not write the Mark into the .ifc file.";
      throw new Error(message);
    }
    await refreshModels();
  }, [activeSiteId, buildingId, refreshModels]);

  const applyLocalMark = useCallback((expressId: number, mark: string) => {
    setIndex((previous) => previous
      ? { ...previous, elements: previous.elements.map((element) => element.expressId === expressId ? { ...element, mark } : element) }
      : previous);
  }, [setIndex]);

  const clearBimFields = (asset: Equipment): Equipment => ({
    ...asset, bimGlobalId: undefined, bimExpressId: undefined, bimBuildingId: undefined, bimCategory: undefined, bimTypeName: undefined,
  });

  const assignExisting = async (element: BimElement, equipmentCode: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await patchMark(element, equipmentCode);
      const stamp = new Date().toISOString();
      setData((current) => ({
        ...current,
        equipment: current.equipment.map((asset) => {
          if (asset.SiteId !== activeSiteId) return asset;
          if (asset.EquipmentCode === equipmentCode) {
            return {
              ...asset, bimGlobalId: element.globalId, bimExpressId: element.expressId, bimBuildingId: buildingId,
              bimCategory: element.category || undefined, bimTypeName: element.typeName || undefined, UpdatedAt: stamp,
            };
          }
          return asset.bimGlobalId === element.globalId && asset.bimBuildingId === buildingId ? clearBimFields(asset) : asset;
        }),
        bimElementLinks: {
          ...(current.bimElementLinks ?? {}),
          [bimLinkKey(buildingId, element.globalId)]: { equipmentCode, buildingId, updatedAt: stamp, updatedBy: activePerson },
        },
      }));
      applyLocalMark(element.expressId, equipmentCode);
      setAssignOpen(false);
      setAssignQuery("");
      setNotice(`Linked ${equipmentCode} and wrote Mark='${equipmentCode}' into the .ifc file.`);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "The EQ ID assignment failed.");
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (element: BimElement) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await patchMark(element, "");
      setData((current) => {
        const nextLinks = { ...(current.bimElementLinks ?? {}) };
        delete nextLinks[bimLinkKey(buildingId, element.globalId)];
        return {
          ...current,
          equipment: current.equipment.map((asset) =>
            asset.SiteId === activeSiteId && asset.bimGlobalId === element.globalId && asset.bimBuildingId === buildingId ? clearBimFields(asset) : asset),
          bimElementLinks: nextLinks,
        };
      });
      applyLocalMark(element.expressId, "");
      setNotice("The EQ ID was unassigned and the Mark was cleared in the .ifc file.");
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Unassigning the EQ ID failed.");
    } finally {
      setBusy(false);
    }
  };

  const createNewEquipment = async (element: BimElement) => {
    if (busy || !index) return;
    setBusy(true);
    setError("");
    try {
      const code = nextSequentialEquipmentCode(siteEquipment);
      const level = element.storeyName || index.storeys[0]?.name || "Level 0";
      const space = index.spaces.find((entry) => entry.code === element.roomCode)
        ?? index.spaces.find((entry) => entry.storeyName === level);
      const room = element.roomCode || space?.code || `${buildingId}-GEN`;
      await patchMark(element, code);
      const stamp = new Date().toISOString();
      setData((current) => {
        const hasBuilding = current.buildings.some((entry) => entry.bl_id === buildingId && entry.SiteId === activeSiteId);
        const hasFloor = current.floors.some((entry) => entry.bl_id === buildingId && entry.LevelName === level && entry.SiteId === activeSiteId);
        const hasRoom = current.rooms.some((entry) => entry.bl_id === buildingId && entry.RoomCode === room && entry.SiteId === activeSiteId);
        const newBuilding: Building = { bl_id: buildingId, SiteId: activeSiteId, Name: index.buildingName || buildingId, Address: "Imported from IFC model", IsActive: true };
        const newFloor: Floor = { bl_id: buildingId, SiteId: activeSiteId, LevelName: level, FloorNumber: Math.max(index.storeys.findIndex((storey) => storey.name === level), 0), IsActive: true };
        const newRoom: Room = { bl_id: buildingId, SiteId: activeSiteId, LevelName: level, RoomCode: room, Name: space?.longName || room, IsDeskReservable: false, IsActive: true };
        const newAsset: Equipment = {
          EquipmentCode: code,
          EquipmentName: displayName(element),
          Category: suggestEquipmentCategory(element),
          HierarchyLevel: "Installation",
          IsInstallation: true,
          Status: "In Service",
          TechnicalSpecifications: {},
          bl_id: buildingId,
          SiteId: activeSiteId,
          LevelName: level,
          RoomCode: room,
          PrimaryTradeId: suggestEquipmentTrade(element),
          bimGlobalId: element.globalId,
          bimExpressId: element.expressId,
          bimBuildingId: buildingId,
          bimCategory: element.category || undefined,
          bimTypeName: element.typeName || undefined,
          CreatedAt: stamp,
          UpdatedAt: stamp,
        };
        return {
          ...current,
          buildings: hasBuilding ? current.buildings : [...current.buildings, newBuilding],
          floors: hasFloor ? current.floors : [...current.floors, newFloor],
          rooms: hasRoom ? current.rooms : [...current.rooms, newRoom],
          equipment: [...current.equipment, newAsset],
          bimElementLinks: {
            ...(current.bimElementLinks ?? {}),
            [bimLinkKey(buildingId, element.globalId)]: { equipmentCode: code, buildingId, updatedAt: stamp, updatedBy: activePerson },
          },
        };
      });
      applyLocalMark(element.expressId, code);
      setNotice(`Created CAFM equipment ${code} from the IFC element and wrote its Mark into the .ifc file.`);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Creating the equipment failed.");
    } finally {
      setBusy(false);
    }
  };

  const syncMissingToCafm = () => {
    if (!index || !missing) return;
    const stamp = new Date().toISOString();
    setData((current) => {
      const hasBuilding = current.buildings.some((entry) => entry.bl_id === buildingId && entry.SiteId === activeSiteId);
      const buildings = hasBuilding ? current.buildings : [...current.buildings, {
        bl_id: buildingId, SiteId: activeSiteId, Name: index.buildingName || buildingId, Address: "Imported from IFC model", IsActive: true,
      } satisfies Building];
      const floors = [...current.floors];
      for (const storey of missing.floors) {
        if (!floors.some((entry) => entry.bl_id === buildingId && entry.LevelName === storey.name && entry.SiteId === activeSiteId)) {
          floors.push({ bl_id: buildingId, SiteId: activeSiteId, LevelName: storey.name, FloorNumber: Math.max(index.storeys.findIndex((item) => item.name === storey.name), 0), IsActive: true } satisfies Floor);
        }
      }
      const rooms = [...current.rooms];
      for (const space of missing.rooms) {
        if (!rooms.some((entry) => entry.bl_id === buildingId && entry.RoomCode === space.code && entry.SiteId === activeSiteId)) {
          rooms.push({ bl_id: buildingId, SiteId: activeSiteId, LevelName: space.storeyName || index.storeys[0]?.name || "Level 0", RoomCode: space.code, Name: space.longName || space.code, IsDeskReservable: false, IsActive: true } satisfies Room);
        }
      }
      const equipment = [...current.equipment];
      for (const element of missing.taggedAssets) {
        if (equipment.some((asset) => asset.EquipmentCode === element.mark && asset.SiteId === activeSiteId)) continue;
        const level = element.storeyName || index.storeys[0]?.name || "Level 0";
        const space = index.spaces.find((entry) => entry.code === element.roomCode) ?? index.spaces.find((entry) => entry.storeyName === level);
        equipment.push({
          EquipmentCode: element.mark,
          EquipmentName: displayName(element),
          Category: suggestEquipmentCategory(element),
          HierarchyLevel: "Installation",
          IsInstallation: true,
          Status: "In Service",
          TechnicalSpecifications: {},
          bl_id: buildingId,
          SiteId: activeSiteId,
          LevelName: level,
          RoomCode: element.roomCode || space?.code || `${buildingId}-GEN`,
          PrimaryTradeId: suggestEquipmentTrade(element),
          bimGlobalId: element.globalId,
          bimExpressId: element.expressId,
          bimBuildingId: buildingId,
          bimCategory: element.category || undefined,
          bimTypeName: element.typeName || undefined,
          CreatedAt: stamp,
          UpdatedAt: stamp,
        } satisfies Equipment);
      }
      return { ...current, buildings, floors, rooms, equipment };
    });
    setNotice("The missing floors, rooms, and tagged assets were synced to CAFM.");
  };

  const downloadIfc = async () => {
    try {
      const response = await fetch(`/api/bim-models?siteId=${encodeURIComponent(activeSiteId)}&buildingId=${encodeURIComponent(buildingId)}&download=1&rawIfc=1`, { cache: "no-store" });
      if (!response.ok) throw new Error("The download failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${buildingId}.ifc`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "The download failed.");
    }
  };

  const createFastJob = (job: FastJobData) => {
    if (!canCreateFastJob) { alert("Permission required to create a Fast Job."); return; }
    const newWR = buildFastJobWR(job, { siteId: activeSiteId, data, actor, source: job.bimPin ? "Fast Job pinned at an exact 3D spot in the BIM viewer" : "Fast Job created from the 3D BIM viewer" });
    setData((current) => ({ ...current, workRequests: [...current.workRequests, newWR] }));
    setFastJobOpen(false);
    setNotice(`Fast Job ${newWR.WR_ID} was created.`);
  };

  /** 1-click `Sync IFC Metadata → CAFM Specs`: copies the 3D element's identity into the linked asset. */
  const syncIfcSpecs = (element: BimElement, equipmentCode: string) => {
    const stamp = new Date().toISOString();
    const size = element.bbox
      ? `${(element.bbox.max[0] - element.bbox.min[0]).toFixed(2)} × ${(element.bbox.max[2] - element.bbox.min[2]).toFixed(2)} × ${(element.bbox.max[1] - element.bbox.min[1]).toFixed(2)} m`
      : "";
    setData((current) => ({
      ...current,
      equipment: current.equipment.map((asset) => {
        if (asset.SiteId !== activeSiteId || asset.EquipmentCode !== equipmentCode) return asset;
        const manufacturer = resolveBimManufacturer(element, asset.Manufacturer);
        return {
          ...asset,
          Manufacturer: asset.Manufacturer?.trim() ? asset.Manufacturer : manufacturer || undefined,
          bimCategory: element.category || asset.bimCategory,
          bimTypeName: element.typeName || asset.bimTypeName,
          TechnicalSpecifications: {
            ...asset.TechnicalSpecifications,
            "IFC Class": element.ifcType,
            "IFC Type / Family": element.typeName || element.name,
            ...(manufacturer ? { Manufacturer: manufacturer } : {}),
            ...(element.storeyName ? { "IFC Storey": element.storeyName } : {}),
            ...(size ? { "BBox Dimensions (m)": size } : {}),
          },
          UpdatedAt: stamp,
        };
      }),
    }));
    setNotice(`IFC metadata was synced into the technical specifications of ${equipmentCode}.`);
  };

  return { busy, assignExisting, unassign, createNewEquipment, syncMissingToCafm, downloadIfc, createFastJob, syncIfcSpecs };
}
