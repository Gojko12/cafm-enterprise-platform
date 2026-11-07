import { describe, expect, it } from "vitest";
import { revealAssignment } from "../../../web-portal/lib/calendar-locator";
import { section20Seed } from "../../../web-portal/lib/section20-seed";

describe("show assignment on calendar", () => {
  const wr = { ...section20Seed(["SITE-01"]).workRequests[0], WR_Type: "PM" as const, IsFrozen: true, Percentage: 78 };
  const interval = { craftpersonId: "person", assignedStartDateTime: "2026-11-07T05:30", assignedEndDateTime: "2026-11-07T21:15" };
  it("reveals a hidden weekend assignment and widens every blocking filter", () => {
    const result = revealAssignment(wr, interval, "Mechanical", { dates: ["2026-11-09"], weekends: false, firstHour: 6, lastHour: 20, people: [], trades: ["Electrical"], buildings: ["other"], availability: "On leave", types: ["FJ"] });
    expect(result).toMatchObject({ day: "2026-11-07", weekends: true, firstHour: 5, lastHour: 22, people: ["person"], trades: ["Electrical", "Mechanical"], buildings: ["other", wr.bl_id], types: ["FJ", "PM", "Frozen", "Completed"] });
    expect(result.changed).toEqual(["date", "weekends", "start hour", "end hour", "craftpeople", "trades", "buildings", "availability", "request type/status"]);
  });
  it("handles multi-day work and missing locations conservatively", () => {
    const result = revealAssignment({ ...wr, bl_id: undefined }, { ...interval, assignedEndDateTime: "2026-11-08T00:00" }, "Mechanical", { dates: ["2026-11-07"], weekends: true, firstHour: 0, lastHour: 20, people: null, trades: null, buildings: [], availability: "All", types: ["PM", "Frozen", "Completed"] });
    expect(result.lastHour).toBe(24);
    expect(result.buildings).toBeNull();
    expect(result.changed).toContain("buildings");
  });
});
