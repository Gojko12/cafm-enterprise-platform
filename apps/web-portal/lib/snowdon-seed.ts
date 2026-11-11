import type { BaseWorkRequest, Building, Equipment, Floor, Room } from "@cafm/shared-schema";
import type { BimElementLink, DemoData } from "./cafm-data";
import { createPmOrder } from "./pm-orders";
import { addDays, calendarDate } from "./dispatch";

/**
 * `S01-BL-2 · Snowdon Towers (HVAC Showcase)` — pre-seeded demo content bound to the
 * bundled `public/bim/S01-BL-2.ifc.gz` model (Autodesk "Snowdon Towers Sample HVAC").
 *
 * All IfcGlobalIds, expressIDs, storeys, and rooms below were extracted from the real
 * IFC file with web-ifc, so every seeded Equipment record lands exactly on its 3D
 * element. Applied as a safe idempotent migration inside `scopeData`, so existing
 * saved states receive the showcase without `Reset Demo Data`.
 */

export const SNOWDON_BUILDING_ID = "S01-BL-2";
const SNOWDON_BUILDING_NAME = "Snowdon Towers · HVAC Showcase";
const SEED_STAMP = "2026-11-11T08:00:00.000Z";

const SNOWDON_FLOORS: Array<[string, number]> = [
  ["Parking", -1], ["L1 - Block 35", 0], ["L1 - Block 37", 1], ["L1 - Block 43", 2],
  ["M1", 3], ["L2", 4], ["L3", 5], ["L4", 6], ["L5", 7], ["R1", 8], ["R2", 9],
];

const SNOWDON_ROOMS: Array<[string, string, string]> = [
  ["102", "Cafe Kitchen", "L1 - Block 35"],
  ["109", "Commercial/Retail", "L1 - Block 43"],
  ["201", "Electrical", "L2"],
  ["202", "Live/Work Unit", "L2"],
  ["203", "Studio Unit", "L2"],
  ["205", "Live/Work Unit", "L2"],
  ["4", "Level 2 Gross", "L2"],
  ["303", "Live/Work Unit", "L3"],
  ["304", "Studio Unit", "L3"],
  ["308", "Live/Work Unit", "L3"],
  ["309", "Live/Work Unit", "L3"],
  ["5", "Level 3 Gross", "L3"],
];

interface SnowdonAsset {
  globalId: string;
  expressId: number;
  name: string;
  typeName: string;
  level: string;
  room: string;
  category: Equipment["Category"];
  trade: string;
  /** Live Maintenance Status demo colour this asset should show. */
  demo: "red" | "amber" | "cyan" | "green";
}

/** 10 flagship HVAC/MEP elements harvested from S01-BL-2.ifc (real GlobalIds + locations). */
const SNOWDON_ASSETS: SnowdonAsset[] = [
  { globalId: "3kTQlJ2m13T8zbkDKl7sEg", expressId: 1172, name: "Heat Recovery Unit HRU-L2-202", typeName: "HeatRecoveryUnit:Heat Recovery Unit (HRU)", level: "L2", room: "202", category: "A", trade: "Mechanical", demo: "red" },
  { globalId: "1C302qy0jEhBBvbtn1VCXy", expressId: 1221, name: "Heat Recovery Unit HRU-L2-203", typeName: "HeatRecoveryUnit:Heat Recovery Unit (HRU)", level: "L2", room: "203", category: "A", trade: "Mechanical", demo: "cyan" },
  { globalId: "1C302qy0jEhBBvbtn1VCjo", expressId: 1271, name: "Heat Recovery Unit HRU-L1-109", typeName: "HeatRecoveryUnit:Heat Recovery Unit (HRU)", level: "L1 - Block 43", room: "109", category: "A", trade: "Mechanical", demo: "green" },
  { globalId: "1C302qy0jEhBBvbtn1VCn9", expressId: 1285, name: "Heat Recovery Unit HRU-L3-303", typeName: "HeatRecoveryUnit:Heat Recovery Unit (HRU)", level: "L3", room: "303", category: "A", trade: "Mechanical", demo: "red" },
  { globalId: "1C302qy0jEhBBvbtn1VCnq", expressId: 1310, name: "Heat Recovery Unit HRU-L3-308", typeName: "HeatRecoveryUnit:Heat Recovery Unit (HRU)", level: "L3", room: "308", category: "A", trade: "Mechanical", demo: "amber" },
  { globalId: "1C302qy0jEhBBvbtn1VCoe", expressId: 1352, name: "Heat Recovery Unit HRU-L3-304", typeName: "HeatRecoveryUnit:Heat Recovery Unit (HRU)", level: "L3", room: "304", category: "A", trade: "Mechanical", demo: "green" },
  { globalId: "0uItpyAgXCovb3y_iwf_F$", expressId: 1380, name: "Exhaust Ventilation Cap EC-L2", typeName: "Air Terminal-Exhaust Cap-FB:4\" DIA", level: "L2", room: "4", category: "A", trade: "Mechanical", demo: "amber" },
  { globalId: "0B82sWVf587AtmxOGOUsde", expressId: 1418, name: "Linear Slot Supply Diffuser SD-L2-202", typeName: "Supply Diffuser with Plenum - Linear Slot - Hosted", level: "L2", room: "202", category: "A", trade: "Mechanical", demo: "green" },
  { globalId: "0d1xlIsmn0D9DcDwK83nrR", expressId: 3195, name: "Return Grille RG-L2-202", typeName: "Return Grille - Perforated - Rectangular Face Rectangular Neck:16x10", level: "L2", room: "202", category: "A", trade: "Mechanical", demo: "green" },
  { globalId: "2Zs0cYFRZnHwchAJgbPJpy", expressId: 147512, name: "Commercial Kitchen Extraction Hood KH-102", typeName: "Hood_wPSP:Hood_wPSP", level: "L1 - Block 35", room: "102", category: "K", trade: "Catering", demo: "amber" },
];

/**
 * Picks ten sequential 10-digit EquipmentCodes for the showcase. The preferred
 * `0000000021`–`0000000030` block is used when entirely free; otherwise the first
 * fully-free consecutive block at or above 21 is chosen so existing site assets
 * (and their WRs/schedules) are never overwritten.
 */
function pickShowcaseCodes(equipment: Equipment[]): string[] {
  const used = new Set(equipment.filter((asset) => asset.SiteId === "SITE-01" && /^\d{10}$/.test(asset.EquipmentCode))
    .map((asset) => Number(asset.EquipmentCode)));
  let start = 21;
  while (start < 9_999_999_000) {
    let free = true;
    for (let offset = 0; offset < 10; offset++) {
      if (used.has(start + offset)) { free = false; start = start + offset + 1; break; }
    }
    if (free) break;
  }
  return Array.from({ length: 10 }, (_, index) => String(start + index).padStart(10, "0"));
}

function buildWorkRequest(asset: Equipment, id: string, percentage: 50 | 55, dueDate: string, description: string): BaseWorkRequest {
  return {
    WR_ID: id,
    WR_Type: "FJ",
    ESAWorkType: "Corrective Maintenance",
    Description: description,
    ProblemLocation: `${asset.bl_id} / ${asset.LevelName} / ${asset.RoomCode}`,
    SiteId: "SITE-01",
    bl_id: asset.bl_id,
    LevelName: asset.LevelName,
    RoomCode: asset.RoomCode,
    TradeId: asset.PrimaryTradeId ?? "Mechanical",
    TradeName: asset.PrimaryTradeId ?? "Mechanical",
    EquipmentCodes: [asset.EquipmentCode],
    AssignedCraftpersonIds: [],
    AssignedUserIds: [],
    CreatedBy: "Mark",
    CreatedDate: SEED_STAMP.slice(0, 10),
    UpdatedAt: SEED_STAMP,
    DueDate: dueDate,
    MarginDate: addDays(dueDate, 7),
    WorkRequestStatus: percentage === 55 ? "On Hold" : "Issued",
    WorkRequestSubstatus: percentage === 55 ? "On Hold for Parts" : "Issued",
    Percentage: percentage,
    IsFrozen: percentage === 55,
    ...(percentage === 55 ? { FreezeReason: "Parts", FreezeStartedAt: SEED_STAMP } : {}),
    TotalTimeMinutes: 0,
    StartDateTBD: false,
    EstimatedCostEur: 180,
    RequiresSAT: false,
    RequiresDrawingUpdate: false,
    RequiresInventoryUpdate: false,
    AcceptanceGates: [],
    Activity: [{
      id: `${id}-log-1`, kind: "log", actorId: "Mark", actorName: "Mark", actorRole: "ESA_TM",
      createdAt: SEED_STAMP, text: "Snowdon Towers showcase work request seeded from the BIM demo.",
    }],
  };
}

/**
 * Idempotent migration: ensures SITE-01 carries the Snowdon Towers HVAC showcase
 * (building, floors, rooms, 10 BIM-linked equipment records, demo WRs, a freeze
 * period on the L2/203 mechanical zone, SmartPM `PMS` orders, and `bimElementLinks`).
 * Must run on a v60 (post-`migratePmState`) state. Never throws: on any conflict
 * the original state is returned unchanged.
 */
export function withSnowdonShowcase(data: DemoData): DemoData {
  try {
    if (!data.sites.includes("SITE-01")) return data;
    if (data.equipment.some((asset) => asset.SiteId === "SITE-01" && asset.bimGlobalId === SNOWDON_ASSETS[0].globalId)) return data;

    const today = calendarDate(new Date());
    const codes = pickShowcaseCodes(data.equipment);

    // Building: rebrand the existing S01-BL-2 (or create it) as the Snowdon showcase.
    let buildings = data.buildings;
    const existingBuilding = buildings.find((entry) => entry.SiteId === "SITE-01" && entry.bl_id === SNOWDON_BUILDING_ID);
    if (!existingBuilding) {
      buildings = [...buildings, { bl_id: SNOWDON_BUILDING_ID, SiteId: "SITE-01", Name: SNOWDON_BUILDING_NAME, Address: "Snowdon Towers Sample Project (Autodesk HVAC showcase)", IsActive: true } satisfies Building];
    } else if (existingBuilding.Name !== SNOWDON_BUILDING_NAME) {
      buildings = buildings.map((entry) => entry === existingBuilding ? { ...entry, Name: SNOWDON_BUILDING_NAME } : entry);
    }

    const floors = [...data.floors];
    for (const [levelName, floorNumber] of SNOWDON_FLOORS) {
      if (!floors.some((floor) => floor.SiteId === "SITE-01" && floor.bl_id === SNOWDON_BUILDING_ID && floor.LevelName === levelName)) {
        floors.push({ SiteId: "SITE-01", bl_id: SNOWDON_BUILDING_ID, LevelName: levelName, FloorNumber: floorNumber, IsActive: true } satisfies Floor);
      }
    }

    const rooms = [...data.rooms];
    for (const [code, name, levelName] of SNOWDON_ROOMS) {
      if (!rooms.some((room) => room.SiteId === "SITE-01" && room.bl_id === SNOWDON_BUILDING_ID && room.RoomCode === code)) {
        rooms.push({ SiteId: "SITE-01", bl_id: SNOWDON_BUILDING_ID, LevelName: levelName, RoomCode: code, Name: name, IsDeskReservable: false, IsActive: true } satisfies Room);
      }
    }

    const equipment = [...data.equipment];
    const seededAssets: Equipment[] = [];
    const bimElementLinks: Record<string, BimElementLink> = { ...(data.bimElementLinks ?? {}) };
    SNOWDON_ASSETS.forEach((asset, index) => {
      const code = codes[index];
      if (equipment.some((entry) => entry.SiteId === "SITE-01" && entry.EquipmentCode === code)) return;
      const record: Equipment = {
        EquipmentCode: code,
        EquipmentName: asset.name,
        Category: asset.category,
        HierarchyLevel: "Installation",
        IsInstallation: true,
        Status: "In Service",
        TechnicalSpecifications: { source: "Snowdon Towers Sample HVAC", ifcType: asset.typeName },
        bl_id: SNOWDON_BUILDING_ID,
        SiteId: "SITE-01",
        LevelName: asset.level,
        RoomCode: asset.room,
        PrimaryTradeId: asset.trade,
        Manufacturer: "Snowdon Mechanical Systems",
        Model: `SNW-${100 + index}`,
        Criticality: asset.demo === "red" ? "High" : "Medium",
        bimGlobalId: asset.globalId,
        bimExpressId: asset.expressId,
        bimBuildingId: SNOWDON_BUILDING_ID,
        bimCategory: "Mechanical Equipment",
        bimTypeName: asset.typeName,
        CreatedAt: SEED_STAMP,
        UpdatedAt: SEED_STAMP,
      };
      equipment.push(record);
      seededAssets.push(record);
      bimElementLinks[`${SNOWDON_BUILDING_ID}:${asset.globalId}`] = {
        equipmentCode: code, buildingId: SNOWDON_BUILDING_ID, updatedAt: SEED_STAMP, updatedBy: "Mark",
      };
    });
    if (!seededAssets.length) return data;

    // Live Maintenance Status variety: 2 overdue (red), 3 open 50%/55% (amber),
    // 1 freeze period on the L2/203 Snowdon mechanical zone (cyan), 4 healthy (emerald).
    const byGlobalId = new Map(seededAssets.map((record) => [record.bimGlobalId!, record]));
    const workRequests = [...data.workRequests];
    const wrSeeds: Array<{ globalId: string; id: string; percentage: 50 | 55; due: string; text: string }> = [
      { globalId: SNOWDON_ASSETS[0].globalId, id: "2026990001", percentage: 50, due: addDays(today, -10), text: "HRU supply fan vibration above limit — overdue corrective action." },
      { globalId: SNOWDON_ASSETS[3].globalId, id: "2026990002", percentage: 50, due: addDays(today, -4), text: "Heat recovery core differential pressure alarm — overdue inspection." },
      { globalId: SNOWDON_ASSETS[4].globalId, id: "2026990003", percentage: 50, due: addDays(today, 21), text: "Replace HRU filter set and verify airflow balance." },
      { globalId: SNOWDON_ASSETS[6].globalId, id: "2026990004", percentage: 55, due: addDays(today, 14), text: "Exhaust cap bird guard damaged — waiting for spare parts." },
      { globalId: SNOWDON_ASSETS[9].globalId, id: "2026990005", percentage: 50, due: addDays(today, 30), text: "Kitchen extraction hood deep clean and PSP nozzle check." },
    ];
    for (const seed of wrSeeds) {
      const record = byGlobalId.get(seed.globalId);
      if (!record || workRequests.some((wr) => wr.WR_ID === seed.id && wr.SiteId === "SITE-01")) continue;
      workRequests.push(buildWorkRequest(record, seed.id, seed.percentage, seed.due, seed.text));
    }

    const locationFreezes = [...(data.locationFreezes ?? [])];
    if (!locationFreezes.some((freeze) => freeze.id === "SITE-01-snowdon-freeze")) {
      locationFreezes.push({
        id: "SITE-01-snowdon-freeze", siteId: "SITE-01", buildingId: SNOWDON_BUILDING_ID, floorId: "L2", roomId: "203",
        title: "Snowdon L2 Mechanical Zone Shutdown",
        description: "Studio unit 203 mechanical zone is isolated for refrigerant line recertification.",
        responsiblePerson: "Yvonne",
        startDateTime: `${addDays(today, -2)}T06:00`, endDateTime: `${addDays(today, 180)}T20:00`,
        allowPM: false, allowFJ: false, allowLJ: false,
      });
    }

    // SmartPM orders for every showcase asset (viewer shows Next Occurrence in DD-MM-YYYY).
    const schedules = [...data.schedules];
    const blueprint = data.blueprints
      .filter((entry) => (!entry.SiteId || entry.SiteId === "SITE-01") && entry.IsActive && entry.blueprintMode !== "family_ladder" && entry.TradeId === "Mechanical")
      .sort((a, b) => a.ChecklistCode.localeCompare(b.ChecklistCode))[0];
    if (blueprint) {
      const highWatermark = Math.max(data.pmsOrderHighWatermark ?? 0, 0, ...schedules.map((order) => Number(order.ScheduleId) || 0));
      for (const record of seededAssets) {
        try {
          schedules.push(createPmOrder(schedules, data.blueprints, blueprint, record, addDays(today, 14), "Mark", highWatermark));
        } catch (scheduleError) {
          console.warn(`Snowdon PMS order skipped for ${record.EquipmentCode}`, scheduleError);
        }
      }
    }

    return { ...data, buildings, floors, rooms, equipment, workRequests, locationFreezes, schedules, bimElementLinks };
  } catch (error) {
    console.warn("Snowdon Towers showcase migration was skipped", error);
    return data;
  }
}
