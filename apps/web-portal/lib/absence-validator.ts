import { z } from "zod";
import { SiteIdSchema } from "@cafm/shared-schema";
import type { CraftpersonAbsence } from "@cafm/shared-schema";

const localAbsenceSchema = z.object({
  id: z.string().min(1),
  siteId: SiteIdSchema,
  craftpersonId: z.string().min(1),
  absenceType: z.enum(["Vacation", "SickLeave", "Training", "PublicHoliday", "OtherAbsence"]),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  isFullDay: z.boolean(),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  unavailableHoursPerDay: z.number().nonnegative(),
  status: z.enum(["Approved", "Pending", "Cancelled"]),
  notes: z.string(),
}).superRefine((entry, context) => {
  if (entry.startDate > entry.endDate) context.addIssue({ code: "custom", path: ["endDate"], message: "End date must not precede start date." });
  if (!entry.isFullDay && (!entry.startTime || !entry.endTime || entry.startTime >= entry.endTime)) context.addIssue({ code: "custom", path: ["endTime"], message: "Provide a start and end time with end after start." });
});

export function validateAbsence(value: unknown): { success: true; data: CraftpersonAbsence } | { success: false; message: string } {
  const result = localAbsenceSchema.safeParse(value);
  return result.success ? { success: true, data: result.data } : { success: false, message: result.error.issues.map((issue) => issue.message).join("; ") };
}
