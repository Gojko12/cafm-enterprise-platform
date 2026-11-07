import { z } from "zod";
import { SiteIdSchema } from "./locations.js";

export const CalendarDateSchema = z.iso.date();
export const LocalTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const LocalDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/)
  .refine((value) => CalendarDateSchema.safeParse(value.slice(0, 10)).success, "Invalid local date and time");
export const LocationFreezeSchema = z.object({
  id: z.string().min(1),
  siteId: SiteIdSchema,
  buildingId: z.string().min(1),
  floorId: z.string().min(1).optional(),
  roomId: z.string().min(1).optional(),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  responsiblePerson: z.string().trim().min(1),
  startDateTime: LocalDateTimeSchema,
  endDateTime: LocalDateTimeSchema,
  allowPM: z.boolean(),
  allowFJ: z.boolean(),
  allowLJ: z.boolean(),
}).superRefine((entry, context) => {
  if (entry.roomId && !entry.floorId) context.addIssue({ code: "custom", path: ["roomId"], message: "A room requires a floor." });
  if (entry.endDateTime <= entry.startDateTime) context.addIssue({ code: "custom", path: ["endDateTime"], message: "End must be after start." });
});
export type LocationFreeze = z.infer<typeof LocationFreezeSchema>;
export const CraftpersonAbsenceSchema = z.object({
  id: z.string().min(1),
  siteId: SiteIdSchema,
  craftpersonId: z.string().min(1),
  absenceType: z.enum(["Vacation", "SickLeave", "Training", "PublicHoliday", "OtherAbsence"]),
  startDate: CalendarDateSchema,
  endDate: CalendarDateSchema,
  isFullDay: z.boolean(),
  startTime: LocalTimeSchema.optional(),
  endTime: LocalTimeSchema.optional(),
  unavailableHoursPerDay: z.number().nonnegative().default(8),
  status: z.enum(["Approved", "Pending", "Cancelled"]),
  notes: z.string(),
}).superRefine((absence, context) => {
  if (absence.startDate > absence.endDate) context.addIssue({ code: "custom", path: ["endDate"], message: "End date must not precede start date." });
  if (!absence.isFullDay && ((absence.startTime && !absence.endTime) || (!absence.startTime && absence.endTime) || (absence.startTime && absence.endTime && absence.startTime >= absence.endTime))) {
    context.addIssue({ code: "custom", path: ["endTime"], message: "Provide a start and end time with end after start." });
  }
});

export type CraftpersonAbsence = z.infer<typeof CraftpersonAbsenceSchema>;
