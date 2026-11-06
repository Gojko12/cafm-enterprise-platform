import { z } from "zod";
import { LocationHierarchySchema } from "./locations.js";

export const WR_Type = z.enum(["PM", "LJ", "FJ"]);
export type WR_Type = z.infer<typeof WR_Type>;

export const WRStatusDefinitionSchema = z.object({
  WorkRequestStatus: z.string().min(1),
  WorkRequestSubstatus: z.string().min(1),
  Percentage: z.number().min(0).max(100),
  ESAWorkType: z.string().min(1),
});

export type WRStatusDefinition = z.infer<typeof WRStatusDefinitionSchema>;

export const WR_Statuses: readonly WRStatusDefinition[] = Object.freeze([
  {
    WorkRequestStatus: "Issued",
    WorkRequestSubstatus: "Issued",
    Percentage: 50,
    ESAWorkType: "Preventive Maintenance",
  },
  {
    WorkRequestStatus: "Issued",
    WorkRequestSubstatus: "Issued",
    Percentage: 50,
    ESAWorkType: "Corrective Maintenance",
  },
  {
    WorkRequestStatus: "Technically Completed",
    WorkRequestSubstatus: "Technically Completed",
    Percentage: 78,
    ESAWorkType: "Preventive Maintenance",
  },
  {
    WorkRequestStatus: "Technically Completed",
    WorkRequestSubstatus: "Technically Completed",
    Percentage: 78,
    ESAWorkType: "Corrective Maintenance",
  },
  {
    WorkRequestStatus: "Closed",
    WorkRequestSubstatus: "Approved",
    Percentage: 100,
    ESAWorkType: "Preventive Maintenance",
  },
  {
    WorkRequestStatus: "Closed",
    WorkRequestSubstatus: "Approved",
    Percentage: 100,
    ESAWorkType: "Corrective Maintenance",
  },
]);

export const WR_StatusesSchema = z.array(WRStatusDefinitionSchema);

export const BaseWorkRequestSchema = z.object({
  WR_ID: z.string().min(1),
  JobID: z.string().min(1).optional(),
  TicketSequence: z.number().int().nonnegative().optional(),
  WR_Type,
  ESAWorkType: z.string().min(1),
  Description: z.string().min(1),
  ProblemLocation: z.string().optional(),
  TradeId: z.string().min(1).optional(),
  TradeName: z.string().min(1).optional(),
  EquipmentCodes: z.array(z.string().min(1)).default([]),
  PM_CycleKey: z.string().min(1).optional(),
  ScheduleId: z.string().min(1).optional(),
  ExpectedHours: z.number().nonnegative().optional(),
  TotalTimeMinutes: z.number().nonnegative().default(0),
  CreatedDate: z.string().min(1),
  StartDate: z.string().min(1).optional(),
  StartDateTBD: z.boolean().default(false),
  DueDate: z.string().min(1).optional(),
  MarginDate: z.string().min(1).optional(),
  WorkRequestStatus: z.string().min(1),
  WorkRequestSubstatus: z.string().min(1),
  Percentage: z.number().min(0).max(100),
  ...LocationHierarchySchema.shape,
  AssignedCraftpersonIds: z.array(z.string().min(1)).default([]),
  AssignedUserIds: z.array(z.string().min(1)).default([]),
  CreatedBy: z.string().min(1),
  ActiveFreezeName: z.string().optional(),
  PlannedFreezeText: z.string().optional(),
  IsFrozen: z.boolean().default(false),
  FreezeStartedAt: z.string().optional(),
  FreezeEndedAt: z.string().optional(),
  FreezeReason: z.string().optional(),
  UpdatedAt: z.string().min(1).optional(),
});

export type BaseWorkRequest = z.infer<typeof BaseWorkRequestSchema>;

export function validateWorkRequestStatusTransition(
  current: WRStatusDefinition,
  next: WRStatusDefinition,
  statuses: readonly WRStatusDefinition[] = WR_Statuses,
): boolean {
  const configuredCurrent = statuses.some(
    (status) =>
      status.ESAWorkType === current.ESAWorkType &&
      status.WorkRequestStatus === current.WorkRequestStatus &&
      status.WorkRequestSubstatus === current.WorkRequestSubstatus &&
      status.Percentage === current.Percentage,
  );
  const configuredNext = statuses.some(
    (status) =>
      status.ESAWorkType === next.ESAWorkType &&
      status.WorkRequestStatus === next.WorkRequestStatus &&
      status.WorkRequestSubstatus === next.WorkRequestSubstatus &&
      status.Percentage === next.Percentage,
  );

  const nextAvailablePercentage = statuses
    .filter(
      (status) =>
        status.ESAWorkType === current.ESAWorkType &&
        status.Percentage > current.Percentage,
    )
    .reduce<number | undefined>(
      (lowest, status) =>
        lowest === undefined || status.Percentage < lowest ? status.Percentage : lowest,
      undefined,
    );

  return (
    configuredCurrent &&
    configuredNext &&
    current.ESAWorkType === next.ESAWorkType &&
    nextAvailablePercentage === next.Percentage
  );
}

export function assertWorkRequestStatusTransition(
  current: WRStatusDefinition,
  next: WRStatusDefinition,
  statuses: readonly WRStatusDefinition[] = WR_Statuses,
): void {
  if (!validateWorkRequestStatusTransition(current, next, statuses)) {
    throw new Error(
      `Invalid work request status transition for ESAWorkType "${current.ESAWorkType}".`,
    );
  }
}

export function getInitialIssuedStatus(
  esaWorkType: string,
  statuses: readonly WRStatusDefinition[] = WR_Statuses,
): WRStatusDefinition {
  const initialStatus = statuses.find(
    (status) =>
      status.ESAWorkType === esaWorkType &&
      status.WorkRequestStatus === "Issued" &&
      status.WorkRequestSubstatus === "Issued" &&
      status.Percentage === 50,
  );
  if (!initialStatus) {
    throw new Error(`No 50% Issued status is configured for "${esaWorkType}".`);
  }
  return initialStatus;
}

export function createPMCycleKey(scheduleId: string, dueDate: string): string {
  if (!scheduleId.trim() || !dueDate.trim()) {
    throw new Error("A schedule ID and due date are required to identify a PM cycle.");
  }
  return `${scheduleId.trim()}::${dueDate.trim()}`;
}
