import { PM_ChecklistStandard, PM_Schedule, PM_WorkRequestStep, PM_StepAuditLog, Building, Floor, Room, Equipment } from "@cafm/shared-schema";
export interface PMGenerationRequest {
    generationMode: "single" | "selected" | "horizon30days";
    scheduleId?: string;
    selectedScheduleIds?: string[];
    checklistBlueprint: PM_ChecklistStandard;
    schedule: PM_Schedule;
    equipment?: Equipment;
    floor?: Floor;
    building?: Building;
    roomList?: Room[];
    userId: string;
    timestamp: Date;
}
export interface PMGeneratedWorkRequest {
    WR_ID: string;
    PM_CycleKey: string;
    DueDate: string;
    MarginDate: string;
    steps: PM_WorkRequestStep[];
    auditLogs: PM_StepAuditLog[];
}
export interface GeneratorContext {
    firestore: any;
    logger: any;
}
export declare function generatePMWorkRequests(request: PMGenerationRequest, context: GeneratorContext): Promise<PMGeneratedWorkRequest[]>;
//# sourceMappingURL=pm-generator.d.ts.map