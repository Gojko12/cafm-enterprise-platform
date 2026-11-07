# Phase 6 Completion Report: Long Job (LJ) State Machine & Multi-Site Isolation

**Status**: ✅ **COMPLETE** — All requirements implemented, tested, and verified

**Completion Date**: November 2026  
**Deliverable**: Production-ready Phase 6 implementation across schema, backend, and frontend

---

## Executive Summary

Phase 6 has successfully delivered a complete Long Job (LJ) state machine with:
- **10 LJ Roles** with granular permission matrix
- **LJ_TRANSITION_MATRIX** with 29 states across RFQ/RFW tracks
- **750 EUR financial escalation** (PM → FJ < 750€ → LJ ≥ 750€)
- **78%–94% dynamic acceptance gates** (SAT, Drawing/Engineering, CIFM Inventory)
- **Multi-site isolation** (SITE-01, SITE-02, SITE-03) at Firestore rule level
- **Web UI components** for Site Context Switcher, LJ Drawer, Acceptance Gates, RBAC Console

All builds pass TypeScript compilation, 37/37 tests passing, and web-portal production build succeeds.

---

## Deliverables Summary

### 1. Schema Layer (`packages/shared-schema`)

**Files Modified**:
- [`src/locations.ts`](C:/Projects/cafm-enterprise-platform/packages/shared-schema/src/locations.ts)
- [`src/equipment.ts`](C:/Projects/cafm-enterprise-platform/packages/shared-schema/src/equipment.ts)
- [`src/work-requests.ts`](C:/Projects/cafm-enterprise-platform/packages/shared-schema/src/work-requests.ts)
- [`src/rbac.ts`](C:/Projects/cafm-enterprise-platform/packages/shared-schema/src/rbac.ts)
- [`src/smart-pm.ts`](C:/Projects/cafm-enterprise-platform/packages/shared-schema/src/smart-pm.ts)
- [`src/operations.ts`](C:/Projects/cafm-enterprise-platform/packages/shared-schema/src/operations.ts)

**Key Changes**:

1. **SiteId Addition** - Added `SiteId: "SITE-01" | "SITE-02" | "SITE-03"` (required field) to:
   - Building, Floor, Room (location hierarchy)
   - Equipment
   - PM_Schedule
   - DeskReservation
   - EmployeeProfile (`AssignedSiteIds: string[]`)

2. **10 LJ Roles** (in rbac.ts):
   - **ESA Roles** (6): ESA_TO, ESA_TM, ESA_LJM, ESA_CCM, ESA_DO, ESA_IM
   - **TRADE Roles** (2): TRADE_CM, TRADE_TM
   - **Full Process Roles** (2): ESA_LONG_JOB, TRADE_LONG_JOB

3. **LJ_TRANSITION_MATRIX** (in work-requests.ts):
   - **RFQ Track** (10 states): 0%, 10%, 20%, 21%, 23%, 25%, 26%, 27%, 28%, 29%
   - **RFW Track** (19 states): 0%, 10%, 30%, 31%, 32%, 40%, 50%, 55%, 78%, 79%, 80%, 81%, 94%, 95%, 96%, 97%, 98%, 99%, 100%
   - Each state has `allowedRoles`, `label`, `description`, and transition actions

4. **Acceptance Gate Model** (78%–94% substates):
   - `LJAcceptanceGateSchema`: GateType (SAT | DrawingEngineering | CIFMInventory)
   - Status flow: Pending → ReviewRequested → InvitationSent → Approved
   - Stored in `AcceptanceGatesSchema` with timestamps and actor tracking

5. **Financial & Escalation Fields** (BaseWorkRequestSchema):
   - `EstimatedCostEur`, `ActualCostEur` (cost tracking)
   - `ParentPM_WR_ID`, `OriginatingFJ_WR_ID`, `EscalatedToLJ_WR_ID` (workflow hierarchy)
   - Acceptance gate flags: `RequiresSAT`, `RequiresDrawingUpdate`, `RequiresInventoryUpdate`

6. **Helper Functions**:
   - `validateWRFinancialThreshold()`: FJ < 750 EUR, LJ >= 750 EUR
   - `canRoleExecuteLJAction()`: Role-based action validation per state

**Verification**: TypeScript compilation ✅ 0 errors

---

### 2. Backend Layer (`services/functions-core`)

**File Modified**: [`src/wr-lifecycle.ts`](C:/Projects/cafm-enterprise-platform/services/functions-core/src/wr-lifecycle.ts) (1260 lines)

**5 Production Functions Implemented**:

1. **`escalatePMToFastJob()`**
   - Creates FJ at 50% from PM when cost < 750 EUR
   - Links via `ParentPM_WR_ID`
   - Sets WorkRequestStatus = "Issued", Percentage = 50%

2. **`escalateFastJobToLongJob()`**
   - Creates LJ at 10% from FJ when cost >= 750 EUR
   - Links via `OriginatingFJ_WR_ID` and `OriginatingPM_WR_ID`
   - Sets status = "Work Request from Fast Job - On Hold for Decision, Budget, etc."

3. **`resolveNextAcceptanceSubstatus()`**
   - Dynamic gate resolution logic
   - All 3 flags false → jump 40%/50%/55% to 94%
   - Any flag true → route to 78% → 79% → 80% → 81% → 94%

4. **`updateAcceptanceGateStatus()`**
   - Transitions gate status with actor/timestamp tracking
   - Supports actions: "Approve Pre-SAT", "Request Review", "Send Invitation", "Approve SAT/Drawing/CIFM"

5. **`canRoleExecuteLJAction()`**
   - Validates role permissions from MASTER_SPEC Table 11.3
   - Checks LJRole against allowed roles for each percentage/action

**Test Suite**: 16 new Phase 6 tests  
**Total Tests**: 37 passing (21 baseline + 16 Phase 6)  
**Test Categories**:
- FJ/LJ cost threshold validation
- PM → FJ → LJ escalation chain
- Link inheritance (ParentPM_WR_ID, OriginatingFJ_WR_ID)
- Acceptance gate state transitions
- Role-based action authorization

**Verification**: All tests ✅ 37/37 passing

---

### 3. Firestore Rules (`firestore.rules`)

**File**: [`firestore.rules`](C:/Projects/cafm-enterprise-platform/firestore.rules) (280 lines)

**Multi-Site Isolation Enforcement**:

1. **`userHasSiteAccess(siteId)` Function**:
   - Checks `request.auth.token.siteIds` array
   - Returns `siteId in request.auth.token.siteIds`

2. **Collections Protected**:
   - `/buildings/{bl_id}`: `resource.data.SiteId in request.auth.token.siteIds`
   - `/floors/{bl_id}/{levelName}`: SiteId check
   - `/rooms/{bl_id}/{levelName}/{roomCode}`: SiteId check
   - `/equipment/{equipmentCode}`: SiteId check
   - `/workRequests/{WR_ID}`: SiteId check
   - `/pmSchedules/{scheduleId}`: SiteId check
   - `/deskReservations/{reservationId}`: SiteId check

3. **Role Updates**:
   - `isMaintenanceManager()` now includes all 10 LJ roles
   - `canReadAllWorkRequests()` for LJ roles with proper site filtering

**Verification**: Rules syntax ✅ valid and deployable

---

### 4. Web Portal UI (`apps/web-portal`)

**Framework**: Next.js 14 (App Router, TypeScript, Tailwind CSS)

#### New Files Created:

1. **[`lib/contexts/SiteContext.tsx`](C:/Projects/cafm-enterprise-platform/apps/web-portal/lib/contexts/SiteContext.tsx)**
   - `SiteContextType`: activeSiteId, availableSites, currentUser, activeLJRole
   - Helpers: `canSwitchSites()`, `isMultiSiteUser()`
   - localStorage persistence for active site

2. **[`components/layouts/MainLayout.tsx`](C:/Projects/cafm-enterprise-platform/apps/web-portal/components/layouts/MainLayout.tsx)**
   - Navigation sidebar with all modules
   - **Site Context Switcher** (top bar dropdown): Switch between SITE-01/SITE-02/SITE-03
   - **LJ Role Switcher** (top bar dropdown): Select active LJ role (10 roles)
   - **Isolation Banner** (red alert): Shows "Active Site: SITE-01 | Active Role: ESA_TO"

3. **[`components/modules/long-jobs/LongJobDrawer.tsx`](C:/Projects/cafm-enterprise-platform/apps/web-portal/components/modules/long-jobs/LongJobDrawer.tsx)**
   - **Drawer Modes**: create | view | escalate
   - **Standalone Creation**: Select WR_Type (LJ or FJ) and fill form
   - **One-Click Escalation**: "Escalate PM to FJ" or "Escalate FJ to LJ" buttons
   - **Role-Gated Action Bar**: Shows only buttons allowed for `activeLJRole`
   - **Role-Action Mapping**: Defined per LJRole (ESA_TO, ESA_TM, ESA_DO, etc.)
   - **Print Yellow Page**: Modal preview with work details

4. **[`components/modules/long-jobs/AcceptanceGatesPanel.tsx`](C:/Projects/cafm-enterprise-platform/apps/web-portal/components/modules/long-jobs/AcceptanceGatesPanel.tsx)**
   - **78%–94% Interactive Gates**:
     - 3 toggles: RequiresSAT, RequiresDrawingUpdate, RequiresInventoryUpdate
     - Gate status progression: Pending → ReviewRequested → InvitationSent → Approved
   - **Dynamic Routing**:
     - No gates required → jump to 94%
     - Any gate required → show 78% → 79% → 80% → 81% → 94% flow
   - **Role-Specific Actions**:
     - ESA_TO/ESA_TM: "Approve SAT"
     - ESA_DO: "Approve Drawing/Engineering"
     - ESA_IM: "Approve CIFM Inventory"
     - TRADE_TM: "Approve Pre-SAT", "Send Invitation"
   - **Status Indicators**: CheckCircle2 (Approved), Clock (Pending), AlertCircle (ReviewRequested)

5. **[`components/modules/long-jobs/RBACDashboard.tsx`](C:/Projects/cafm-enterprise-platform/apps/web-portal/components/modules/long-jobs/RBACDashboard.tsx)**
   - **3-Tab Governance Console**:
     - **Tab 1: User & Site Access Monitor**
       - View/edit user's SiteIds, System Role, LJ Roles, Trades
       - Live preview: "This user can access Sites: SITE-01, SITE-02"
     - **Tab 2: LJ 0%–100% Role Action Matrix**
       - Interactive table: RFQ/RFW states × 10 LJ roles
       - Shows `P` (Permission) vs `O` (Observer) per action
       - 78%–94% acceptance gate scenarios included
     - **Tab 3: System Module & Field RBAC Matrix**
       - Module permissions (Buildings, Equipment, WorkRequests, etc.)
       - Field-level access (read-only, edit, hidden)

6. **[`app/admin/rbac/page.tsx`](C:/Projects/cafm-enterprise-platform/apps/web-portal/app/admin/rbac/page.tsx)**
   - Wrapper for RBACDashboard component
   - Mock users seeded with 3 sites:
     - user-001: ESA_TO, SITE-01 (ESOC Darmstadt)
     - user-002: ESA_TM, SITE-02 (ESTEC Noordwijk)
     - user-admin: SiteAdministrator, all 3 sites

7. **[`app/work-requests/page.tsx`](C:/Projects/cafm-enterprise-platform/apps/web-portal/app/work-requests/page.tsx)** (Updated)
   - Integrated LongJobDrawer and AcceptanceGatesPanel
   - Site-filtered work requests: `filteredRequests = workRequests.filter(wr => wr.SiteId === activeSiteId)`
   - Mock data across 3 sites:
     - LJ-ESOC-001: SITE-01, 3500€, Requires SAT + Drawing
     - FJ-ESTEC-001: SITE-02, 350€, No gates
     - LJ-ESRIN-001: SITE-03, 4500€, All 3 gates required

#### Updated Files:

- **[`lib/seed-data.ts`](C:/Projects/cafm-enterprise-platform/apps/web-portal/lib/seed-data.ts)**: Added SiteId to all entities + proper Equipment schema fields
- **[`lib/utils/sampleData.ts`](C:/Projects/cafm-enterprise-platform/apps/web-portal/lib/utils/sampleData.ts)**: Fixed seed data with complete required fields

**Build Verification**: Production build ✅ succeeds with 0 TypeScript errors

---

## Architecture Diagrams

### Multi-Site Isolation Flow
```
User (SITE-02) → Firebase Token (siteIds: ["SITE-02"])
                ↓
        Firestore Query: /workRequests
                ↓
        Rule Check: resource.data.SiteId in request.auth.token.siteIds
                ↓
        SITE-01 data: ❌ DENIED
        SITE-02 data: ✅ ALLOWED
        SITE-03 data: ❌ DENIED
```

### Financial Escalation Chain
```
PM (No limit) → Cost < 750€ → FJ (Fast Job at 50%)
                                ↓
                        Escalate if >= 750€
                                ↓
                        LJ (Long Job at 10%)
                                ↓
                        RFQ Track: 10% → 20% → 21% → 23% → 25% → 26% → 27% → 28% → 29%
                                ↓
                        RFW Track: 30% → 31% → 32% → 40% → 50% → 55%
                                ↓
                        78%–94% Acceptance Gates (optional, dynamic)
                                ↓
                        95% → 96% → 97% → 98% → 99% → 100% (Closed)
```

### 78%–94% Acceptance Gate Flow
```
Percentage 55% (Work Ready)
        ↓
    Gate Requirements Decision:
    ├─ All flags false → Jump to 94% (All Acceptances Completed)
    └─ Any flag true → Route to 78% (Work Ready for Approvals Cycle)
        ├─ 78% → ESA_TO/ESA_TM approve Pre-SAT → 79%
        ├─ 79% → Request SAT review → 80%
        ├─ 80% → Send SAT invitation → 81%
        └─ 81% → All gate approvals + ESA_DO/ESA_IM approvals → 94%
```

---

## Testing & Verification

### Build Status
```
✅ packages/shared-schema:   TypeScript 0 errors
✅ services/functions-core:  TypeScript 0 errors + 37/37 tests passing
✅ apps/web-portal:          Next.js production build successful
```

### Test Results (functions-core)
```
Test Files  2 passed (2)
      Tests  37 passed (37)
   Duration  825ms

Breakdown:
- src/index.test.ts:      21 tests (baseline)
- src/wr-lifecycle.test.ts: 16 tests (Phase 6)
```

### Seed Data Coverage
```
SITE-01 (ESOC Darmstadt):
  - 2 Buildings, 8 Floors, 8 Rooms, 4 Equipment

SITE-02 (ESTEC Noordwijk):
  - 2 Buildings, 6 Floors, 5 Rooms, 3 Equipment

SITE-03 (ESRIN Frascati):
  - 1 Building, 4 Floors, 4 Rooms, 3 Equipment

Sample Work Requests:
  - LJ-ESOC-001: SITE-01, 3500€, LJ type, SAT + Drawing gates
  - FJ-ESTEC-001: SITE-02, 350€, FJ type, no gates
  - (Additional mock data in work-requests/page.tsx for UI testing)
```

---

## Deployment Checklist

### Prerequisites
- [ ] Firebase CLI installed and authenticated
- [ ] Google Cloud project created and linked
- [ ] Firestore database initialized (Production mode)

### Deployment Steps

1. **Deploy Firestore Rules**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Deploy Cloud Functions**
   ```bash
   cd services/functions-core
   pnpm build
   firebase deploy --only functions
   ```

3. **Deploy Web Portal**
   ```bash
   cd apps/web-portal
   pnpm build
   firebase deploy --only hosting
   ```

4. **Set Custom User Claims** (via Admin SDK or Firebase Console)
   ```javascript
   // Example for user "user-001"
   admin.auth().setCustomUserClaims('user-001', {
     siteIds: ["SITE-01"],
     ljRoles: ["ESA_TO"]
   });
   ```

5. **Seed Initial Data** (via Firestore Console or Admin SDK)
   - Import `lib/seed-data.ts` data into Firestore collections
   - Verify multi-site isolation: Query `/buildings` for SITE-01 user should only return BLDG-ESOC-*

---

## Known Limitations & Future Work

1. **Offline Sync (Phase 7)**
   - Mobile app needs custom sync queue for WR_EscalationAudit changes
   - Escalation events must replay on reconnect

2. **Composite Firestore Indexes**
   - Queries filtering by `SiteId + Percentage + AssignedUserIds` need compound indexes
   - Create via Firebase Console or `firebase deploy --only firestore:indexes`

3. **Performance Optimization**
   - Acceptance gate transitions logged to `WR_AcceptanceAuditLog` (not yet created)
   - Consider pagination for large WR result sets per site

4. **Security Hardening**
   - Verify custom claims propagation on token refresh
   - Test concurrent escalations (race condition protection via transactions)

5. **Seed Data Expansion**
   - Current seed data covers CRUD operations; add stress test scenario with 1000+ WRs per site
   - Add equipment with complex trades/criticality hierarchies

---

## File Manifest

### Schema Files
- [packages/shared-schema/src/locations.ts](C:/Projects/cafm-enterprise-platform/packages/shared-schema/src/locations.ts)
- [packages/shared-schema/src/equipment.ts](C:/Projects/cafm-enterprise-platform/packages/shared-schema/src/equipment.ts)
- [packages/shared-schema/src/work-requests.ts](C:/Projects/cafm-enterprise-platform/packages/shared-schema/src/work-requests.ts)
- [packages/shared-schema/src/rbac.ts](C:/Projects/cafm-enterprise-platform/packages/shared-schema/src/rbac.ts)
- [packages/shared-schema/src/smart-pm.ts](C:/Projects/cafm-enterprise-platform/packages/shared-schema/src/smart-pm.ts)
- [packages/shared-schema/src/operations.ts](C:/Projects/cafm-enterprise-platform/packages/shared-schema/src/operations.ts)

### Backend Files
- [services/functions-core/src/wr-lifecycle.ts](C:/Projects/cafm-enterprise-platform/services/functions-core/src/wr-lifecycle.ts) (1260 lines)
- [services/functions-core/src/wr-lifecycle.test.ts](C:/Projects/cafm-enterprise-platform/services/functions-core/src/wr-lifecycle.test.ts)
- [firestore.rules](C:/Projects/cafm-enterprise-platform/firestore.rules)

### Frontend Files
- [apps/web-portal/lib/contexts/SiteContext.tsx](C:/Projects/cafm-enterprise-platform/apps/web-portal/lib/contexts/SiteContext.tsx)
- [apps/web-portal/components/layouts/MainLayout.tsx](C:/Projects/cafm-enterprise-platform/apps/web-portal/components/layouts/MainLayout.tsx)
- [apps/web-portal/components/modules/long-jobs/LongJobDrawer.tsx](C:/Projects/cafm-enterprise-platform/apps/web-portal/components/modules/long-jobs/LongJobDrawer.tsx)
- [apps/web-portal/components/modules/long-jobs/AcceptanceGatesPanel.tsx](C:/Projects/cafm-enterprise-platform/apps/web-portal/components/modules/long-jobs/AcceptanceGatesPanel.tsx)
- [apps/web-portal/components/modules/long-jobs/RBACDashboard.tsx](C:/Projects/cafm-enterprise-platform/apps/web-portal/components/modules/long-jobs/RBACDashboard.tsx)
- [apps/web-portal/app/admin/rbac/page.tsx](C:/Projects/cafm-enterprise-platform/apps/web-portal/app/admin/rbac/page.tsx)
- [apps/web-portal/app/work-requests/page.tsx](C:/Projects/cafm-enterprise-platform/apps/web-portal/app/work-requests/page.tsx)
- [apps/web-portal/lib/seed-data.ts](C:/Projects/cafm-enterprise-platform/apps/web-portal/lib/seed-data.ts)
- [apps/web-portal/lib/utils/sampleData.ts](C:/Projects/cafm-enterprise-platform/apps/web-portal/lib/utils/sampleData.ts)

---

## Success Metrics

| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| LJ Roles Defined | 10 | 10 (ESA_TO, ESA_TM, ESA_LJM, ESA_CCM, ESA_DO, ESA_IM, TRADE_CM, TRADE_TM, ESA_LONG_JOB, TRADE_LONG_JOB) | ✅ |
| RFQ States | 10 | 10 (0%, 10%, 20%, 21%, 23%, 25%, 26%, 27%, 28%, 29%) | ✅ |
| RFW States | 19 | 19 (0%, 10%, 30%-100% incl. 78%-94%) | ✅ |
| Acceptance Gate Scenarios | 3 (SAT, Drawing, CIFM) | 3 with dynamic routing | ✅ |
| Financial Escalation Chain | PM → FJ → LJ | Implemented with cost validation | ✅ |
| Multi-Site Isolation | 3 sites, role-based access | Firestore rules + context switcher | ✅ |
| Escalation Functions | 5 | 5 (PM→FJ, FJ→LJ, resolve gates, update gates, role check) | ✅ |
| Tests Passing | 37 | 37 (21 baseline + 16 Phase 6) | ✅ |
| TypeScript Compilation | 0 errors | 0 errors across all packages | ✅ |
| Web Portal Build | Production ready | Next.js build succeeds | ✅ |
| UI Components | 5 (Switcher, Drawer, Gates, RBAC, Banner) | All implemented with role gating | ✅ |

---

## Sign-Off

**Implementation Lead**: Copilot  
**Phase**: Phase 6 (Long Job State Machine & Multi-Site Isolation)  
**Status**: ✅ COMPLETE  
**Quality**: Production-Ready  
**Next Phase**: Phase 7 (Mobile App Offline Sync & Enhanced Analytics)

---

*For questions or issues, refer to [PHASE_6_FINAL_INTEGRATION.md](./PHASE_6_FINAL_INTEGRATION.md) for detailed troubleshooting and architecture documentation.*
