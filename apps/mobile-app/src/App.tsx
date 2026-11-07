import React, { useState, useEffect, useCallback, useRef } from "react";
import { initOfflineEngine, OfflineEngine } from "./lib/offline-engine";
import { getDB } from "./lib/db";
import {
  MobileHeader,
  TechnicianHome,
  AdvancedFilterPanel,
  ChecklistExecutor,
  QRScanner,
  EquipmentInspectionView,
  PM_StepDefinition,
  PM_StepExecutionValue,
} from "./components";
import {
  BaseWorkRequest,
  Building,
  Floor,
  Room,
  Equipment,
  SiteId,
  WR_Statuses,
} from "@cafm/shared-schema";
import { applyFilters, useFilterStore } from "./lib/store";
import type { FilterCriteria } from "./lib/store";

type AppView = "home" | "checklist" | "scanner" | "inspection";

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>("home");
  const [activeSiteId, setActiveSiteId] = useState<SiteId>("SITE-01");
  const [currentTechnicianId, setCurrentTechnicianId] = useState<string>("TECH-001");
  const activeSelection = useRef({ activeSiteId, currentTechnicianId });
  activeSelection.current = { activeSiteId, currentTechnicianId };

  // State
  const [engine, setEngine] = useState<OfflineEngine | null>(null);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);
  const [myWRs, setMyWRs] = useState<BaseWorkRequest[]>([]);
  const [unassignedWRs, setUnassignedWRs] = useState<BaseWorkRequest[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);

  // Selected items for views
  const [selectedWR, setSelectedWR] = useState<BaseWorkRequest | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [checklistSteps, setChecklistSteps] = useState<PM_StepDefinition[]>([]);

  // Filters
  const filters = useFilterStore((state) => state.filters);
  const setFilter = useFilterStore((state) => state.setFilter);
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const refreshData = useCallback(async () => {
    const db = await getDB();
    const [storedBuildings, storedFloors, storedRooms, storedEquipment, storedRequests] = await Promise.all([
      db.getAll("buildings"), db.getAll("floors"), db.getAll("rooms"),
      db.getAll("equipment"), db.getAll("workRequests"),
    ]);
    if (activeSelection.current.activeSiteId !== activeSiteId ||
        activeSelection.current.currentTechnicianId !== currentTechnicianId) return;
    setBuildings(storedBuildings.filter((item) => item.SiteId === activeSiteId));
    setFloors(storedFloors.filter((item) => item.SiteId === activeSiteId));
    setRooms(storedRooms.filter((item) => item.SiteId === activeSiteId));
    setEquipment(storedEquipment.filter((item) => item.SiteId === activeSiteId));
    const siteRequests = storedRequests.filter((item) => item.SiteId === activeSiteId);
    setMyWRs(siteRequests.filter((wr) => wr.AssignedUserIds?.includes(currentTechnicianId)));
    setUnassignedWRs(siteRequests.filter((wr) => !wr.AssignedUserIds?.length));
  }, [activeSiteId, currentTechnicianId]);

  useEffect(() => {
    setEngine(initOfflineEngine());
  }, []);

  useEffect(() => {
    if (!engine) return;
    engine.configureSync(activeSiteId, currentTechnicianId, isSimulatedOffline);
    void refreshData().catch((error) => console.error("Could not load offline data:", error));
    if (isSimulatedOffline) return;
    const sync = () => {
      void engine.syncNow().then(refreshData).catch((error) => console.error("Background sync failed:", error));
    };
    sync();
    const interval = window.setInterval(sync, 30000);
    return () => window.clearInterval(interval);
  }, [engine, activeSiteId, currentTechnicianId, isSimulatedOffline, refreshData]);

  const handleSyncNow = async () => {
    if (!engine) throw new Error("The offline engine is not ready.");
    const result = await engine.syncNow();
    await refreshData();
    return result;
  };

  const handleToggleOfflineMode = (isOffline: boolean) => {
    setIsSimulatedOffline(isOffline);
  };

  const handleClaimWR = async (wrId: string) => {
    const claimed = unassignedWRs.find((wr) => wr.WR_ID === wrId);
    if (!claimed || !engine) return;
    try {
      await engine.saveWorkRequest({ ...claimed, AssignedUserIds: [currentTechnicianId] }, claimed);
      await refreshData();
    } catch (error) {
      console.error("Could not claim work request:", error);
      alert("Could not save the work request assignment.");
    }
  };

  const handleOpenWR = (wrId: string) => {
    const wr = [...myWRs, ...unassignedWRs].find((w) => w.WR_ID === wrId);
    if (wr) {
      setSelectedWR(wr);
      // Generate sample checklist steps
      setChecklistSteps([
        {
          StepId: "step-1",
          StepNumber: 1,
          StepTitle: "Visual Inspection",
          InputType: "Boolean",
        },
        {
          StepId: "step-2",
          StepNumber: 2,
          StepTitle: "Measure Voltage",
          InputType: "Numeric",
          MinThreshold: 200,
          MaxThreshold: 250,
          Unit: "V",
        },
        {
          StepId: "step-3",
          StepNumber: 3,
          StepTitle: "Test Function",
          InputType: "SingleSelect",
          Options: [
            { OptionId: "opt-1", OptionValue: "Working correctly" },
            { OptionId: "opt-2", OptionValue: "Needs adjustment" },
            { OptionId: "opt-3", OptionValue: "Requires replacement" },
          ],
        },
      ]);
      setCurrentView("checklist");
    }
  };

  const handleScanEquipment = (equipmentCode: string) => {
    const eq = equipment.find((e) => e.EquipmentCode === equipmentCode);
    if (eq) {
      setSelectedEquipment(eq);
      setCurrentView("inspection");
    } else {
      alert(`Equipment ${equipmentCode} not found`);
    }
  };

  const persistCreatedRequest = async (request: BaseWorkRequest) => {
    if (!engine) {
      throw new Error("The offline work request store is not ready yet.");
    }
    await engine.saveWorkRequest(request, null);
    setMyWRs((current) => [...current, request]);
  };

  const handleCreateMobileFJ = async (job: {
    equipmentCode: string;
    bl_id: string;
    levelName: string;
    roomCode: string;
    description: string;
    photoUrl?: string;
  }) => {
    const issued = WR_Statuses.find(
      (status) =>
        status.Percentage === 50 &&
        status.ESAWorkType === "Corrective Maintenance",
    );
    if (!issued) throw new Error("Issued status configuration is missing.");
    const now = new Date().toISOString();
    const request: BaseWorkRequest = {
      WR_ID: `FJ-${Date.now()}`,
      JobID: `JOB-${Date.now()}`,
      WR_Type: "FJ",
      ESAWorkType: issued.ESAWorkType,
      Description: job.description,
      ProblemLocation: `${job.bl_id} / ${job.levelName} / ${job.roomCode}`,
      EquipmentCodes: [job.equipmentCode],
      TotalTimeMinutes: 0,
      CreatedDate: now.slice(0, 10),
      WorkRequestStatus: issued.WorkRequestStatus,
      WorkRequestSubstatus: issued.WorkRequestSubstatus,
      Percentage: issued.Percentage,
      bl_id: job.bl_id,
      LevelName: job.levelName,
      RoomCode: job.roomCode,
      SiteId: activeSiteId,
      AssignedCraftpersonIds: [],
      AssignedUserIds: [currentTechnicianId],
      CreatedBy: currentTechnicianId,
      IsFrozen: false,
      StartDateTBD: false,
      RequiresSAT: false,
      RequiresDrawingUpdate: false,
      RequiresInventoryUpdate: false,
      AcceptanceGates: [],
      UpdatedAt: now,
      Attachments: job.photoUrl ? [{ id: crypto.randomUUID(), name: "Fast job photo", type: "image", dataUrl: job.photoUrl }] : [],
    };
    await persistCreatedRequest(request);
  };

  const handleCreateMobileLJ = async (job: {
    equipmentCodes: string[];
    bl_id: string;
    levelName: string;
    roomCode?: string;
    description: string;
  }) => {
    const now = new Date().toISOString();
    const request: BaseWorkRequest = {
      WR_ID: `LJ-${Date.now()}`,
      JobID: `JOB-${Date.now()}`,
      WR_Type: "LJ",
      ESAWorkType: "Corrective Maintenance",
      Description: job.description,
      ProblemLocation: `${job.bl_id} / ${job.levelName}${job.roomCode ? ` / ${job.roomCode}` : ""}`,
      EquipmentCodes: job.equipmentCodes,
      TotalTimeMinutes: 0,
      CreatedDate: now.slice(0, 10),
      WorkRequestStatus: "Requested",
      WorkRequestSubstatus: "New Request for Quotation",
      Percentage: 0,
      bl_id: job.bl_id,
      LevelName: job.levelName,
      RoomCode: job.roomCode,
      SiteId: activeSiteId,
      AssignedCraftpersonIds: [],
      AssignedUserIds: [currentTechnicianId],
      CreatedBy: currentTechnicianId,
      IsFrozen: false,
      StartDateTBD: false,
      RequiresSAT: false,
      RequiresDrawingUpdate: false,
      RequiresInventoryUpdate: false,
      AcceptanceGates: [],
      UpdatedAt: now,
    };
    await persistCreatedRequest(request);
  };

  const handleApplyFilters = () => {
    setAppliedFilters(useFilterStore.getState().filters);
  };

  // Render based on current view
  const renderContent = () => {
    switch (currentView) {
      case "checklist":
        return selectedWR ? (
          <ChecklistExecutor
            wr={selectedWR}
            steps={checklistSteps}
            onStepComplete={async (stepValues: PM_StepExecutionValue[]) => {
              if (!engine) throw new Error("Offline storage is not ready. Please try again.");
              const now = new Date().toISOString();
              const actorName = currentTechnicianId;
              const checklistResults = stepValues.map((result) => ({
                stepId: result.StepId,
                value: typeof result.Value === "boolean" ? String(result.Value) : result.Value,
                passed: result.Passed,
                completedAt: result.Timestamp,
                ...(result.PhotoUrl ? { photoPaths: [result.PhotoUrl] } : {}),
                ...(result.TechnicianComment ? { comment: result.TechnicianComment } : {}),
              }));
              const completedInstances = selectedWR.ChecklistInstances?.map((instance) => {
                const answer = stepValues.find((item) => item.StepId === instance.StepId);
                if (!answer) return instance;
                const values = Array.isArray(answer.Value) ? answer.Value : [answer.Value];
                return {
                  ...instance,
                  ValueBoolean: instance.InputType === "Boolean" && typeof answer.Value === "boolean" ? answer.Value : undefined,
                  ValueNumeric: instance.InputType === "Numeric" && typeof answer.Value === "number" ? answer.Value : undefined,
                  ValueText: instance.InputType === "FreeText" && typeof answer.Value === "string" ? answer.Value : undefined,
                  SelectedOptionIds: instance.InputType === "SingleSelect" || instance.InputType === "MultiSelect"
                    ? values.map((value) => instance.Options.find((option) => option.Value === String(value))?.OptionId)
                      .filter((id): id is string => id !== undefined)
                    : undefined,
                  PhotoIds: answer.PhotoUrl
                    ? [...instance.PhotoIds, `ChecklistResults/${instance.StepId}/${now}`]
                    : instance.PhotoIds,
                  TechnicianComment: answer.TechnicianComment,
                  IsFailed: !answer.Passed,
                  IsCompleted: true,
                  CompletedBy: currentTechnicianId,
                  CompletedAt: now,
                };
              });
              const savedWR: BaseWorkRequest = {
                ...selectedWR,
                ChecklistCompleted: true,
                ChecklistResults: checklistResults,
                ChecklistInstances: completedInstances,
                StepAuditLogs: [
                  ...(selectedWR.StepAuditLogs ?? []),
                  ...(completedInstances ?? []).filter((step) => step.IsCompleted).map((step) => ({
                    AuditLogId: crypto.randomUUID(),
                    StepInstanceId: step.StepInstanceId,
                    WR_ID: selectedWR.WR_ID,
                    ActorId: currentTechnicianId,
                    Action: "completed" as const,
                    OccurredAt: now,
                  })),
                ],
                ChecklistHistory: [
                  ...(selectedWR.ChecklistHistory ?? []),
                  {
                    id: crypto.randomUUID(),
                    timestamp: now,
                    performedBy: actorName,
                    actionType: "Checklist completed",
                    details: `${checklistResults.length} of ${checklistSteps.length} steps answered`,
                  },
                ],
                UpdatedAt: now,
                Activity: [
                  ...(selectedWR.Activity ?? []),
                  {
                    id: crypto.randomUUID(),
                    kind: "log",
                    actorId: currentTechnicianId,
                    actorName,
                    actorRole: "MobileTechnician",
                    createdAt: now,
                    text: `Checklist finished by ${actorName}`,
                  },
                ],
              };
              await engine.saveWorkRequest(savedWR, selectedWR);
              setMyWRs((current) => current.map((wr) => wr.WR_ID === savedWR.WR_ID ? savedWR : wr));
              setUnassignedWRs((current) => current.map((wr) => wr.WR_ID === savedWR.WR_ID ? savedWR : wr));
              setCurrentView("home");
              setSelectedWR(null);
            }}
            onClose={() => {
              setCurrentView("home");
              setSelectedWR(null);
            }}
          />
        ) : null;

      case "scanner":
        return (
          <QRScanner
            onScanComplete={handleScanEquipment}
            onCancel={() => setCurrentView("home")}
          />
        );

      case "inspection":
        return selectedEquipment ? (
          <EquipmentInspectionView
            equipment={selectedEquipment}
            activeWRs={[]}
            historicalWRs={[]}
            buildings={buildings}
            floors={floors}
            rooms={rooms}
            equipmentList={equipment}
            onCreateFJ={handleCreateMobileFJ}
            onCreateLJ={handleCreateMobileLJ}
            onClose={() => {
              setCurrentView("home");
              setSelectedEquipment(null);
            }}
          />
        ) : null;

      case "home":
      default:
        return (
          <div className="pt-40 pb-20">
            <AdvancedFilterPanel
              buildings={buildings}
              floors={floors}
              rooms={rooms}
              equipment={equipment}
              currentFilters={filters}
              onFiltersChange={(newFilters) => {
                Object.entries(newFilters).forEach(([key, value]) => {
                  setFilter(key as keyof FilterCriteria, value);
                });
              }}
              onApplyFilters={handleApplyFilters}
            />

            <TechnicianHome
              myWRs={applyFilters(myWRs, appliedFilters)}
              unassignedWRs={applyFilters(unassignedWRs, appliedFilters)}
              onClaimWR={handleClaimWR}
              onOpenWR={handleOpenWR}
            />
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-50 mobile-app">
      {/* Header */}
      <MobileHeader
        activeSiteId={activeSiteId}
        onSiteChange={(site) => {
          if (currentView !== "home") {
            alert("Return to the work request list before switching sites.");
            return;
          }
          setActiveSiteId(site);
        }}
        onSyncNow={handleSyncNow}
        isSimulatedOffline={isSimulatedOffline}
        onToggleOfflineMode={handleToggleOfflineMode}
      />

      {/* Main Content */}
      <main className="h-screen overflow-hidden flex flex-col">{renderContent()}</main>

      {/* Bottom Navigation Tabs */}
      {currentView === "home" && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-center justify-around z-40 mobile-nav">
          <button
            onClick={() => setCurrentView("home")}
            className="flex-1 py-3 text-center hover:bg-gray-50 transition-colors"
            aria-label="Home tab"
            aria-current={currentView === "home" ? "page" : undefined}
          >
            <div className="text-xl">📋</div>
            <div className="text-xs font-medium text-gray-700">Work Requests</div>
          </button>
          <button
            onClick={() => setCurrentView("scanner")}
            className="flex-1 py-3 text-center hover:bg-gray-50 transition-colors"
            aria-label="Scanner tab"
          >
            <div className="text-xl">📱</div>
            <div className="text-xs font-medium text-gray-700">Scan QR</div>
          </button>
          <button
            className="flex-1 py-3 text-center hover:bg-gray-50 transition-colors opacity-50 cursor-not-allowed"
            aria-label="Reports tab (disabled)"
            title="Coming in next phase"
          >
            <div className="text-xl">📊</div>
            <div className="text-xs font-medium text-gray-700">Reports</div>
          </button>
          <button
            className="flex-1 py-3 text-center hover:bg-gray-50 transition-colors opacity-50 cursor-not-allowed"
            aria-label="Settings tab (disabled)"
            title="Coming in next phase"
          >
            <div className="text-xl">⚙️</div>
            <div className="text-xs font-medium text-gray-700">Settings</div>
          </button>
        </nav>
      )}
    </div>
  );
}
