import { getDB } from "./db.js";
import { getOfflineEngine, compressPhoto } from "./offline-engine.js";
import {
  PM_StepAuditLogEntry,
  WorkSessionEntry,
  OfflinePhotoQueueEntry,
} from "./db.js";
import { BaseWorkRequest } from "@cafm/shared-schema";

/**
 * Generate UUID v4
 */
function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create simple SHA256 checksum (browser-compatible)
 */
async function createChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Start a work session timer for a WR
 */
export async function startWorkSession(wrId: string, technicianId: string): Promise<string> {
  const db = await getDB();
  const sessionId = uuidv4();

  const session: WorkSessionEntry = {
    SessionId: sessionId,
    WR_ID: wrId,
    StartedAt: new Date().toISOString(),
    TotalTimeMinutes: 0,
    Status: "RUNNING",
  };

  await db.put("workSessions", session);
  return sessionId;
}

/**
 * Pause a running work session
 */
export async function pauseWorkSession(sessionId: string): Promise<void> {
  const db = await getDB();
  const session = await db.get("workSessions", sessionId);

  if (!session) throw new Error("Session not found");
  if (session.Status !== "RUNNING") throw new Error("Session is not running");

  session.PausedAt = new Date().toISOString();
  session.Status = "PAUSED";
  await db.put("workSessions", session);
}

/**
 * Resume a paused work session
 */
export async function resumeWorkSession(sessionId: string): Promise<void> {
  const db = await getDB();
  const session = await db.get("workSessions", sessionId);

  if (!session) throw new Error("Session not found");
  if (session.Status !== "PAUSED") throw new Error("Session is not paused");

  session.ResumedAt = new Date().toISOString();
  session.Status = "RUNNING";
  await db.put("workSessions", session);
}

/**
 * Stop a work session and calculate total time
 */
export async function stopWorkSession(
  sessionId: string,
  timerOverrideReason?: string,
): Promise<{ totalTimeMinutes: number }> {
  const db = await getDB();
  const session = await db.get("workSessions", sessionId);

  if (!session) throw new Error("Session not found");

  const startTime = new Date(session.StartedAt).getTime();
  let endTime = new Date().getTime();

  if (session.PausedAt) {
    const pauseTime = new Date(session.PausedAt).getTime();
    endTime = session.ResumedAt ? new Date(session.ResumedAt).getTime() : pauseTime;
  }

  const totalMinutes = Math.round((endTime - startTime) / 60000);

  session.StoppedAt = new Date().toISOString();
  session.TotalTimeMinutes = totalMinutes;
  session.Status = "STOPPED";
  if (timerOverrideReason) {
    session.TimerOverrideReason = timerOverrideReason;
  }

  await db.put("workSessions", session);

  const engine = getOfflineEngine();
  await engine.queueMutation("SESSION_LOG", { ...session });

  return { totalTimeMinutes: totalMinutes };
}

/**
 * Get or create work session for a WR
 */
export async function getActiveWorkSession(wrId: string): Promise<WorkSessionEntry | null> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex("workSessions", "by-wr", wrId);
  const active = sessions.find((s) => s.Status === "RUNNING" || s.Status === "PAUSED");
  return active || null;
}

/**
 * Log a step completion with optional photo
 */
export async function logStepCompletion(
  wrId: string,
  stepId: string,
  technicianId: string,
  action: "PASS" | "FAIL" | "UPDATE_VALUE",
  result?: string | number | boolean,
  photoDataUrl?: string,
  technicianComment?: string,
): Promise<void> {
  const db = await getDB();
  const auditId = uuidv4();
  const timestamp = new Date().toISOString();

  // Create immutable checksum
  const checksumData = `${wrId}${stepId}${action}${result}${timestamp}`;
  const checksum = await createChecksum(checksumData);

  const auditEntry: PM_StepAuditLogEntry = {
    AuditId: auditId,
    StepId: stepId,
    WR_ID: wrId,
    Action: action,
    Result: result,
    TechnicianId: technicianId,
    Timestamp: timestamp,
    ImmutableChecksum: checksum,
  };

  await db.put("stepAuditLog", auditEntry);

  // Queue photo if provided
  if (photoDataUrl && action === "FAIL") {
    const engine = getOfflineEngine();
    const { compressedDataUrl, originalSizeKB, compressedSizeKB } =
      await compressPhoto(photoDataUrl);

    await engine.queuePhotoUpload(wrId, compressedDataUrl, originalSizeKB, compressedSizeKB, stepId);
  }

  const engine = getOfflineEngine();
  await engine.queueMutation("STEP_COMPLETE", { ...auditEntry, TechnicianComment: technicianComment });
}

/**
 * Get audit log for a step
 */
export async function getStepAuditLog(wrId: string): Promise<PM_StepAuditLogEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex("stepAuditLog", "by-wr", wrId);
}

/**
 * Validate numeric step result against thresholds
 */
export function validateNumericThreshold(
  value: number,
  minThreshold?: number,
  maxThreshold?: number,
): { valid: boolean; outOfRange: boolean; message?: string } {
  if (minThreshold !== undefined && value < minThreshold) {
    return { valid: false, outOfRange: true, message: `Below minimum: ${minThreshold}` };
  }
  if (maxThreshold !== undefined && value > maxThreshold) {
    return { valid: false, outOfRange: true, message: `Above maximum: ${maxThreshold}` };
  }
  return { valid: true, outOfRange: false };
}

/**
 * Create follow-up corrective WR after step failure
 */
export async function createFollowUpCorrectiveWR(
  originalWrId: string,
  stepId: string,
  description: string,
  failurePhotos: string[],
): Promise<string> {
  const db = await getDB();
  const originalWr = await db.get("workRequests", originalWrId);

  if (!originalWr) throw new Error("Original WR not found");

  const followUpWrId = `${originalWrId}-FOLLOWUP-${new Date().getTime()}`;

  // Queue follow-up WR creation
  const engine = getOfflineEngine();
  await engine.saveWorkRequest({
    WR_ID: followUpWrId,
    WR_Type: "LJ",
    ESAWorkType: "Corrective Maintenance",
    Description: `Follow-up from ${originalWrId}: ${description}`,
    bl_id: originalWr.bl_id,
    LevelName: originalWr.LevelName,
    RoomCode: originalWr.RoomCode,
    EquipmentCodes: originalWr.EquipmentCodes,
    TradeName: originalWr.TradeName,
    CreatedDate: new Date().toISOString(),
    WorkRequestStatus: "Issued",
    WorkRequestSubstatus: "Issued",
    Percentage: 50,
    CreatedBy: "SYSTEM",
  } as any);

  // Queue photos
  for (const photoUrl of failurePhotos) {
    await engine.queuePhotoUpload(followUpWrId, photoUrl, 0, 0, stepId);
  }

  return followUpWrId;
}

/**
 * Claim (self-assign) an unassigned WR
 */
export async function claimWorkRequest(wrId: string, technicianId: string): Promise<void> {
  const db = await getDB();
  const wr = await db.get("workRequests", wrId);

  if (!wr) throw new Error("Work request not found");

  // Add to assigned list
  if (!wr.AssignedUserIds) {
    wr.AssignedUserIds = [];
  }
  if (!wr.AssignedUserIds.includes(technicianId)) {
    wr.AssignedUserIds.push(technicianId);
  }

  await db.put("workRequests", wr);

  // Queue sync
  const engine = getOfflineEngine();
  await engine.saveWorkRequest(wr);
}


/**
 * Get unassigned WRs for a specific trade
 */
export async function getUnassignedWRsByTrade(trade: string): Promise<BaseWorkRequest[]> {
  const db = await getDB();
  const allWrs = await db.getAllFromIndex("workRequests", "by-trade", trade);
  return allWrs.filter((wr) => !wr.AssignedUserIds || wr.AssignedUserIds.length === 0);
}
