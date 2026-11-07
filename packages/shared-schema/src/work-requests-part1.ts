import { z } from "zod";
import { LocationHierarchySchema, SiteIdSchema } from "./locations.js";

export const WR_Type = z.enum(["PM", "LJ", "FJ"]);
export type WR_Type = z.infer<typeof WR_Type>;

// Long Job (LJ) Role Types
export const LJRoleEnum = z.enum([
  "ESA_TO",
  "ESA_TM",
  "ESA_LJM",
  "ESA_CCM",
  "ESA_DO",
  "ESA_IM",
  "TRADE_CM",
  "TRADE_TM",
  "ESA_LONG_JOB",
  "TRADE_LONG_JOB",
]);
export type LJRole = z.infer<typeof LJRoleEnum>;

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

// Long Job Acceptance Gates Schema
export const LJAcceptanceGateSchema = z.object({
  GateType: z.enum(["SAT", "DrawingEngineering", "CIFMInventory"]),
  IsRequired: z.boolean(),
  Status: z.enum(["Pending", "ReviewRequested", "InvitationSent", "Approved"]),
  AssignedToUserId: z.string().min(1).optional(),
  AssignedToRole: LJRoleEnum.optional(),
  ApprovedBy: z.string().min(1).optional(),
  ApprovedAt: z.string().optional(),
});

export type LJAcceptanceGate = z.infer<typeof LJAcceptanceGateSchema>;

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
  SiteId: SiteIdSchema,
  AssignedCraftpersonIds: z.array(z.string().min(1)).default([]),
  AssignedUserIds: z.array(z.string().min(1)).default([]),
  CreatedBy: z.string().min(1),
  ActiveFreezeName: z.string().optional(),
  PlannedFreezeText: z.string().optional(),
  IsFrozen: z.boolean().default(false),
  FreezeStartedAt: z.string().optional(),
  FreezeEndedAt: z.string().optional(),
  FreezeReason: z.string().optional(),
  // Financial & Escalation Fields (for Phase 6)
  EstimatedCostEur: z.number().nonnegative().optional(),
  ActualCostEur: z.number().nonnegative().optional(),
  ParentPM_WR_ID: z.string().min(1).optional(),
  OriginatingFJ_WR_ID: z.string().min(1).optional(),
  EscalatedToLJ_WR_ID: z.string().min(1).optional(),
  // Long Job specific fields
  RequiresSAT: z.boolean().default(false),
  RequiresDrawingUpdate: z.boolean().default(false),
  RequiresInventoryUpdate: z.boolean().default(false),
  AcceptanceGates: z.array(LJAcceptanceGateSchema).default([]),
  UpdatedAt: z.string().min(1).optional(),
});

export type BaseWorkRequest = z.infer<typeof BaseWorkRequestSchema>;

// Acceptance Gate Schemas (Section 11.4)
export const AcceptanceGateStatusEnum = z.enum([
  "Pending",
  "ReviewRequested",
  "InvitationSent",
  "Approved",
]);

export const AcceptanceGateSchema = z.object({
  Status: AcceptanceGateStatusEnum,
  Actor: z.string().optional(),
  Timestamp: z.string().optional(),
});

export type AcceptanceGate = z.infer<typeof AcceptanceGateSchema>;

export const AcceptanceGatesSchema = z.object({
  PreSAT: AcceptanceGateSchema.optional(),
  SAT: AcceptanceGateSchema.optional(),
  DrawingEngineering: AcceptanceGateSchema.optional(),
  CIFMInventory: AcceptanceGateSchema.optional(),
});

export type AcceptanceGates = z.infer<typeof AcceptanceGatesSchema>;

