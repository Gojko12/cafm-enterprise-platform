import { describe, expect, it } from "vitest";
import { gridStatusChange } from "../../../web-portal/lib/wr-grid";
import type { BaseWorkRequest } from "@cafm/shared-schema";

const request: BaseWorkRequest = {
  WR_ID: "PM-1", WR_Type: "PM", ESAWorkType: "Preventive Maintenance",
  Description: "Inspection", ProblemLocation: "B1", SiteId: "SITE-01", bl_id: "B1",
  CreatedDate: "2026-01-01", UpdatedAt: "2026-01-01", CreatedBy: "technician",
  WorkRequestStatus: "Issued", WorkRequestSubstatus: "Issued", Percentage: 50,
  AssignedCraftpersonIds: [], AssignedUserIds: [], EquipmentCodes: [], IsFrozen: false,
  TotalTimeMinutes: 0, StartDateTBD: false, RequiresSAT: false,
  RequiresDrawingUpdate: false, RequiresInventoryUpdate: false, AcceptanceGates: [],
};

describe("work request grid transitions", () => {
  it("uses configured statuses and requires manual 78% transition", () => {
    expect(gridStatusChange(request, 78, "StandardEmployee")).toMatchObject({
      Percentage: 78, WorkRequestStatus: "Technically Completed",
    });
    expect(request.Percentage).toBe(50);
    expect(() => gridStatusChange(request, 100, "TeamLeader")).toThrow();
    expect(() => gridStatusChange(request, 55, "TeamLeader")).toThrow(/not configured/);
    expect(() => gridStatusChange(request, 27, "TeamLeader")).toThrow(/not configured/);
  });

  it("requires a passed QA inspection and team leader for PM closure", () => {
    const completed = { ...request, Percentage: 78 };
    expect(() => gridStatusChange(completed, 100, "TeamLeader")).toThrow(/QA inspection/);
    expect(() => gridStatusChange({ ...completed, QA_InspectionStatus: "Passed" }, 100, "StandardEmployee")).toThrow(/Team Leader/);
    expect(gridStatusChange({ ...completed, QA_InspectionStatus: "Passed" }, 100, "TeamLeader").Percentage).toBe(100);
  });

  it("does not bypass hold handling or LJ acceptance gates", () => {
    expect(() => gridStatusChange({ ...request, Percentage: 55, IsFrozen: true }, 78, "SiteAdministrator")).toThrow(/hold/);
    expect(() => gridStatusChange({ ...request, WR_Type: "LJ" }, 78, "SiteAdministrator")).toThrow(/LJ Actions/);
  });
});
