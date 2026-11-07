import { describe, expect, it } from "vitest";
import { CraftpersonAbsenceSchema } from "@cafm/shared-schema";
import { addDays, assignPerson, assignmentAbsences, dailyCapacity, fromWallMinutes, frozenOn, intervalFor, resolveLeaveConflicts, schedulePerson, unassignPerson, wallMinutes } from "../../../web-portal/lib/dispatch";
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
  it("allocates timed multi-day work only to overlapping days and ignores stale assignments", () => {
    const timed = { ...wr, CraftpersonAssignments: [{ craftpersonId: "person", assignedStartDateTime: "2026-11-06T22:00", assignedEndDateTime: "2026-11-07T03:30" }] };
    expect(dailyCapacity([timed], [], "SITE-01", "person", "2026-11-06", 8).allocated).toBe(2);
    expect(dailyCapacity([timed], [], "SITE-01", "person", "2026-11-07", 8).allocated).toBe(3.5);
    expect(intervalFor({ ...timed, AssignedCraftpersonIds: [] }, "person")).toBeNull();
    expect(fromWallMinutes(wallMinutes("2026-03-29T01:30") + 120)).toBe("2026-03-29T03:30");
  });
  it("validates partial-day ranges, checks actual overlap and merges overlapping leave for capacity", () => {
    const partial = { ...leave, startTime: "09:00", endTime: "13:00", unavailableHoursPerDay: 4 };
    expect(CraftpersonAbsenceSchema.safeParse({ ...partial, endTime: "08:00" }).success).toBe(false);
    expect(CraftpersonAbsenceSchema.safeParse({ ...partial, endTime: undefined }).success).toBe(false);
    const morning = { craftpersonId: "person", assignedStartDateTime: "2026-11-06T07:00", assignedEndDateTime: "2026-11-06T09:00" };
    expect(assignmentAbsences([partial], "SITE-01", morning)).toHaveLength(0);
    expect(assignmentAbsences([partial], "SITE-01", { ...morning, assignedEndDateTime: "2026-11-06T09:30" })).toHaveLength(1);
    expect(dailyCapacity([], [partial, { ...partial, id: "two", startTime: "11:00", endTime: "15:00" }], "SITE-01", "person", "2026-11-06", 8).available).toBe(2);
  });
  it("moves or removes timed records when resolving leave and rejects unavailable peers", () => {
    const task = { ...wr, TradeName: "Mechanical", CraftpersonAssignments: [{ craftpersonId: "person", assignedStartDateTime: "2026-11-06T09:00", assignedEndDateTime: "2026-11-06T11:00" }] };
    const people = [{ id: "peer", SiteId: "SITE-01", Trade: "Mechanical", ShiftHours: 8 }];
    const result = resolveLeaveConflicts([task], [leave], people, leave, "reassign", (request) => request);
    expect(result.requests[0].CraftpersonAssignments).toEqual([{ ...task.CraftpersonAssignments[0], craftpersonId: "peer" }]);
    expect(resolveLeaveConflicts([task], [leave], people, leave, "unassign", (request) => request).requests[0].CraftpersonAssignments).toEqual([]);
    const unavailable = { ...leave, id: "peer-leave", craftpersonId: "peer" };
    expect(resolveLeaveConflicts([task], [leave, unavailable], people, leave, "reassign", (request) => request).unresolved).toBe(1);
  });
  it("seeds timed assignments and shifts at every site", () => {
    for (const site of ["SITE-01", "SITE-02", "SITE-03"] as const) {
      const seeded = section20Seed([site]);
      expect(seeded.craftspeople.every((person) => person.shiftStart === "07:00" && person.shiftEnd === "15:30")).toBe(true);
      expect(seeded.workRequests.some((request) => request.CraftpersonAssignments?.some((item) => item.assignedStartDateTime >= "2026-11-07T00:00" && item.assignedStartDateTime < "2026-11-14T00:00"))).toBe(true);
    }
  });
  it("adds and reschedules individual craftspeople without losing existing intervals", () => {
    const first = { craftpersonId: "person", assignedStartDateTime: "2026-11-09T08:00", assignedEndDateTime: "2026-11-09T11:00" };
    const second = { craftpersonId: "peer", assignedStartDateTime: "2026-11-10T09:00", assignedEndDateTime: "2026-11-10T12:00" };
    const initial = schedulePerson({ ...wr, AssignedCraftpersonIds: [], CraftpersonAssignments: undefined }, first);
    const both = schedulePerson(initial, second);
    expect(both.AssignedCraftpersonIds).toEqual(["person", "peer"]);
    expect(both.CraftpersonAssignments).toEqual([first, second]);
    const moved = schedulePerson(both, { ...second, assignedStartDateTime: "2026-11-11T09:00", assignedEndDateTime: "2026-11-11T12:00" });
    expect(moved.AssignedCraftpersonIds).toEqual(["person", "peer"]);
    expect(intervalFor(moved, "person")).toEqual(first);
    expect(intervalFor(moved, "peer")?.assignedStartDateTime).toBe("2026-11-11T09:00");
    const legacy = schedulePerson({ ...wr, AssignedCraftpersonIds: ["person"], CraftpersonAssignments: undefined }, second);
    expect(intervalFor(legacy, "person")?.assignedStartDateTime).toBe("2026-11-06T07:00");
    const unscheduled = schedulePerson({ ...wr, AssignedCraftpersonIds: ["person"], CraftpersonAssignments: undefined, StartDate_DateToPerform: undefined }, second);
    expect(intervalFor(unscheduled, "person")).toBeNull();
    expect(intervalFor(unscheduled, "peer")).toEqual(second);
    const removed = unassignPerson(both, "person");
    expect(removed.AssignedCraftpersonIds).toEqual(["peer"]);
    expect(intervalFor(removed, "peer")).toEqual(second);
    expect(intervalFor(removed, "person")).toBeNull();
    expect(intervalFor(unassignPerson(removed, "peer"), "peer")).toBeNull();
  });
  it("preserves legacy schedules and recorded labor when assigning and unassigning", () => {
    const labor = { craftpersonId: "peer", name: "Peer", lastName: "Example", hourlyRate: 42, workingTimeMinutes: 45 };
    const legacy = { ...wr, CraftpersonAssignments: undefined, CraftpersonLabor: [labor] };
    const assigned = assignPerson(legacy, { ...labor, workingTimeMinutes: 0 });
    expect(intervalFor(assigned, "person")?.assignedStartDateTime).toBe("2026-11-06T07:00");
    expect(intervalFor(assigned, "peer")).toBeNull();
    expect(assigned.CraftpersonLabor).toEqual([labor]);
    const removed = unassignPerson(assigned, "peer");
    expect(removed.AssignedCraftpersonIds).toEqual(["person"]);
    expect(removed.CraftpersonLabor).toEqual([labor]);
  });
  it("seeds multi-person PM and LJ assignments at every site", () => {
    for (const site of ["SITE-01", "SITE-02", "SITE-03"] as const) {
      const requests = section20Seed([site]).workRequests;
      for (const type of ["PM", "LJ"]) expect(requests.some((item) => item.WR_Type === type && item.AssignedCraftpersonIds.length >= 2 && item.CraftpersonAssignments?.length === item.AssignedCraftpersonIds.length)).toBe(true);
    }
  });
});
