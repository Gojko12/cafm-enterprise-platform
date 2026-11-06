import {
  BaseWorkRequestSchema,
  PM_ChecklistStandard,
  PM_Schedule,
  PM_WorkRequestStep,
  PM_StepAuditLog,
  WR_Type,
  WR_Statuses,
  getInitialIssuedStatus,
  createPMCycleKey,
  Building,
  Floor,
  Room,
  Equipment,
} from "@cafm/shared-schema";
import { z } from "zod";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

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

const SEQUENCE_COUNTER_COLLECTION = "wrs_sequence";
const WR_ID_PREFIX = "2026";

async function getNextWR_ID(context: GeneratorContext): Promise<string> {
  const db = context.firestore;
  const sequenceRef = db.collection(SEQUENCE_COUNTER_COLLECTION).doc("pm_counter");

  let nextSequence = 0;
  await db.runTransaction(async (transaction: any) => {
    const doc = await transaction.get(sequenceRef);
    nextSequence = (doc.exists ? doc.data().counter : 0) + 1;
    transaction.update(sequenceRef, { counter: nextSequence });
  });

  return `${WR_ID_PREFIX}${String(nextSequence).padStart(6, "0")}`;
}

async function checkDuplicateCycle(
  context: GeneratorContext,
  cycleKey: string,
  scheduleId: string,
): Promise<boolean> {
  const db = context.firestore;
  const snapshot = await db
    .collectionGroup("workRequests")
    .where("PM_CycleKey", "==", cycleKey)
    .where("ScheduleId", "==", scheduleId)
    .where("Percentage", "in", [50, 78])
    .limit(1)
    .get();

  return !snapshot.empty;
}

function calculateDueAndMarginDates(
  frequency: string,
  frequencyInterval: number,
  baseDate: Date,
  leadTimeDays: number,
  marginWindowDays: number,
): { dueDate: string; marginDate: string } {
  const dueDate = new Date(baseDate);

  switch (frequency) {
    case "Daily":
      dueDate.setDate(dueDate.getDate() + frequencyInterval);
      break;
    case "Weekly":
      dueDate.setDate(dueDate.getDate() + 7 * frequencyInterval);
      break;
    case "Monthly":
      dueDate.setMonth(dueDate.getMonth() + frequencyInterval);
      break;
    case "Quarterly":
      dueDate.setMonth(dueDate.getMonth() + 3 * frequencyInterval);
      break;
    case "Yearly":
      dueDate.setFullYear(dueDate.getFullYear() + frequencyInterval);
      break;
    case "Meter-based":
      dueDate.setDate(dueDate.getDate() + 30);
      break;
    default:
      throw new Error(`Unsupported frequency: ${frequency}`);
  }

  dueDate.setDate(dueDate.getDate() - leadTimeDays);
  const marginDate = new Date(dueDate);
  marginDate.setDate(marginDate.getDate() + marginWindowDays);

  return {
    dueDate: dueDate.toISOString().split("T")[0],
    marginDate: marginDate.toISOString().split("T")[0],
  };
}

function resolveLocationHierarchy(
  equipment?: Equipment,
  floor?: Floor,
  building?: Building,
): { bl_id: string; LevelName: string; RoomCode?: string } {
  if (equipment) {
    return {
      bl_id: equipment.bl_id,
      LevelName: equipment.LevelName,
      RoomCode: equipment.RoomCode,
    };
  }
  if (floor) {
    return { bl_id: floor.bl_id, LevelName: floor.LevelName };
  }
  if (building) {
    return { bl_id: building.bl_id, LevelName: "", RoomCode: undefined };
  }
  throw new Error("Cannot resolve location hierarchy without equipment, floor, or building.");
}

function instantiateChecklistSteps(
  blueprint: PM_ChecklistStandard,
  wrId: string,
  scheduleId: string,
  userId: string,
  timestamp: Date,
): { steps: PM_WorkRequestStep[]; auditLogs: PM_StepAuditLog[] } {
  const steps: PM_WorkRequestStep[] = [];
  const auditLogs: PM_StepAuditLog[] = [];
  const isoTimestamp = timestamp.toISOString();

  blueprint.Steps.forEach((templateStep: typeof blueprint.Steps[0]) => {
    const stepInstanceId = `step_${wrId}_${templateStep.StepId}`;

    const step: PM_WorkRequestStep = {
      StepInstanceId: stepInstanceId,
      WR_ID: wrId,
      ScheduleId: scheduleId,
      ChecklistCode: blueprint.ChecklistCode,
      StepId: templateStep.StepId,
      Title: templateStep.Title,
      Instructions: templateStep.Instructions,
      SortOrder: templateStep.SortOrder,
      InputType: templateStep.InputType,
      Unit: templateStep.Unit,
      MinThreshold: templateStep.MinThreshold,
      MaxThreshold: templateStep.MaxThreshold,
      Options: templateStep.Options,
      PhotoIds: [],
      IsFailed: false,
      IsCompleted: false,
      CompletedAt: undefined,
    };

    steps.push(step);

    auditLogs.push({
      AuditLogId: `audit_${stepInstanceId}_${Date.now()}`,
      StepInstanceId: stepInstanceId,
      WR_ID: wrId,
      ActorId: userId,
      Action: "created",
      PreviousValue: undefined,
      NewValue: { step },
      OccurredAt: isoTimestamp,
    });
  });

  return { steps, auditLogs };
}

export async function generatePMWorkRequests(
  request: PMGenerationRequest,
  context: GeneratorContext,
): Promise<PMGeneratedWorkRequest[]> {
  const { firestore, logger } = context;
  const {
    generationMode,
    checklistBlueprint,
    schedule,
    equipment,
    floor,
    building,
    roomList,
    userId,
    timestamp,
  } = request;

  const generated: PMGeneratedWorkRequest[] = [];

  const initialStatus = getInitialIssuedStatus("Preventive Maintenance", WR_Statuses);

  let targetEquipment: Equipment[] = [];

  if (generationMode === "single" || generationMode === "selected") {
    if (!equipment) {
      throw new Error(
        "Single and selected modes require an equipment object in the request.",
      );
    }
    targetEquipment = [equipment];
  } else if (generationMode === "horizon30days") {
    if (!roomList && !floor && !building) {
      throw new Error(
        "Horizon mode requires room list, floor, or building targeting.",
      );
    }

    if (roomList && roomList.length > 0) {
      const roomCodes = new Set(roomList.map((r) => r.RoomCode));
      const snapshot = await firestore
        .collectionGroup("equipment")
        .where("bl_id", "==", building?.bl_id || floor?.bl_id)
        .where("LevelName", "==", floor?.LevelName || "")
        .get();

      targetEquipment = snapshot.docs
        .map((doc: any) => doc.data())
        .filter((eq: Equipment) => roomCodes.has(eq.RoomCode));
    } else if (floor) {
      const snapshot = await firestore
        .collectionGroup("equipment")
        .where("bl_id", "==", floor.bl_id)
        .where("LevelName", "==", floor.LevelName)
        .get();
      targetEquipment = snapshot.docs.map((doc: any) => doc.data());
    } else if (building) {
      const snapshot = await firestore
        .collectionGroup("equipment")
        .where("bl_id", "==", building.bl_id)
        .get();
      targetEquipment = snapshot.docs.map((doc: any) => doc.data());
    }
  }

  if (targetEquipment.length === 0) {
    logger.info("No equipment found for PM generation request", { schedule });
    return [];
  }

  for (const eq of targetEquipment) {
    const { dueDate, marginDate } = calculateDueAndMarginDates(
      schedule.Frequency,
      schedule.FrequencyInterval,
      new Date(),
      schedule.LeadTimeDays,
      schedule.MarginWindowDays,
    );

    const cycleKey = createPMCycleKey(schedule.ScheduleId, dueDate);

    const isDuplicate = await checkDuplicateCycle(context, cycleKey, schedule.ScheduleId);
    if (isDuplicate) {
      logger.info("Skipping duplicate PM cycle", { cycleKey, equipment: eq.EquipmentCode });
      continue;
    }

    const wrId = await getNextWR_ID(context);
    const hierarchy = resolveLocationHierarchy(eq, undefined, undefined);

    const { steps, auditLogs } = instantiateChecklistSteps(
      checklistBlueprint,
      wrId,
      schedule.ScheduleId,
      userId,
      timestamp,
    );

    const baseWR: any = {
      WR_ID: wrId,
      WR_Type: "PM" as const,
      ESAWorkType: "Preventive Maintenance",
      Description: checklistBlueprint.MaintenanceReason,
      TradeId: checklistBlueprint.TradeId,
      TradeName: checklistBlueprint.TradeName,
      EquipmentCodes: [eq.EquipmentCode],
      PM_CycleKey: cycleKey,
      ScheduleId: schedule.ScheduleId,
      ExpectedHours: checklistBlueprint.ExpectedHours,
      CreatedDate: timestamp.toISOString().split("T")[0],
      DueDate: dueDate,
      MarginDate: marginDate,
      StartDateTBD: true,
      WorkRequestStatus: initialStatus.WorkRequestStatus,
      WorkRequestSubstatus: initialStatus.WorkRequestSubstatus,
      Percentage: initialStatus.Percentage,
      bl_id: hierarchy.bl_id,
      LevelName: hierarchy.LevelName,
      RoomCode: hierarchy.RoomCode,
      CreatedBy: userId,
      AssignedCraftpersonIds: [],
      AssignedUserIds: [],
      TotalTimeMinutes: 0,
    };

    generated.push({
      WR_ID: wrId,
      PM_CycleKey: cycleKey,
      DueDate: dueDate,
      MarginDate: marginDate,
      steps,
      auditLogs,
    });

    logger.info("Generated PM WR", { wrId, equipment: eq.EquipmentCode, cycleKey });
  }

  return generated;
}
