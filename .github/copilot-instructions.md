# Enterprise CAFM, SmartPM & Workplace Platform — AI Engineering Laws

## 1. Source of Truth
Always read `docs/MASTER_SPEC.md` before designing schemas, UI views, or backend functions.
Never write placeholder comments like `// TODO: implement logic` or mock calculations. Write complete, production-grade code.

## 2. Architecture & Folder Boundaries
- `packages/shared-schema`: TypeScript interfaces & Zod schemas shared across Web and Cloud Functions (`Building`, `Floor`, `Room`, `Equipment`, `BaseWorkRequest`, `WR_Statuses`, `PM_ChecklistStandard`, `PM_Schedule`, `PM_WorkRequestStep`, `WorkSession`, `TechnicalAudit`, `RBAC`).
- `services/functions-core`: TypeScript Firebase Cloud Functions v2 (SmartPM horizon generator, duplicate cycle check, SLA/Margin calculations, Excel `.xlsx` dry-run import/export).
- `services/cad-bim-parser`: Python 3.11+ Cloud Functions using `ezdxf` and `shapely` to parse `.dxf`/`.dwg` room boundaries, match `RoomCode` text tags inside polygons, calculate exact net area in m2, and export GeoJSON/SVG polygons.
- `apps/web-portal`: Next.js (App Router, TypeScript, Tailwind, TanStack Table) + 2D interactive floor plan viewer + 3D IFC viewer (`web-ifc` + Three.js).
- `apps/mobile-app`: Offline-first Flutter app using local SQLite (`drift`) with background Firestore sync queue, QR scanner (`ScanEquipmentQR`), and in-place Multi-Select Equipment Picker.

## 3. Non-Negotiable Domain Invariants
1. **3-Tier Location Hierarchy**: `Building (bl_id)` -> `Floor (LevelName)` -> `Room (RoomCode)`. Selecting a Room or Floor MUST automatically resolve and populate parent IDs.
2. **Percentage Status Engine (`WR_Statuses`)**: Every status transition must validate against the central `WR_Statuses` configuration (`50%` = Issued, `78%` = Technically Completed, `100%` = Closed/Approved) mapped to `ESAWorkType`.
3. **SmartPM Generation**: Must prevent duplicate cycle WRs, auto-resolve `Equipment -> Room -> Floor -> Building`, set initial status to `50% Issued`, instantiate `PM_WorkRequestStep` and `PM_StepOption` records, and log every step change to an immutable `PM_StepAuditLog`.
