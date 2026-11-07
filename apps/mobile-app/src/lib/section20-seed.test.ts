import { describe, expect, it } from "vitest";
import { BaseWorkRequestSchema, BuildingSchema, FloorSchema, RoomSchema, EquipmentSchema, EquipmentStatusSchema, normalizeEquipmentStatus, PM_ChecklistStandardSchema, PM_ScheduleSchema, CLASSICAL_TRADES, EQUIPMENT_CATEGORIES, EQUIPMENT_STATUSES } from "@cafm/shared-schema";
import { section20Seed } from "../../../web-portal/lib/section20-seed";
import { groupLongJobs } from "../../../web-portal/lib/wr-overview";
import { resolveEquipmentLocation } from "../../../web-portal/lib/equipment-locator";
import { equipmentChangeDescriptions } from "../../../web-portal/lib/equipment-activity";

describe("Section 20 demo seed", () => {
  const sites = ["SITE-01", "SITE-02", "SITE-03"] as const;
  const data = section20Seed([...sites]);
  it("meets thresholds and validates every record against shared schemas", () => {
    for (const [items, schema] of [[data.buildings, BuildingSchema], [data.floors, FloorSchema], [data.rooms, RoomSchema],
      [data.equipment, EquipmentSchema], [data.blueprints, PM_ChecklistStandardSchema], [data.schedules, PM_ScheduleSchema],
      [data.workRequests, BaseWorkRequestSchema]] as const) {
      for (const item of items) {
        const result = schema.safeParse(item);
        expect(result.success, result.success ? "" : JSON.stringify(result.error.issues)).toBe(true);
      }
    }
    for (const site of sites) {
      const bySite = <T extends { SiteId?: string }>(items: T[]) => items.filter((item) => item.SiteId === site);
      expect(bySite(data.buildings).length).toBeGreaterThanOrEqual(4);
      for (const building of bySite(data.buildings)) expect(bySite(data.floors).filter((floor) => floor.bl_id === building.bl_id).length).toBeGreaterThanOrEqual(3);
      expect(bySite(data.rooms).length).toBeGreaterThanOrEqual(15);
      expect(bySite(data.rooms).every((room) => room.Polygon?.coordinates[0].length === 5)).toBe(true);
      expect(bySite(data.equipment).length).toBeGreaterThanOrEqual(25);
      expect(new Set(bySite(data.equipment).map((eq) => eq.Category))).toEqual(new Set(Object.keys(EQUIPMENT_CATEGORIES)));
      expect(new Set(bySite(data.equipment).map((eq) => eq.Status))).toEqual(new Set(EQUIPMENT_STATUSES));
      expect(bySite(data.equipment).every((eq) => eq.Activity?.some((entry) => entry.kind === "log") && eq.Activity?.some((entry) => entry.kind === "comment" && entry.editHistory?.length))).toBe(true);
      expect(bySite(data.craftspeople).length).toBeGreaterThanOrEqual(10);
      expect(new Set(bySite(data.craftspeople).map((person) => person.Trade))).toEqual(new Set(CLASSICAL_TRADES));
      expect(bySite(data.blueprints).length).toBeGreaterThanOrEqual(10);
      expect(bySite(data.schedules).length).toBeGreaterThanOrEqual(16);
      for (const blueprint of bySite(data.blueprints)) {
        expect(new Set(blueprint.Steps.map((step) => step.InputType))).toEqual(new Set(["Boolean", "Numeric", "SingleSelect", "MultiSelect", "FreeText"]));
        expect(blueprint.Steps.filter((step) => step.InputType === "Boolean").map((step) => step.favourableBoolean)).toEqual([true, false]);
      }
      const wrs = bySite(data.workRequests);
      for (const [type, min] of [["PM", 25], ["FJ", 15], ["LJ", 22]] as const) expect(wrs.filter((wr) => wr.WR_Type === type).length).toBeGreaterThanOrEqual(min);
      expect(new Set(wrs.filter((wr) => wr.WR_Type === "LJ").map((wr) => wr.Percentage))).toEqual(new Set([0,10,20,21,23,25,26,27,28,29,30,31,32,40,50,55,78,79,80,81,94,95,96,97,98,99,100]));
      expect(wrs.every((wr) => (wr.Activity?.filter((item) => item.kind === "log").length ?? 0) >= 3 && (wr.Activity?.filter((item) => item.kind === "comment").length ?? 0) >= 2)).toBe(true);
      expect(wrs.filter((wr) => wr.WR_Type === "FJ").every((wr) => (wr.EstimatedCostEur ?? 750) < 750 && wrs.some((parent) => parent.WR_ID === wr.ParentPM_WR_ID))).toBe(true);
      expect(wrs.filter((wr) => wr.WR_Type === "LJ").every((wr) => (wr.EstimatedCostEur ?? 0) >= 750)).toBe(true);
      expect(new Set(wrs.filter((wr) => wr.WR_Type === "FJ").map((wr) => wr.TradeName))).toEqual(new Set(CLASSICAL_TRADES));
      const pm = wrs.filter((wr) => wr.WR_Type === "PM");
      for (const predicate of [
        (wr: typeof pm[number]) => wr.Percentage === 50,
        (wr: typeof pm[number]) => wr.Percentage === 55,
        (wr: typeof pm[number]) => wr.Percentage === 78 && wr.QA_InspectionStatus === "Pending",
        (wr: typeof pm[number]) => wr.Percentage === 78 && wr.QA_InspectionStatus === "Passed",
        (wr: typeof pm[number]) => wr.Percentage === 78 && wr.QA_InspectionStatus === "ToBeCorrected",
        (wr: typeof pm[number]) => wr.Percentage === 100,
        (wr: typeof pm[number]) => wr.Percentage === 27,
      ]) expect(pm.some(predicate)).toBe(true);
      expect(new Set(pm.filter((wr) => wr.Percentage === 55).map((wr) => wr.FreezeReason))).toEqual(new Set(["Access", "Labor", "Parts"]));
    }
  });
  it("migrates only recognized legacy equipment statuses", () => {
    for (const [legacy, expected] of [["Active", "In Service"], ["Under Repair", "Repair"], ["Decommissioned", "Out Of Service"]] as const) {
      expect(EquipmentSchema.parse({ ...data.equipment[0], Status: legacy }).Status).toBe(expected);
      expect(EquipmentStatusSchema.parse(normalizeEquipmentStatus(legacy))).toBe(expected);
    }
    expect(EquipmentSchema.safeParse({ ...data.equipment[0], Status: "Unknown" }).success).toBe(false);
  });
  it("resolves equipment locations only with matching site, hierarchy and polygon", () => {
    const equipment = data.equipment[0];
    const query = { equipment: equipment.EquipmentCode, building: equipment.bl_id, floor: equipment.LevelName, room: equipment.RoomCode };
    expect(resolveEquipmentLocation(query, equipment.SiteId, data)?.room.RoomCode).toBe(equipment.RoomCode);
    expect(resolveEquipmentLocation(query, "SITE-02", data)).toBeNull();
    expect(resolveEquipmentLocation({ ...query, room: "wrong" }, equipment.SiteId, data)).toBeNull();
    expect(resolveEquipmentLocation(query, equipment.SiteId, { ...data, rooms: [] })).toBeNull();
    expect(resolveEquipmentLocation(query, equipment.SiteId, { ...data, floors: [] })).toBeNull();
  });
  it("reports equipment field and document changes without embedding document contents", () => {
    const before = data.equipment[0];
    const after = { ...before, Status: "Repair" as const, Model: "Carrier 30XA", Documents: [{ id: "doc", name: "manual.pdf", type: "application/pdf", dataUrl: "secret-content" }] };
    const logs = equipmentChangeDescriptions(before, after, "Mark");
    expect(logs).toContain("Status changed from 'In Service' to 'Repair' by Mark");
    expect(logs).toContain("Model changed from 'CS-100' to 'Carrier 30XA' by Mark");
    expect(logs).toContain("Documents changed from 'none' to 'manual.pdf' by Mark");
    expect(logs.join(" ")).not.toContain("secret-content");
    expect(equipmentChangeDescriptions(before, before, "Mark")).toEqual([]);
  });
  it("resolves all hierarchy and schedule references and groups filtered jobs", () => {
    expect(new Set(data.equipment.map((item) => item.EquipmentCode)).size).toBe(data.equipment.length);
    expect(data.equipment.every((item) => /^\d{10}$/.test(item.EquipmentCode))).toBe(true);
    expect(new Set(data.workRequests.map((item) => item.WR_ID)).size).toBe(data.workRequests.length);
    expect(data.workRequests.every((item) => /^2026\d{6}$/.test(item.WR_ID))).toBe(true);
    for (const item of data.equipment) {
      expect(data.rooms.some((room) => room.SiteId === item.SiteId && room.bl_id === item.bl_id && room.LevelName === item.LevelName && room.RoomCode === item.RoomCode)).toBe(true);
      if (item.ParentEquipmentCode) expect(data.equipment.some((parent) => parent.SiteId === item.SiteId && parent.EquipmentCode === item.ParentEquipmentCode &&
        parent.HierarchyLevel === (item.HierarchyLevel === "Component" ? "SubEquipment" : "Installation"))).toBe(true);
    }
    for (const schedule of data.schedules) {
      const blueprint = data.blueprints.find((item) => item.SiteId === schedule.SiteId && item.ChecklistCode === schedule.ChecklistCode);
      const equipment = data.equipment.find((item) => item.SiteId === schedule.SiteId && item.EquipmentCode === schedule.EquipmentCodes[0]);
      expect(blueprint?.TradeId).toBe(equipment?.PrimaryTradeId);
    }
    const jobs = data.workRequests.filter((wr) => wr.SiteId === "SITE-01" && wr.WR_Type === "LJ");
    const groups = groupLongJobs(jobs);
    expect(groups.length).toBe(27);
    expect(groups.reduce((sum, group) => sum + group.cost, 0)).toBe(jobs.reduce((sum, wr) => sum + (wr.EstimatedCostEur ?? 0), 0));
  });
});
