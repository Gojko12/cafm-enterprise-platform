# CAFM Enterprise Platform: Architecture (Phases 6 & 7)

---

## System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                    CAFM Enterprise Platform v1.0                   │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Phase 7: Mobile Field Application (React)                  │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │ • 10 production components (2,676 LOC TypeScript)          │  │
│  │ • Offline-first via Phase 5 engine                         │  │
│  │ • SiteId isolation + PM→FJ→LJ escalation                   │  │
│  │ • Mobile-first responsive (360px–768px+)                   │  │
│  │ • WCAG 2.1 AA accessible                                   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│                              ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Phase 6: Web Portal (Next.js)                              │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │ • Site Context Switcher + LJ Role Selector                │  │
│  │ • Long Job Drawer (Create/View/Escalate)                  │  │
│  │ • Acceptance Gates Panel (78%–94% dynamic routing)        │  │
│  │ • RBAC Dashboard (3 tabs: Users, Roles, Modules)          │  │
│  │ • Work Requests page with LJ/FJ filtering                 │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│                              ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Phase 5: Offline Engine (TypeScript)                       │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │ • IndexedDB persistence + localStorage fallback            │  │
│  │ • Sync queue management (conflict resolution)              │  │
│  │ • Work session timer + checklist execution                 │  │
│  │ • Immutable PM_StepAuditLog (SHA-256 checksums)           │  │
│  │ • Photo compression + metadata                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│                              ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Phase 6: State Machine + Cloud Functions                   │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │ Schema Layer (shared-schema)                               │  │
│  │ • LJ_TRANSITION_MATRIX (29 states: RFQ + RFW)            │  │
│  │ • LJAcceptanceGateSchema (78%–94% gates)                  │  │
│  │ • SiteId on all entities                                   │  │
│  │ • Financial fields (EstimatedCostEur, ActualCostEur)     │  │
│  │ • 10 LJ roles with permission matrix                       │  │
│  │                                                             │  │
│  │ Functions (services/functions-core)                        │  │
│  │ • escalatePMToFastJob() [FJ < 750€ at 50%]               │  │
│  │ • escalateFastJobToLongJob() [LJ ≥ 750€ at 10%]          │  │
│  │ • resolveNextAcceptanceSubstatus() [Dynamic routing]      │  │
│  │ • updateAcceptanceGateStatus() [SAT/Drawing/CIFM]         │  │
│  │ • canRoleExecuteLJAction() [Role permissions]             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│                              ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Firestore Database + Security Rules                        │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │ Collections:                                                │  │
│  │ • /buildings/{bl_id} → SiteId isolation                   │  │
│  │ • /floors/{fl_id} → Inherited SiteId                      │  │
│  │ • /rooms/{rm_id} → Inherited SiteId                       │  │
│  │ • /equipment/{eq_id} → SiteId filtering                   │  │
│  │ • /workRequests/{wr_id} → SiteId + financial fields       │  │
│  │ • /pmSchedules/{pm_id} → SiteId + LJ roles               │  │
│  │ • /deskReservations/{desk_id} → SiteId isolation          │  │
│  │                                                             │  │
│  │ Security:                                                   │  │
│  │ • userHasSiteAccess(siteId) → Deny cross-site access     │  │
│  │ • Role-based authorization (10 LJ roles)                  │  │
│  │ • Firestore rules (280 LOC)                               │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│                              ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Multi-Site Isolation (SITE-01, SITE-02, SITE-03)          │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │ • SITE-01: ESOC Darmstadt (2 buildings, 8 floors)        │  │
│  │ • SITE-02: ESTEC Noordwijk (2 buildings, 6 floors)       │  │
│  │ • SITE-03: ESRIN Frascati (1 building, 4 floors)         │  │
│  │                                                             │  │
│  │ Auth Token Claims:                                          │  │
│  │ • { siteIds: ["SITE-02"] }  Technician scoped to SITE-02  │  │
│  │ • { siteIds: ["SITE-01", "SITE-02", "SITE-03"] } Admin   │  │
│  │                                                             │  │
│  │ Query Filtering:                                            │  │
│  │ • const myWRs = wrs.filter(wr => wr.SiteId === activeSite)│  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Phase 6: Long Job State Machine

### LJ_TRANSITION_MATRIX (29 States)

#### RFQ Track (Request for Quotation) - 10 states
```
0%   → Work Request Created
10%  → Sent to Trade (awaiting quote)
20%  → Quote Received (< 750€ auto-FJ, ≥ 750€ LJ)
21%  → Quote Under Review
23%  → Quote Rejected (needs resubmission)
25%  → Quote Approved (financial)
26%  → Ready for Work Authorization
27%  → Authorization Pending ESA Signature
28%  → Authorized
29%  → Ready for Transition to RFW
```

#### RFW Track (Request for Work) - 19 states
```
0%   → Long Job Created (Standalone or Escalated from FJ)
10%  → Work Request from Fast Job (On Hold for Decision/Budget)
30%  → Design Phase Initiated
31%  → Design Under Review
32%  → Design Approved / Engineering Complete
40%  → Procurement Phase
50%  → Procurement Complete / Ready for Execution
55%  → Pre-Execution Checklist
78%  → SAT Inspection Requested (Acceptance Gate 1/3)
79%  → Drawing/Engineering Update Requested (Gate 2/3)
80%  → CIFM Inventory Update Requested (Gate 3/3)
81%  → All Gates Approved / Ready for Closure
94%  → Execution Complete / Pending Closure
95%  → Final Review
96%  → Approved for Archival
97%  → Documentation Complete
98%  → Archival in Progress
99%  → Archived
100% → Closed & Archived (Final)
```

### Financial Escalation (750 EUR Threshold)

```
PM (No limit)
  │
  ├─ Cost < 750 EUR
  │  └─ CREATE FAST JOB (FJ)
  │     Percentage: 50% (Issued)
  │     Status: Active work
  │     → Step Pass: Close FJ at 100%
  │     → Step Fail: Escalate to LJ
  │
  └─ Cost ≥ 750 EUR
     └─ CREATE LONG JOB (LJ)
        Percentage: 10% (RFW: "Work Request from FJ")
        Status: On Hold for Decision/Budget
        → Workflow: 10% → 30% → 40% → 50% → 55%
        → Gates: 78% → 79% → 80% → 81% → 94% → 100%
```

### Cost Validation

```typescript
// Function: validateWRFinancialThreshold(wr, type)

FJ Validation:
  EstimatedCostEur < 750 EUR ✓ OR
  ActualCostEur < 750 EUR ✓
  → Create at 50% Issued

LJ Validation:
  EstimatedCostEur ≥ 750 EUR ✓ OR
  ActualCostEur ≥ 750 EUR ✓
  → Create at 10% RFW
```

### Acceptance Gates (78%–94% Dynamic Routing)

```
Gate Model:
  • RequiresSAT: boolean
  • RequiresDrawingUpdate: boolean
  • RequiresInventoryUpdate: boolean

Gate Status Flow (per gate):
  Pending
    → ReviewRequested
    → InvitationSent
    → Approved ✓ (immutable)

Dynamic Routing Logic:

If all 3 flags false:
  40% → 50% → 55% → 94% (skip gates)

If ≥1 flag true:
  40% → 50% → 55% → 78%
  
  Then for each gate:
    78% (SAT) → approve → 79%
    79% (Drawing) → approve → 80%
    80% (CIFM) → approve → 81%
    81% (All gates approved) → 94%

Role-Based Gate Approval:
  • SAT: ESA_TO, ESA_TM
  • Drawing/Engineering: ESA_DO (Draftsman)
  • CIFM Inventory: ESA_IM (Inventory Admin)
  • Orchestration: ESA_TM (Trade Manager)
```

### Link Inheritance

```
PM ──┬──> FJ (< 750€)
     │    ParentPM_WR_ID ──→ PM
     │
     └──> LJ (≥ 750€) — Direct
          EstimatedCostEur ≥ 750

FJ ──┬──> LJ (≥ 750€) — Escalated
     │    ParentPM_WR_ID ──→ PM (inherited)
     │    OriginatingFJ_WR_ID ──→ FJ (escalation trigger)
     │
     └──> FJ (< 750€) — Follow-up
          ParentPM_WR_ID ──→ PM (inherited)

Audit Trail:
  • ParentPM_WR_ID: Original PM (root cause)
  • OriginatingFJ_WR_ID: Triggering FJ (escalation trigger)
  • EscalatedToLJ_WR_ID: Target LJ (escalation result)
```

### 10 LJ Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| ESA_TO | Technical Officer | SAT approval, LJ oversight |
| ESA_TM | Trade Manager | LJ workflow orchestration, escalation decisions |
| ESA_LJM | Long Job Manager | Dedicated LJ coordinator |
| ESA_CCM | Cost Control Manager | Budget tracking, cost thresholds |
| ESA_DO | Drawing Officer/Draftsman | Engineering drawings approval |
| ESA_IM | CIFM Inventory Admin | CIFM inventory updates |
| TRADE_CM | Contractor Contract Manager | Contractor oversight |
| TRADE_TM | Contractor Trade Manager | Contractor execution |
| ESA_LONG_JOB | Simplified ESA Role | Automated escalation |
| TRADE_LONG_JOB | Simplified Contractor Role | Automated escalation |

---

## Phase 7: Mobile Field Application

### Component Architecture

```
App.tsx (Root Component)
├── State Management
│   ├── activeSiteId: "SITE-01" | "SITE-02" | "SITE-03"
│   ├── currentTechnicianId: "TECH-001"
│   ├── myWRs: BaseWorkRequest[]
│   ├── unassignedWRs: BaseWorkRequest[]
│   ├── buildings: Building[]
│   ├── floors: Floor[]
│   ├── rooms: Room[]
│   └── equipment: Equipment[]
│
├── Offline Engine Initialization
│   ├── initOfflineEngine()
│   ├── onOnlineStatusChange() → UI update
│   └── onSyncStatusChange() → Pending counter
│
├── Multi-View Routing
│   ├── "home" → TechnicianHome
│   ├── "checklist" → ChecklistExecutor
│   ├── "scanner" → QRScanner
│   └── "inspection" → EquipmentInspectionView
│
└── Component Hierarchy
    ├── MobileHeader
    │   ├── Site badge (activeSiteId)
    │   ├── Sync status + pending counter
    │   ├── Sync Now button
    │   └── Online/Offline simulator
    │
    ├── TechnicianHome
    │   ├── Tab: My WRs (assigned)
    │   ├── Tab: Unassigned WRs (Trade Pool)
    │   └── WRPreviewCard[]
    │       └── One-tap Claim
    │
    ├── AdvancedFilterPanel
    │   ├── Building picker (cascading)
    │   ├── Floor picker (auto-resolves Building)
    │   ├── Room picker (auto-resolves Floor & Building)
    │   ├── WR_ID search
    │   ├── Trade filter
    │   ├── Checklist toggle
    │   └── Date range pickers
    │
    ├── MultiSelectEquipmentPicker
    │   ├── Equipment list (searchable)
    │   ├── In-place toggles (Blue/Orange)
    │   ├── Maintains scroll position
    │   └── Unselect All button
    │
    ├── WorkSessionTimer
    │   ├── Start / Pause / Stop
    │   ├── MM:SS display
    │   ├── Manual override (minutes)
    │   └── Mandatory override reason
    │
    ├── ChecklistExecutor
    │   ├── Step N of M progress
    │   ├── 5 Input Types:
    │   │   ├── Boolean (Pass/Fail)
    │   │   ├── Numeric (with threshold validation)
    │   │   ├── SingleSelect (radio)
    │   │   ├── MultiSelect (checkboxes)
    │   │   └── FreeText (input)
    │   ├── Step Failure Flow:
    │   │   ├── Mandatory photo capture
    │   │   ├── Technician comment
    │   │   ├── "Open Follow-Up FJ (<750€)" button
    │   │   └── "Escalate to LJ (≥750€)" button
    │   └── Previous / Next / Submit
    │
    ├── QRScanner
    │   ├── Camera file input
    │   ├── Manual code input (MVP)
    │   ├── Validation (alphanumeric)
    │   └── Scan completion callback
    │
    └── EquipmentInspectionView
        ├── Equipment details
        ├── Active WRs list
        ├── Historical WRs list
        └── 4 Action Buttons:
            ├── Start Assigned PM
            ├── Create FJ (<750€)
            ├── Create LJ (≥750€)
            └── Log Technical Audit
```

### Data Flow (Offline-First)

```
Mobile App
    │
    ├─► Offline Engine (Phase 5)
    │   ├─► IndexedDB (Primary)
    │   │   ├─ buildings, floors, rooms, equipment
    │   │   ├─ workRequests (my + unassigned)
    │   │   ├─ pmSchedules, checklists
    │   │   └─ workSessions, auditLogs
    │   │
    │   ├─► localStorage (Fallback)
    │   │   └─ Minimal state for headless env
    │   │
    │   └─► Sync Queue
    │       ├─ Pending mutations (offline)
    │       ├─ Batch upload when online
    │       └─ Conflict resolution
    │
    └─► Zustand Store (useFilterStore)
        └─ Filter state, active view, etc.

Operations:
  Read:
    const buildings = await engine.getBuildings();
    // → From IndexedDB (instant if cached)
    
  Write:
    await engine.createWorkRequest(newWR);
    // → Queue to sync queue if offline
    // → Cloud Functions when sync
    
  Sync:
    await engine.syncToFirebase();
    // → Batch upload mutations
    // → Conflict resolution
    // → Update local cache
```

### SiteId Isolation Logic

```typescript
// In App.tsx initialization:

const activeSiteId = "SITE-02"; // From user auth claims
const currentTechnicianId = "TECH-001";

// Load all WRs from IndexedDB
const allWRs = await engine.getWorkRequests();

// Filter by active site + technician
const myWRs = allWRs.filter(wr =>
  wr.SiteId === activeSiteId &&
  wr.AssignedUserIds?.includes(currentTechnicianId)
);

const unassignedWRs = allWRs.filter(wr =>
  wr.SiteId === activeSiteId &&
  (!wr.AssignedUserIds || wr.AssignedUserIds.length === 0)
);

// Filter locations by site
const siteBuildings = buildings.filter(b => b.SiteId === activeSiteId);
const siteEquipment = equipment.filter(e => e.SiteId === activeSiteId);

// Filter in AdvancedFilterPanel
const filteredWRs = myWRs.filter(wr =>
  wr.SiteId === activeSiteId &&  // Double-check site
  wr.bl_id === selectedBuilding?.bl_id &&
  wr.LevelName === selectedFloor?.LevelName &&
  wr.RoomCode === selectedRoom?.RoomCode &&
  (!trade || wr.Trade === trade)
);
```

### Mobile Responsive Design

```
360px (Mobile - minimum)
├─ Single-column layout
├─ Full-width cards
├─ Touch-friendly (44x44px buttons)
├─ Stacked form fields
└─ Vertical scrolling

568px (Tablet - portrait)
├─ Wider margins
├─ Improved spacing
└─ Same single-column

768px (Tablet - landscape)
├─ Two-column card grid
├─ Side-by-side panels
├─ Wider MobileHeader
└─ Multi-pane views

1024px+ (Desktop - optional)
├─ Three-column layout
├─ Horizontal navigation
└─ Advanced analytics

Breakpoints (Tailwind):
  sm: 640px   (sm:)
  md: 768px   (md:)
  lg: 1024px  (lg:)
  xl: 1280px  (xl:)

Mobile-First Strategy:
  1. Design for 360px
  2. Add responsive classes: sm:, md:, lg:
  3. Never remove features at smaller sizes
  4. Ensure accessibility at all sizes
```

---

## Testing Strategy

### Unit Tests (Phase 5 & 6)

```
Phase 5: Offline Engine Tests (16 groups)
├─ IndexedDB persistence
├─ Sync queue conflict resolution
├─ Multi-select filtering
├─ Checklist validation
├─ Timer workflows
├─ Audit log checksums
├─ WR assignment operations
└─ Photo compression

Phase 6: LJ Lifecycle Tests (16 tests)
├─ PM→FJ escalation (cost < 750€)
├─ FJ→LJ escalation (cost ≥ 750€)
├─ Link inheritance (ParentPM_WR_ID, OriginatingFJ_WR_ID)
├─ Acceptance gate transitions (all 7 scenarios)
├─ Role-based authorization (all 10 roles)
├─ Acceptance gate immutability
├─ Cost validation (boundary cases)
└─ Firestore rule enforcement

Total: 37/37 tests passing ✓
```

### Integration Tests (Phase 8+)

```
Planned for Phase 8:
├─ Offline app → Cloud Functions sync
├─ Multi-site isolation enforcement
├─ FJ/LJ creation via mobile UI
├─ Escalation workflow end-to-end
├─ Photo upload queue management
├─ Technical audit form submission
└─ Push notification delivery
```

### Accessibility Tests (Phase 7+)

```
WCAG 2.1 AA Compliance:
├─ Semantic HTML structure
├─ ARIA labels on all interactive elements
├─ Keyboard navigation (Tab, Enter, Escape)
├─ Focus indicators visible
├─ Color contrast ≥4.5:1
├─ Touch targets ≥44x44px
├─ Form labels associated with inputs
└─ Screen reader compatibility
```

---

## Deployment Architecture (Phase 8)

```
┌─────────────────────────────────────────────┐
│         Firebase Project Setup              │
├─────────────────────────────────────────────┤
│                                             │
│  Firestore Database                         │
│  ├─ /buildings/{bl_id}                     │
│  ├─ /floors/{fl_id}                        │
│  ├─ /rooms/{rm_id}                         │
│  ├─ /equipment/{eq_id}                     │
│  ├─ /workRequests/{wr_id}                  │
│  ├─ /pmSchedules/{pm_id}                   │
│  └─ /deskReservations/{desk_id}            │
│                                             │
│  Cloud Functions                            │
│  ├─ escalatePMToFastJob()                  │
│  ├─ escalateFastJobToLongJob()             │
│  ├─ resolveNextAcceptanceSubstatus()       │
│  ├─ updateAcceptanceGateStatus()           │
│  └─ canRoleExecuteLJAction()               │
│                                             │
│  Storage                                    │
│  └─ /photos/{wrId}/                        │
│                                             │
│  Security Rules                             │
│  └─ firestore.rules (280 LOC)              │
│                                             │
│  Authentication                             │
│  ├─ Custom claims: { siteIds, role, etc }  │
│  └─ Firebase Auth UI                       │
│                                             │
└─────────────────────────────────────────────┘
         ▲
         │ (HTTPS)
         │
┌─────────────────────────────────────────────┐
│    Web Portal (Next.js)                     │
│    Deployed: Vercel / Firebase Hosting      │
├─────────────────────────────────────────────┤
│ • /work-requests (LJ management)            │
│ • /admin/rbac (Governance console)          │
│ • /settings (Site/Role config)              │
└─────────────────────────────────────────────┘
         ▲
         │ (HTTPS)
         │
┌─────────────────────────────────────────────┐
│    Mobile App (React)                       │
│    Deployed: Static hosting                 │
├─────────────────────────────────────────────┤
│ • Offline-first via IndexedDB               │
│ • Service Worker for offline HTTP caching   │
│ • Automatic sync when online                │
│ • All 10 components with SiteId isolation   │
└─────────────────────────────────────────────┘
```

---

## Conclusion

**Phases 6 & 7** deliver a complete, scalable architecture for the CAFM Enterprise Platform:

✅ **Phase 6**: Long Job state machine with 29-state workflow, 750 EUR financial escalation, 78%–94% dynamic acceptance gates, multi-site isolation, and role-based access control.

✅ **Phase 7**: Mobile field application with 10 production React components, full offline-first support, SiteId isolation, and PM→FJ→LJ escalation workflow integration.

**Ready for Phase 8**: Firestore integration, photo upload queue, push notifications, and technical audit workflows.
