import { z } from "zod";
import { SiteIdSchema } from "./locations.js";

export const PM_Frequency = z.enum([
  "Daily",
  "Weekly",
  "Monthly",
  "Quarterly",
  "Yearly",
  "Meter-based",
]);

export const PMStepInputType = z.enum([
  "Boolean",
  "Numeric",
  "SingleSelect",
  "MultiSelect",
  "FreeText",
]);

export const PM_StepOptionSchema = z.object({
  OptionId: z.string().min(1),
  Label: z.string().min(1),
  Value: z.string().min(1),
  SortOrder: z.number().int().nonnegative(),
  TriggersFailure: z.boolean().default(false),
});

export const PM_ScheduleStepSchema = z
  .object({
    StepId: z.string().min(1),
    Title: z.string().min(1),
    Instructions: z.string().optional(),
    SortOrder: z.number().int().nonnegative(),
    InputType: PMStepInputType,
    favourableBoolean: z.boolean().optional(),
    Unit: z.string().optional(),
    MinThreshold: z.number().optional(),
    MaxThreshold: z.number().optional(),
    Options: z.array(PM_StepOptionSchema).default([]),
    RequiresPhotoOnFailure: z.boolean().default(true),
    RequiresCommentOnFailure: z.boolean().default(true),
    IsRequired: z.boolean().default(true),
  })
  .superRefine((step, context) => {
    if (step.MinThreshold !== undefined && step.MaxThreshold !== undefined &&
        step.MinThreshold > step.MaxThreshold) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MinThreshold"],
        message: "Minimum threshold cannot exceed maximum threshold.",
      });
    }
    if ((step.InputType === "SingleSelect" || step.InputType === "MultiSelect") &&
        step.Options.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["Options"],
        message: "Select-type steps must define at least one option.",
      });
    }
  });

export const PM_ChecklistStandardSchema = z.object({
  ChecklistCode: z.string().min(1),
  SiteId: SiteIdSchema.optional(),
  Title: z.string().min(1),
  MaintenanceReason: z.string().min(1),
  TradeId: z.string().min(1),
  TradeName: z.string().min(1),
  ExpectedHours: z.number().nonnegative(),
  Steps: z.array(PM_ScheduleStepSchema).min(1),
  IsActive: z.boolean().default(true),
  Version: z.number().int().positive().default(1),
  CreatedAt: z.string().min(1).optional(),
  UpdatedAt: z.string().min(1).optional(),
}).superRefine((checklist, context) => {
  const stepIds = new Set<string>();
  const sortOrders = new Set<number>();
  checklist.Steps.forEach((step, index) => {
    if (stepIds.has(step.StepId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["Steps", index, "StepId"],
        message: "Checklist step IDs must be unique.",
      });
    }
    if (sortOrders.has(step.SortOrder)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["Steps", index, "SortOrder"],
        message: "Checklist step sort orders must be unique.",
      });
    }
    stepIds.add(step.StepId);
    sortOrders.add(step.SortOrder);
  });
});

export const PM_ScheduleSchema = z
  .object({
    ScheduleId: z.string().min(1),
    ChecklistCode: z.string().min(1),
    SiteId: SiteIdSchema,
    EquipmentCodes: z.array(z.string().min(1)).default([]),
    bl_id: z.string().min(1).optional(),
    LevelName: z.string().min(1).optional(),
    RoomCode: z.string().min(1).optional(),
    Frequency: PM_Frequency,
    FrequencyInterval: z.number().positive().default(1),
    MeterType: z.string().min(1).optional(),
    MeterInterval: z.number().positive().optional(),
    LeadTimeDays: z.number().int().nonnegative().default(0),
    MarginWindowDays: z.number().int().nonnegative().default(0),
    NextDueDate: z.string().min(1),
    IsActive: z.boolean().default(true),
    CreatedBy: z.string().min(1),
    CreatedAt: z.string().min(1).optional(),
    UpdatedAt: z.string().min(1).optional(),
  })
  .superRefine((schedule, context) => {
    if (schedule.Frequency === "Meter-based" &&
        (!schedule.MeterType || schedule.MeterInterval === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MeterType"],
        message: "Meter-based schedules require a meter type and interval.",
      });
    }
    if (schedule.RoomCode && (!schedule.bl_id || !schedule.LevelName)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bl_id"],
        message: "Room-targeted schedules must include building and floor IDs.",
      });
    }
    if (schedule.LevelName && !schedule.bl_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bl_id"],
        message: "Floor-targeted schedules must include a building ID.",
      });
    }
    if (schedule.EquipmentCodes.length === 0 && !schedule.bl_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EquipmentCodes"],
        message: "A schedule must target equipment or a building, floor, or room.",
      });
    }
  });

export const PM_WorkRequestStepSchema = z
  .object({
    StepInstanceId: z.string().min(1),
    WR_ID: z.string().min(1),
    ScheduleId: z.string().min(1),
    ChecklistCode: z.string().min(1),
    StepId: z.string().min(1),
    Title: z.string().min(1),
    Instructions: z.string().optional(),
    SortOrder: z.number().int().nonnegative(),
    InputType: PMStepInputType,
    Unit: z.string().optional(),
    MinThreshold: z.number().optional(),
    MaxThreshold: z.number().optional(),
    Options: z.array(PM_StepOptionSchema).default([]),
    PhotoIds: z.array(z.string().min(1)).default([]),
    ValueBoolean: z.boolean().optional(),
    ValueNumeric: z.number().optional(),
    SelectedOptionIds: z.array(z.string().min(1)).optional(),
    ValueText: z.string().optional(),
    TechnicianComment: z.string().optional(),
    IsFailed: z.boolean().default(false),
    IsCompleted: z.boolean().default(false),
    CompletedBy: z.string().optional(),
    CompletedAt: z.string().optional(),
  })
  .superRefine((step, context) => {
    if (step.InputType === "Boolean" && step.ValueBoolean === false && !step.IsFailed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["IsFailed"],
        message: "A failed Boolean check must be marked failed.",
      });
    }
    if (step.ValueNumeric !== undefined) {
      const outOfRange =
        (step.MinThreshold !== undefined && step.ValueNumeric < step.MinThreshold) ||
        (step.MaxThreshold !== undefined && step.ValueNumeric > step.MaxThreshold);
      if (outOfRange && !step.IsFailed) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["IsFailed"],
          message: "An out-of-range numeric measurement must be marked failed.",
        });
      }
    }
    if (step.IsFailed && !step.TechnicianComment?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TechnicianComment"],
        message: "Failed steps require a technician comment.",
      });
    }
    if (step.IsFailed && step.PhotoIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PhotoIds"],
        message: "Failed steps require at least one evidence photo.",
      });
    }
    if (
      (step.InputType === "SingleSelect" || step.InputType === "MultiSelect") &&
      step.Options.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["Options"],
        message: "Select-type steps must define at least one option.",
      });
    }
    const selectedOptionIds = step.SelectedOptionIds ?? [];
    if (step.InputType === "SingleSelect" && selectedOptionIds.length > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SelectedOptionIds"],
        message: "Single-select steps can have only one selected option.",
      });
    }
    if (selectedOptionIds.some((id) => !step.Options.some((option) => option.OptionId === id))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SelectedOptionIds"],
        message: "Selected option IDs must belong to this step.",
      });
    }
    if (step.IsCompleted) {
      const hasInput = {
        Boolean: step.ValueBoolean !== undefined,
        Numeric: step.ValueNumeric !== undefined,
        SingleSelect: selectedOptionIds.length === 1,
        MultiSelect: selectedOptionIds.length > 0,
        FreeText: Boolean(step.ValueText?.trim()),
      }[step.InputType];
      if (!hasInput) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["IsCompleted"],
          message: "Completed checklist steps require an answer for their input type.",
        });
      }
    }
  });

export const PM_StepPhotoSchema = z.object({
  PhotoId: z.string().min(1),
  StepInstanceId: z.string().min(1),
  WR_ID: z.string().min(1),
  StoragePath: z.string().min(1),
  DownloadUrl: z.string().url().optional(),
  CapturedBy: z.string().min(1),
  CapturedAt: z.string().min(1),
  Caption: z.string().optional(),
});

export const PM_StepAuditLogSchema = z.object({
  AuditLogId: z.string().min(1),
  StepInstanceId: z.string().min(1),
  WR_ID: z.string().min(1),
  ActorId: z.string().min(1),
  Action: z.enum(["created", "completed", "modified", "reopened"]),
  PreviousValue: z.unknown().optional(),
  NewValue: z.unknown().optional(),
  OccurredAt: z.string().min(1),
});

export type PM_Frequency = z.infer<typeof PM_Frequency>;
export type PMStepInputType = z.infer<typeof PMStepInputType>;
export type PM_StepOption = z.infer<typeof PM_StepOptionSchema>;
export type PM_ScheduleStep = z.infer<typeof PM_ScheduleStepSchema>;
export type PM_ChecklistStandard = z.infer<typeof PM_ChecklistStandardSchema>;
export type PM_Schedule = z.infer<typeof PM_ScheduleSchema>;
export type PM_WorkRequestStep = z.infer<typeof PM_WorkRequestStepSchema>;
export type PM_StepPhoto = z.infer<typeof PM_StepPhotoSchema>;
export type PM_StepAuditLog = z.infer<typeof PM_StepAuditLogSchema>;
