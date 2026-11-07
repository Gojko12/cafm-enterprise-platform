import { describe, expect, it } from "vitest";
import { CraftpersonAbsenceSchema } from "@cafm/shared-schema";
import { addDays, dailyCapacity, frozenOn, resolveLeaveConflicts } from "../../../web-portal/lib/dispatch";
import { section20Seed } from "../../../web-portal/lib/section20-seed";

describe("dispatch capacity", () => {
  const data = section20Seed(["SITE-01"]);
  const wr = { ...data.workRequests[0], AssignedCraftpersonIds: ["person"], StartDate_DateToPerform: "2026-11-06", ExpectedHours: 6, Percentage: 50, IsFrozen: false };
  const leave = CraftpersonAbsenceSchema.parse({ id: "leave", siteId: "SITE-01", craftpersonId: "person", absenceType: "Vacation", startDate: "2026-11-06", endDate: "2026-11-07", isFullDay: false, unavailableHoursPerDay: 2, status: "Approved", notes: "" });

  it("counts assigned work against partial or full approved leave", () => {
    expect(dailyCapacity([wr], [leave], "SITE-01", "person", "2026-11-06", 8)).toMatchObject({ allocated: 6, available: 6 });
    expect(dailyCapacity([wr], [{ ...leave, isFullDay: true }], "SITE-01", "person", "2026-11-06", 8)).toMatchObject({ allocated: 6, available: 0 });
    expect(dailyCapacity([wr], [{ ...leave, status: "Pending" }], "SITE-01", "person", "2026-11-06", 8).available).toBe(8);
    expect(dailyCapacity([wr], [leave], "SITE-02", "person", "2026-11-06", 8)).toMatchObject({ allocated: 0, available: 8 });
  });
  it("excludes frozen work only within the freeze window, and excludes completed work", () => {
    const frozen = { ...wr, IsFrozen: true, FreezeStartDate: "2026-11-05", FreezeEndDate: "2026-11-07" };
    expect(frozenOn(frozen, "2026-11-08")).toBe(false);
    expect(dailyCapacity([frozen], [], "SITE-01", "person", "2026-11-06", 8).allocated).toBe(0);
    expect(dailyCapacity([{ ...wr, Percentage: 78 }], [], "SITE-01", "person", "2026-11-06", 8).allocated).toBe(0);
  });
  it("checks calendar boundaries and absence dates", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(CraftpersonAbsenceSchema.safeParse({ ...leave, endDate: "2026-11-01" }).success).toBe(false);
    expect(CraftpersonAbsenceSchema.safeParse({ ...leave, startDate: "2026-02-30" }).success).toBe(false);
  });
  it("reassigns only to same-site trade peers with remaining capacity and leaves other assignments intact", () => {
    const task = { ...wr, TradeName: "Mechanical", AssignedCraftpersonIds: ["person", "helper"] };
    const second = { ...task, WR_ID: "second", ExpectedHours: 4 };
    const people = [{ id: "other-site", SiteId: "SITE-02", Trade: "Mechanical", ShiftHours: 8 }, { id: "peer", SiteId: "SITE-01", Trade: "Mechanical", ShiftHours: 8 }];
    const result = resolveLeaveConflicts([task, second], [leave], people, leave, "reassign", (request) => request);
    expect(result.requests[0].AssignedCraftpersonIds).toEqual(["helper", "peer"]);
    expect(result.requests[1].AssignedCraftpersonIds).toEqual(["person", "helper"]);
    expect(result.unresolved).toBe(1);
    const unassigned = resolveLeaveConflicts([task], [leave], people, leave, "unassign", (request) => request);
    expect(unassigned.requests[0].AssignedCraftpersonIds).toEqual(["helper"]);
  });
  it("seeds low, full and overloaded daily capacity for each site", () => {
    for (const site of ["SITE-01", "SITE-02", "SITE-03"] as const) {
      const seeded = section20Seed([site]);
      const ratios = seeded.craftspeople.flatMap((person) => Array.from({ length: 7 }, (_, index) => {
        const capacity = dailyCapacity(seeded.workRequests, [], site, person.id, `2026-11-0${index + 2}`, person.ShiftHours);
        return capacity.allocated / capacity.available;
      }));
      expect(ratios.some((ratio) => ratio > 0 && ratio < 0.8)).toBe(true);
      expect(ratios.some((ratio) => ratio >= 0.8 && ratio <= 1)).toBe(true);
      expect(ratios.some((ratio) => ratio > 1)).toBe(true);
    }
  });
});
