import { describe, expect, it } from "vitest";
import { dryRun, siteWorkbookBytes, type Entity } from "../../../web-portal/lib/bulk-import";
import type { DemoData } from "../../../web-portal/lib/cafm-data";

const empty = (): DemoData => ({
  sites: ["SITE-01"], buildings: [], floors: [], rooms: [], desks: [], equipment: [],
  blueprints: [], schedules: [], workRequests: [], users: [], userAccessProfiles: [], craftspeople: [], craftpersonAbsences: [], locationFreezes: [],
  tradeRoleMappings: [], siteRoleMappings: [], siteRoleAssignments: [], mobileMutationIds: [],
});
const csv = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const preview = (entity: Entity, text: string, data = empty()) => dryRun(csv(text), "input.csv", entity, data, "SITE-01");

describe("bulk import", () => {
  it("previews actual CSV inserts and updates without modifying the input state", () => {
    const data = empty();
    data.buildings.push({ bl_id: "B1", SiteId: "SITE-01", Name: "Old", Address: "Address", IsActive: true });
    const result = preview("buildings", "bl_id,Name,Address\nB1,New,\nB2,Second,Other", data);
    expect(result.errors).toEqual([]);
    expect(result.diffs.map((item) => item.operation)).toEqual(["Update", "Insert"]);
    expect(result.next.buildings[0]).toMatchObject({ Name: "New", Address: "Address" });
    expect(data.buildings[0].Name).toBe("Old");
  });

  it("reports row, column, duplicate keys and invalid site", () => {
    const result = preview("buildings", "bl_id,SiteId,Name,Address\nB1,SITE-02,Name,Address\nB1,SITE-01,,");
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, column: "SiteId" }),
      expect.objectContaining({ row: 3, column: "bl_id" }),
    ]));
  });

  it("preserves leading zeroes in CSV identifiers", () => {
    const result = preview("buildings", "bl_id,Name,Address\n000012,Building,Address");
    expect(result.errors).toEqual([]);
    expect(result.next.buildings[0].bl_id).toBe("000012");
  });

  it("resolves room parents and rejects missing references", () => {
    const data = empty();
    data.buildings.push({ bl_id: "B1", SiteId: "SITE-01", Name: "Building", Address: "Address", IsActive: true });
    data.floors.push({ bl_id: "B1", SiteId: "SITE-01", LevelName: "L1", FloorNumber: 1, IsActive: true });
    data.rooms.push({ bl_id: "B1", SiteId: "SITE-01", LevelName: "L1", RoomCode: "R1", Name: "Room", IsDeskReservable: false, IsActive: true });
    const good = preview("equipment", "EquipmentCode,EquipmentName,RoomCode\nE1,Pump,R1", data);
    expect(good.errors).toEqual([]);
    expect(good.next.equipment[0]).toMatchObject({ bl_id: "B1", LevelName: "L1", RoomCode: "R1" });
    const bad = preview("equipment", "EquipmentCode,EquipmentName,bl_id,LevelName,RoomCode\nE1,Pump,B1,L1,missing", data);
    expect(bad.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 2, column: "RoomCode" })]));
  });

  it("round-trips an exported XLSX entity and retains nested checklist data", () => {
    const data = empty();
    data.blueprints.push({
      ChecklistCode: "C1", SiteId: "SITE-01", Title: "Inspection", MaintenanceReason: "Service",
      TradeId: "T1", TradeName: "Mechanical", ExpectedHours: 1, IsActive: true, Version: 1,
      Steps: [{ StepId: "S1", Title: "Inspect", SortOrder: 1, InputType: "Boolean", Options: [],
        RequiresPhotoOnFailure: true, RequiresCommentOnFailure: true, IsRequired: true }],
    });
    const result = dryRun(siteWorkbookBytes(data), "export.xlsx", "blueprints", empty(), "SITE-01");
    expect(result.errors).toEqual([]);
    expect(result.next.blueprints).toEqual(data.blueprints);
  });

  it("imports floors, rooms, schedules, assignments and issued work requests", () => {
      let data = empty();
      const building = preview("buildings", "bl_id,Name,Address\nB1,Building,Address", data);
      expect(building.errors).toEqual([]);
      data = building.next;
      const floor = preview("floors", "bl_id,LevelName,FloorNumber\nB1,L1,1", data);
      expect(floor.errors).toEqual([]);
      data = floor.next;
      const room = preview("rooms", "bl_id,LevelName,RoomCode,Name\nB1,L1,R1,Room", data);
      expect(room.errors).toEqual([]);
      data = room.next;
      const blueprint = preview("blueprints",
        'ChecklistCode,Title,MaintenanceReason,TradeId,TradeName,ExpectedHours,Steps\nC1,Inspection,Service,T1,Mechanical,1,"[{""StepId"":""S1"",""Title"":""Inspect"",""SortOrder"":1,""InputType"":""Boolean""}]"', data);
      expect(blueprint.errors).toEqual([]);
      data = blueprint.next;
      const schedule = preview("schedules", "ScheduleId,ChecklistCode,bl_id,Frequency,NextDueDate,CreatedBy\nP1,C1,B1,Monthly,2026-01-01,Planner", data);
      expect(schedule.errors).toEqual([]);
      data = schedule.next;
      const assignment = preview("siteRoleAssignments", "AssignmentId,PersonName,RoleCode,Trade,AssignmentLevel,ReceiveNotifications\nA1,Mark,ESA_TM,Mechanical,Main,Yes", data);
      expect(assignment.errors).toEqual([]);
      data = assignment.next;
      const request = preview("workRequests", "WR_ID,WR_Type,ESAWorkType,Description,bl_id,LevelName,RoomCode,CreatedDate,WorkRequestStatus,WorkRequestSubstatus,Percentage,CreatedBy\nW1,PM,Preventive Maintenance,Inspect,B1,L1,R1,2026-01-01,Issued,Issued,50,Planner", data);
      expect(request.errors).toEqual([]);
      expect(request.next.workRequests[0]).toMatchObject({ WR_ID: "W1", Percentage: 50, SiteId: "SITE-01" });
      expect(request.next.siteRoleAssignments[0].ReceiveNotifications).toBe(true);
  });

  it("does not allow bulk status transitions", () => {
    const data = empty();
    data.workRequests.push({
      WR_ID: "W1", WR_Type: "PM", ESAWorkType: "Preventive Maintenance", Description: "Inspect",
      bl_id: "B", SiteId: "SITE-01", CreatedDate: "2026-01-01", WorkRequestStatus: "Issued",
      WorkRequestSubstatus: "Issued", Percentage: 50, EquipmentCodes: [], TotalTimeMinutes: 0,
      AssignedCraftpersonIds: [], AssignedUserIds: [], CreatedBy: "Planner", IsFrozen: false,
      StartDateTBD: false, RequiresSAT: false, RequiresDrawingUpdate: false, RequiresInventoryUpdate: false, AcceptanceGates: [],
    });
    const result = preview("workRequests", "WR_ID,Percentage\nW1,78", data);
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 2, column: "Percentage" })]));
  });
});
