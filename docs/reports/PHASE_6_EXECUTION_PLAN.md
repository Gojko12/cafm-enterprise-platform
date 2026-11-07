# Phase 6 Execution Plan: Complete Long Job (LJ) State Machine, 78%-94% Acceptance Gates & Multi-Site Isolation

**Status**: In Progress  
**Date Started**: 2026-11-06  
**Target Completion**: Full TypeScript/Firestore Rules/Web Portal deployment  

## Overview

Phase 6 implements the complete Long Job (LJ) state machine with:
1. **Financial Escalation**: PM (unlimited) -> FJ (<750€) -> LJ (≥750€)
2. **LJ 0%-100% State Machine**: Complete RFQ & RFW workflow with exact role permissions
3. **78%-94% Acceptance Gates**: Dynamic SAT, Drawing/Engineering, CIFM Inventory approvals
4. **Multi-Site Isolation**: SITE-01 (Darmstadt), SITE-02 (Noordwijk), SITE-03 (Frascati)
5. **10 LJ Roles**: ESA_TO, ESA_TM, ESA_LJM, ESA_CCM, ESA_DO, ESA_IM, TRADE_CM, TRADE_TM, ESA_LONG_JOB, TRADE_LONG_JOB

---

## Task A: Schema Upgrades (`packages/shared-schema`)

### Completed ✓
- [x] Added `SiteIdSchema` (SITE-01, SITE-02, SITE-03) to locations.ts
- [x] Updated BuildingSchema with SiteId field
- [x] Updated FloorSchema with SiteId field
- [x] Updated RoomSchema with SiteId field
- [x] Updated EquipmentSchema with SiteId field
- [x] Added 10 LJ Roles to rbac.ts
- [x] Updated ROLE_PERMISSIONS mapping for all LJ roles
- [x] Updated PM_ScheduleSchema with SiteId
- [x] Updated EmployeeProfileSchema with AssignedSiteIds: string[]
- [x] Updated DeskReservationSchema with SiteId
- [x] Added financial & escalation fields to BaseWorkRequestSchema
- [x] Implemented validateWRFinancialThreshold helper function
- [x] **Build Status**: All TypeScript compiles successfully ✅

### In Progress (Agent A)
- [ ] LJ_TRANSITION_MATRIX with complete RFQ & RFW state definitions
- [ ] 78%-94% Acceptance Gate Model
- [ ] Helper Functions: canRoleExecuteLJAction, resolveNextAcceptanceSubstatus

---

## Task B: Cloud Functions & Firestore Rules

### Completed ✓
- [x] Upgraded firestore.rules with SiteId isolation
- [x] Updated isMaintenanceManager() to include all 10 LJ roles
- [x] Updated canReadAllWorkRequests() for LJ roles
- [x] SiteId isolation on workRequests, pmSchedules, deskReservations

### In Progress (Agent B)
- [ ] Escalation Functions: escalatePMToFastJob, escalateFastJobToLongJob
- [ ] Acceptance Gate Actions: approveSAT, approveDrawing, approveInventory
- [ ] Role-based Action Validation
- [ ] Audit logging to WR_EscalationAudit collection

---

## Task C: Web Portal UI & RBAC Governance

### In Progress (Agent C)
- [ ] Site Context Switcher & Isolation Banner in MainLayout
- [ ] Long Job Work Request Drawer enhancements
- [ ] 78%-94% Acceptance Gates Panel
- [ ] `/admin/rbac` Unified Governance Console with 3 tabs
- [ ] Seed data for 3 sites

---

## Parallel Agent Status

**Agent A (42915699-d748-4daf-a080-4ac2a46051f7)**: Working on LJ state machine schema  
**Agent B (7155d145-00e6-4475-85c1-7502fc12cdd5)**: Working on escalation & lifecycle functions  
**Agent C (26c08c58-c64b-4011-aa1a-2110a65fe704)**: Working on web-portal UI components  

---

## Files Modified in This Phase

### Schema Layer
- `/packages/shared-schema/src/locations.ts`: Added SiteId
- `/packages/shared-schema/src/equipment.ts`: Added SiteId
- `/packages/shared-schema/src/work-requests.ts`: Added financial fields & SiteId
- `/packages/shared-schema/src/smart-pm.ts`: Added SiteId
- `/packages/shared-schema/src/operations.ts`: Added SiteId, AssignedSiteIds
- `/packages/shared-schema/src/rbac.ts`: Added 10 LJ roles

### Backend Layer
- `/firestore.rules`: Added SiteId isolation & LJ role support
- `/services/functions-core/src/wr-lifecycle.ts`: (In progress - Agent B)

### Frontend Layer
- `/apps/web-portal/app/(root)/layout.tsx`: Site Context (In progress - Agent C)
- `/apps/web-portal/app/work-requests/page.tsx`: LJ Drawer (In progress - Agent C)
- `/apps/web-portal/app/admin/rbac/page.tsx`: Governance Console (In progress - Agent C)

---

*Last Updated: 2026-11-06 23:50 UTC*
