import type { BaseWorkRequest, Building, Equipment, Floor, Room } from "@cafm/shared-schema";
import type { BimElementLink, DemoData } from "./cafm-data";
import { createPmOrder } from "./pm-orders";
import { addDays, calendarDate } from "./dispatch";

/**
 * `02-S_V1 · S Building (Darmstadt Showcase)` — pre-seeded demo content bound to the
 * bundled `public/bim/02-S_V1.ifc.gz` model (Revit export of the example building
 * that mimics the ESOC S building at site 02, Darmstadt).
 *
 * All IfcGlobalIds, expressIDs, storeys, and rooms below were extracted from the
 * real IFC file, so every seeded Equipment record lands exactly on its 3D element.
 * Applied as a safe idempotent migration inside `scopeData`, so existing saved
 * states receive the showcase without `Reset Demo Data`.
 */

const SB_MODEL_ID = "02-S_V1";
const SB_BUILDING_NAME = "S Building · ESOC Darmstadt";
const SEED_STAMP = "2026-11-18T08:00:00.000Z";

const SB_FLOORS: Array<[string, number]> = [
  ["Basement", -1], ["Ground Floor", 0], ["Level 1", 1], ["Level 2", 2],
  ["Level 3", 3], ["Level 4", 4], ["Level 5", 5], ["Roof", 6],
];

const SB_ROOMS: Array<[string, string, string]> = [
  ["-125", "Basement Plant Room 125", "Basement"],
  ["-109", "Basement Pump Room 109", "Basement"],
  ["003", "Ground Floor WC 003", "Ground Floor"],
  ["004", "Ground Floor WC 004", "Ground Floor"],
  ["110", "Level 1 Kitchenette and Pantry", "Level 1"],
  ["127", "Level 1 Copy Room", "Level 1"],
  ["535", "Level 5 Plant Zone 535", "Level 5"],
  ["S10", "Roof Plant Zone S10", "Roof"],
  ["S26", "Roof Plant Zone S26", "Roof"],
];

interface SbAsset {
  globalId: string;
  expressId: number;
  name: string;
  typeName: string;
  level: string;
  room: string;
  category: Equipment["Category"];
  trade: string;
  manufacturer: string;
  model: string;
  bimCategory: string;
  /** Live Maintenance Status demo colour this asset should show. */
  demo: "red" | "amber" | "cyan" | "green";
}

/** 12 flagship assets harvested from 02-S_V1.ifc (real GlobalIds + storeys + rooms). */
const SB_ASSETS: SbAsset[] = [
  { globalId: "2IEGO32UH9wQ$IqcIYLpmx", expressId: 107034, name: "AHU 1", typeName: "AHU_1:AHU_1", level: "Roof", room: "S10", category: "A", trade: "Mechanical", manufacturer: "Systemair", model: "TopVX SR 35", bimCategory: "Mechanical Equipment", demo: "red" },
  { globalId: "1W4btLSR1FERhnIy3AN4RP", expressId: 107587, name: "AHU 2", typeName: "AHU_2:AHU_1", level: "Roof", room: "S26", category: "A", trade: "Mechanical", manufacturer: "Systemair", model: "TopVX SR 35", bimCategory: "Mechanical Equipment", demo: "green" },
  { globalId: "1W4btLSR1FERhnIy3AN4PB", expressId: 107515, name: "Condensing Unit DX 422 kW", typeName: "Condensing Unit - Air Cooled - DX - 422-457 kW", level: "Level 5", room: "535", category: "A", trade: "Mechanical", manufacturer: "Carrier", model: "30RB 422", bimCategory: "Mechanical Equipment", demo: "amber" },
  { globalId: "1W4btLSR1FERhnIy3ANqAM", expressId: 180054, name: "Water Heater Fondital 100 PU E", typeName: "HVAC_Water Heaters_Fondital_WHPF PU E_100:100 PU E", level: "Basement", room: "-125", category: "H", trade: "Mechanical", manufacturer: "Fondital", model: "WHPF PU E 100", bimCategory: "Mechanical Equipment", demo: "amber" },
  { globalId: "1W4btLSR1FERhnIy3ANqh$", expressId: 180332, name: "Water Heater Fondital 24 PU E", typeName: "HVAC_Water Heaters_Fondital_WHPF PU E_24-50:24 PU E", level: "Basement", room: "-125", category: "H", trade: "Mechanical", manufacturer: "Fondital", model: "WHPF PU E 24-50", bimCategory: "Mechanical Equipment", demo: "green" },
  { globalId: "1W4btLSR1FERhnIy3ANrlC", expressId: 179050, name: "DELTA HCU Booster Set UK", typeName: "modular system-delta hcu uk-groundfos-deltahcu-international", level: "Basement", room: "-109", category: "D", trade: "Mechanical", manufacturer: "Grundfos", model: "DELTA HCU-G 2TPE2", bimCategory: "Mechanical Equipment", demo: "cyan" },
  { globalId: "1W4btLSR1FERhnIy3ANuSx", expressId: 168699, name: "Lovato Macro E5-SR PRO", typeName: "Lovato_Macuk_E S-SR PRO", level: "Basement", room: "-109", category: "B", trade: "Electrical", manufacturer: "Lovato", model: "Macro E5-SR PRO", bimCategory: "Electrical Fixtures", demo: "cyan" },
  { globalId: "1WS$B7$zX1WPpH6LNEChXO", expressId: 206647, name: "ABB System pro E Energy Cabinet", typeName: "ABB_System pro E energy M _BOM IP55:IP55 2000 X 800 X 250 with door", level: "Level 1", room: "110", category: "E", trade: "Electrical", manufacturer: "ABB", model: "System pro E IP55 2000x800x250", bimCategory: "Electrical Fixtures", demo: "amber" },
  { globalId: "1WS$B7$zX1WPpH6LNEChJJ", expressId: 207300, name: "Copier Floor", typeName: "Specialty_Equipment_Copier-Floor:Standard", level: "Level 1", room: "127", category: "G", trade: "Civil", manufacturer: "Canon", model: "imageRUNNER C5560", bimCategory: "Specialty Equipment", demo: "green" },
  { globalId: "0n5D8NmrXFq8arGlOuroLG", expressId: 208958, name: "Kitchen Unit", typeName: "Kitchen Unit:635 mmx2135 mm", level: "Level 1", room: "110", category: "K", trade: "Catering", manufacturer: "Belling", model: "Kitchenette 635x2135", bimCategory: "Plumbing Fixtures", demo: "red" },
  { globalId: "0RGdgzwsP6nhCXvp6qx2Rr", expressId: 212961, name: "Duravit DuraStyle Wall Toilet", typeName: "Sanitary_Toilets_DURAVIT-AG_DuraStyle-wall-mounted-toilet-257109", level: "Ground Floor", room: "003", category: "D", trade: "Civil", manufacturer: "Duravit", model: "DuraStyle 257109", bimCategory: "Plumbing Fixtures", demo: "amber" },
  { globalId: "1W4btLSR1FERhnIy3AN6Kn", expressId: 150757, name: "Haws Emergency Tempering Skid", typeName: "Water_Heater-Haws_Corporation-Enclosed_Emergency_Environments_8780", level: "Basement", room: "-125", category: "D", trade: "Civil", manufacturer: "Haws Corporation", model: "8780 Tempering Skid", bimCategory: "Plumbing Fixtures", demo: "amber" },
];

/**
 * Picks twelve sequential 10-digit EquipmentCodes for the showcase: the first
 * fully-free consecutive block at or above 21, so the Snowdon showcase block
 * (21-30 when free) and existing site assets are never overwritten.
 */
function pickSbCodes(equipment: Equipment[]): string[] {
  const used = new Set(equipment.filter((asset) => asset.SiteId === "02-ESOC" && /^\d{10}$/.test(asset.EquipmentCode))
    .map((asset) => Number(asset.EquipmentCode)));
  let start = 21;
  while (start < 9_999_999_000) {
    let free = true;
    for (let offset = 0; offset < SB_ASSETS.length; offset++) {
      if (used.has(start + offset)) { free = false; start = start + offset + 1; break; }
    }
    if (free) break;
  }
  return Array.from({ length: SB_ASSETS.length }, (_, index) => String(start + index).padStart(10, "0"));
}

function buildWorkRequest(asset: Equipment, id: string, percentage: 50 | 55, dueDate: string, description: string): BaseWorkRequest {
  return {
    WR_ID: id,
    WR_Type: "FJ",
    ESAWorkType: "Corrective Maintenance",
    Description: description,
    ProblemLocation: `${asset.bl_id} / ${asset.LevelName} / ${asset.RoomCode}`,
    SiteId: "02-ESOC",
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
      createdAt: SEED_STAMP, text: "S Building Darmstadt showcase work request seeded from the BIM demo.",
    }],
  };
}

/**
 * Idempotent migration: ensures 02-ESOC carries the S Building showcase (building,
 * floors, rooms, 12 BIM-linked equipment records, demo WRs, a freeze on the
 * Basement pump room, SmartPM `PMS` orders, and `bimElementLinks`). Must run after
 * `withSnowdonShowcase` so the two showcases never collide on equipment codes.
 * Never throws: on any conflict the original state is returned unchanged.
 */
export function withSBuildingShowcase(data: DemoData): DemoData {
  try {
    if (!data.sites.includes("02-ESOC")) return data;
    if (data.equipment.some((asset) => asset.SiteId === "02-ESOC" && asset.bimGlobalId === SB_ASSETS[0].globalId)) return data;

    const today = calendarDate(new Date());
    const codes = pickSbCodes(data.equipment);

    let buildings = data.buildings;
    if (!buildings.some((entry) => entry.SiteId === "02-ESOC" && entry.bl_id === SB_MODEL_ID)) {
      buildings = [...buildings, { bl_id: SB_MODEL_ID, SiteId: "02-ESOC", Name: SB_BUILDING_NAME, Address: "ESOC Darmstadt, Germany (example building mimicking the S building)", IsActive: true } satisfies Building];
    }

    const floors = [...data.floors];
    for (const [levelName, floorNumber] of SB_FLOORS) {
      if (!floors.some((floor) => floor.SiteId === "02-ESOC" && floor.bl_id === SB_MODEL_ID && floor.LevelName === levelName)) {
        floors.push({ SiteId: "02-ESOC", bl_id: SB_MODEL_ID, LevelName: levelName, FloorNumber: floorNumber, IsActive: true } satisfies Floor);
      }
    }

    const rooms = [...data.rooms];
    for (const [code, name, levelName] of SB_ROOMS) {
      if (!rooms.some((room) => room.SiteId === "02-ESOC" && room.bl_id === SB_MODEL_ID && room.RoomCode === code)) {
        rooms.push({ SiteId: "02-ESOC", bl_id: SB_MODEL_ID, LevelName: levelName, RoomCode: code, Name: name, IsDeskReservable: false, IsActive: true } satisfies Room);
      }
    }

    const equipment = [...data.equipment];
    const seededAssets: Equipment[] = [];
    const bimElementLinks: Record<string, BimElementLink> = { ...(data.bimElementLinks ?? {}) };
    SB_ASSETS.forEach((asset, index) => {
      const code = codes[index];
      if (equipment.some((entry) => entry.SiteId === "02-ESOC" && entry.EquipmentCode === code)) return;
      const record: Equipment = {
        EquipmentCode: code,
        EquipmentName: asset.name,
        Category: asset.category,
        HierarchyLevel: "Installation",
        IsInstallation: true,
        Status: "In Service",
        TechnicalSpecifications: { source: "02-S_V1 Revit export", ifcType: asset.typeName },
        bl_id: SB_MODEL_ID,
        SiteId: "02-ESOC",
        LevelName: asset.level,
        RoomCode: asset.room,
        PrimaryTradeId: asset.trade,
        Manufacturer: asset.manufacturer,
        Model: asset.model,
        Criticality: asset.demo === "red" ? "High" : asset.category === "E" || asset.category === "D" ? "High" : "Medium",
        InstallationDate: "2026-03-15",
        WarrantyExpiryDate: "2029-03-15",
        bimGlobalId: asset.globalId,
        bimExpressId: asset.expressId,
        bimBuildingId: SB_MODEL_ID,
        bimCategory: asset.bimCategory,
        bimTypeName: asset.typeName,
        CreatedAt: SEED_STAMP,
        UpdatedAt: SEED_STAMP,
      };
      equipment.push(record);
      seededAssets.push(record);
      bimElementLinks[`${SB_MODEL_ID}:${asset.globalId}`] = {
        equipmentCode: code, buildingId: SB_MODEL_ID, updatedAt: SEED_STAMP, updatedBy: "Mark",
      };
    });
    if (!seededAssets.length) return data;

    // Live Maintenance Status variety: 2 overdue (red), 5 open 50%/55% (amber),
    // 1 freeze period on the Basement -109 pump room (cyan), 4 healthy (emerald).
    const byGlobalId = new Map(seededAssets.map((record) => [record.bimGlobalId!, record]));
    const workRequests = [...data.workRequests];
    const wrSeeds: Array<{ globalId: string; id: string; percentage: 50 | 55; due: string; text: string }> = [
      { globalId: SB_ASSETS[0].globalId, id: "2026990101", percentage: 50, due: addDays(today, -10), text: "AHU 1 supply air temperature drift; filter bank differential pressure limit exceeded. Overdue corrective maintenance." },
      { globalId: SB_ASSETS[9].globalId, id: "2026990102", percentage: 50, due: addDays(today, -4), text: "Water leak under kitchen sink module; cabinet base saturated. Overdue repair." },
      { globalId: SB_ASSETS[2].globalId, id: "2026990103", percentage: 50, due: addDays(today, 7), text: "Refrigerant leak check and condenser coil clean on the 422 kW DX condensing unit." },
      { globalId: SB_ASSETS[3].globalId, id: "2026990104", percentage: 50, due: addDays(today, 21), text: "Annual burner service and flue gas inspection on the Fondital 100 PU E storage heater." },
      { globalId: SB_ASSETS[7].globalId, id: "2026990105", percentage: 50, due: addDays(today, 30), text: "Thermographic inspection of the 2000 X 800 distribution board per the electrical safety plan." },
      { globalId: SB_ASSETS[10].globalId, id: "2026990106", percentage: 55, due: addDays(today, 14), text: "Wall-mounted toilet flush valve stuck; waiting for the spare valve cartridge." },
      { globalId: SB_ASSETS[11].globalId, id: "2026990107", percentage: 55, due: addDays(today, 10), text: "Emergency drench water tempering skid annual flow test; valve cartridge on order." },
    ];
    for (const seed of wrSeeds) {
      const record = byGlobalId.get(seed.globalId);
      if (!record || workRequests.some((wr) => wr.WR_ID === seed.id && wr.SiteId === "02-ESOC")) continue;
      workRequests.push(buildWorkRequest(record, seed.id, seed.percentage, seed.due, seed.text));
    }

    const locationFreezes = [...(data.locationFreezes ?? [])];
    if (!locationFreezes.some((freeze) => freeze.id === "SITE-02-sb-pumproom-freeze")) {
      locationFreezes.push({
        id: "SITE-02-sb-pumproom-freeze", siteId: "02-ESOC", buildingId: SB_MODEL_ID, floorId: "Basement", roomId: "-109",
        title: "Basement Pump Room Isolation",
        description: "Pump room -109 is isolated while the DELTA HCU booster set is re-commissioned.",
        responsiblePerson: "Thomas",
        startDateTime: `${addDays(today, -2)}T06:00`, endDateTime: `${addDays(today, 90)}T20:00`,
        allowPM: false, allowFJ: false, allowLJ: false,
      });
    }

    // SmartPM orders for every showcase asset (viewer shows Next Occurrence in DD-MM-YYYY).
    const schedules = [...data.schedules];
    const blueprint = data.blueprints
      .filter((entry) => (!entry.SiteId || entry.SiteId === "02-ESOC") && entry.IsActive && entry.blueprintMode !== "family_ladder" && entry.TradeId === "Mechanical")
      .sort((a, b) => a.ChecklistCode.localeCompare(b.ChecklistCode))[0];
    if (blueprint) {
      const highWatermark = Math.max(data.pmsOrderHighWatermark ?? 0, 0, ...schedules.map((order) => Number(order.ScheduleId) || 0));
      for (const record of seededAssets) {
        try {
          schedules.push(createPmOrder(schedules, data.blueprints, blueprint, record, addDays(today, 14), "Mark", highWatermark));
        } catch (scheduleError) {
          console.warn(`S Building PMS order skipped for ${record.EquipmentCode}`, scheduleError);
        }
      }
    }

    return { ...data, buildings, floors, rooms, equipment, workRequests, locationFreezes, schedules, bimElementLinks };
  } catch (error) {
    console.warn("S Building showcase migration was skipped", error);
    return data;
  }
}
