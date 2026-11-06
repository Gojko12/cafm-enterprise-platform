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
        changes?: Record<string, {
            old: any;
            new: any;
        }>;
    }>;
}
export declare function dryRunValidateImport(fileBuffer: Buffer, fileName: string, context: ImportExportContext): Promise<DryRunValidationResult>;
export declare function commitBulkImport(fileBuffer: Buffer, fileName: string, context: ImportExportContext): Promise<{
    success: boolean;
    message: string;
    created: number;
    updated: number;
    failed: number;
}>;
export declare function generateExportFile(entityTypes: string[], context: ImportExportContext): Promise<Buffer>;
//# sourceMappingURL=import-export.d.ts.map