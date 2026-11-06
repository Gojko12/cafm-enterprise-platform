import { z } from "zod";
export declare const PM_Frequency: z.ZodEnum<{
    Daily: "Daily";
    Weekly: "Weekly";
    Monthly: "Monthly";
    Quarterly: "Quarterly";
    Yearly: "Yearly";
    "Meter-based": "Meter-based";
}>;
export declare const PMStepInputType: z.ZodEnum<{
    Boolean: "Boolean";
    Numeric: "Numeric";
    SingleSelect: "SingleSelect";
    MultiSelect: "MultiSelect";
    FreeText: "FreeText";
}>;
export declare const PM_StepOptionSchema: z.ZodObject<{
    OptionId: z.ZodString;
    Label: z.ZodString;
    Value: z.ZodString;
    SortOrder: z.ZodNumber;
    TriggersFailure: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const PM_ScheduleStepSchema: z.ZodObject<{
    StepId: z.ZodString;
    Title: z.ZodString;
    Instructions: z.ZodOptional<z.ZodString>;
    SortOrder: z.ZodNumber;
    InputType: z.ZodEnum<{
        Boolean: "Boolean";
        Numeric: "Numeric";
        SingleSelect: "SingleSelect";
        MultiSelect: "MultiSelect";
        FreeText: "FreeText";
    }>;
    Unit: z.ZodOptional<z.ZodString>;
    MinThreshold: z.ZodOptional<z.ZodNumber>;
    MaxThreshold: z.ZodOptional<z.ZodNumber>;
    Options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        OptionId: z.ZodString;
        Label: z.ZodString;
        Value: z.ZodString;
        SortOrder: z.ZodNumber;
        TriggersFailure: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>>;
    RequiresPhotoOnFailure: z.ZodDefault<z.ZodBoolean>;
    RequiresCommentOnFailure: z.ZodDefault<z.ZodBoolean>;
    IsRequired: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const PM_ChecklistStandardSchema: z.ZodObject<{
    ChecklistCode: z.ZodString;
    Title: z.ZodString;
    MaintenanceReason: z.ZodString;
    TradeId: z.ZodString;
    TradeName: z.ZodString;
    ExpectedHours: z.ZodNumber;
    Steps: z.ZodArray<z.ZodObject<{
        StepId: z.ZodString;
        Title: z.ZodString;
        Instructions: z.ZodOptional<z.ZodString>;
        SortOrder: z.ZodNumber;
        InputType: z.ZodEnum<{
            Boolean: "Boolean";
            Numeric: "Numeric";
            SingleSelect: "SingleSelect";
            MultiSelect: "MultiSelect";
            FreeText: "FreeText";
        }>;
        Unit: z.ZodOptional<z.ZodString>;
        MinThreshold: z.ZodOptional<z.ZodNumber>;
        MaxThreshold: z.ZodOptional<z.ZodNumber>;
        Options: z.ZodDefault<z.ZodArray<z.ZodObject<{
            OptionId: z.ZodString;
            Label: z.ZodString;
            Value: z.ZodString;
            SortOrder: z.ZodNumber;
            TriggersFailure: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>>>;
        RequiresPhotoOnFailure: z.ZodDefault<z.ZodBoolean>;
        RequiresCommentOnFailure: z.ZodDefault<z.ZodBoolean>;
        IsRequired: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    IsActive: z.ZodDefault<z.ZodBoolean>;
    Version: z.ZodDefault<z.ZodNumber>;
    CreatedAt: z.ZodOptional<z.ZodString>;
    UpdatedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const PM_ScheduleSchema: z.ZodObject<{
    ScheduleId: z.ZodString;
    ChecklistCode: z.ZodString;
    EquipmentCodes: z.ZodDefault<z.ZodArray<z.ZodString>>;
    bl_id: z.ZodOptional<z.ZodString>;
    LevelName: z.ZodOptional<z.ZodString>;
    RoomCode: z.ZodOptional<z.ZodString>;
    Frequency: z.ZodEnum<{
        Daily: "Daily";
        Weekly: "Weekly";
        Monthly: "Monthly";
        Quarterly: "Quarterly";
        Yearly: "Yearly";
        "Meter-based": "Meter-based";
    }>;
    FrequencyInterval: z.ZodDefault<z.ZodNumber>;
    MeterType: z.ZodOptional<z.ZodString>;
    MeterInterval: z.ZodOptional<z.ZodNumber>;
    LeadTimeDays: z.ZodDefault<z.ZodNumber>;
    MarginWindowDays: z.ZodDefault<z.ZodNumber>;
    NextDueDate: z.ZodString;
    IsActive: z.ZodDefault<z.ZodBoolean>;
    CreatedBy: z.ZodString;
    CreatedAt: z.ZodOptional<z.ZodString>;
    UpdatedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const PM_WorkRequestStepSchema: z.ZodObject<{
    StepInstanceId: z.ZodString;
    WR_ID: z.ZodString;
    ScheduleId: z.ZodString;
    ChecklistCode: z.ZodString;
    StepId: z.ZodString;
    Title: z.ZodString;
    Instructions: z.ZodOptional<z.ZodString>;
    SortOrder: z.ZodNumber;
    InputType: z.ZodEnum<{
        Boolean: "Boolean";
        Numeric: "Numeric";
        SingleSelect: "SingleSelect";
        MultiSelect: "MultiSelect";
        FreeText: "FreeText";
    }>;
    Unit: z.ZodOptional<z.ZodString>;
    MinThreshold: z.ZodOptional<z.ZodNumber>;
    MaxThreshold: z.ZodOptional<z.ZodNumber>;
    Options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        OptionId: z.ZodString;
        Label: z.ZodString;
        Value: z.ZodString;
        SortOrder: z.ZodNumber;
        TriggersFailure: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>>;
    PhotoIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    ValueBoolean: z.ZodOptional<z.ZodBoolean>;
    ValueNumeric: z.ZodOptional<z.ZodNumber>;
    SelectedOptionIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    ValueText: z.ZodOptional<z.ZodString>;
    TechnicianComment: z.ZodOptional<z.ZodString>;
    IsFailed: z.ZodDefault<z.ZodBoolean>;
    IsCompleted: z.ZodDefault<z.ZodBoolean>;
    CompletedBy: z.ZodOptional<z.ZodString>;
    CompletedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const PM_StepPhotoSchema: z.ZodObject<{
    PhotoId: z.ZodString;
    StepInstanceId: z.ZodString;
    WR_ID: z.ZodString;
    StoragePath: z.ZodString;
    DownloadUrl: z.ZodOptional<z.ZodString>;
    CapturedBy: z.ZodString;
    CapturedAt: z.ZodString;
    Caption: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const PM_StepAuditLogSchema: z.ZodObject<{
    AuditLogId: z.ZodString;
    StepInstanceId: z.ZodString;
    WR_ID: z.ZodString;
    ActorId: z.ZodString;
    Action: z.ZodEnum<{
        created: "created";
        completed: "completed";
        modified: "modified";
        reopened: "reopened";
    }>;
    PreviousValue: z.ZodOptional<z.ZodUnknown>;
    NewValue: z.ZodOptional<z.ZodUnknown>;
    OccurredAt: z.ZodString;
}, z.core.$strip>;
export type PM_Frequency = z.infer<typeof PM_Frequency>;
export type PMStepInputType = z.infer<typeof PMStepInputType>;
export type PM_StepOption = z.infer<typeof PM_StepOptionSchema>;
export type PM_ScheduleStep = z.infer<typeof PM_ScheduleStepSchema>;
export type PM_ChecklistStandard = z.infer<typeof PM_ChecklistStandardSchema>;
export type PM_Schedule = z.infer<typeof PM_ScheduleSchema>;
export type PM_WorkRequestStep = z.infer<typeof PM_WorkRequestStepSchema>;
export type PM_StepPhoto = z.infer<typeof PM_StepPhotoSchema>;
export type PM_StepAuditLog = z.infer<typeof PM_StepAuditLogSchema>;
//# sourceMappingURL=smart-pm.d.ts.map