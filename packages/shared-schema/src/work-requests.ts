import { z } from "zod";
import { LocationHierarchySchema, SiteIdSchema } from "./locations.js";
import { PM_ScheduleStepSchema, PM_StepAuditLogSchema, PM_WorkRequestStepSchema } from "./smart-pm.js";

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

export const ChecklistHistoryEntrySchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().min(1),
  performedBy: z.string().min(1),
  actionType: z.string().min(1),
  stepReference: z.string().optional(),
  details: z.string().min(1),
});

export const CraftpersonLaborSchema = z.object({
  craftpersonId: z.string().min(1),
  hourlyRate: z.number().nonnegative(),
  workingTimeMinutes: z.number().nonnegative(),
  name: z.string().min(1),
  lastName: z.string().min(1),
});

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
  LevelName: z.string().min(1).optional(),
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
  ProcessTrack: z.enum(["RFQ", "RFW"]).optional(),
  ArchivedAt: z.string().optional(),
  AssignedRoles: z.object({
    ESA_TM: z.string().optional(),
    ESA_CCM: z.string().optional(),
    TRADE_TM: z.string().optional(),
    TRADE_CM: z.string().optional(),
    ESA_TO: z.string().optional(),
    ESA_LJM: z.string().optional(),
    ESA_DO: z.string().optional(),
    ESA_IM: z.string().optional(),
  }).optional(),
  ChecklistSteps: z.array(PM_ScheduleStepSchema).optional(),
  ChecklistStandardCode: z.string().optional(),
  ChecklistCompleted: z.boolean().optional(),
  ChecklistInstances: z.array(PM_WorkRequestStepSchema).optional(),
  StepAuditLogs: z.array(PM_StepAuditLogSchema).optional(),
  ChecklistHistory: z.array(ChecklistHistoryEntrySchema).optional(),
  CraftpersonLabor: z.array(CraftpersonLaborSchema).optional(),
  SpareParts: z.array(z.object({
    id: z.string().min(1),
    description: z.string(),
    quantity: z.number().nonnegative(),
    unitCostEur: z.number().nonnegative(),
  })).optional(),
  QuotationLines: z.array(z.object({
    id: z.string().min(1),
    description: z.string(),
    quantity: z.number().nonnegative(),
    unitCostEur: z.number().nonnegative(),
  })).optional(),
  PMPIdOriginal: z.string().optional(),
  PMPIdSmart: z.string().optional(),
  PMProcedureDescription: z.string().optional(),
  PMProcedureDescriptionSmart: z.string().optional(),
  ResponsibleCompany: z.string().optional(),
  ResponsiblePerson: z.string().optional(),
  PMSIdOriginal: z.string().optional(),
  PMSIdSmart: z.string().optional(),
  DowntimeMinutes: z.number().nonnegative().optional(),
  KPINotes: z.string().optional(),
  AuditInspectionStatus: z.enum(["To Be Inspected", "Passed Inspected", "PM WRs to be corrected"]).optional(),
  QA_InspectionStatus: z.enum(["Pending", "Passed", "ToBeCorrected"]).optional(),
  QA_IssueDescription: z.string().optional(),
  QA_CorrectionComment: z.string().optional(),
  Urgency: z.string().optional(),
  PreSATApproved: z.boolean().optional(),
  Activity: z.array(z.object({
    id: z.string(),
    kind: z.enum(["comment", "log"]),
    actorId: z.string(),
    actorName: z.string(),
    actorRole: z.string(),
    createdAt: z.string(),
    text: z.string(),
    editHistory: z.array(z.object({ text: z.string(), timestamp: z.string() })).optional(),
    editedAt: z.string().optional(),
  })).optional(),
  Attachments: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    dataUrl: z.string(),
  })).optional(),
  ChecklistResults: z.array(z.object({
    stepId: z.string(),
    passed: z.boolean(),
    value: z.union([z.string(), z.number(), z.array(z.string())]),
    photoPaths: z.array(z.string()).optional(),
    comment: z.string().optional(),
    completedAt: z.string(),
  })).optional(),
  // Long Job specific fields
  RequiresSAT: z.boolean().default(false),
  RequiresDrawingUpdate: z.boolean().default(false),
  RequiresInventoryUpdate: z.boolean().default(false),
  AcceptanceGates: z.array(LJAcceptanceGateSchema).default([]),
  UpdatedAt: z.string().min(1).optional(),
});

export type BaseWorkRequest = z.infer<typeof BaseWorkRequestSchema>;
export type ChecklistHistoryEntry = z.infer<typeof ChecklistHistoryEntrySchema>;
export type CraftpersonLabor = z.infer<typeof CraftpersonLaborSchema>;

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

/**
 * Validate whether a Work Request meets the financial threshold for its type.
 * - FJ (Fast Job): EstimatedCostEur < 750 EUR
 * - LJ (Long Job): EstimatedCostEur >= 750 EUR
 * - PM (Preventive Maintenance): No cost threshold
 */
export function validateWRFinancialThreshold(
  wrType: WR_Type,
  estimatedCostEur?: number,
): boolean {
  if (wrType === "PM") {
    return true;
  }

  if (estimatedCostEur === undefined) {
    return false;
  }

  if (wrType === "FJ") {
    return estimatedCostEur < 750;
  }

  if (wrType === "LJ") {
    return estimatedCostEur >= 750;
  }

  return false;
}

// LJ Transition Matrix Entry Type (Section 11.3-11.5)
export type LJTransitionAction = {
  actionName: string;
  targetPercentage: number;
  allowedRoles: LJRole[];
};

export type LJTransitionMatrixEntry = {
  percentage: number;
  label: string;
  description: string;
  allowedActions: LJTransitionAction[];
  allowedRoles: LJRole[];
  track: "RFQ" | "RFW";
};

// Complete LJ Transition Matrix (RFQ & RFW Tracks)
export const LJ_TRANSITION_MATRIX: readonly LJTransitionMatrixEntry[] = Object.freeze([
  // ===== RFQ Track (Request for Quotation) =====
  {
    percentage: 0,
    label: "Requested - New Request for Quotation",
    description: "Initial request created in RFQ track",
    track: "RFQ",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 0, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
      { actionName: "Submit to Trade", targetPercentage: 20, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
      { actionName: "Submit for Acceptance", targetPercentage: 25, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
      { actionName: "Cancel", targetPercentage: 27, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 10,
    label: "Requested - Work Request from Fast Job - On Hold for Decision, Budget, etc.",
    description: "LJ escalated from Fast Job, waiting for decision or budget approval",
    track: "RFQ",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 10, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
      { actionName: "Submit to Trade", targetPercentage: 20, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
      { actionName: "Submit for Acceptance", targetPercentage: 25, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
      { actionName: "Cancel", targetPercentage: 27, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 20,
    label: "Requested - Quotation Preparation Offer by Contractor",
    description: "Contractor/Trade preparing quotation",
    track: "RFQ",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 20, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"] },
      { actionName: "In Progress", targetPercentage: 21, allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB"] },
      { actionName: "Submit for Acceptance", targetPercentage: 25, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"] },
      { actionName: "Cancel", targetPercentage: 27, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 21,
    label: "Requested - Quotation Preparation Offer by Trade",
    description: "Trade actively preparing quotation",
    track: "RFQ",
    allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 21, allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB"] },
      { actionName: "Submit for Acceptance", targetPercentage: 25, allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB"] },
      { actionName: "Cancel", targetPercentage: 27, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 23,
    label: "Requested - Quotation Not Accepted by ESA-TM. Review by Contractor",
    description: "Quotation rejected; contractor needs to revise",
    track: "RFQ",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 23, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"] },
      { actionName: "In Progress", targetPercentage: 21, allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB"] },
      { actionName: "Submit for Acceptance", targetPercentage: 25, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"] },
      { actionName: "Cancel", targetPercentage: 27, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 25,
    label: "Requested - Quotation Pending Acceptance by ESA-Trade Manager",
    description: "Quotation submitted, awaiting ESA Trade Manager approval",
    track: "RFQ",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 25, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
      { actionName: "Send to User for Acceptance", targetPercentage: 26, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
      { actionName: "Accept", targetPercentage: 28, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
      { actionName: "Accept and Convert to RFW", targetPercentage: 30, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
      { actionName: "Request Review", targetPercentage: 23, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
      { actionName: "Reject", targetPercentage: 29, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 26,
    label: "Requested - Quotation Pending Approval for User Budget",
    description: "Quotation submitted to user/budget holder for approval",
    track: "RFQ",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 26, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
      { actionName: "Accept", targetPercentage: 28, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
      { actionName: "Request Review", targetPercentage: 23, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
      { actionName: "Reject", targetPercentage: 29, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 28,
    label: "Requested - Quotation Accepted",
    description: "Quotation accepted; ready to convert to RFW",
    track: "RFQ",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 28, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
      { actionName: "Convert RFQ to RFW", targetPercentage: 30, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 27,
    label: "Cancelled (Archived)",
    description: "Request cancelled and archived",
    track: "RFQ",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"],
    allowedActions: [],
  },
  {
    percentage: 29,
    label: "Rejected (Archived)",
    description: "Request rejected and archived",
    track: "RFQ",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"],
    allowedActions: [],
  },
  
  // ===== RFW Track (Request for Work) =====
  {
    percentage: 0,
    label: "Requested - New Request for Work",
    description: "New RFW work request created",
    track: "RFW",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 0, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
      { actionName: "Submit for Approval", targetPercentage: 30, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
      { actionName: "Cancel", targetPercentage: 27, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 10,
    label: "Work Request from Fast Job - On Hold",
    description: "Work request escalated from Fast Job, on hold for decision/budget",
    track: "RFW",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 10, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
      { actionName: "Submit for Approval", targetPercentage: 30, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
      { actionName: "Cancel", targetPercentage: 27, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 30,
    label: "Requested - Pending Approval From ESA Technical Officer",
    description: "Awaiting approval from ESA Technical Officer",
    track: "RFW",
    allowedRoles: ["ESA_TO"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 30, allowedRoles: ["ESA_TO"] },
      { actionName: "Reject", targetPercentage: 29, allowedRoles: ["ESA_TO"] },
      { actionName: "Request Review", targetPercentage: 23, allowedRoles: ["ESA_TO"] },
      { actionName: "On Hold for Budget", targetPercentage: 31, allowedRoles: ["ESA_TO"] },
      { actionName: "Approve & Order", targetPercentage: 32, allowedRoles: ["ESA_TO"] },
    ],
  },
  {
    percentage: 31,
    label: "Approved - Waiting for Budget",
    description: "Approved but awaiting budget confirmation",
    track: "RFW",
    allowedRoles: ["ESA_TO"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 31, allowedRoles: ["ESA_TO"] },
      { actionName: "Reject", targetPercentage: 29, allowedRoles: ["ESA_TO"] },
      { actionName: "Request Review", targetPercentage: 23, allowedRoles: ["ESA_TO"] },
      { actionName: "Approve & Order", targetPercentage: 32, allowedRoles: ["ESA_TO"] },
    ],
  },
  {
    percentage: 32,
    label: "Issued and In Process - Work Request Ordered to Contractor",
    description: "Work request issued and ordered to contractor",
    track: "RFW",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 32, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"] },
      { actionName: "Commit", targetPercentage: 40, allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB"] },
    ],
  },
  {
    percentage: 40,
    label: "Commitment to Due Date & Price Details",
    description: "Contractor committed to due date and price",
    track: "RFW",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 40, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"] },
      { actionName: "Start Work", targetPercentage: 50, allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB"] },
      { actionName: "Technically Completed", targetPercentage: 78, allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB"] },
    ],
  },
  {
    percentage: 50,
    label: "Work Request Execution",
    description: "Active work execution in progress",
    track: "RFW",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_IM", "ESA_LONG_JOB", "TRADE_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 50, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"] },
      { actionName: "On Hold", targetPercentage: 55, allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB"] },
      { actionName: "Technically Completed", targetPercentage: 78, allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB", "ESA_IM"] },
      { actionName: "Log CIFM Inventory Update", targetPercentage: 50, allowedRoles: ["ESA_IM"] },
    ],
  },
  {
    percentage: 55,
    label: "On Hold for Access / Labor / Parts",
    description: "Work paused due to missing access, labor, or parts",
    track: "RFW",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 55, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LJM", "TRADE_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"] },
      { actionName: "Resume Work", targetPercentage: 50, allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB"] },
      { actionName: "Technically Completed", targetPercentage: 78, allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB"] },
    ],
  },
  {
    percentage: 78,
    label: "Work Ready for Approvals Cycle",
    description: "Technically completed; pending SAT, Drawing, and/or Inventory approvals",
    track: "RFW",
    allowedRoles: ["TRADE_TM", "ESA_TO", "ESA_TM", "ESA_DO", "ESA_IM", "ESA_LONG_JOB", "TRADE_LONG_JOB"],
    allowedActions: [
      { actionName: "Approve Pre-SAT", targetPercentage: 79, allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB"] },
      { actionName: "Approve SAT", targetPercentage: 81, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
      { actionName: "Approve Drawing/Engineering", targetPercentage: 82, allowedRoles: ["ESA_DO", "ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
      { actionName: "Approve CIFM Inventory", targetPercentage: 83, allowedRoles: ["ESA_IM", "ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
      { actionName: "Request Review", targetPercentage: 78, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 79,
    label: "Pre-SAT Performed",
    description: "Contractor performed pre-SAT inspection",
    track: "RFW",
    allowedRoles: ["TRADE_TM", "ESA_TO", "ESA_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"],
    allowedActions: [
      { actionName: "Send Invitation", targetPercentage: 80, allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB"] },
      { actionName: "Approve SAT", targetPercentage: 81, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
      { actionName: "Request Review", targetPercentage: 78, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 80,
    label: "Work Request Ready for SAT Approval (Invite)",
    description: "SAT invitation sent; awaiting ESA approval",
    track: "RFW",
    allowedRoles: ["TRADE_TM", "ESA_TO", "ESA_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"],
    allowedActions: [
      { actionName: "Approve SAT", targetPercentage: 81, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
      { actionName: "Request Review", targetPercentage: 78, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 81,
    label: "SAT Approved",
    description: "SAT inspection approved by ESA",
    track: "RFW",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"],
    allowedActions: [
      { actionName: "Save", targetPercentage: 81, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 94,
    label: "All Acceptances Completed",
    description: "All required acceptance gates (SAT, Drawing, Inventory) approved",
    track: "RFW",
    allowedRoles: ["TRADE_TM", "ESA_TO", "ESA_TM", "ESA_LONG_JOB", "TRADE_LONG_JOB"],
    allowedActions: [
      { actionName: "Completed", targetPercentage: 95, allowedRoles: ["TRADE_TM", "TRADE_LONG_JOB"] },
    ],
  },
  {
    percentage: 95,
    label: "Complete WR � Cost Information + Customer Feedback",
    description: "Work complete; awaiting cost sign-off",
    track: "RFW",
    allowedRoles: ["TRADE_CM"],
    allowedActions: [
      { actionName: "Sign Yellow Page", targetPercentage: 96, allowedRoles: ["TRADE_CM"] },
    ],
  },
  {
    percentage: 96,
    label: "Work Request Approved by Contractor Contract Manager",
    description: "Contract manager approved; awaiting cost review",
    track: "RFW",
    allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"],
    allowedActions: [
      { actionName: "Approve Costs", targetPercentage: 97, allowedRoles: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
    ],
  },
  {
    percentage: 97,
    label: "Consistency Check Approved by ESA Trade Manager",
    description: "Trade manager consistency check approved",
    track: "RFW",
    allowedRoles: ["ESA_TO"],
    allowedActions: [
      { actionName: "Final Approval", targetPercentage: 98, allowedRoles: ["ESA_TO"] },
    ],
  },
  {
    percentage: 98,
    label: "Work Request Approved by ESA Technical Officer",
    description: "Technical officer approved; ready for invoicing",
    track: "RFW",
    allowedRoles: ["ESA_TO", "ESA_CCM"],
    allowedActions: [
      { actionName: "Confirm Invoice Information", targetPercentage: 99, allowedRoles: ["ESA_TO", "ESA_CCM"] },
    ],
  },
  {
    percentage: 99,
    label: "Work Request Invoicing Completed",
    description: "Invoice processed; awaiting payment confirmation",
    track: "RFW",
    allowedRoles: ["TRADE_CM", "TRADE_TM", "TRADE_LONG_JOB"],
    allowedActions: [
      { actionName: "Confirm Payment", targetPercentage: 100, allowedRoles: ["TRADE_CM", "TRADE_TM", "TRADE_LONG_JOB"] },
    ],
  },
  {
    percentage: 100,
    label: "Payment Received, Work Request Completed (Closed)",
    description: "Payment received; work request closed and ready for archival",
    track: "RFW",
    allowedRoles: ["TRADE_CM", "TRADE_TM", "TRADE_LONG_JOB"],
    allowedActions: [],
  },
]);

// Helper function: Check if a role can execute a specific LJ action
export function canRoleExecuteLJAction(
  role: LJRole,
  currentPercentage: number,
  actionName: string,
  track: "RFQ" | "RFW" = "RFW",
): boolean {
  const entry = LJ_TRANSITION_MATRIX.find(
    (e) => e.percentage === currentPercentage && e.track === track,
  );

  if (!entry) {
    return false;
  }

  const action = entry.allowedActions.find((a) => a.actionName === actionName);
  if (!action) {
    return false;
  }

  return action.allowedRoles.includes(role);
}

// Helper function: Resolve next acceptance substatus after technical completion (78%)
export function resolveNextAcceptanceSubstatus(
  currentPercentage: number,
  requiresSAT: boolean,
  requiresDrawingUpdate: boolean,
  requiresInventoryUpdate: boolean,
): number {
  // If technically completed at 78% but no acceptance gates required, jump to 94%
  if (currentPercentage === 78) {
    const hasAnyGates = requiresSAT || requiresDrawingUpdate || requiresInventoryUpdate;
    if (!hasAnyGates) {
      return 94;
    }
    // If gates are required, stay at 78% until they are approved
    return 78;
  }

  // For other percentages, return as-is (gating logic handled by transition matrix)
  return currentPercentage;
}
