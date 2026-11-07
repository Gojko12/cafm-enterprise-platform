import { describe, expect, it } from "vitest";
import { LocationFreezeSchema } from "@cafm/shared-schema";
import { section20Seed } from "../../../web-portal/lib/section20-seed";
import { getActiveFreezeConflictsForWR, getCurrentLocationFreezes } from "../../../web-portal/lib/location-freezes";

describe("location freeze conflicts", () => {
  const wr = { ...section20Seed(["SITE-01"]).workRequests[1], WR_Type: "PM" as const, AssignedCraftpersonIds: ["one"], StartDate_DateToPerform: "2026-11-09" };
  const freeze = LocationFreezeSchema.parse({ id: "f", siteId: "SITE-01", buildingId: wr.bl_id, title: "Test", description: "Test", responsiblePerson: "Mark", startDateTime: "2026-11-09T08:00", endDateTime: "2026-11-09T10:00", allowPM: false, allowFJ: false, allowLJ: false });
  it("uses assigned time, location hierarchy, site and work type rather than due dates", () => {
    expect(getActiveFreezeConflictsForWR(wr, [freeze])).toHaveLength(1);
    expect(getActiveFreezeConflictsForWR({ ...wr, AssignedCraftpersonIds: [] }, [freeze])).toHaveLength(0);
    expect(getActiveFreezeConflictsForWR(wr, [{ ...freeze, allowPM: true }, { ...freeze, siteId: "SITE-02" }, { ...freeze, floorId: "Other" }])).toHaveLength(0);
    expect(getActiveFreezeConflictsForWR(wr, [{ ...freeze, floorId: wr.LevelName, roomId: "Other" }])).toHaveLength(0);
    expect(getActiveFreezeConflictsForWR({ ...wr, StartDate_DateToPerform: undefined, DueDate: "2026-11-09" }, [freeze])).toHaveLength(0);
  });
  it("handles exact boundaries and ignores stale craftsperson assignments", () => {
    const assigned = { ...wr, CraftpersonAssignments: [{ craftpersonId: "one", assignedStartDateTime: "2026-11-09T10:00", assignedEndDateTime: "2026-11-09T11:00" }] };
    expect(getActiveFreezeConflictsForWR(assigned, [freeze])).toHaveLength(0);
    expect(getActiveFreezeConflictsForWR({ ...assigned, CraftpersonAssignments: [{ ...assigned.CraftpersonAssignments[0], assignedStartDateTime: "2026-11-09T09:59" }] }, [freeze])).toHaveLength(1);
    expect(getActiveFreezeConflictsForWR({ ...assigned, AssignedCraftpersonIds: ["another"], StartDate_DateToPerform: undefined }, [freeze])).toHaveLength(0);
  });
  it("validates range and room hierarchy", () => {
    expect(LocationFreezeSchema.safeParse({ ...freeze, roomId: "room" }).success).toBe(false);
    expect(LocationFreezeSchema.safeParse({ ...freeze, endDateTime: freeze.startDateTime }).success).toBe(false);
    expect(LocationFreezeSchema.safeParse({ ...freeze, startDateTime: "2026-02-30T08:00" }).success).toBe(false);
  });
  it("reports currently active location restrictions independently of assignment", () => {
    const unassigned = { ...wr, AssignedCraftpersonIds: [] };
    expect(getCurrentLocationFreezes(unassigned, [freeze], "2026-11-09T08:00")).toHaveLength(1);
    expect(getCurrentLocationFreezes(unassigned, [freeze], "2026-11-09T10:00")).toHaveLength(0);
    expect(getCurrentLocationFreezes(unassigned, [{ ...freeze, floorId: "other" }], "2026-11-09T09:00")).toHaveLength(0);
  });
});
