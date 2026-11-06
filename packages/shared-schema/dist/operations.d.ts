import { z } from "zod";
export declare const WorkSessionSchema: z.ZodObject<{
    WorkSessionId: z.ZodString;
    WR_ID: z.ZodString;
    CraftpersonId: z.ZodString;
    UserId: z.ZodString;
    State: z.ZodEnum<{
        running: "running";
        paused: "paused";
        stopped: "stopped";
    }>;
    StartedAt: z.ZodString;
    PausedAt: z.ZodOptional<z.ZodString>;
    StoppedAt: z.ZodOptional<z.ZodString>;
    TotalTimeMinutes: z.ZodDefault<z.ZodNumber>;
    IsManualOverride: z.ZodDefault<z.ZodBoolean>;
    TimerOverrideReason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const TechnicalAuditSchema: z.ZodObject<{
    TechnicalAuditId: z.ZodString;
    WR_ID: z.ZodOptional<z.ZodString>;
    EquipmentCode: z.ZodOptional<z.ZodString>;
    QA_InspectedBy: z.ZodString;
    QA_IssueDescription: z.ZodOptional<z.ZodString>;
    QA_CorrectionComment: z.ZodOptional<z.ZodString>;
    Result: z.ZodEnum<{
        Pass: "Pass";
        Fail: "Fail";
    }>;
    Score: z.ZodOptional<z.ZodNumber>;
    PhotoStoragePaths: z.ZodDefault<z.ZodArray<z.ZodString>>;
    ReopenWorkRequest: z.ZodDefault<z.ZodBoolean>;
    InspectedAt: z.ZodString;
}, z.core.$strip>;
export declare const CraftpersonSchema: z.ZodObject<{
    CraftpersonId: z.ZodString;
    UserId: z.ZodString;
    EmployeeProfileId: z.ZodOptional<z.ZodString>;
    DisplayName: z.ZodString;
    TradeIds: z.ZodArray<z.ZodString>;
    SkillLevels: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    ShiftSchedule: z.ZodDefault<z.ZodArray<z.ZodObject<{
        DayOfWeek: z.ZodNumber;
        StartTime: z.ZodString;
        EndTime: z.ZodString;
        AvailableHours: z.ZodNumber;
    }, z.core.$strip>>>;
    HourlyRate: z.ZodOptional<z.ZodNumber>;
    IsActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const EmployeeProfileSchema: z.ZodObject<{
    EmployeeProfileId: z.ZodString;
    UserId: z.ZodString;
    DisplayName: z.ZodString;
    Email: z.ZodString;
    Department: z.ZodOptional<z.ZodString>;
    CostCenter: z.ZodOptional<z.ZodString>;
    CraftpersonId: z.ZodOptional<z.ZodString>;
    IsActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const DeskReservationSchema: z.ZodObject<{
    ReservationId: z.ZodString;
    DeskId: z.ZodString;
    bl_id: z.ZodString;
    LevelName: z.ZodString;
    RoomCode: z.ZodString;
    ReservedBy: z.ZodString;
    StartAt: z.ZodString;
    EndAt: z.ZodString;
    Status: z.ZodEnum<{
        Reserved: "Reserved";
        CheckedIn: "CheckedIn";
        Released: "Released";
        Cancelled: "Cancelled";
    }>;
    CheckedInAt: z.ZodOptional<z.ZodString>;
    CreatedAt: z.ZodString;
}, z.core.$strip>;
export type WorkSession = z.infer<typeof WorkSessionSchema>;
export type TechnicalAudit = z.infer<typeof TechnicalAuditSchema>;
export type Craftperson = z.infer<typeof CraftpersonSchema>;
export type EmployeeProfile = z.infer<typeof EmployeeProfileSchema>;
export type DeskReservation = z.infer<typeof DeskReservationSchema>;
export declare function calculateWorkSessionMinutes(startedAt: Date, stoppedAt: Date, pausedMinutes?: number): number;
//# sourceMappingURL=operations.d.ts.map