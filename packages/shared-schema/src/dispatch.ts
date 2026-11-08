import { z } from "zod";
import { SiteIdSchema } from "./locations.js";

export const CalendarDateSchema = z.iso.date();
export const LocalTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const ShiftTypeSchema = z.enum(["Early", "Standard", "Late", "Night", "Custom"]);
export const CraftpersonShiftSchema = z.object({
  shiftType: ShiftTypeSchema,
  shiftStart: LocalTimeSchema,
  shiftEnd: LocalTimeSchema,
}).refine((value) => value.shiftStart !== value.shiftEnd, "Shift start and end must differ.");
export type CraftpersonShift = z.infer<typeof CraftpersonShiftSchema>;
export type ShiftType = z.infer<typeof ShiftTypeSchema>;
export const LocalDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/)
  .refine((value) => CalendarDateSchema.safeParse(value.slice(0, 10)).success, "Invalid local date and time");
export const LocationFreezeSchema = z.preprocess((value) => {
  if (value && typeof value === "object" && "buildingIds" in value && Array.isArray(value.buildingIds) && !("buildingId" in value)) {
    return { ...value, buildingId: value.buildingIds[0] };
  }
  return value;
}, z.object({
  id: z.string().min(1),
  siteId: SiteIdSchema,
  buildingId: z.string().min(1),
  floorId: z.string().min(1).optional(),
  roomId: z.string().min(1).optional(),
  buildingIds: z.array(z.string().min(1)).min(1).optional(),
  floorIds: z.array(z.string().min(1)).optional(),
  roomIds: z.array(z.string().min(1)).optional(),
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
  if (entry.buildingIds && !entry.buildingIds.includes(entry.buildingId)) context.addIssue({ code: "custom", path: ["buildingId"], message: "The legacy building must be included in the selected buildings." });
  if (entry.roomIds?.length && !entry.floorIds?.length) context.addIssue({ code: "custom", path: ["floorIds"], message: "Selected rooms require their parent floors." });
  if (entry.endDateTime <= entry.startDateTime) context.addIssue({ code: "custom", path: ["endDateTime"], message: "End must be after start." });
}));
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
