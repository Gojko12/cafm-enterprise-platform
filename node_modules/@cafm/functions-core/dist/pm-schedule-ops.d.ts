import { PM_Schedule } from "@cafm/shared-schema";
export interface ScheduleOperationContext {
    firestore: any;
    logger: any;
}
export interface BulkCreatePMSRequest {
    schedules: PM_Schedule[];
    userId: string;
    timestamp: Date;
}
export interface BulkAssignBlueprintRequest {
    scheduleIds: string[];
    newChecklistCode: string;
    userId: string;
    timestamp: Date;
}
export interface OverruleIssuedWRsRequest {
    scheduleId: string;
    reasonForCancellation: string;
    userId: string;
    timestamp: Date;
}
export interface SwitchBlueprintRequest {
    scheduleId: string;
    newChecklistCode: string;
    userId: string;
    timestamp: Date;
}
export declare function bulkCreatePMS(request: BulkCreatePMSRequest, context: ScheduleOperationContext): Promise<{
    created: string[];
    errors: Array<{
        schedule: PM_Schedule;
        error: string;
    }>;
}>;
export declare function bulkAssignBlueprint(request: BulkAssignBlueprintRequest, context: ScheduleOperationContext): Promise<{
    updated: string[];
    errors: Array<{
        scheduleId: string;
        error: string;
    }>;
}>;
export declare function overruleIssuedWRs(request: OverruleIssuedWRsRequest, context: ScheduleOperationContext): Promise<{
    cancelled: string[];
    errors: Array<{
        wrId: string;
        error: string;
    }>;
}>;
export declare function switchBlueprint(request: SwitchBlueprintRequest, context: ScheduleOperationContext): Promise<{
    success: boolean;
    message: string;
    affectedCount: number;
}>;
//# sourceMappingURL=pm-schedule-ops.d.ts.map