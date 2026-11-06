import { WRStatusDefinition } from "@cafm/shared-schema";
export interface WRLifecycleContext {
    firestore: any;
    logger: any;
}
export interface StatusTransitionRequest {
    wrId: string;
    fromStatus: WRStatusDefinition;
    toStatus: WRStatusDefinition;
    userId: string;
    notes?: string;
    timestamp: Date;
}
export interface FreezeManagementRequest {
    wrId: string;
    action: "freeze" | "unfreeze";
    freezeName?: string;
    freezeReason?: string;
    userId: string;
    timestamp: Date;
}
export interface ChecklistStepExecutionRequest {
    wrId: string;
    stepInstanceId: string;
    inputData: Record<string, any>;
    photoIds: string[];
    technicianComment?: string;
    userId: string;
    timestamp: Date;
}
export interface FastJobCreationRequest {
    description: string;
    problemLocation: string;
    bl_id: string;
    LevelName: string;
    RoomCode?: string;
    equipmentCodes: string[];
    tradeId: string;
    tradeName: string;
    userId: string;
    timestamp: Date;
}
export interface WorkSessionTimerRequest {
    wrId: string;
    action: "start" | "pause" | "stop";
    craftpersonId: string;
    userId: string;
    manualOverrideMinutes?: number;
    overrideReason?: string;
    timestamp: Date;
}
export interface TechnicalAuditRequest {
    wrId: string;
    qaInspectedBy: string;
    result: "Pass" | "Fail";
    issueDescription?: string;
    correctionComment?: string;
    score?: number;
    photoStoragePaths: string[];
    shouldReopenWR: boolean;
    userId: string;
    timestamp: Date;
}
export declare function updateWorkRequestStatus(request: StatusTransitionRequest, context: WRLifecycleContext): Promise<{
    success: boolean;
    wrId: string;
    message: string;
}>;
export declare function manageLongJobFreeze(request: FreezeManagementRequest, context: WRLifecycleContext): Promise<{
    success: boolean;
    wrId: string;
    message: string;
}>;
export declare function createFastJob(request: FastJobCreationRequest, context: WRLifecycleContext): Promise<{
    success: boolean;
    wrId?: string;
    message: string;
}>;
export declare function executeChecklistStep(request: ChecklistStepExecutionRequest, context: WRLifecycleContext): Promise<{
    success: boolean;
    message: string;
}>;
export declare function manageWorkSessionTimer(request: WorkSessionTimerRequest, context: WRLifecycleContext): Promise<{
    success: boolean;
    message: string;
    sessionMinutes?: number;
}>;
export declare function conductTechnicalAudit(request: TechnicalAuditRequest, context: WRLifecycleContext): Promise<{
    success: boolean;
    message: string;
}>;
//# sourceMappingURL=wr-lifecycle.d.ts.map