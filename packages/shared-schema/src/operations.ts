import { z } from "zod";

export const WorkSessionSchema = z
  .object({
    WorkSessionId: z.string().min(1),
    WR_ID: z.string().min(1),
    CraftpersonId: z.string().min(1),
    UserId: z.string().min(1),
    State: z.enum(["running", "paused", "stopped"]),
    StartedAt: z.string().min(1),
    PausedAt: z.string().min(1).optional(),
    StoppedAt: z.string().min(1).optional(),
    TotalTimeMinutes: z.number().nonnegative().default(0),
    IsManualOverride: z.boolean().default(false),
    TimerOverrideReason: z.string().optional(),
  })
  .superRefine((session, context) => {
    if (session.State === "paused" && !session.PausedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PausedAt"],
        message: "Paused sessions require a pause timestamp.",
      });
    }
    if (session.State === "stopped" && !session.StoppedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["StoppedAt"],
        message: "Stopped sessions require a stop timestamp.",
      });
    }
    if (session.IsManualOverride && !session.TimerOverrideReason?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TimerOverrideReason"],
        message: "Manual timer overrides require a reason.",
      });
    }
  });

export const TechnicalAuditSchema = z.object({
  TechnicalAuditId: z.string().min(1),
  WR_ID: z.string().min(1).optional(),
  EquipmentCode: z.string().min(1).optional(),
  QA_InspectedBy: z.string().min(1),
  QA_IssueDescription: z.string().optional(),
  QA_CorrectionComment: z.string().optional(),
  Result: z.enum(["Pass", "Fail"]),
  Score: z.number().min(0).max(100).optional(),
  PhotoStoragePaths: z.array(z.string().min(1)).default([]),
  ReopenWorkRequest: z.boolean().default(false),
  InspectedAt: z.string().min(1),
})
  .refine((audit) => audit.WR_ID !== undefined || audit.EquipmentCode !== undefined, {
    message: "An audit must reference a work request or equipment item.",
  });

export const CraftpersonSchema = z.object({
  CraftpersonId: z.string().min(1),
  UserId: z.string().min(1),
  EmployeeProfileId: z.string().min(1).optional(),
  DisplayName: z.string().min(1),
  TradeIds: z.array(z.string().min(1)).min(1),
  SkillLevels: z.record(z.string(), z.number().int().min(1).max(5)).default({}),
  ShiftSchedule: z.array(
    z.object({
      DayOfWeek: z.number().int().min(0).max(6),
      StartTime: z.string().min(1),
      EndTime: z.string().min(1),
      AvailableHours: z.number().nonnegative(),
    }),
  ).default([]),
  HourlyRate: z.number().nonnegative().optional(),
  IsActive: z.boolean().default(true),
});

export const EmployeeProfileSchema = z.object({
  EmployeeProfileId: z.string().min(1),
  UserId: z.string().min(1),
  DisplayName: z.string().min(1),
  Email: z.string().email(),
  Department: z.string().optional(),
  CostCenter: z.string().optional(),
  CraftpersonId: z.string().optional(),
  IsActive: z.boolean().default(true),
});

export const DeskReservationSchema = z
  .object({
    ReservationId: z.string().min(1),
    DeskId: z.string().min(1),
    bl_id: z.string().min(1),
    LevelName: z.string().min(1),
    RoomCode: z.string().min(1),
    ReservedBy: z.string().min(1),
    StartAt: z.string().min(1),
    EndAt: z.string().min(1),
    Status: z.enum(["Reserved", "CheckedIn", "Released", "Cancelled"]),
    CheckedInAt: z.string().optional(),
    CreatedAt: z.string().min(1),
  })
  .superRefine((reservation, context) => {
    const start = Date.parse(reservation.StartAt);
    const end = Date.parse(reservation.EndAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EndAt"],
        message: "Reservation end must be after its start.",
      });
    }
    if (reservation.Status === "CheckedIn" && !reservation.CheckedInAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CheckedInAt"],
        message: "Checked-in reservations require a check-in timestamp.",
      });
    }
  });

export type WorkSession = z.infer<typeof WorkSessionSchema>;
export type TechnicalAudit = z.infer<typeof TechnicalAuditSchema>;
export type Craftperson = z.infer<typeof CraftpersonSchema>;
export type EmployeeProfile = z.infer<typeof EmployeeProfileSchema>;
export type DeskReservation = z.infer<typeof DeskReservationSchema>;

export function calculateWorkSessionMinutes(
  startedAt: Date,
  stoppedAt: Date,
  pausedMinutes = 0,
): number {
  const elapsedMinutes = (stoppedAt.getTime() - startedAt.getTime()) / 60_000;
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 0) {
    throw new Error("Work session timestamps must be valid and in chronological order.");
  }
  if (!Number.isFinite(pausedMinutes) || pausedMinutes < 0 || pausedMinutes > elapsedMinutes) {
    throw new Error("Paused minutes must be between zero and the elapsed session duration.");
  }
  return Math.round(elapsedMinutes - pausedMinutes);
}
