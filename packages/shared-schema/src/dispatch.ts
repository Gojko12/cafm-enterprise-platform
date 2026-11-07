import { z } from "zod";
import { SiteIdSchema } from "./locations.js";

export const CalendarDateSchema = z.iso.date();
export const CraftpersonAbsenceSchema = z.object({
  id: z.string().min(1),
  siteId: SiteIdSchema,
  craftpersonId: z.string().min(1),
  absenceType: z.enum(["Vacation", "SickLeave", "Training", "PublicHoliday", "OtherAbsence"]),
  startDate: CalendarDateSchema,
  endDate: CalendarDateSchema,
  isFullDay: z.boolean(),
  unavailableHoursPerDay: z.number().nonnegative().default(8),
  status: z.enum(["Approved", "Pending", "Cancelled"]),
  notes: z.string(),
}).refine((absence) => absence.startDate <= absence.endDate, { path: ["endDate"], message: "End date must not precede start date." });

export type CraftpersonAbsence = z.infer<typeof CraftpersonAbsenceSchema>;
