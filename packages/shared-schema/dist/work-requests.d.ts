import { z } from "zod";
export declare const WR_Type: z.ZodEnum<{
    PM: "PM";
    LJ: "LJ";
    FJ: "FJ";
}>;
export type WR_Type = z.infer<typeof WR_Type>;
export declare const WRStatusDefinitionSchema: z.ZodObject<{
    WorkRequestStatus: z.ZodString;
    WorkRequestSubstatus: z.ZodString;
    Percentage: z.ZodNumber;
    ESAWorkType: z.ZodString;
}, z.core.$strip>;
export type WRStatusDefinition = z.infer<typeof WRStatusDefinitionSchema>;
export declare const WR_Statuses: readonly WRStatusDefinition[];
export declare const WR_StatusesSchema: z.ZodArray<z.ZodObject<{
    WorkRequestStatus: z.ZodString;
    WorkRequestSubstatus: z.ZodString;
    Percentage: z.ZodNumber;
    ESAWorkType: z.ZodString;
}, z.core.$strip>>;
export declare const BaseWorkRequestSchema: z.ZodObject<{
    AssignedCraftpersonIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    AssignedUserIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    CreatedBy: z.ZodString;
    ActiveFreezeName: z.ZodOptional<z.ZodString>;
    PlannedFreezeText: z.ZodOptional<z.ZodString>;
    IsFrozen: z.ZodDefault<z.ZodBoolean>;
    FreezeStartedAt: z.ZodOptional<z.ZodString>;
    FreezeEndedAt: z.ZodOptional<z.ZodString>;
    FreezeReason: z.ZodOptional<z.ZodString>;
    UpdatedAt: z.ZodOptional<z.ZodString>;
    bl_id: z.ZodString;
    LevelName: z.ZodString;
    RoomCode: z.ZodOptional<z.ZodString>;
    WR_ID: z.ZodString;
    JobID: z.ZodOptional<z.ZodString>;
    TicketSequence: z.ZodOptional<z.ZodNumber>;
    WR_Type: z.ZodEnum<{
        PM: "PM";
        LJ: "LJ";
        FJ: "FJ";
    }>;
    ESAWorkType: z.ZodString;
    Description: z.ZodString;
    ProblemLocation: z.ZodOptional<z.ZodString>;
    TradeId: z.ZodOptional<z.ZodString>;
    TradeName: z.ZodOptional<z.ZodString>;
    EquipmentCodes: z.ZodDefault<z.ZodArray<z.ZodString>>;
    PM_CycleKey: z.ZodOptional<z.ZodString>;
    ScheduleId: z.ZodOptional<z.ZodString>;
    ExpectedHours: z.ZodOptional<z.ZodNumber>;
    TotalTimeMinutes: z.ZodDefault<z.ZodNumber>;
    CreatedDate: z.ZodString;
    StartDate: z.ZodOptional<z.ZodString>;
    StartDateTBD: z.ZodDefault<z.ZodBoolean>;
    DueDate: z.ZodOptional<z.ZodString>;
    MarginDate: z.ZodOptional<z.ZodString>;
    WorkRequestStatus: z.ZodString;
    WorkRequestSubstatus: z.ZodString;
    Percentage: z.ZodNumber;
}, z.core.$strip>;
export type BaseWorkRequest = z.infer<typeof BaseWorkRequestSchema>;
export declare function validateWorkRequestStatusTransition(current: WRStatusDefinition, next: WRStatusDefinition, statuses?: readonly WRStatusDefinition[]): boolean;
export declare function assertWorkRequestStatusTransition(current: WRStatusDefinition, next: WRStatusDefinition, statuses?: readonly WRStatusDefinition[]): void;
export declare function getInitialIssuedStatus(esaWorkType: string, statuses?: readonly WRStatusDefinition[]): WRStatusDefinition;
export declare function createPMCycleKey(scheduleId: string, dueDate: string): string;
//# sourceMappingURL=work-requests.d.ts.map