import {
  BaseWorkRequest,
  BaseWorkRequestSchema,
  WR_Statuses,
  validateWorkRequestStatusTransition,
  assertWorkRequestStatusTransition,
  WRStatusDefinition,
  PM_WorkRequestStep,
  calculateWorkSessionMinutes,
  WorkSession,
  validateWRFinancialThreshold,
  WR_Type,
  LJRole,
  SiteIdSchema,
} from "@cafm/shared-schema";
import { Timestamp } from "firebase-admin/firestore";

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

export async function updateWorkRequestStatus(
  request: StatusTransitionRequest,
  context: WRLifecycleContext,
): Promise<{ success: boolean; wrId: string; message: string }> {
  const { firestore, logger } = context;
  const { wrId, fromStatus, toStatus, userId, notes, timestamp } = request;

  try {
    assertWorkRequestStatusTransition(fromStatus, toStatus, WR_Statuses);

    const wrRef = firestore.collectionGroup("workRequests").where("WR_ID", "==", wrId);
    const snapshot = await wrRef.get();

    if (snapshot.empty) {
      throw new Error(`Work request ${wrId} not found`);
    }

    const wrDoc = snapshot.docs[0];
    const wrData = wrDoc.data();

    if (wrData.Percentage !== fromStatus.Percentage) {
      throw new Error(
        `Work request current status (${wrData.Percentage}%) does not match expected status (${fromStatus.Percentage}%).`,
      );
    }

    await wrDoc.ref.update({
      WorkRequestStatus: toStatus.WorkRequestStatus,
      WorkRequestSubstatus: toStatus.WorkRequestSubstatus,
      Percentage: toStatus.Percentage,
      UpdatedAt: Timestamp.fromDate(timestamp),
    });

    await firestore
      .collection("wr_status_audit_log")
      .add({
        WR_ID: wrId,
        FromPercentage: fromStatus.Percentage,
        ToPercentage: toStatus.Percentage,
        FromStatus: fromStatus.WorkRequestStatus,
        ToStatus: toStatus.WorkRequestStatus,
        Notes: notes,
        ActorId: userId,
        TransitionedAt: Timestamp.fromDate(timestamp),
      });

    logger.info("Updated work request status", {
      wrId,
      fromPercentage: fromStatus.Percentage,
      toPercentage: toStatus.Percentage,
    });

    return {
      success: true,
      wrId,
      message: `Status updated from ${fromStatus.Percentage}% to ${toStatus.Percentage}%.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to update work request status", { wrId, error: errorMessage });
    return { success: false, wrId, message: errorMessage };
  }
}

export async function manageLongJobFreeze(
  request: FreezeManagementRequest,
  context: WRLifecycleContext,
): Promise<{ success: boolean; wrId: string; message: string }> {
  const { firestore, logger } = context;
  const { wrId, action, freezeName, freezeReason, userId, timestamp } = request;

  try {
    const snapshot = await firestore
      .collectionGroup("workRequests")
      .where("WR_ID", "==", wrId)
      .get();

    if (snapshot.empty) {
      throw new Error(`Work request ${wrId} not found`);
    }

    const wrDoc = snapshot.docs[0];
    const wrData = wrDoc.data();

    if (action === "freeze") {
      if (!freezeName || !freezeReason) {
        throw new Error("Freeze action requires freezeName and freezeReason.");
      }

      const slaAdjustment = 7;

      let newMarginDate = new Date(wrData.MarginDate);
      newMarginDate.setDate(newMarginDate.getDate() + slaAdjustment);

      await wrDoc.ref.update({
        IsFrozen: true,
        ActiveFreezeName: freezeName,
        PlannedFreezeText: freezeReason,
        FreezeStartedAt: Timestamp.fromDate(timestamp),
        MarginDate: newMarginDate.toISOString().split("T")[0],
        UpdatedAt: Timestamp.fromDate(timestamp),
      });

      logger.info("Froze long job", {
        wrId,
        freezeName,
        slaAdjustmentDays: slaAdjustment,
      });
    } else if (action === "unfreeze") {
      await wrDoc.ref.update({
        IsFrozen: false,
        ActiveFreezeName: null,
        PlannedFreezeText: null,
        FreezeEndedAt: Timestamp.fromDate(timestamp),
        UpdatedAt: Timestamp.fromDate(timestamp),
      });

      logger.info("Unfroze long job", { wrId });
    }

    return {
      success: true,
      wrId,
      message: `Long job ${action}d successfully.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to manage long job freeze", { wrId, error: errorMessage });
    return { success: false, wrId, message: errorMessage };
  }
}

export async function createFastJob(
  request: FastJobCreationRequest,
  context: WRLifecycleContext,
): Promise<{ success: boolean; wrId?: string; message: string }> {
  const { firestore, logger } = context;
  const {
    description,
    problemLocation,
    bl_id,
    LevelName,
    RoomCode,
    equipmentCodes,
    tradeId,
    tradeName,
    userId,
    timestamp,
  } = request;

  try {
    const counter = await getNextWR_ID(context);

    const issuedStatus = WR_Statuses.find(
      (s) => s.Percentage === 50 && s.ESAWorkType === "Corrective Maintenance",
    );

    if (!issuedStatus) {
      throw new Error("No 50% Issued status configured for Corrective Maintenance.");
    }

    const wrId = counter;

    const fjPayload = {
      WR_ID: wrId,
      WR_Type: "FJ",
      ESAWorkType: "Corrective Maintenance",
      Description: description,
      ProblemLocation: problemLocation,
      TradeId: tradeId,
      TradeName: tradeName,
      EquipmentCodes: equipmentCodes,
      ExpectedHours: 0.5,
      CreatedDate: timestamp.toISOString().split("T")[0],
      WorkRequestStatus: issuedStatus.WorkRequestStatus,
      WorkRequestSubstatus: issuedStatus.WorkRequestSubstatus,
      Percentage: issuedStatus.Percentage,
      bl_id,
      LevelName,
      RoomCode,
      CreatedBy: userId,
      AssignedCraftpersonIds: [],
      AssignedUserIds: [],
      TotalTimeMinutes: 0,
      CreatedAt: Timestamp.fromDate(timestamp),
      UpdatedAt: Timestamp.fromDate(timestamp),
    };

    await firestore
      .collection("buildings")
      .doc(bl_id)
      .collection("workRequests")
      .doc(wrId)
      .set(fjPayload);

    logger.info("Created fast job", { wrId, equipmentCodes });

    return {
      success: true,
      wrId,
      message: `Fast Job ${wrId} created and ready for immediate completion.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to create fast job", { error: errorMessage });
    return { success: false, message: `Fast Job creation failed: ${errorMessage}` };
  }
}

export async function executeChecklistStep(
  request: ChecklistStepExecutionRequest,
  context: WRLifecycleContext,
): Promise<{ success: boolean; message: string }> {
  const { firestore, logger } = context;
  const { wrId, stepInstanceId, inputData, photoIds, technicianComment, userId, timestamp } =
    request;

  try {
    const stepRef = firestore
      .collectionGroup("pm_steps")
      .where("StepInstanceId", "==", stepInstanceId)
      .where("WR_ID", "==", wrId);
    const stepSnapshot = await stepRef.get();

    if (stepSnapshot.empty) {
      throw new Error(
        `Checklist step ${stepInstanceId} not found for work request ${wrId}`,
      );
    }

    const stepDoc = stepSnapshot.docs[0];
    const stepData = stepDoc.data();

    let isFailed = false;

    if (stepData.InputType === "Numeric") {
      const value = inputData.value as number;
      if (
        (stepData.MinThreshold !== undefined && value < stepData.MinThreshold) ||
        (stepData.MaxThreshold !== undefined && value > stepData.MaxThreshold)
      ) {
        isFailed = true;
      }
    } else if (stepData.InputType === "Boolean") {
      isFailed = inputData.value === false;
    }

    if (isFailed && photoIds.length === 0) {
      throw new Error("Failed checklist steps require at least one evidence photo.");
    }

    if (isFailed && !technicianComment?.trim()) {
      throw new Error("Failed checklist steps require a technician comment.");
    }

    const updatePayload: any = {
      IsCompleted: true,
      CompletedAt: Timestamp.fromDate(timestamp),
      CompletedBy: userId,
      IsFailed: isFailed,
      PhotoIds: photoIds,
      TechnicianComment: technicianComment,
      UpdatedAt: Timestamp.fromDate(timestamp),
    };

    if (stepData.InputType === "Boolean") {
      updatePayload.ValueBoolean = inputData.value;
    } else if (stepData.InputType === "Numeric") {
      updatePayload.ValueNumeric = inputData.value;
    } else if (stepData.InputType === "SingleSelect" || stepData.InputType === "MultiSelect") {
      updatePayload.SelectedOptionIds = inputData.selectedOptionIds || [];
    } else if (stepData.InputType === "FreeText") {
      updatePayload.ValueText = inputData.value;
    }

    await stepDoc.ref.update(updatePayload);

    await firestore
      .collection("pm_step_audit_log")
      .add({
        StepInstanceId: stepInstanceId,
        WR_ID: wrId,
        ActorId: userId,
        Action: "completed",
        Result: isFailed ? "failed" : "passed",
        OccurredAt: Timestamp.fromDate(timestamp),
      });

    logger.info("Executed checklist step", {
      wrId,
      stepInstanceId,
      isFailed,
    });

    return {
      success: true,
      message: `Step completed${isFailed ? " with failure" : ""}. Evidence and comment recorded.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to execute checklist step", { wrId, stepInstanceId, error: errorMessage });
    return { success: false, message: errorMessage };
  }
}

export async function manageWorkSessionTimer(
  request: WorkSessionTimerRequest,
  context: WRLifecycleContext,
): Promise<{ success: boolean; message: string; sessionMinutes?: number }> {
  const { firestore, logger } = context;
  const {
    wrId,
    action,
    craftpersonId,
    userId,
    manualOverrideMinutes,
    overrideReason,
    timestamp,
  } = request;

  try {
    const sessionId = `session_${wrId}_${craftpersonId}_${Date.now()}`;

    if (action === "start") {
      const sessionPayload = {
        WorkSessionId: sessionId,
        WR_ID: wrId,
        CraftpersonId: craftpersonId,
        UserId: userId,
        State: "running",
        StartedAt: Timestamp.fromDate(timestamp),
        TotalTimeMinutes: 0,
        IsManualOverride: false,
      };

      await firestore.collection("work_sessions").doc(sessionId).set(sessionPayload);

      logger.info("Started work session", { sessionId, wrId });
    } else if (action === "pause") {
      const sessionRef = firestore
        .collectionGroup("work_sessions")
        .where("WR_ID", "==", wrId)
        .where("CraftpersonId", "==", craftpersonId)
        .where("State", "==", "running");

      const snapshot = await sessionRef.get();
      if (snapshot.empty) {
        throw new Error("No running work session found.");
      }

      const sessionDoc = snapshot.docs[0];
      await sessionDoc.ref.update({
        State: "paused",
        PausedAt: Timestamp.fromDate(timestamp),
      });

      logger.info("Paused work session", { wrId });
    } else if (action === "stop") {
      const sessionRef = firestore
        .collectionGroup("work_sessions")
        .where("WR_ID", "==", wrId)
        .where("CraftpersonId", "==", craftpersonId)
        .where("State", "in", ["running", "paused"]);

      const snapshot = await sessionRef.get();
      if (snapshot.empty) {
        throw new Error("No active work session found.");
      }

      const sessionDoc = snapshot.docs[0];
      const sessionData = sessionDoc.data();

      let totalMinutes = 0;

      if (manualOverrideMinutes !== undefined) {
        if (!overrideReason?.trim()) {
          throw new Error("Manual timer overrides require an override reason.");
        }
        totalMinutes = manualOverrideMinutes;
      } else {
        totalMinutes = calculateWorkSessionMinutes(
          sessionData.StartedAt.toDate(),
          new Date(timestamp),
        );
      }

      await sessionDoc.ref.update({
        State: "stopped",
        StoppedAt: Timestamp.fromDate(timestamp),
        TotalTimeMinutes: totalMinutes,
        IsManualOverride: manualOverrideMinutes !== undefined,
        TimerOverrideReason: overrideReason,
      });

      await firestore
        .collectionGroup("workRequests")
        .where("WR_ID", "==", wrId)
        .get()
        .then(async (wrSnapshot: any) => {
          if (!wrSnapshot.empty) {
            const wrDoc = wrSnapshot.docs[0];
            const currentTotal = wrDoc.data().TotalTimeMinutes || 0;
            await wrDoc.ref.update({
              TotalTimeMinutes: currentTotal + totalMinutes,
              UpdatedAt: Timestamp.fromDate(timestamp),
            });
          }
        });

      logger.info("Stopped work session", { wrId, totalMinutes });

      return {
        success: true,
        message: `Work session stopped. Total time: ${totalMinutes} minutes.`,
        sessionMinutes: totalMinutes,
      };
    }

    return {
      success: true,
      message: `Work session ${action}ed successfully.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to manage work session timer", { wrId, action, error: errorMessage });
    return { success: false, message: errorMessage };
  }
}

export async function conductTechnicalAudit(
  request: TechnicalAuditRequest,
  context: WRLifecycleContext,
): Promise<{ success: boolean; message: string }> {
  const { firestore, logger } = context;
  const {
    wrId,
    qaInspectedBy,
    result,
    issueDescription,
    correctionComment,
    score,
    photoStoragePaths,
    shouldReopenWR,
    userId,
    timestamp,
  } = request;

  try {
    const auditId = `audit_${wrId}_${Date.now()}`;

    await firestore
      .collection("technical_audits")
      .doc(auditId)
      .set({
        TechnicalAuditId: auditId,
        WR_ID: wrId,
        QA_InspectedBy: qaInspectedBy,
        Result: result,
        IssueDescription: issueDescription,
        QA_CorrectionComment: correctionComment,
        Score: score,
        PhotoStoragePaths: photoStoragePaths,
        InspectedAt: Timestamp.fromDate(timestamp),
        CreatedAt: Timestamp.fromDate(timestamp),
      });

    if (result === "Fail" && shouldReopenWR) {
      const snapshot = await firestore
        .collectionGroup("workRequests")
        .where("WR_ID", "==", wrId)
        .get();

      if (!snapshot.empty) {
        const wrDoc = snapshot.docs[0];
        const wrData = wrDoc.data();

        if (wrData.Percentage === 78) {
          const issueStatus = WR_Statuses.find(
            (s: WRStatusDefinition) =>
              s.Percentage === 50 &&
              s.ESAWorkType === wrData.ESAWorkType,
          );

          if (issueStatus) {
            await wrDoc.ref.update({
              WorkRequestStatus: issueStatus.WorkRequestStatus,
              WorkRequestSubstatus: issueStatus.WorkRequestSubstatus,
              Percentage: 50,
              QA_FailureReason: issueDescription,
              ReopenedBy: userId,
              ReopenedAt: Timestamp.fromDate(timestamp),
              UpdatedAt: Timestamp.fromDate(timestamp),
            });

            logger.info("Reopened WR after QA failure", { wrId });
          }
        }
      }
    }

    logger.info("Conducted technical audit", { wrId, result, shouldReopenWR });

    return {
      success: true,
      message: `Technical audit recorded. WR ${shouldReopenWR ? "reopened" : "not reopened"}.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to conduct technical audit", { wrId, error: errorMessage });
    return { success: false, message: errorMessage };
  }
}

async function getNextWR_ID(context: WRLifecycleContext): Promise<string> {
  const db = context.firestore;
  const sequenceRef = db.collection("wrs_sequence").doc("pm_counter");

  let nextSequence = 0;
  await db.runTransaction(async (transaction: any) => {
    const doc = await transaction.get(sequenceRef);
    nextSequence = (doc.exists ? doc.data().counter : 0) + 1;
    transaction.update(sequenceRef, { counter: nextSequence });
  });

  return `2026${String(nextSequence).padStart(6, "0")}`;
}

// ============================================================================
// PHASE 6 ESCALATION & LIFECYCLE FUNCTIONS
// ============================================================================

export interface EscalatePMToFJRequest {
  pmWrId: string;
  estimatedCostEur: number;
  description: string;
  userId: string;
  timestamp: Date;
}

export interface EscalateFJToLJRequest {
  fjWrId: string;
  ljType: "RFQ" | "RFW";
  estimatedCostEur: number;
  userId: string;
  timestamp: Date;
}

export interface AcceptanceGateConfig {
  RequiresSAT: boolean;
  RequiresDrawingUpdate: boolean;
  RequiresInventoryUpdate: boolean;
  gateStatuses: {
    SAT?: GateStatus;
    Drawing?: GateStatus;
    Inventory?: GateStatus;
  };
}

export interface GateStatus {
  status: "Pending" | "ReviewRequested" | "InvitationSent" | "Approved";
  actor?: string;
  timestamp?: Date;
}

export interface AcceptanceGateResolution {
  nextPercentage: number;
  action: string;
  gatesApproved: string[];
  gatesPending: string[];
}

export async function escalatePMToFastJob(
  request: EscalatePMToFJRequest,
  context: WRLifecycleContext,
): Promise<{ success: boolean; fjWrId?: string; message: string }> {
  const { firestore, logger } = context;
  const { pmWrId, estimatedCostEur, description, userId, timestamp } = request;

  try {
    if (!validateWRFinancialThreshold("FJ", estimatedCostEur)) {
      throw new Error(
        `Fast Job estimated cost (${estimatedCostEur} EUR) exceeds 750 EUR threshold.`,
      );
    }

    const pmSnapshot = await firestore
      .collectionGroup("workRequests")
      .where("WR_ID", "==", pmWrId)
      .get();

    if (pmSnapshot.empty) {
      throw new Error(`PM Work Request ${pmWrId} not found.`);
    }

    const pmDoc = pmSnapshot.docs[0];
    const pmData = pmDoc.data();

    if (pmData.WR_Type !== "PM") {
      throw new Error(`Work request ${pmWrId} is not a PM. Cannot escalate.`);
    }

    const fjWrId = await getNextWR_ID(context);
    const issuedStatus = WR_Statuses.find(
      (s) => s.Percentage === 50 && s.ESAWorkType === "Corrective Maintenance",
    );

    if (!issuedStatus) {
      throw new Error("No 50% Issued status configured for Corrective Maintenance.");
    }

    const fjPayload = {
      WR_ID: fjWrId,
      WR_Type: "FJ",
      ESAWorkType: "Corrective Maintenance",
      Description: description || pmData.Description,
      ProblemLocation: pmData.ProblemLocation || "",
      TradeId: pmData.TradeId,
      TradeName: pmData.TradeName,
      EquipmentCodes: pmData.EquipmentCodes || [],
      ParentPM_WR_ID: pmWrId,
      EstimatedCostEur: estimatedCostEur,
      CreatedDate: timestamp.toISOString().split("T")[0],
      WorkRequestStatus: issuedStatus.WorkRequestStatus,
      WorkRequestSubstatus: issuedStatus.WorkRequestSubstatus,
      Percentage: issuedStatus.Percentage,
      bl_id: pmData.bl_id,
      LevelName: pmData.LevelName,
      RoomCode: pmData.RoomCode,
      SiteId: pmData.SiteId,
      CreatedBy: userId,
      AssignedCraftpersonIds: [],
      AssignedUserIds: [],
      TotalTimeMinutes: 0,
      CreatedAt: Timestamp.fromDate(timestamp),
      UpdatedAt: Timestamp.fromDate(timestamp),
    };

    const fjDocRef = firestore
      .collection("buildings")
      .doc(pmData.bl_id)
      .collection("workRequests")
      .doc(fjWrId);

    await fjDocRef.set(fjPayload);

    await firestore
      .collection("WR_EscalationAudit")
      .add({
        SourceWR_ID: pmWrId,
        TargetWR_ID: fjWrId,
        EscalationType: "PM_to_FJ",
        EstimatedCostEur: estimatedCostEur,
        ActorId: userId,
        Timestamp: Timestamp.fromDate(timestamp),
        Details: {
          description,
          parentStatus: pmData.Percentage,
          fjInitialStatus: issuedStatus.Percentage,
        },
      });

    logger.info("Escalated PM to Fast Job", {
      pmWrId,
      fjWrId,
      estimatedCostEur,
    });

    return {
      success: true,
      fjWrId,
      message: `Fast Job ${fjWrId} created at 50% status, linked to PM ${pmWrId}.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to escalate PM to Fast Job", { pmWrId, error: errorMessage });
    return { success: false, message: `PM->FJ Escalation failed: ${errorMessage}` };
  }
}

export async function escalateFastJobToLongJob(
  request: EscalateFJToLJRequest,
  context: WRLifecycleContext,
): Promise<{ success: boolean; ljWrId?: string; message: string }> {
  const { firestore, logger } = context;
  const { fjWrId, ljType, estimatedCostEur, userId, timestamp } = request;

  try {
    if (!validateWRFinancialThreshold("LJ", estimatedCostEur)) {
      throw new Error(`Long Job estimated cost (${estimatedCostEur} EUR) must be >= 750 EUR.`);
    }

    const fjSnapshot = await firestore
      .collectionGroup("workRequests")
      .where("WR_ID", "==", fjWrId)
      .get();

    if (fjSnapshot.empty) {
      throw new Error(`Fast Job ${fjWrId} not found.`);
    }

    const fjDoc = fjSnapshot.docs[0];
    const fjData = fjDoc.data();

    if (fjData.WR_Type !== "FJ") {
      throw new Error(`Work request ${fjWrId} is not an FJ. Cannot escalate.`);
    }

    const ljWrId = await getNextWR_ID(context);

    const ljInitialPercentage = 10;

    const ljPayload = {
      WR_ID: ljWrId,
      WR_Type: "LJ",
      ESAWorkType: "Corrective Maintenance",
      Description: fjData.Description,
      ProblemLocation: fjData.ProblemLocation || "",
      TradeId: fjData.TradeId,
      TradeName: fjData.TradeName,
      EquipmentCodes: fjData.EquipmentCodes || [],
      OriginatingFJ_WR_ID: fjWrId,
      OriginatingPM_WR_ID: fjData.ParentPM_WR_ID,
      EstimatedCostEur: estimatedCostEur,
      CreatedDate: timestamp.toISOString().split("T")[0],
      WorkRequestStatus: "Requested",
      WorkRequestSubstatus:
        "Work Request from Fast Job - On Hold for Decision, Budget, etc.",
      Percentage: ljInitialPercentage,
      bl_id: fjData.bl_id,
      LevelName: fjData.LevelName,
      RoomCode: fjData.RoomCode,
      SiteId: fjData.SiteId,
      CreatedBy: userId,
      AssignedCraftpersonIds: [],
      AssignedUserIds: [],
      TotalTimeMinutes: 0,
      LJType: ljType,
      RequiresSAT: false,
      RequiresDrawingUpdate: false,
      RequiresInventoryUpdate: false,
      CreatedAt: Timestamp.fromDate(timestamp),
      UpdatedAt: Timestamp.fromDate(timestamp),
    };

    const ljDocRef = firestore
      .collection("buildings")
      .doc(fjData.bl_id)
      .collection("workRequests")
      .doc(ljWrId);

    await ljDocRef.set(ljPayload);

    await firestore
      .collection("WR_EscalationAudit")
      .add({
        SourceWR_ID: fjWrId,
        TargetWR_ID: ljWrId,
        EscalationType: "FJ_to_LJ",
        LJType: ljType,
        EstimatedCostEur: estimatedCostEur,
        ActorId: userId,
        Timestamp: Timestamp.fromDate(timestamp),
        Details: {
          originatingPM: fjData.ParentPM_WR_ID,
          fjStatus: fjData.Percentage,
          ljInitialStatus: ljInitialPercentage,
        },
      });

    logger.info("Escalated Fast Job to Long Job", {
      fjWrId,
      ljWrId,
      ljType,
      estimatedCostEur,
    });

    return {
      success: true,
      ljWrId,
      message: `Long Job ${ljWrId} (${ljType}) created at ${ljInitialPercentage}% status, linked to FJ ${fjWrId}.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to escalate Fast Job to Long Job", {
      fjWrId,
      error: errorMessage,
    });
    return { success: false, message: `FJ->LJ Escalation failed: ${errorMessage}` };
  }
}

export async function resolveNextAcceptanceSubstatus(
  currentPercentage: number,
  acceptanceGates: AcceptanceGateConfig,
  context: WRLifecycleContext,
): Promise<AcceptanceGateResolution> {
  const { logger } = context;

  const gatesApproved: string[] = [];
  const gatesPending: string[] = [];

  if (acceptanceGates.gateStatuses.SAT?.status === "Approved") {
    gatesApproved.push("SAT");
  } else if (acceptanceGates.RequiresSAT) {
    gatesPending.push("SAT");
  }

  if (acceptanceGates.gateStatuses.Drawing?.status === "Approved") {
    gatesApproved.push("Drawing");
  } else if (acceptanceGates.RequiresDrawingUpdate) {
    gatesPending.push("Drawing");
  }

  if (acceptanceGates.gateStatuses.Inventory?.status === "Approved") {
    gatesApproved.push("Inventory");
  } else if (acceptanceGates.RequiresInventoryUpdate) {
    gatesPending.push("Inventory");
  }

  const allRequiredGatesApproved =
    (!acceptanceGates.RequiresSAT || gatesApproved.includes("SAT")) &&
    (!acceptanceGates.RequiresDrawingUpdate || gatesApproved.includes("Drawing")) &&
    (!acceptanceGates.RequiresInventoryUpdate || gatesApproved.includes("Inventory"));

  if ([40, 50, 55].includes(currentPercentage)) {
    if (allRequiredGatesApproved && gatesPending.length === 0) {
      logger.info("No acceptance gates required, jumping to 94%", {
        from: currentPercentage,
      });
      return {
        nextPercentage: 94,
        action: "Technically Completed (no gates required)",
        gatesApproved,
        gatesPending,
      };
    } else if (gatesPending.length > 0) {
      logger.info("Acceptance gates required, transitioning to 78%", {
        from: currentPercentage,
        pending: gatesPending,
      });
      return {
        nextPercentage: 78,
        action: "Work Ready for Approvals Cycle",
        gatesApproved,
        gatesPending,
      };
    }
  }

  if (currentPercentage === 78) {
    if (acceptanceGates.RequiresSAT) {
      logger.info("SAT gate required, can transition to 79% after Pre-SAT approval", {
        from: currentPercentage,
      });
      return {
        nextPercentage: 79,
        action: "Approve Pre-SAT -> 79%",
        gatesApproved,
        gatesPending,
      };
    }
  }

  if (currentPercentage === 79) {
    if (gatesPending.length === 0) {
      logger.info("All gates approved, jumping to 94%", { from: currentPercentage });
      return {
        nextPercentage: 94,
        action: "All Acceptances Completed",
        gatesApproved,
        gatesPending,
      };
    } else if (gatesPending.length === 1 && gatesApproved.length >= 1) {
      const nextPercentage = gatesPending.includes("Drawing") ? 81 : 81;
      logger.info("Some gates pending, transitioning to 81%", {
        from: currentPercentage,
        pending: gatesPending,
      });
      return {
        nextPercentage,
        action: "SAT Approved, other gates pending -> 81%",
        gatesApproved,
        gatesPending,
      };
    }
  }

  if (allRequiredGatesApproved && gatesPending.length === 0) {
    logger.info("Last gate approved, all transitions complete, moving to 94%", {
      from: currentPercentage,
    });
    return {
      nextPercentage: 94,
      action: "All Acceptances Completed",
      gatesApproved,
      gatesPending,
    };
  }

  logger.info("No transition triggered at current percentage", {
    currentPercentage,
    gatesApproved,
    gatesPending,
  });

  return {
    nextPercentage: currentPercentage,
    action: "No transition available",
    gatesApproved,
    gatesPending,
  };
}

export async function updateAcceptanceGateStatus(
  wrId: string,
  gateName: "SAT" | "Drawing" | "Inventory",
  newStatus: "Pending" | "ReviewRequested" | "InvitationSent" | "Approved",
  actor: string,
  context: WRLifecycleContext,
): Promise<{ success: boolean; message: string; nextPercentage?: number }> {
  const { firestore, logger } = context;
  const timestamp = new Date();

  try {
    const wrSnapshot = await firestore
      .collectionGroup("workRequests")
      .where("WR_ID", "==", wrId)
      .get();

    if (wrSnapshot.empty) {
      throw new Error(`Work request ${wrId} not found.`);
    }

    const wrDoc = wrSnapshot.docs[0];
    const wrData = wrDoc.data();

    const gatesKey = `AcceptanceGates_${wrId}`;
    const gateDocRef = firestore.collection("acceptance_gates").doc(gatesKey);
    const gateDoc = await gateDocRef.get();

    let gateConfig: AcceptanceGateConfig;
    if (gateDoc.exists) {
      const existingData = gateDoc.data();
      gateConfig = {
        RequiresSAT: existingData.RequiresSAT || false,
        RequiresDrawingUpdate: existingData.RequiresDrawingUpdate || false,
        RequiresInventoryUpdate: existingData.RequiresInventoryUpdate || false,
        gateStatuses: existingData.gateStatuses || {},
      };
    } else {
      gateConfig = {
        RequiresSAT: false,
        RequiresDrawingUpdate: false,
        RequiresInventoryUpdate: false,
        gateStatuses: {},
      };
    }

    if (!gateConfig.gateStatuses[gateName]) {
      gateConfig.gateStatuses[gateName] = {
        status: "Pending",
      };
    }

    gateConfig.gateStatuses[gateName] = {
      status: newStatus,
      actor,
      timestamp,
    };

    await gateDocRef.set(gateConfig);

    await firestore
      .collection("gate_audit_log")
      .add({
        WR_ID: wrId,
        GateName: gateName,
        FromStatus: gateDoc.exists ? gateConfig.gateStatuses[gateName]?.status : "Pending",
        ToStatus: newStatus,
        Actor: actor,
        ChangedAt: Timestamp.fromDate(timestamp),
      });

    const resolution = await resolveNextAcceptanceSubstatus(wrData.Percentage, gateConfig, context);

    if (resolution.nextPercentage !== wrData.Percentage) {
      await wrDoc.ref.update({
        Percentage: resolution.nextPercentage,
        WorkRequestStatus: resolution.nextPercentage === 94 ? "All Acceptances Completed" : wrData.WorkRequestStatus,
        UpdatedAt: Timestamp.fromDate(timestamp),
      });

      logger.info("Gate status updated and WR status transitioned", {
        wrId,
        gate: gateName,
        newGateStatus: newStatus,
        wrTransition: `${wrData.Percentage}% -> ${resolution.nextPercentage}%`,
      });

      return {
        success: true,
        message: `Gate ${gateName} updated to ${newStatus}. WR transitioned to ${resolution.nextPercentage}%.`,
        nextPercentage: resolution.nextPercentage,
      };
    }

    logger.info("Gate status updated", { wrId, gate: gateName, newStatus });
    return {
      success: true,
      message: `Gate ${gateName} updated to ${newStatus}.`,
      nextPercentage: wrData.Percentage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to update acceptance gate status", { wrId, error: errorMessage });
    return { success: false, message: `Gate update failed: ${errorMessage}` };
  }
}

export function canRoleExecuteLJAction(
  role: LJRole,
  currentPercentage: number,
  actionName: string,
): boolean {
  const rolePermissions: Record<LJRole, Record<number, string[]>> = {
    ESA_TO: {
      0: ["Save", "Submit to Trade", "Submit for Acceptance", "Cancel"],
      10: ["Save", "Submit to Trade", "Submit for Acceptance", "Cancel"],
      20: ["Save", "Submit for Acceptance", "Cancel"],
      21: ["Save", "Submit for Acceptance", "Cancel"],
      23: ["Save", "Submit for Acceptance", "Cancel"],
      25: ["Save", "Send to User for Acceptance", "Accept", "Accept and Convert to RFW", "Request Review", "Reject"],
      26: ["Save", "Accept", "Request Review", "Reject"],
      28: ["Save", "Convert RFQ to RFW"],
      30: ["Save", "Reject", "Request Review", "On Hold for Budget", "Approve & Order"],
      31: ["Save", "Reject", "Request Review", "On Hold for Budget", "Approve & Order"],
      32: ["Save"],
      40: ["Save"],
      50: ["Save"],
      55: ["Save"],
      78: ["Approve SAT"],
      79: ["Approve SAT"],
      94: ["Completed"],
      95: ["Sign Yellow Page"],
      96: ["Approve Costs"],
      97: ["Final Approval"],
      98: ["Confirm Invoice Information"],
      99: ["Confirm Payment"],
      100: ["View"],
    },
    ESA_TM: {
      0: ["Save", "Submit to Trade", "Submit for Acceptance", "Cancel"],
      10: ["Save", "Submit to Trade", "Submit for Acceptance", "Cancel"],
      20: ["Save", "Submit for Acceptance", "Cancel"],
      21: ["Save", "Submit for Acceptance", "Cancel"],
      23: ["Save", "Submit for Acceptance", "Cancel"],
      25: ["Save", "Send to User for Acceptance", "Accept", "Accept and Convert to RFW", "Request Review", "Reject"],
      26: ["Save", "Accept", "Request Review", "Reject"],
      28: ["Save", "Convert RFQ to RFW"],
      30: ["Save"],
      31: ["Save"],
      32: ["Save"],
      40: ["Save"],
      50: ["Save"],
      55: ["Save"],
      78: ["Approve SAT"],
      79: ["Approve SAT"],
      94: ["Completed"],
      96: ["Approve Costs"],
      98: ["Confirm Invoice Information"],
      100: ["View"],
    },
    ESA_LJM: {
      0: ["Save", "Submit to Trade", "Submit for Acceptance", "Cancel"],
      10: ["Save", "Submit to Trade", "Submit for Acceptance", "Cancel"],
      20: ["Save", "Submit for Acceptance", "Cancel"],
      21: ["Save", "Submit for Acceptance", "Cancel"],
      23: ["Save", "Submit for Acceptance", "Cancel"],
      25: ["Save"],
      26: ["Save"],
      28: ["Save", "Convert RFQ to RFW"],
      30: ["Save"],
      31: ["Save"],
      32: ["Save"],
      40: ["Save"],
      50: ["Save"],
      55: ["Save"],
      78: ["Save"],
      94: ["Completed"],
      100: ["View"],
    },
    ESA_CCM: {
      98: ["Confirm Invoice Information"],
      100: ["View"],
    },
    ESA_DO: {
      78: ["Approve Drawing"],
      79: ["Approve Drawing"],
      94: ["View"],
      100: ["View"],
    },
    ESA_IM: {
      78: ["Approve Inventory"],
      79: ["Approve Inventory"],
      94: ["View"],
      100: ["View"],
    },
    TRADE_CM: {
      95: ["Sign Yellow Page"],
      99: ["Confirm Payment"],
      100: ["View"],
    },
    TRADE_TM: {
      20: ["Save", "In Progress (21%)", "Submit for Acceptance", "Cancel"],
      21: ["Save", "Submit for Acceptance"],
      23: ["Save", "In Progress (21%)", "Submit for Acceptance"],
      32: ["Save", "Commit"],
      40: ["Save"],
      50: ["Save"],
      55: ["Save"],
      78: ["Approve Pre-SAT"],
      80: ["Send Invitation"],
      94: ["Completed"],
      100: ["View"],
    },
    ESA_LONG_JOB: {
      0: ["Save", "Submit to Trade", "Submit for Acceptance", "Cancel"],
      10: ["Save", "Submit to Trade", "Submit for Acceptance", "Cancel"],
      20: ["Save", "Submit for Acceptance", "Cancel"],
      21: ["Save", "Submit for Acceptance", "Cancel"],
      23: ["Save", "Submit for Acceptance", "Cancel"],
      25: ["Save", "Send to User for Acceptance", "Accept", "Accept and Convert to RFW", "Request Review", "Reject"],
      26: ["Save", "Accept", "Request Review", "Reject"],
      28: ["Save", "Convert RFQ to RFW"],
      30: ["Save", "Reject", "Request Review", "On Hold for Budget", "Approve & Order"],
      31: ["Save", "Reject", "Request Review", "On Hold for Budget", "Approve & Order"],
      32: ["Save"],
      40: ["Save"],
      50: ["Save"],
      55: ["Save"],
      78: ["Approve SAT"],
      79: ["Approve SAT"],
      94: ["Completed"],
      96: ["Approve Costs"],
      98: ["Confirm Invoice Information"],
      100: ["View"],
    },
    TRADE_LONG_JOB: {
      20: ["Save", "In Progress (21%)", "Submit for Acceptance", "Cancel"],
      21: ["Save", "Submit for Acceptance"],
      23: ["Save", "In Progress (21%)", "Submit for Acceptance"],
      32: ["Save", "Commit"],
      40: ["Save"],
      50: ["Save"],
      55: ["Save"],
      78: ["Approve Pre-SAT"],
      80: ["Send Invitation"],
      94: ["Completed"],
      100: ["View"],
    },
  };

  const permissionsForRole = rolePermissions[role];
  if (!permissionsForRole) {
    return false;
  }

  const permissionsForStatus = permissionsForRole[currentPercentage];
  if (!permissionsForStatus) {
    return false;
  }

  return permissionsForStatus.includes(actionName);
}
