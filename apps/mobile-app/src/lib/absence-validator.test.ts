import { describe, expect, it } from "vitest";
import { CraftpersonAbsenceSchema } from "@cafm/shared-schema";
import { validateAbsence } from "../../../web-portal/lib/absence-validator";

describe("local absence form validation", () => {
  const input = { id: "leave", siteId: "SITE-01", craftpersonId: "person", absenceType: "Training", startDate: "2026-11-09", endDate: "2026-11-10", isFullDay: false, startTime: "09:00", endTime: "13:00", unavailableHoursPerDay: 4, status: "Approved", notes: "" };
  it("accepts valid form data that the persistence schema also accepts", () => {
    const result = validateAbsence(input);
    expect(result.success).toBe(true);
    if (result.success) expect(CraftpersonAbsenceSchema.safeParse(result.data).success).toBe(true);
  });
  it("returns errors for invalid dates, reversed hours, invalid sites and missing times", () => {
    for (const change of [{ startDate: "2026-02-30" }, { endDate: "2026-11-01" }, { endTime: "08:00" }, { startTime: undefined }, { siteId: "OTHER" }]) {
      expect(validateAbsence({ ...input, ...change }).success).toBe(false);
    }
  });
});
