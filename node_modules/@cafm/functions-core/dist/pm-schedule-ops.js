import { Timestamp } from "firebase-admin/firestore";
export async function bulkCreatePMS(request, context) {
    const { firestore, logger } = context;
    const { schedules, userId, timestamp } = request;
    const created = [];
    const errors = [];
    for (const schedule of schedules) {
        try {
            const scheduleRef = firestore
                .collection("pm_schedules")
                .doc(schedule.ScheduleId);
            const payload = {
                ...schedule,
                CreatedBy: userId,
                CreatedAt: Timestamp.fromDate(timestamp),
                UpdatedAt: Timestamp.fromDate(timestamp),
            };
            await scheduleRef.set(payload);
            created.push(schedule.ScheduleId);
            logger.info("Created PM schedule", { scheduleId: schedule.ScheduleId });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push({ schedule, error: errorMessage });
            logger.error("Failed to create PM schedule", {
                scheduleId: schedule.ScheduleId,
                error: errorMessage,
            });
        }
    }
    return { created, errors };
}
export async function bulkAssignBlueprint(request, context) {
    const { firestore, logger } = context;
    const { scheduleIds, newChecklistCode, userId, timestamp } = request;
    const updated = [];
    const errors = [];
    for (const scheduleId of scheduleIds) {
        try {
            const scheduleRef = firestore.collection("pm_schedules").doc(scheduleId);
            const doc = await scheduleRef.get();
            if (!doc.exists) {
                errors.push({ scheduleId, error: "Schedule not found" });
                continue;
            }
            await scheduleRef.update({
                ChecklistCode: newChecklistCode,
                UpdatedAt: Timestamp.fromDate(timestamp),
            });
            updated.push(scheduleId);
            logger.info("Updated PM schedule blueprint assignment", {
                scheduleId,
                newChecklistCode,
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push({ scheduleId, error: errorMessage });
            logger.error("Failed to assign blueprint", { scheduleId, error: errorMessage });
        }
    }
    return { updated, errors };
}
export async function overruleIssuedWRs(request, context) {
    const { firestore, logger } = context;
    const { scheduleId, reasonForCancellation, userId, timestamp } = request;
    const cancelled = [];
    const errors = [];
    try {
        const snapshot = await firestore
            .collectionGroup("workRequests")
            .where("ScheduleId", "==", scheduleId)
            .where("Percentage", "==", 50)
            .where("WorkRequestStatus", "==", "Issued")
            .get();
        for (const doc of snapshot.docs) {
            try {
                const wrId = doc.id;
                await doc.ref.update({
                    Percentage: 0,
                    WorkRequestStatus: "Cancelled",
                    WorkRequestSubstatus: "Overruled",
                    UpdatedAt: Timestamp.fromDate(timestamp),
                    CancellationReason: reasonForCancellation,
                    CancelledBy: userId,
                    CancelledAt: Timestamp.fromDate(timestamp),
                });
                await firestore
                    .collection("wrs_audit_log")
                    .add({
                    WR_ID: wrId,
                    ScheduleId: scheduleId,
                    Action: "overruled_issued",
                    Reason: reasonForCancellation,
                    ActorId: userId,
                    OccurredAt: Timestamp.fromDate(timestamp),
                });
                cancelled.push(wrId);
                logger.info("Cancelled issued PM WR", { wrId, scheduleId, reason: reasonForCancellation });
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const wrId = doc.id;
                errors.push({ wrId, error: errorMessage });
                logger.error("Failed to cancel issued WR", { wrId, error: errorMessage });
            }
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to fetch issued WRs for schedule", { scheduleId, error: errorMessage });
        throw error;
    }
    return { cancelled, errors };
}
export async function switchBlueprint(request, context) {
    const { firestore, logger } = context;
    const { scheduleId, newChecklistCode, userId, timestamp } = request;
    try {
        const scheduleRef = firestore.collection("pm_schedules").doc(scheduleId);
        const scheduleDoc = await scheduleRef.get();
        if (!scheduleDoc.exists) {
            throw new Error(`Schedule ${scheduleId} not found`);
        }
        const oldChecklistCode = scheduleDoc.data().ChecklistCode;
        const newBlueprintRef = firestore
            .collection("pm_checklists")
            .doc(newChecklistCode);
        const newBlueprintDoc = await newBlueprintRef.get();
        if (!newBlueprintDoc.exists) {
            throw new Error(`New checklist blueprint ${newChecklistCode} not found`);
        }
        await scheduleRef.update({
            ChecklistCode: newChecklistCode,
            UpdatedAt: Timestamp.fromDate(timestamp),
        });
        const wrsSnapshot = await firestore
            .collectionGroup("workRequests")
            .where("ScheduleId", "==", scheduleId)
            .where("Percentage", "==", 50)
            .get();
        let affectedCount = 0;
        for (const doc of wrsSnapshot.docs) {
            const wrId = doc.id;
            const stepsSnapshot = await firestore
                .collection("pm_steps")
                .where("WR_ID", "==", wrId)
                .get();
            const batch = firestore.batch();
            for (const stepDoc of stepsSnapshot.docs) {
                batch.delete(stepDoc.ref);
            }
            batch.commit().catch((error) => {
                logger.error("Failed to delete old steps during blueprint switch", {
                    wrId,
                    error: error.message,
                });
            });
            affectedCount++;
        }
        await firestore
            .collection("blueprint_migration_log")
            .add({
            ScheduleId: scheduleId,
            OldChecklistCode: oldChecklistCode,
            NewChecklistCode: newChecklistCode,
            AffectedWRCount: affectedCount,
            ActorId: userId,
            MigratedAt: Timestamp.fromDate(timestamp),
        });
        logger.info("Switched blueprint for schedule", {
            scheduleId,
            fromChecklistCode: oldChecklistCode,
            toChecklistCode: newChecklistCode,
            affectedCount,
        });
        return {
            success: true,
            message: `Successfully switched blueprint. ${affectedCount} open PM WRs will use the new blueprint for future instantiation.`,
            affectedCount,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Blueprint switch failed", { scheduleId, error: errorMessage });
        return {
            success: false,
            message: `Blueprint switch failed: ${errorMessage}`,
            affectedCount: 0,
        };
    }
}
//# sourceMappingURL=pm-schedule-ops.js.map