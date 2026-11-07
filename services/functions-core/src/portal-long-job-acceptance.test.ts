import { describe, expect, it } from "vitest";
import { LJ_TRANSITION_MATRIX, PM_WorkRequestStepSchema } from "@cafm/shared-schema";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { updateAcceptanceGate } from "../../../apps/web-portal/lib/long-job-acceptance";

const wr: BaseWorkRequest = {
  WR_ID: "LJ", WR_Type: "LJ", ESAWorkType: "Corrective Maintenance", Description: "Project",
  CreatedDate: "2026-01-01", WorkRequestStatus: "Technically Completed", WorkRequestSubstatus: "Pre-SAT Performed",
  Percentage: 79, SiteId: "SITE-01", bl_id: "B", CreatedBy: "tester", EquipmentCodes: [],
  TotalTimeMinutes: 0, StartDateTBD: false, AssignedCraftpersonIds: [], AssignedUserIds: [], IsFrozen: false,
  RequiresSAT: true, RequiresDrawingUpdate: true, RequiresInventoryUpdate: true, PreSATApproved: true, AcceptanceGates: [],
};
const time = "2026-01-01T12:00:00Z";

describe("portal LJ acceptance engine", () => {
  it("advances through invitation and SAT, then waits for all other required gates", () => {
    const invitation = updateAcceptanceGate(wr, "SAT", "InvitationSent", "Trade", time);
    expect(invitation.percentage).toBe(80);
    const sat = updateAcceptanceGate({ ...wr, ...invitation.updates, Percentage: invitation.percentage }, "SAT", "Approved", "Officer", time);
    expect(sat.percentage).toBe(81);
    const drawing = updateAcceptanceGate({ ...wr, ...sat.updates, Percentage: sat.percentage }, "DrawingEngineering", "Approved", "Draftsman", time);
    expect(drawing.percentage).toBe(81);
    const inventory = updateAcceptanceGate({ ...wr, ...drawing.updates, Percentage: drawing.percentage }, "CIFMInventory", "Approved", "Inventory", time);
    expect(inventory.percentage).toBe(94);
    expect(inventory.updates.AcceptanceGates?.every((gate) => gate.Status === "Approved")).toBe(true);
  });

  it("allows the final SAT to advance directly to 94 and rejects approval before Pre-SAT", () => {
    expect(() => updateAcceptanceGate({ ...wr, PreSATApproved: false }, "SAT", "Approved", "Officer", time)).toThrow("Pre-SAT");
    const result = updateAcceptanceGate({ ...wr, RequiresDrawingUpdate: false, RequiresInventoryUpdate: false }, "SAT", "Approved", "Officer", time);
    expect(result.percentage).toBe(94);
  });

  it("defines the forward financial chain and RFQ review transitions", () => {
    for (const [from, to] of [[94, 95], [95, 96], [96, 97], [97, 98], [98, 99], [99, 100]]) {
      expect(LJ_TRANSITION_MATRIX.find((entry) => entry.track === "RFW" && entry.percentage === from)
        ?.allowedActions.some((action) => action.targetPercentage === to)).toBe(true);
    }
    expect(LJ_TRANSITION_MATRIX.find((entry) => entry.track === "RFQ" && entry.percentage === 25)
      ?.allowedActions.some((action) => action.targetPercentage === 23)).toBe(true);
  });

  it("respects a No-favourable Boolean in instantiated steps", () => {
    const result = PM_WorkRequestStepSchema.safeParse({
      StepInstanceId: "s", WR_ID: "wr", ScheduleId: "schedule", ChecklistCode: "check", StepId: "step",
      Title: "Test", SortOrder: 1, InputType: "Boolean", favourableBoolean: false, ValueBoolean: false,
      Options: [], PhotoIds: [], IsFailed: false, IsCompleted: true,
    });
    expect(result.success).toBe(true);
  });
});
