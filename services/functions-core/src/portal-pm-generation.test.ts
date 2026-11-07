import { describe, expect, it } from "vitest";
import type { Equipment, PM_ChecklistStandard, PM_Schedule } from "@cafm/shared-schema";
import { generatePMWorkRequests } from "../../../apps/web-portal/lib/pm-generation";
import { completeChecklistInstances } from "../../../apps/web-portal/lib/checklist-completion";

const blueprint: PM_ChecklistStandard = {
  ChecklistCode: "CHECK", SiteId: "SITE-01", Title: "Inspection", MaintenanceReason: "Routine",
  TradeId: "Mechanical", TradeName: "Mechanical", ExpectedHours: 1, IsActive: true, Version: 1,
  Steps: [{ StepId: "step", Title: "Check", SortOrder: 1, InputType: "Boolean", favourableBoolean: false,
    Options: [], IsRequired: true, RequiresPhotoOnFailure: true, RequiresCommentOnFailure: true }],
};
const schedule: PM_Schedule = {
  ScheduleId: "S1", ChecklistCode: "CHECK", SiteId: "SITE-01", EquipmentCodes: ["E1", "E2"],
  Frequency: "Monthly", FrequencyInterval: 1, LeadTimeDays: 2, MarginWindowDays: 3,
  NextDueDate: "2026-01-31", IsActive: true, CreatedBy: "tester",
};
const equipment: Equipment[] = ["E1", "E2"].map((code) => ({
  EquipmentCode: code, EquipmentName: code, SiteId: "SITE-01", bl_id: "B", LevelName: "F", RoomCode: "R",
  IsInstallation: false, Status: "In Service", TechnicalSpecifications: {},
}));
const input = {
  schedules: [schedule], blueprints: [blueprint], equipment, workRequests: [], siteId: "SITE-01" as const,
  mode: "single" as const, selectedIds: ["S1"], horizonDays: 30, now: new Date("2026-01-01T10:00:00Z"),
  actor: { id: "tester", name: "Tester", role: "PM_Planner" },
};

describe("portal PM generation", () => {
  it("generates one WR per equipment with a stable checklist snapshot and audit", () => {
    const result = generatePMWorkRequests(input);
    expect(result.generated).toBe(2);
    expect(result.schedules[0].NextDueDate).toBe("2026-02-28");
    expect(result.workRequests.map((wr) => wr.PM_CycleKey)).toEqual(["S1::2026-01-31::E1", "S1::2026-01-31::E2"]);
    const wr = result.workRequests[0];
    expect(wr).toMatchObject({ Percentage: 50, bl_id: "B", LevelName: "F", RoomCode: "R",
      DueDate: "2026-01-31", MarginDate: "2026-02-03" });
    expect(wr.ChecklistSteps?.[0].favourableBoolean).toBe(false);
    expect(wr.ChecklistSteps?.[0]).not.toBe(blueprint.Steps[0]);
    expect(wr.StepAuditLogs?.[0].Action).toBe("created");
    expect(wr.ChecklistInstances?.[0]).toMatchObject({ InputType: "Boolean", favourableBoolean: false, IsCompleted: false });
  });

  it("completes instances using their saved favourable Boolean and failure evidence rules", () => {
    const wr = generatePMWorkRequests(input).workRequests[0];
    const completed = completeChecklistInstances(wr.ChecklistInstances ?? [], [{
      stepId: "step", value: "false", passed: true, completedAt: "2026-01-01T10:00:00Z",
    }], "tester", "2026-01-01T10:00:00Z");
    expect(completed[0]).toMatchObject({ ValueBoolean: false, IsFailed: false, IsCompleted: true });
    expect(() => completeChecklistInstances(wr.ChecklistInstances ?? [], [{
      stepId: "step", value: "true", passed: false, completedAt: "2026-01-01T10:00:00Z",
    }], "tester", "2026-01-01T10:00:00Z")).toThrow("Invalid answer");
  });

  it("skips existing target cycles without suppressing other equipment", () => {
    const first = generatePMWorkRequests(input);
    const result = generatePMWorkRequests({ ...input, workRequests: [first.workRequests[0]] });
    expect(result.generated).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.workRequests[1].EquipmentCodes).toEqual(["E2"]);
  });

  it("rejects missing equipment and meter-based generation explicitly", () => {
    expect(() => generatePMWorkRequests({ ...input, equipment: [] })).toThrow("Equipment E1");
    expect(() => generatePMWorkRequests({ ...input, schedules: [{ ...schedule, Frequency: "Meter-based", MeterType: "hours", MeterInterval: 100 }] })).toThrow("meter reading");
  });

  it("generates all due horizon cycles and a building-only target", () => {
    const result = generatePMWorkRequests({ ...input, mode: "horizon", now: new Date("2026-01-30T00:00:00Z"),
      schedules: [{ ...schedule, EquipmentCodes: [], bl_id: "B", Frequency: "Daily", NextDueDate: "2026-01-31", LeadTimeDays: 0 }],
      horizonDays: 2 });
    expect(result.generated).toBe(2);
    expect(result.workRequests.map((wr) => wr.DueDate)).toEqual(["2026-01-31", "2026-02-01"]);
    expect(result.workRequests[0].LevelName).toBeUndefined();
    expect(result.schedules[0].NextDueDate).toBe("2026-02-02");
  });

  it("rejects invalid intervals and selections", () => {
    expect(() => generatePMWorkRequests({ ...input, schedules: [{ ...schedule, FrequencyInterval: 0.5 }] })).toThrow("invalid frequency");
    expect(() => generatePMWorkRequests({ ...input, selectedIds: ["missing"] })).toThrow("no longer active");
  });
});
