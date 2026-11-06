# Phase 2: Firebase Cloud Functions Core Service (`services/functions-core`)

## Overview

This service implements the complete, production-grade Firebase Cloud Functions v2 backend for the Enterprise CAFM & SmartPM platform. It provides:

- **PM Generation Engine**: Automated Preventive Maintenance work request generation with duplicate cycle prevention and 3-tier location hierarchy resolution
- **PM Schedule Operations**: Bulk schedule management, blueprint assignment, and cycle overruling
- **Work Request Lifecycle**: Status transitions, freeze/unfreeze management, checklist step execution, work session timers, and technical audits
- **Bulk Import/Export**: Excel/CSV validation and data import/export with dry-run validation
- **RBAC Claims Management**: Custom Firebase Authentication claims and permission-based authorization

## Project Structure

```
services/functions-core/
├── src/
│   ├── index.ts                 # Cloud Functions v2 callables and scheduled functions
│   ├── pm-generator.ts          # PM WR generation (single, selected, 30-day horizon)
│   ├── pm-schedule-ops.ts       # Schedule bulk operations, blueprint switching
│   ├── wr-lifecycle.ts          # Status transitions, freezes, checklists, audits
│   ├── import-export.ts         # Excel/CSV import/export with validation
│   ├── rbac-claims.ts           # Role-based access control and custom claims
│   └── index.test.ts            # Comprehensive unit tests
├── dist/                         # Compiled TypeScript (JavaScript + type definitions)
├── package.json                  # Dependencies: firebase-admin, firebase-functions, zod, xlsx
├── tsconfig.json                 # TypeScript configuration (ES2022, ESM)
└── vitest.config.ts             # Test runner configuration
```

## Key Features

### 1. PM Work Request Generation (`pm-generator.ts`)

**Supports Three Generation Modes:**
- **Single Mode**: Generate PM WR for one specific equipment item
- **Selected Mode**: Batch generate across multiple selected schedules
- **Horizon Mode**: Generate all due PMs for the next 30 days across a Building/Floor/Room

**Core Functionality:**
- ✅ Duplicate cycle prevention using `PM_CycleKey` (schedule ID + due date)
- ✅ Automatic 3-tier location hierarchy resolution: `Equipment → Room → Floor → Building`
- ✅ WR_ID sequence generation with format `2026000001` (year + 6-digit counter)
- ✅ DueDate and MarginDate calculation from schedule frequency and tolerance windows
- ✅ Initial status assignment: `50%` (Issued) validated via `WR_Statuses` engine
- ✅ Instantiation of all `PM_WorkRequestStep` and `PM_StepAuditLog` records from blueprint
- ✅ Immutable audit trail for every step creation

**Example Request:**
```typescript
{
  generationMode: "single",
  checklistBlueprint: { ... },  // PM_ChecklistStandard
  schedule: { ... },             // PM_Schedule
  equipment: { ... },            // Equipment with bl_id, LevelName, RoomCode
  userId: "planner001",
  timestamp: new Date()
}
```

### 2. PM Schedule Operations (`pm-schedule-ops.ts`)

**Operations Provided:**
- `bulkCreatePMS()`: Batch-create multiple PM schedules
- `bulkAssignBlueprint()`: Reassign checklist blueprints to multiple schedules
- `overruleIssuedWRs()`: Cancel all open 50% Issued PM WRs for a schedule with audit trail
- `switchBlueprint()`: Migrate a schedule to a new checklist blueprint; old open WRs remain unaffected

**Key Properties:**
- Transaction-safe database updates
- Comprehensive error handling and logging
- Audit log records for all administrative actions

### 3. Work Request Lifecycle Management (`wr-lifecycle.ts`)

**Status Transition Engine:**
- Validates transitions using `WR_Statuses` configuration
- Enforces strict percentage progression: 50% → 78% → 100%
- Logs every transition with timestamp and actor ID

**Long Job (LJ) Freeze Management:**
- Freeze and unfreeze LJs with reason tracking
- Automatic SLA margin extension (+7 days) when frozen
- Immutable freeze/unfreeze audit logs

**Fast Job (FJ) Creation:**
- Streamlined single-call creation for on-the-spot repairs
- Auto-assigned 50% Issued status for Corrective Maintenance
- Pre-configured 0.5-hour expected duration

**Checklist Step Execution:**
- Dynamic input type validation (Boolean, Numeric, SingleSelect, MultiSelect, FreeText)
- Automatic out-of-range detection for numeric measurements
- Mandatory photo capture and technician comments on failures
- Audit log for each step completion/modification

**Work Session Timer:**
- Start/pause/stop workflow with automatic duration calculation
- Manual override capability with reason tracking
- Automatic accumulation to WR's total TotalTimeMinutes

**Technical Audit & QA:**
- QA pass/fail inspection with scoring
- Ability to reopen 78% Technically Completed WRs if QA fails
- Photo evidence and correction comments required

### 4. Bulk Import/Export Engine (`import-export.ts`)

**Supported Entity Types:**
- Buildings, Floors, Rooms, Equipment
- PM_ChecklistStandards (with steps)
- PM_Schedules, Trades, EmployeeProfiles

**Two-Phase Validation Workflow:**
1. **Dry-Run Validation** (`dryRunValidateImport`):
   - Parses Excel/CSV rows
   - Validates against `@cafm/shared-schema` Zod schemas
   - Computes field-by-field diffs (new vs. updated records)
   - Returns structured row/column validation errors before commit
   - Shows preview of create/update/delete operations

2. **Commit & Import** (`commitBulkImport`):
   - Writes validated batches to Firestore
   - Creates or updates records by unique code
   - Returns success/failure summary

**Export Functionality:**
- Batch export entity types to `.xlsx` format
- Base64-encoded for transport via HTTPS callable
- Ready for Excel-based off-site archival or external system integration

### 5. RBAC Claims & Authorization (`rbac-claims.ts`)

**Custom Claims Management:**
- `setUserRoleClaims()`: Assign role + permissions to Firebase Auth user
- `verifyPermission()`: Check if decoded token has required permission
- `syncRolePermissions()`: Refresh cached permissions from Firestore

**Supported Roles:**
- `SiteAdministrator`: Full system access
- `ESA_LongJobManager`: LJ creation, freezes, approvals, scheduling
- `PM_Planner`: PM schedule management, bulk generation, technician assignment
- `QA_Inspector`: Technical audit and quality inspections
- `MobileTechnician`: Assigned WRs, checklist execution, session timers
- `StandardEmployee`: Desk reservations, basic tickets

**Permission Matrix:**
Each role is pre-configured with a precise set of permissions (e.g., `pmSchedules.generate`, `workRequests.approve`). Custom middleware for Express or direct callable checks.

## Callable Cloud Functions (index.ts)

All functions require Firebase authentication. Data is validated before processing.

### PM Generation
- **`generatePMWorkRequestsCallable`**: Generate PM WRs by mode

### PM Schedule Management
- **`bulkCreatePMSchedulesCallable`**: Batch-create schedules
- **`bulkAssignBlueprintCallable`**: Reassign blueprints
- **`overruleIssuedWRsCallable`**: Cancel open PM WRs
- **`switchBlueprintCallable`**: Migrate to new blueprint

### Work Request Lifecycle
- **`updateWorkRequestStatusCallable`**: Transition WR status
- **`manageLongJobFreezeCallable`**: Freeze/unfreeze LJs
- **`createFastJobCallable`**: Create quick FJ
- **`executeChecklistStepCallable`**: Execute checklist step with input
- **`manageWorkSessionTimerCallable`**: Start/pause/stop session
- **`conductTechnicalAuditCallable`**: QA inspection with reopen capability

### Data Management
- **`dryRunValidateImportCallable`**: Preview import changes
- **`commitBulkImportCallable`**: Commit validated data
- **`generateExportFileCallable`**: Export to `.xlsx`

### RBAC
- **`setUserRoleClaimsCallable`**: Assign user role + permissions
- **`verifyPermissionCallable`**: Check user authorization

### Scheduled Background Jobs
- **`cleanupFrozenWRsScheduled`**: Daily 02:00 UTC job that auto-unfreezes LJs frozen >30 days

## Validation & Error Handling

### Schema Validation
All inputs validated against `@cafm/shared-schema` Zod schemas:
- Type safety (string, number, enum, array)
- Business rules (3-tier hierarchy, thresholds, status transitions)
- Detailed error messages per field

### Error Responses
Firebase HttpsError codes:
- `unauthenticated`: User not authenticated
- `permission-denied`: User lacks required permission
- `invalid-argument`: Input validation failed
- `not-found`: Referenced entity not found
- `internal`: Unhandled server error (with masked details for security)

### Audit Logging
Immutable audit trails for:
- PM cycle generation
- Status transitions
- Checklist step completions
- Technical audits
- Role assignments
- Blueprint migrations

## Testing

### Unit Tests (Vitest)
- **21 test cases** covering:
  - Cycle key generation and duplicate prevention
  - Status transition validation
  - Checklist blueprint instantiation
  - Location hierarchy resolution
  - Freeze/unfreeze operations
  - Import/export validation
  - RBAC permission matrix
  - Full PM generation workflow

### Running Tests
```bash
npm run test:run        # Run once
npm run test            # Watch mode
npm run typecheck       # TypeScript type checking
npm run build          # Compile to dist/
```

## Building & Deployment

### Build
```bash
npm run build
```
Compiles TypeScript to `dist/` with source maps and type definitions.

### TypeScript Configuration
- **Target**: ES2022
- **Module**: ESNext (native ES modules)
- **Strict Mode**: Enabled
- **Source Maps**: Yes (for debugging)
- **Declaration Files**: Yes (`.d.ts` for consumers)

### Dependencies

**Runtime:**
- `firebase-admin@^12.0.0`: Firebase backend SDK
- `firebase-functions@^5.0.0`: Cloud Functions v2 framework
- `zod@^4.6.7`: Runtime schema validation
- `xlsx@^0.18.5`: Excel file parsing/generation
- `@cafm/shared-schema`: Local workspace package with domain schemas

**Development:**
- `typescript@^5.8.0`: Language
- `vitest@^3.1.0`: Test runner
- `@types/node@^22.0.0`: Node.js types

## Non-Negotiable Domain Invariants

✅ **3-Tier Location Hierarchy**: Every WR explicitly resolves and stores `bl_id`, `LevelName`, `RoomCode`

✅ **Percentage Status Engine**: All status transitions validated against `WR_Statuses` configuration (50% Issued, 78% Technically Completed, 100% Closed)

✅ **SmartPM Generation**:
  - Duplicate cycle prevention (by `PM_CycleKey`)
  - Auto-resolved location hierarchy
  - Initial 50% Issued status
  - Instantiated `PM_WorkRequestStep` + `PM_StepAuditLog` records
  - Immutable audit trails

✅ **Freeze/SLA Management**: 7-day margin extension on freeze, tracked with reason

✅ **Checklist Validation**: Failed steps require photos, comments, and optional follow-up WR creation

✅ **Audit Trail**: All state changes (PM generation, status transitions, step completions, audits, role assignments) logged with timestamp, actor ID, and previous/new values

## Future Enhancements

- Meter-based PM cycle detection (integration with asset telemetry)
- Dynamic lead-time calculation based on equipment criticality
- Bulk checklist step result import (mass data entry from site surveys)
- Multi-language checklist template support
- SLA breach escalation triggers
- Cloud Tasks queue for long-running import/export jobs

## Contact & Support

For questions on Cloud Functions deployment, see Firebase documentation:
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
- [Callable Functions](https://firebase.google.com/docs/functions/callable)
- [Custom Claims](https://firebase.google.com/docs/auth/admin-setup)
