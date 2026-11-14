import { WR_Statuses } from "@cafm/shared-schema";
import type { BaseWorkRequest, PM_ScheduleStep } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { allocateWorkRequestId } from "./wr-id-migration";

export interface FollowUpActor { id: string; name: string; role: string }

/**
 * Creates a linked Follow-Up Fast Job for a PM WR (starting at 50% Issued),
 * registering it on the parent's `FollowUpFJIds` with activity logs on both sides.
 */
export function createFollowUpFastJob(data: DemoData, parent: BaseWorkRequest, options: {
  description: string; urgency: string; stepId?: string; checklistSteps: PM_ScheduleStep[]; actor: FollowUpActor;
}): { error: string } | { next: DemoData; jobId: string } {
  if (!options.description.trim()) return { error: "Enter a description for the Fast Job." };
  const issued = WR_Statuses.find((item) => item.Percentage === 50 && item.ESAWorkType === "Corrective Maintenance");
  if (!issued) return { error: "The 50% Corrective Maintenance status is not configured." };
  const now = new Date().toISOString();
  const jobId = allocateWorkRequestId(data.workRequests, { site: parent.SiteId, deleted: data.deletedWorkRequests ?? [] });
  const job: BaseWorkRequest = {
    WR_ID: jobId,
    JobID: `JOB-${Date.now()}`,
    WR_Type: "FJ",
    ESAWorkType: "Corrective Maintenance",
    Description: options.description.trim(),
    ProblemLocation: parent.ProblemLocation,
    CreatedDate: now.slice(0, 10),
    WorkRequestStatus: issued.WorkRequestStatus,
    WorkRequestSubstatus: issued.WorkRequestSubstatus,
    Percentage: issued.Percentage,
    SiteId: parent.SiteId,
    bl_id: parent.bl_id,
    LevelName: parent.LevelName,
    RoomCode: parent.RoomCode,
    EquipmentCodes: parent.EquipmentCodes,
    AssignedCraftpersonIds: [],
    AssignedUserIds: [],
    CreatedBy: options.actor.id,
    IsFrozen: false,
    TotalTimeMinutes: 0,
    StartDateTBD: false,
    RequiresSAT: false,
    RequiresDrawingUpdate: false,
    RequiresInventoryUpdate: false,
    AcceptanceGates: [],
    ParentPM_WR_ID: parent.WR_ID,
    ParentWR_ID: parent.WR_ID,
    sourcePmWrId: parent.WR_ID,
    originatingChecklistStepId: options.stepId || undefined,
    originatingChecklistStepLabel: options.checklistSteps.find((step) => step.StepId === options.stepId)?.Title,
    EstimatedCostEur: 0,
    Urgency: options.urgency,
    UpdatedAt: now,
    updatedAt: now,
    Activity: [{
      id: crypto.randomUUID(),
      kind: "log",
      actorId: options.actor.id,
      actorName: options.actor.name,
      actorRole: options.actor.role,
      createdAt: now,
      text: `Follow-up Fast Job created from ${parent.WR_ID} by ${options.actor.name}`,
    }],
  };
  const next: DemoData = {
    ...data,
    workRequests: [
      ...data.workRequests.map((item) =>
        item.WR_ID === parent.WR_ID && item.SiteId === parent.SiteId
          ? {
            ...item,
            FollowUpFJIds: [...new Set([...(item.FollowUpFJIds ?? []), job.WR_ID])],
            UpdatedAt: now,
            updatedAt: now,
            Activity: [...(item.Activity ?? []), {
              id: crypto.randomUUID(),
              kind: "log" as const,
              actorId: options.actor.id,
              actorName: options.actor.name,
              actorRole: options.actor.role,
              createdAt: now,
              text: `Follow-up Fast Job ${job.WR_ID} created by ${options.actor.name}`,
            }],
          }
          : item,
      ),
      job,
    ],
  };
  return { next, jobId };
}
