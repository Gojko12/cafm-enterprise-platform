# Phase 7 Mobile App - Developer Quick Reference

## Running the Mobile App

```bash
# Development mode
cd apps/mobile-app
npm run dev
# Opens at http://localhost:3001

# Production build
npm run build
# Output in dist/

# Type checking
npm run type-check

# Run tests
npm run test
```

## Component Usage Examples

### MobileHeader
```tsx
<MobileHeader
  activeSiteId="SITE-01"
  onSyncNow={handleSync}
  isSimulatedOffline={false}
  onToggleOfflineMode={(isOffline) => setOffline(isOffline)}
/>
```

### TechnicianHome
```tsx
<TechnicianHome
  myWRs={assignedWRs}
  unassignedWRs={unassignedWRs}
  onClaimWR={(wrId) => claimWorkRequest(wrId)}
  onOpenWR={(wrId) => openDetailView(wrId)}
/>
```

### ChecklistExecutor
```tsx
<ChecklistExecutor
  wr={selectedWorkRequest}
  steps={checklistSteps}
  onStepComplete={(values) => submitChecklist(values)}
  onOpenFollowUpFJ={() => createFastJob()}
  onEscalateLJ={() => createLongJob()}
/>
```

### QRScanner
```tsx
<QRScanner
  onScanComplete={(equipmentCode) => openEquipmentView(equipmentCode)}
  onCancel={() => closeScanner()}
/>
```

### EquipmentInspectionView
```tsx
<EquipmentInspectionView
  equipment={selectedEquipment}
  activeWRs={activeWorkRequests}
  historicalWRs={completedWorkRequests}
  onStartPM={() => startPreventiveMaintenance()}
  onCreateFJ={() => createFastJob()}
  onCreateLJ={() => createLongJob()}
/>
```

## Key Data Structures

### BaseWorkRequest
```typescript
{
  WR_ID: "2026000001",
  WR_Type: "PM" | "FJ" | "LJ",
  Description: "HVAC Maintenance",
  TradeName: "Electrical",
  DueDate: "2026-11-15T00:00:00Z",
  MarginDate: "2026-11-14T00:00:00Z",
  Percentage: 50, // 50=Issued, 78=Technical Complete, 100=Closed
  AssignedUserIds: ["TECH-001"],
  bl_id: "BL-001",
  LevelName: "Floor 1",
  RoomCode: "ROOM-001"
}
```

### Equipment
```typescript
{
  EquipmentCode: "EQP-2026-00001",
  EquipmentName: "HVAC Unit #1",
  bl_id: "BL-001",
  SiteId: "SITE-01",
  LevelName: "Floor 1",
  RoomCode: "ROOM-001",
  Manufacturer: "Carrier",
  Model: "50RQ048",
  SerialNumber: "ABC123456"
}
```

### PM_StepDefinition
```typescript
{
  StepId: "step-1",
  StepNumber: 1,
  StepTitle: "Visual Inspection",
  InputType: "Boolean" | "Numeric" | "SingleSelect" | "MultiSelect" | "FreeText",
  MinThreshold?: 200,      // For Numeric type
  MaxThreshold?: 250,
  Unit?: "V",
  Options?: [              // For Select types
    { OptionId: "opt-1", OptionValue: "Pass" }
  ]
}
```

## Offline Engine API

```typescript
const engine = initOfflineEngine();

// Work Requests
await engine.getWorkRequests();
await engine.getWorkRequest(wrId);
await engine.saveWorkRequest(wr);

// Location Hierarchy
await engine.getBuildings();
await engine.getFloors(bl_id);
await engine.getRooms(bl_id, levelName);

// Equipment
await engine.getEquipment();
await engine.saveEquipment(equipment);

// Photos
const queueId = await engine.queuePhotoUpload(wrId, dataUrl, size);
await engine.getPendingPhotos();

// Sync
const pendingCount = await engine.getPendingSyncItems();
await engine.syncNow();

// Event listeners
engine.onOnlineStatusChange((isOnline) => {});
engine.onSyncStatusChange((status) => {});
```

## Filter Store API

```typescript
import { useFilterStore } from "@/lib/store";

const filters = useFilterStore((state) => state.filters);
const setFilter = useFilterStore((state) => state.setFilter);
const resetFilters = useFilterStore((state) => state.resetFilters);

// Set a filter
setFilter("bl_id", "BL-001");
setFilter("trade", "Electrical");

// Reset all
resetFilters();
```

## Responsive Breakpoints

- **Mobile:** 360px - 480px
- **Tablet:** 481px - 768px
- **Desktop:** 769px+

All components use Tailwind's `@media` breakpoints. Example:

```tsx
<div className="text-sm md:text-base lg:text-lg">
  Responsive text
</div>
```

## Mobile Safe Areas

For notched devices, use:

```tsx
<div className="pt-safe pl-safe pr-safe pb-safe">
  Content with safe area insets
</div>
```

## Animation Classes

```css
.animation-slide-up    /* Toast notifications */
```

## Common Patterns

### Loading State
```tsx
const [isLoading, setIsLoading] = useState(false);

<button disabled={isLoading}>
  {isLoading ? "Loading..." : "Action"}
</button>
```

### Toast Notification
```tsx
const [showToast, setShowToast] = useState(false);

<div className="animation-slide-up bg-green-500 text-white rounded p-4">
  Success message
</div>

setTimeout(() => setShowToast(false), 3000);
```

### Modal
```tsx
{showModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
    <div className="bg-white rounded-lg p-6">
      Modal content
    </div>
  </div>
)}
```

## Development Tips

1. **Always check TypeScript:** `npm run type-check` before committing
2. **Mobile first:** Test at 375px width in DevTools
3. **Accessible:** Use semantic HTML, test with keyboard only
4. **Offline:** Toggle offline mode in header to test offline behaviors
5. **Data flow:** Use Zustand stores for shared state, props for component-level

## Folder Structure

```
src/
├── App.tsx              # Main app with routing
├── main.tsx             # Entry point
├── index.css            # Tailwind styles
├── components/          # 9 reusable components
│   ├── MobileHeader.tsx
│   ├── TechnicianHome.tsx
│   ├── WRPreviewCard.tsx
│   ├── AdvancedFilterPanel.tsx
│   ├── MultiSelectEquipmentPicker.tsx
│   ├── WorkSessionTimer.tsx
│   ├── QRScanner.tsx
│   ├── EquipmentInspectionView.tsx
│   ├── ChecklistExecutor.tsx
│   └── index.ts
└── lib/                 # Phase 5 utilities (unchanged)
    ├── offline-engine.ts
    ├── db.ts
    ├── checklist.ts
    ├── store.ts
    └── offline-engine.test.ts
```

## Performance Optimization

- Equipment lists use pagination (show first 10)
- WR lists use virtualization (render visible items)
- Images compressed before upload
- CSS is tree-shaken by Vite

## Troubleshooting

| Issue | Solution |
|---|---|
| Build fails | `npm run type-check` to identify TS errors |
| Components not styling | Verify Tailwind config content paths |
| Offline mode broken | Check OfflineEngine initialization |
| WRs not loading | Verify IndexedDB in DevTools (Application tab) |
| Photos not saving | Check browser storage quota |

---

**Last Updated:** 2026-11-07  
**For Questions:** See PHASE_7_DELIVERY.md
