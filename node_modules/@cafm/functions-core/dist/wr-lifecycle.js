import { WR_Statuses, assertWorkRequestStatusTransition, calculateWorkSessionMinutes, } from "@cafm/shared-schema";
import { Timestamp } from "firebase-admin/firestore";
export async function updateWorkRequestStatus(request, context) {
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
            throw new Error(`Work request current status (${wrData.Percentage}%) does not match expected status (${fromStatus.Percentage}%).`);
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to update work request status", { wrId, error: errorMessage });
        return { success: false, wrId, message: errorMessage };
    }
}
export async function manageLongJobFreeze(request, context) {
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
        }
        else if (action === "unfreeze") {
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to manage long job freeze", { wrId, error: errorMessage });
        return { success: false, wrId, message: errorMessage };
    }
}
export async function createFastJob(request, context) {
    const { firestore, logger } = context;
    const { description, problemLocation, bl_id, LevelName, RoomCode, equipmentCodes, tradeId, tradeName, userId, timestamp, } = request;
    try {
        const counter = await getNextWR_ID(context);
        const issuedStatus = WR_Statuses.find((s) => s.Percentage === 50 && s.ESAWorkType === "Corrective Maintenance");
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to create fast job", { error: errorMessage });
        return { success: false, message: `Fast Job creation failed: ${errorMessage}` };
    }
}
export async function executeChecklistStep(request, context) {
    const { firestore, logger } = context;
    const { wrId, stepInstanceId, inputData, photoIds, technicianComment, userId, timestamp } = request;
    try {
        const stepRef = firestore
            .collectionGroup("pm_steps")
            .where("StepInstanceId", "==", stepInstanceId)
            .where("WR_ID", "==", wrId);
        const stepSnapshot = await stepRef.get();
        if (stepSnapshot.empty) {
            throw new Error(`Checklist step ${stepInstanceId} not found for work request ${wrId}`);
        }
        const stepDoc = stepSnapshot.docs[0];
        const stepData = stepDoc.data();
        let isFailed = false;
        if (stepData.InputType === "Numeric") {
            const value = inputData.value;
            if ((stepData.MinThreshold !== undefined && value < stepData.MinThreshold) ||
                (stepData.MaxThreshold !== undefined && value > stepData.MaxThreshold)) {
                isFailed = true;
            }
        }
        else if (stepData.InputType === "Boolean") {
            isFailed = inputData.value === false;
        }
        if (isFailed && photoIds.length === 0) {
            throw new Error("Failed checklist steps require at least one evidence photo.");
        }
        if (isFailed && !technicianComment?.trim()) {
            throw new Error("Failed checklist steps require a technician comment.");
        }
        const updatePayload = {
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
        }
        else if (stepData.InputType === "Numeric") {
            updatePayload.ValueNumeric = inputData.value;
        }
        else if (stepData.InputType === "SingleSelect" || stepData.InputType === "MultiSelect") {
            updatePayload.SelectedOptionIds = inputData.selectedOptionIds || [];
        }
        else if (stepData.InputType === "FreeText") {
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to execute checklist step", { wrId, stepInstanceId, error: errorMessage });
        return { success: false, message: errorMessage };
    }
}
export async function manageWorkSessionTimer(request, context) {
    const { firestore, logger } = context;
    const { wrId, action, craftpersonId, userId, manualOverrideMinutes, overrideReason, timestamp, } = request;
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
        }
        else if (action === "pause") {
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
        }
        else if (action === "stop") {
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
            }
            else {
                totalMinutes = calculateWorkSessionMinutes(sessionData.StartedAt.toDate(), new Date(timestamp));
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
                .then(async (wrSnapshot) => {
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to manage work session timer", { wrId, action, error: errorMessage });
        return { success: false, message: errorMessage };
    }
}
export async function conductTechnicalAudit(request, context) {
    const { firestore, logger } = context;
    const { wrId, qaInspectedBy, result, issueDescription, correctionComment, score, photoStoragePaths, shouldReopenWR, userId, timestamp, } = request;
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
                    const issueStatus = WR_Statuses.find((s) => s.Percentage === 50 &&
                        s.ESAWorkType === wrData.ESAWorkType);
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to conduct technical audit", { wrId, error: errorMessage });
        return { success: false, message: errorMessage };
    }
}
async function getNextWR_ID(context) {
    const db = context.firestore;
    const sequenceRef = db.collection("wrs_sequence").doc("pm_counter");
    let nextSequence = 0;
    await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(sequenceRef);
        nextSequence = (doc.exists ? doc.data().counter : 0) + 1;
        transaction.update(sequenceRef, { counter: nextSequence });
    });
    return `2026${String(nextSequence).padStart(6, "0")}`;
}
//# sourceMappingURL=wr-lifecycle.js.map