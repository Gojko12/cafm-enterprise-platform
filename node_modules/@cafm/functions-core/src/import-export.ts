import {
  BuildingSchema,
  FloorSchema,
  RoomSchema,
  EquipmentSchema,
  PM_ChecklistStandardSchema,
  PM_ScheduleSchema,
  TradeSchema,
  EmployeeProfileSchema,
  BaseWorkRequestSchema,
} from "@cafm/shared-schema";
import { z } from "zod";
import * as XLSX from "xlsx";

export interface ImportExportContext {
  firestore: any;
  logger: any;
}

export interface ValidationError {
  rowIndex: number;
  column: string;
  value: any;
  error: string;
}

export interface DryRunValidationResult {
  isValid: boolean;
  totalRows: number;
  validRows: number;
  errors: ValidationError[];
  summary: {
    newRecords: number;
    updatedRecords: number;
    deletedRecords: number;
  };
  diffs: Array<{
    operation: "create" | "update" | "delete";
    entityType: string;
    code: string;
    changes?: Record<string, { old: any; new: any }>;
  }>;
}

const SchemaMap: Record<string, z.ZodSchema> = {
  "Buildings": BuildingSchema,
  "Floors": FloorSchema,
  "Rooms": RoomSchema,
  "Equipment": EquipmentSchema,
  "PM_Checklists": PM_ChecklistStandardSchema,
  "PM_Schedules": PM_ScheduleSchema,
  "Trades": TradeSchema,
  "Employees": EmployeeProfileSchema,
};

export async function dryRunValidateImport(
  fileBuffer: Buffer,
  fileName: string,
  context: ImportExportContext,
): Promise<DryRunValidationResult> {
  const { firestore, logger } = context;
  const errors: ValidationError[] = [];
  const diffs: DryRunValidationResult["diffs"] = [];

  let newCount = 0;
  let updateCount = 0;
  let deleteCount = 0;
  let validRowCount = 0;

  try {
    const workbook = XLSX.read(fileBuffer);

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      const schema = SchemaMap[sheetName];
      if (!schema) {
        logger.warn(`Unknown sheet "${sheetName}", skipping.`);
        continue;
      }

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];

        try {
          const parsed = schema.parse(row);
          validRowCount++;

          const uniqueCode = getUniqueCodeForEntity(parsed, sheetName);
          const existingSnapshot = await findExistingEntity(
            firestore,
            sheetName,
            uniqueCode,
          );

          if (existingSnapshot.empty) {
            newCount++;
            diffs.push({
              operation: "create",
              entityType: sheetName,
              code: uniqueCode,
            });
          } else {
            updateCount++;
            const existingData = existingSnapshot.docs[0].data();
            const changes: Record<string, { old: any; new: any }> = {};

            for (const key of Object.keys(parsed as any)) {
              if ((existingData as any)[key] !== (parsed as any)[key]) {
                changes[key] = {
                  old: (existingData as any)[key],
                  new: (parsed as any)[key],
                };
              }
            }

            diffs.push({
              operation: "update",
              entityType: sheetName,
              code: uniqueCode,
              changes: Object.keys(changes).length > 0 ? changes : undefined,
            });
          }
        } catch (validationError) {
          if (validationError instanceof z.ZodError) {
            for (const issue of validationError.issues) {
              errors.push({
                rowIndex: rowIndex + 2,
                column: issue.path.join("."),
                value: row[issue.path.join(".")],
                error: issue.message,
              });
            }
          } else {
            errors.push({
              rowIndex: rowIndex + 2,
              column: "unknown",
              value: row,
              error: String(validationError),
            });
          }
        }
      }
    }

    const isValid = errors.length === 0;

    logger.info("Dry-run validation complete", {
      fileName,
      isValid,
      totalRows: validRowCount + errors.length,
      validRows: validRowCount,
      errorCount: errors.length,
      newRecords: newCount,
      updatedRecords: updateCount,
    });

    return {
      isValid,
      totalRows: validRowCount + errors.length,
      validRows: validRowCount,
      errors,
      summary: {
        newRecords: newCount,
        updatedRecords: updateCount,
        deletedRecords: deleteCount,
      },
      diffs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Dry-run validation failed", { fileName, error: errorMessage });

    return {
      isValid: false,
      totalRows: 0,
      validRows: 0,
      errors: [
        {
          rowIndex: 0,
          column: "file",
          value: fileName,
          error: `File parsing failed: ${errorMessage}`,
        },
      ],
      summary: { newRecords: 0, updatedRecords: 0, deletedRecords: 0 },
      diffs: [],
    };
  }
}

export async function commitBulkImport(
  fileBuffer: Buffer,
  fileName: string,
  context: ImportExportContext,
): Promise<{
  success: boolean;
  message: string;
  created: number;
  updated: number;
  failed: number;
}> {
  const { firestore, logger } = context;

  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;

  try {
    const workbook = XLSX.read(fileBuffer);

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      const schema = SchemaMap[sheetName];
      if (!schema) {
        continue;
      }

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];

        try {
          const parsed = schema.parse(row);
          const uniqueCode = getUniqueCodeForEntity(parsed, sheetName);
          const existingSnapshot = await findExistingEntity(
            firestore,
            sheetName,
            uniqueCode,
          );

          const collectionName = getCollectionNameForEntity(sheetName);
          const docRef = firestore.collection(collectionName).doc(uniqueCode);

          if (existingSnapshot.empty) {
            await docRef.set({
              ...(parsed as any),
              CreatedAt: new Date().toISOString(),
              UpdatedAt: new Date().toISOString(),
            });
            createdCount++;
          } else {
            await docRef.update({
              ...(parsed as any),
              UpdatedAt: new Date().toISOString(),
            });
            updatedCount++;
          }
        } catch (error) {
          failedCount++;
          logger.error("Failed to commit row", {
            sheet: sheetName,
            row: rowIndex,
            error,
          });
        }
      }
    }

    const totalProcessed = createdCount + updatedCount + failedCount;
    logger.info("Bulk import completed", {
      fileName,
      createdCount,
      updatedCount,
      failedCount,
      totalProcessed,
    });

    return {
      success: failedCount === 0,
      message: `Import complete: ${createdCount} created, ${updatedCount} updated, ${failedCount} failed.`,
      created: createdCount,
      updated: updatedCount,
      failed: failedCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Bulk import failed", { fileName, error: errorMessage });

    return {
      success: false,
      message: `Bulk import failed: ${errorMessage}`,
      created: createdCount,
      updated: updatedCount,
      failed: failedCount + 1,
    };
  }
}

export async function generateExportFile(
  entityTypes: string[],
  context: ImportExportContext,
): Promise<Buffer> {
  const { firestore, logger } = context;
  const workbook = XLSX.utils.book_new();

  for (const entityType of entityTypes) {
    const collectionName = getCollectionNameForEntity(entityType);

    try {
      const snapshot = await firestore.collection(collectionName).get();
      const data = snapshot.docs.map((doc: any) => ({
        ...doc.data(),
      }));

      if (data.length > 0) {
        const worksheet = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, worksheet, entityType);
      }

      logger.info("Exported entity type", { entityType, recordCount: data.length });
    } catch (error) {
      logger.error("Failed to export entity type", { entityType, error });
    }
  }

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  return buffer as Buffer;
}

function getUniqueCodeForEntity(entity: any, entityType: string): string {
  const codeField: Record<string, string> = {
    "Buildings": "bl_id",
    "Floors": "LevelName",
    "Rooms": "RoomCode",
    "Equipment": "EquipmentCode",
    "PM_Checklists": "ChecklistCode",
    "PM_Schedules": "ScheduleId",
    "Trades": "TradeId",
    "Employees": "EmployeeProfileId",
  };

  const field = codeField[entityType];
  if (!field) {
    throw new Error(`Cannot determine unique code for entity type: ${entityType}`);
  }

  return entity[field];
}

async function findExistingEntity(
  firestore: any,
  entityType: string,
  uniqueCode: string,
): Promise<any> {
  const collectionName = getCollectionNameForEntity(entityType);

  return firestore
    .collection(collectionName)
    .where(getUniqueCodeFieldName(entityType), "==", uniqueCode)
    .limit(1)
    .get();
}

function getCollectionNameForEntity(entityType: string): string {
  const collectionMap: Record<string, string> = {
    "Buildings": "buildings",
    "Floors": "floors",
    "Rooms": "rooms",
    "Equipment": "equipment",
    "PM_Checklists": "pm_checklists",
    "PM_Schedules": "pm_schedules",
    "Trades": "trades",
    "Employees": "employees",
  };

  return collectionMap[entityType] || entityType.toLowerCase();
}

function getUniqueCodeFieldName(entityType: string): string {
  const fieldMap: Record<string, string> = {
    "Buildings": "bl_id",
    "Floors": "LevelName",
    "Rooms": "RoomCode",
    "Equipment": "EquipmentCode",
    "PM_Checklists": "ChecklistCode",
    "PM_Schedules": "ScheduleId",
    "Trades": "TradeId",
    "Employees": "EmployeeProfileId",
  };

  return fieldMap[entityType] || "id";
}
