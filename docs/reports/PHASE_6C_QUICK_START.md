# Phase 6C - Quick Start Guide for LJ UI & RBAC Dashboard

## What Was Built
- ✅ Site Context Switcher for multi-site isolation (SITE-01, SITE-02, SITE-03)
- ✅ Long Job Work Request Drawer (create, view, escalate modes)
- ✅ Acceptance Gates Panel (78%-94% workflow with SAT, Drawing, CIFM)
- ✅ RBAC Governance Console (3 tabs: users, role matrix, permissions)
- ✅ Seed data for 3 ESA sites (buildings, floors, rooms, equipment)

## Key Files

| Component | Path | Lines | Purpose |
|-----------|------|-------|---------|
| SiteContextProvider | `lib/contexts/SiteContext.tsx` | 99 | Multi-site isolation + LJ role context |
| LongJobDrawer | `components/modules/long-jobs/LongJobDrawer.tsx` | 376 | Create/view/escalate WRs |
| AcceptanceGatesPanel | `components/modules/long-jobs/AcceptanceGatesPanel.tsx` | 369 | Gate transitions & approvals |
| RBACDashboard | `components/modules/long-jobs/RBACDashboard.tsx` | 463 | Governance console (3 tabs) |
| Work-Requests Page | `app/work-requests/page.tsx` | 267 | Main LJ listing & filter by site |
| RBAC Page | `app/admin/rbac/page.tsx` | 47 | Governance console landing |
| Seed Data | `lib/seed-data.ts` | 261 | 3-site test data |

## Architecture Overview

```
App
├── MainLayout (TopBar with Site Switcher, LJ Role Selector)
│   ├── SiteContextProvider
│   │   ├── useContext() → activeSiteId, activeLJRole, canSwitchSites()
│   │
│   ├── /work-requests
│   │   ├── LongJobDrawer (create | view | escalate)
│   │   ├── AcceptanceGatesPanel (nested in card expansion)
│   │   └── Mock WRs filtered by activeSiteId
│   │
│   └── /admin/rbac
│       └── RBACDashboard (3 tabs)
│           ├── Tab 1: User & Site Access Monitor
│           ├── Tab 2: LJ Role Action Matrix (10 roles × statuses)
│           └── Tab 3: System Module RBAC Matrix
```

## Component Usage

### 1. Using SiteContext in a Component
```tsx
import { useSiteContext } from "@/lib/contexts/SiteContext";

export function MyComponent() {
  const { activeSiteId, availableSites, activeLJRole, canSwitchSites } = useSiteContext();
  
  // Filter data by active site
  const siteData = data.filter(d => d.SiteId === activeSiteId);
  
  // Check if user can switch sites
  if (canSwitchSites()) {
    return <SiteSwitcher sites={availableSites} />;
  }
  
  return <div>Single-site access to {activeSiteId}</div>;
}
```

### 2. Opening LongJobDrawer
```tsx
import { LongJobDrawer } from "@/components/modules/long-jobs/LongJobDrawer";

const [drawerOpen, setDrawerOpen] = useState(false);
const [drawerMode, setDrawerMode] = useState<"create" | "view" | "escalate">("create");
const [selectedWR, setSelectedWR] = useState<BaseWorkRequest | null>(null);

// Create new LJ
const handleCreateLJ = () => {
  setDrawerMode("create");
  setSelectedWR(null);
  setDrawerOpen(true);
};

// View existing LJ
const handleViewLJ = (wr: BaseWorkRequest) => {
  setDrawerMode("view");
  setSelectedWR(wr);
  setDrawerOpen(true);
};

// Escalate FJ to LJ
const handleEscalateFJ = (fj: BaseWorkRequest) => {
  setDrawerMode("escalate");
  setSelectedWR(fj);
  setDrawerOpen(true);
};

return (
  <>
    <button onClick={handleCreateLJ}>+ Create LJ</button>
    <LongJobDrawer
      mode={drawerMode}
      workRequest={selectedWR}
      isOpen={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      onSubmit={(wr) => {
        console.log("Submitted:", wr);
        setDrawerOpen(false);
        // TODO: Save to Firestore
      }}
    />
  </>
);
```

### 3. Displaying AcceptanceGatesPanel
```tsx
import { AcceptanceGatesPanel } from "@/components/modules/long-jobs/AcceptanceGatesPanel";

const [wr, setWR] = useState<BaseWorkRequest>(mockWR);

return (
  <div>
    {wr.Percentage >= 40 && wr.WR_Type === "LJ" && (
      <AcceptanceGatesPanel
        workRequest={wr}
        onGateStatusChange={(gate, newStatus) => {
          console.log(`Gate ${gate} updated to ${newStatus}`);
          // TODO: Persist to Firestore
        }}
      />
    )}
  </div>
);
```

## Cost-Based Escalation Rules

**Fast Rules**:
- **FJ** (Fast Job): < 750 EUR, starts at 50% (standard workflow)
- **LJ** (Long Job): ≥ 750 EUR, starts at 0% (RFQ/RFW workflow)

**Escalation Path**: 
```
FJ@50% → [Escalate] → LJ@10% + OriginatingFJ_WR_ID link
```

**In Drawer**:
- Create mode: auto-switches form based on cost input
- Escalate mode: requires LJ cost ≥ 750 EUR (shows validation error if below)

## 78%-94% Acceptance Gates Workflow

### Gate Configuration (when Percentage < 78%)
```
Three toggles appear:
- Requires SAT (Site Acceptance Test)
- Requires Drawing/Engineering Update
- Requires CIFM Inventory Update
```

### Gate Status Transitions
```
For each gate:
  Pending
    ↓ [Request Review]
  ReviewRequested
    ↓ [Send Invitation]
  InvitationSent
    ↓ [Approve]
  Approved
```

### Auto-Transition Logic
```
"Technically Completed" button:
  if (0 required gates) → jump to 94% (All Acceptances Completed)
  if (≥1 required gate) → go to 78% (Work Ready for Approvals)
  
When last gate approved → auto-advance to 94%
```

## Role-Based Action Visibility

| Role | Drawer Actions | Gates Panel Actions |
|------|---|---|
| **ESA_TO** | Approve & Order, Approve SAT, Final Approval | Approve SAT |
| **ESA_DO** | Approve Drawing/Engineering | Approve Drawing, Edit Assigned User |
| **ESA_IM** | Approve CIFM Inventory | Approve Inventory, Edit Assigned User |
| **TRADE_TM** | Commit, Approve Pre-SAT | Approve Pre-SAT, Send Invitation |
| **TRADE_CM** | Coordinate Contractors | View Only |
| **ESA_LJM** | Full Management | Full Management |
| Others | View Only | View Only |

## Seed Data Structure

### SITE-01: ESOC Darmstadt
```
Building: BL-ESOC-001 / BL-ESOC-002
  Floors: Basement, Ground, F1, F2, F3
    Rooms: GF-HVAC-001 (45m²), GF-ELEC-001 (35m²), GF-LOBBY-001 (80m²), ...
      Equipment: HVAC-ESA-001, ELEC-ESA-001, DOOR-ESA-001, ...
```

### SITE-02: ESTEC Noordwijk
```
Building: BL-ESTEC-001 / BL-ESTEC-002
  Floors: Basement, Ground, F1, F2
    Rooms: GF-HVAC-001, GF-ELEC-001, GF-REC-001, F1-CLASS-001, F1-CLASS-002
      Equipment: HVAC-EST-001, ELEC-EST-001, DOOR-EST-001
```

### SITE-03: ESRIN Frascati
```
Building: BL-ESRIN-001
  Floors: Basement, Ground, F1, F2
    Rooms: B1-ELEC-001, GF-HVAC-001, GF-OFFICE-001, F1-SERVER-001
      Equipment: ELEC-ERI-001, HVAC-ERI-001, SERVER-ERI-001
```

## RBAC Matrix Reference

### Tab 1: User & Site Access
- Add user with multi-site assignment
- Edit assigned sites/roles/trades
- Delete user (revoke access)
- Expandable row shows live permission preview

### Tab 2: LJ Role Action Matrix
- **Columns**: ESA_TO, ESA_TM, ESA_LJM, ESA_CCM, ESA_DO, ESA_IM, TRADE_CM, TRADE_TM, ESA_LONG_JOB, TRADE_LONG_JOB
- **Rows**: 0%, 10%, 20%, 30%, ..., 78%, 94%, 100%
- **Colors**:
  - 🔵 Blue = RFQ phase (0%-28%)
  - 🟢 Green = RFW phase (30%-55%)
  - 🟡 Yellow = Acceptance Gates (78%-94%)
- **Cell Values**: P (Primary), O (Optional), or empty (no access)

### Tab 3: System Module RBAC
- Shows LJ-specific permissions:
  - longJobs.manageRFQ
  - longJobs.manageRFW
  - longJobs.approveAcceptanceGates
  - longJobs.manageSiteContext
- Plus existing system permissions

## TypeScript Types Used

```tsx
// From shared-schema
import {
  BaseWorkRequest,
  WR_Type,
  LJRole,
  SiteId,
  UserAccess,
  Building,
  Floor,
  Room,
  Equipment,
  AcceptanceGates,
} from "@cafm/shared-schema";

// Usage
const wr: BaseWorkRequest = { ... };
const role: LJRole = "ESA_TO";
const site: SiteId = "SITE-01";
```

## Common Tasks

### Filter Work Requests by Site
```tsx
const { activeSiteId } = useSiteContext();
const filteredWRs = workRequests.filter(wr => wr.SiteId === activeSiteId);
```

### Check User Can Perform Action
```tsx
const { activeLJRole } = useSiteContext();
const canApprove = activeLJRole === "ESA_TO" || activeLJRole === "ESA_LJM";
if (canApprove) {
  return <ApproveButton />;
}
```

### Get Cost Threshold Status
```tsx
const isFJ = wr.EstimatedCostEur < 750;
const isLJ = wr.EstimatedCostEur >= 750;
```

### Check Gate Requirements
```tsx
const gatesRequired = [
  wr.RequiresSAT,
  wr.RequiresDrawingUpdate,
  wr.RequiresInventoryUpdate,
].filter(Boolean).length;

if (gatesRequired === 0) {
  // Jump to 94% when "Technically Completed" clicked
} else {
  // Jump to 78% when "Technically Completed" clicked
}
```

## Known Limitations & Next Steps

### Current State (MVP)
- ✅ Client-side mock data only
- ✅ No database persistence
- ✅ No email notifications
- ✅ No PDF export (Yellow Page)
- ✅ No audit logging

### Next Phase Priorities
1. **API Integration** → Replace mock data with Firestore CRUD
2. **PDF Generation** → Implement Yellow Page print
3. **Email Notifications** → Gate approval workflows
4. **Audit Logging** → Track all LJ state changes
5. **Advanced Filters** → Status, cost range, gate state filters

## Testing Locally

### Start Dev Server
```bash
cd apps/web-portal
npm run dev
```

### Navigate to Pages
- Work-Requests: http://localhost:3000/work-requests
- RBAC Dashboard: http://localhost:3000/admin/rbac

### Mock Users (in RBAC Page)
- John ESOC Manager: ESA_TO role, access SITE-01 only
- Marie ESTEC Manager: ESA_TM role, access SITE-02 only
- Admin (All Sites): SiteAdministrator role, access all 3 sites

### Test Scenarios
1. **Single-site user**: Log in as John → Site switcher disabled, "Site Isolation Active" shows
2. **Multi-site user**: Log in as Admin → Site switcher enabled, can switch SITE-01/02/03
3. **Create LJ**: Click "+ Create LJ" → Enter cost ≥ 750 EUR → Select location → Configure gates
4. **Escalate FJ**: View FJ record → "Escalate to LJ" button → Enter LJ cost ≥ 750 EUR
5. **Acceptance Gates**: View LJ at 0-77% → Toggle SAT/Drawing/CIFM → Set to 78% (if gates required)
6. **RBAC Matrix**: Tab 2 → Verify P/O/empty cells for each role/status combo

## Support & Documentation

- Full implementation report: `PHASE_6_TASK_C_COMPLETION.md`
- MASTER_SPEC reference: Section 11 (lines 125-256)
- Shared schema: `packages/shared-schema/src/{work-requests,rbac,locations,equipment}.ts`

---

**Last Updated**: 2026-11-06  
**Build Status**: ✅ All components passing TypeScript strict mode
