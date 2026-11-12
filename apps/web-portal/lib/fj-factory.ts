import type { BaseWorkRequest, SiteId, UrgencyCode } from "@cafm/shared-schema";
import { WR_Statuses } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
export interface FastJobData {
  equipmentCode: string;
  bl_id: string;
  levelName: string;
  roomCode: string;
  description: string;
  photoUrl?: string;
  photoName?: string;
  photoType?: string;
  timeSpentMinutes: number;
  createdAt: string;
  tradeName?: string;
  urgencyCode?: UrgencyCode;
  deferToNextBusinessDay?: boolean;
  intakeChannel?: "Phone Call" | "Email" | "Walk-in" | "Self-Service";
  requestorName?: string;
  requestorEmail?: string;
  requestorPhone?: string;
  requestorDepartment?: string;
  /** True only when the work was already finished on the spot; the job is then logged at 78% with the time spent. */
  completedOnSpot?: boolean;
}
import { computeFjSla, slaStoredDate } from "./fj-sla";
import { getSiteSlaConfig } from "./fj-satisfaction";

export interface FjActor { userId?: string; displayName: string; role: string; personId?: string }

export function buildFastJobWR(job: FastJobData, ctx: { siteId: SiteId; data: DemoData; actor: FjActor; source?: string }): BaseWorkRequest {
  const issuedStatus = WR_Statuses.find((entry) => entry.Percentage === 50 && entry.ESAWorkType === "Corrective Maintenance");
  if (!issuedStatus) throw new Error("Issued status configuration is missing.");
  const completedStatus = job.completedOnSpot ? WR_Statuses.find((entry) => entry.Percentage === 78 && entry.ESAWorkType === "Corrective Maintenance") : undefined;
  if (job.completedOnSpot && !completedStatus) throw new Error("Technically completed status configuration is missing.");
  const status = completedStatus ?? issuedStatus;
  const createdAt = job.createdAt || new Date().toISOString();
  const trade = job.tradeName || "Electrical";
  const urgencyCode: UrgencyCode = job.urgencyCode ?? "NORMAL";
  const config = getSiteSlaConfig(ctx.data, ctx.siteId);
  const sla = computeFjSla(config, trade, urgencyCode, createdAt, { deferToNextBusinessDay: job.deferToNextBusinessDay });
  const stamp = Date.now();
  const actorName = ctx.actor.displayName;
  const onBehalf = !!job.requestorName && job.requestorName !== actorName;
  return {
    WR_ID: `FJ-${stamp}`,
    JobID: `JOB-${stamp}`,
    WR_Type: "FJ",
    ESAWorkType: "Corrective Maintenance",
    Description: job.description,
    ProblemLocation: `${job.bl_id} / ${job.levelName} / ${job.roomCode}`,
    CreatedDate: createdAt.slice(0, 10),
    WorkRequestStatus: status.WorkRequestStatus,
    WorkRequestSubstatus: status.WorkRequestSubstatus,
    Percentage: status.Percentage,
    SiteId: ctx.siteId,
    bl_id: job.bl_id,
    LevelName: job.levelName,
    RoomCode: job.roomCode,
    TradeId: trade,
    TradeName: trade,
    Urgency: config.urgencyLevels.find((item) => item.code === urgencyCode)?.label ?? urgencyCode,
    UrgencyCode: urgencyCode,
    SlaTargetLabel: sla.targetLabel,
    SlaStartAt: sla.startAt,
    SlaDueAt: sla.dueAt,
    SlaMarginAt: sla.marginAt,
    DueDate: slaStoredDate(sla.dueAt, sla.rule),
    MarginDate: slaStoredDate(sla.marginAt, sla.rule),
    IntakeChannel: job.intakeChannel,
    OpenedByPersonId: ctx.actor.personId,
    OpenedByName: actorName,
    OpenedByRole: ctx.actor.role,
    RequestorName: job.requestorName || actorName,
    RequestorEmail: job.requestorEmail,
    RequestorPhone: job.requestorPhone,
    RequestorDepartment: job.requestorDepartment,
    AssignedCraftpersonIds: [],
    AssignedUserIds: [],
    CreatedBy: ctx.actor.userId ?? "current-user",
    IsFrozen: false,
    EquipmentCodes: job.equipmentCode ? [job.equipmentCode] : [],
    TotalTimeMinutes: job.completedOnSpot ? job.timeSpentMinutes : 0,
    StartDateTBD: false,
    RequiresSAT: false,
    RequiresDrawingUpdate: false,
    RequiresInventoryUpdate: false,
    AcceptanceGates: [],
    UpdatedAt: createdAt,
    Attachments: job.photoUrl ? [{ id: crypto.randomUUID(), name: job.photoName ?? "fast-job-photo", type: job.photoType || "image/unknown", dataUrl: job.photoUrl }] : [],
    Activity: [
      { id: crypto.randomUUID(), kind: "log", actorId: ctx.actor.userId ?? "current-user", actorName, actorRole: ctx.actor.role, createdAt,
        text: `${ctx.source ?? "Fast Job created"} at ${status.Percentage}% by ${actorName}${onBehalf ? ` on behalf of ${job.requestorName}${job.intakeChannel ? ` via ${job.intakeChannel}` : ""}` : ""} · ${sla.targetLabel}` },
      ...(sla.deferredToNextBusinessDay ? [{ id: crypto.randomUUID(), kind: "log" as const, actorId: ctx.actor.userId ?? "current-user", actorName, actorRole: ctx.actor.role, createdAt,
        text: "Created outside business days: SLA clock starts next business day at 08:00." }] : []),
      ...(job.photoUrl ? [{ id: crypto.randomUUID(), kind: "log" as const, actorId: ctx.actor.userId ?? "current-user", actorName, actorRole: ctx.actor.role, createdAt,
        text: `Image '${job.photoName ?? "fast-job-photo"}' was added by ${actorName}` }] : []),
    ],
  };
}
