import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

import {
  generatePMWorkRequests,
  PMGenerationRequest,
} from "./pm-generator.js";
import {
  bulkCreatePMS,
  bulkAssignBlueprint,
  overruleIssuedWRs,
  switchBlueprint,
  BulkCreatePMSRequest,
  BulkAssignBlueprintRequest,
  OverruleIssuedWRsRequest,
  SwitchBlueprintRequest,
} from "./pm-schedule-ops.js";
import {
  updateWorkRequestStatus,
  manageLongJobFreeze,
  createFastJob,
  executeChecklistStep,
  manageWorkSessionTimer,
  conductTechnicalAudit,
  StatusTransitionRequest,
  FreezeManagementRequest,
  FastJobCreationRequest,
  ChecklistStepExecutionRequest,
  WorkSessionTimerRequest,
  TechnicalAuditRequest,
} from "./wr-lifecycle.js";
import {
  dryRunValidateImport,
  commitBulkImport,
  generateExportFile,
} from "./import-export.js";
import {
  setUserRoleClaims,
  verifyPermission,
  UserRoleClaimsRequest,
  AuthorizationCheckRequest,
} from "./rbac-claims.js";

initializeApp();
const db = getFirestore();
const auth = getAuth();

const contextProvider = {
  firestore: db,
  logger,
};

export const generatePMWorkRequestsCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const data = request.data as PMGenerationRequest;
      data.userId = userId;
      data.timestamp = new Date();

      const result = await generatePMWorkRequests(data, contextProvider);

      logger.info("PM work request generation completed", {
        generatedCount: result.length,
      });

      return {
        success: true,
        generated: result.length,
        workRequests: result,
      };
    } catch (error) {
      logger.error("PM work request generation failed", { error });
      throw new HttpsError("internal", `Generation failed: ${error}`);
    }
  },
);

export const bulkCreatePMSchedulesCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const data = request.data as BulkCreatePMSRequest;
      data.userId = userId;
      data.timestamp = new Date();

      const result = await bulkCreatePMS(data, contextProvider);

      return {
        success: result.errors.length === 0,
        created: result.created.length,
        failed: result.errors.length,
        errors: result.errors,
      };
    } catch (error) {
      logger.error("Bulk create PM schedules failed", { error });
      throw new HttpsError("internal", `Operation failed: ${error}`);
    }
  },
);

export const bulkAssignBlueprintCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const data = request.data as BulkAssignBlueprintRequest;
      data.userId = userId;
      data.timestamp = new Date();

      const result = await bulkAssignBlueprint(data, contextProvider);

      return {
        success: result.errors.length === 0,
        updated: result.updated.length,
        failed: result.errors.length,
        errors: result.errors,
      };
    } catch (error) {
      logger.error("Bulk assign blueprint failed", { error });
      throw new HttpsError("internal", `Operation failed: ${error}`);
    }
  },
);

export const overruleIssuedWRsCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const data = request.data as OverruleIssuedWRsRequest;
      data.userId = userId;
      data.timestamp = new Date();

      const result = await overruleIssuedWRs(data, contextProvider);

      return {
        success: result.errors.length === 0,
        cancelled: result.cancelled.length,
        failed: result.errors.length,
        errors: result.errors,
      };
    } catch (error) {
      logger.error("Overrule issued WRs failed", { error });
      throw new HttpsError("internal", `Operation failed: ${error}`);
    }
  },
);

export const switchBlueprintCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const data = request.data as SwitchBlueprintRequest;
      data.userId = userId;
      data.timestamp = new Date();

      const result = await switchBlueprint(data, contextProvider);

      return result;
    } catch (error) {
      logger.error("Switch blueprint failed", { error });
      throw new HttpsError("internal", `Operation failed: ${error}`);
    }
  },
);

export const updateWorkRequestStatusCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const data = request.data as StatusTransitionRequest;
      data.userId = userId;
      data.timestamp = new Date();

      const result = await updateWorkRequestStatus(data, contextProvider);

      return result;
    } catch (error) {
      logger.error("Update WR status failed", { error });
      throw new HttpsError("internal", `Operation failed: ${error}`);
    }
  },
);

export const manageLongJobFreezeCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const data = request.data as FreezeManagementRequest;
      data.userId = userId;
      data.timestamp = new Date();

      const result = await manageLongJobFreeze(data, contextProvider);

      return result;
    } catch (error) {
      logger.error("Manage long job freeze failed", { error });
      throw new HttpsError("internal", `Operation failed: ${error}`);
    }
  },
);

export const createFastJobCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const data = request.data as FastJobCreationRequest;
      data.userId = userId;
      data.timestamp = new Date();

      const result = await createFastJob(data, contextProvider);

      return result;
    } catch (error) {
      logger.error("Create fast job failed", { error });
      throw new HttpsError("internal", `Operation failed: ${error}`);
    }
  },
);

export const executeChecklistStepCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const data = request.data as ChecklistStepExecutionRequest;
      data.userId = userId;
      data.timestamp = new Date();

      const result = await executeChecklistStep(data, contextProvider);

      return result;
    } catch (error) {
      logger.error("Execute checklist step failed", { error });
      throw new HttpsError("internal", `Operation failed: ${error}`);
    }
  },
);

export const manageWorkSessionTimerCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const data = request.data as WorkSessionTimerRequest;
      data.userId = userId;
      data.timestamp = new Date();

      const result = await manageWorkSessionTimer(data, contextProvider);

      return result;
    } catch (error) {
      logger.error("Manage work session timer failed", { error });
      throw new HttpsError("internal", `Operation failed: ${error}`);
    }
  },
);

export const conductTechnicalAuditCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const data = request.data as TechnicalAuditRequest;
      data.userId = userId;
      data.timestamp = new Date();

      const result = await conductTechnicalAudit(data, contextProvider);

      return result;
    } catch (error) {
      logger.error("Conduct technical audit failed", { error });
      throw new HttpsError("internal", `Operation failed: ${error}`);
    }
  },
);

export const dryRunValidateImportCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const fileBuffer = Buffer.from(request.data.fileData, "base64");
      const fileName = request.data.fileName as string;

      const result = await dryRunValidateImport(fileBuffer, fileName, contextProvider);

      return result;
    } catch (error) {
      logger.error("Dry-run import validation failed", { error });
      throw new HttpsError("internal", `Validation failed: ${error}`);
    }
  },
);

export const commitBulkImportCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const fileBuffer = Buffer.from(request.data.fileData, "base64");
      const fileName = request.data.fileName as string;

      const result = await commitBulkImport(fileBuffer, fileName, contextProvider);

      return result;
    } catch (error) {
      logger.error("Bulk import commit failed", { error });
      throw new HttpsError("internal", `Import failed: ${error}`);
    }
  },
);

export const generateExportFileCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const entityTypes = request.data.entityTypes as string[];
      const buffer = await generateExportFile(entityTypes, contextProvider);
      const base64 = buffer.toString("base64");

      return {
        success: true,
        fileData: base64,
        fileName: `cafm_export_${new Date().toISOString().split("T")[0]}.xlsx`,
      };
    } catch (error) {
      logger.error("Generate export file failed", { error });
      throw new HttpsError("internal", `Export failed: ${error}`);
    }
  },
);

export const setUserRoleClaimsCallable = onCall(
  async (request) => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const data = request.data as UserRoleClaimsRequest;
      data.userId = userId;
      data.timestamp = new Date();

      const result = await setUserRoleClaims(data, contextProvider as any);

      return result;
    } catch (error) {
      logger.error("Set user role claims failed", { error });
      throw new HttpsError("internal", `Operation failed: ${error}`);
    }
  },
);

export const verifyPermissionCallable = onCall(
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const data = request.data as AuthorizationCheckRequest;

      const result = await verifyPermission(data, contextProvider as any);

      return result;
    } catch (error) {
      logger.error("Verify permission failed", { error });
      throw new HttpsError("internal", `Authorization check failed: ${error}`);
    }
  },
);

export const cleanupFrozenWRsScheduled = onSchedule(
  "every day 02:00",
  async (context) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const snapshot = await db
        .collectionGroup("workRequests")
        .where("IsFrozen", "==", true)
        .where("FreezeStartedAt", "<", thirtyDaysAgo)
        .get();

      let unfrozenCount = 0;

      for (const doc of snapshot.docs) {
        await doc.ref.update({
          IsFrozen: false,
          ActiveFreezeName: null,
          PlannedFreezeText: null,
          FreezeEndedAt: new Date().toISOString(),
          UpdatedAt: new Date().toISOString(),
        });
        unfrozenCount++;
      }

      logger.info("Cleanup scheduled: unfroze long jobs", {
        unfrozenCount,
      });
    } catch (error) {
      logger.error("Cleanup scheduled job failed", { error });
    }
  },
);

logger.info("Firebase Cloud Functions v2 initialized");
