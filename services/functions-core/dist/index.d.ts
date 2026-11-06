export declare const generatePMWorkRequestsCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    generated: number;
    workRequests: import("./pm-generator.js").PMGeneratedWorkRequest[];
}>>;
export declare const bulkCreatePMSchedulesCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    created: number;
    failed: number;
    errors: {
        schedule: import("@cafm/shared-schema").PM_Schedule;
        error: string;
    }[];
}>>;
export declare const bulkAssignBlueprintCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    updated: number;
    failed: number;
    errors: {
        scheduleId: string;
        error: string;
    }[];
}>>;
export declare const overruleIssuedWRsCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    cancelled: number;
    failed: number;
    errors: {
        wrId: string;
        error: string;
    }[];
}>>;
export declare const switchBlueprintCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    message: string;
    affectedCount: number;
}>>;
export declare const updateWorkRequestStatusCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    wrId: string;
    message: string;
}>>;
export declare const manageLongJobFreezeCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    wrId: string;
    message: string;
}>>;
export declare const createFastJobCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    wrId?: string;
    message: string;
}>>;
export declare const executeChecklistStepCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    message: string;
}>>;
export declare const manageWorkSessionTimerCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    message: string;
    sessionMinutes?: number;
}>>;
export declare const conductTechnicalAuditCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    message: string;
}>>;
export declare const dryRunValidateImportCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<import("./import-export.js").DryRunValidationResult>>;
export declare const commitBulkImportCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    message: string;
    created: number;
    updated: number;
    failed: number;
}>>;
export declare const generateExportFileCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    fileData: string;
    fileName: string;
}>>;
export declare const setUserRoleClaimsCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    message: string;
}>>;
export declare const verifyPermissionCallable: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    allowed: boolean;
    message: string;
    role?: import("@cafm/shared-schema").UserRole;
}>>;
export declare const cleanupFrozenWRsScheduled: import("firebase-functions/v2/scheduler").ScheduleFunction;
//# sourceMappingURL=index.d.ts.map