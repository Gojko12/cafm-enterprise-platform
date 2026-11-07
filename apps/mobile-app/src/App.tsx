import React, { useState, useEffect } from "react";
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
} from "./components";
import { BaseWorkRequest, Building, Floor, Room, Equipment } from "@cafm/shared-schema";
import { useFilterStore } from "./lib/store";
import type { FilterCriteria } from "./lib/store";

type AppView = "home" | "checklist" | "scanner" | "inspection";

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>("home");
  const [activeSiteId, setActiveSiteId] = useState<string>("SITE-01");
  const [currentTechnicianId, setCurrentTechnicianId] = useState<string>("TECH-001");

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

  // Initialize engine and load data
  useEffect(() => {
    const setupApp = async () => {
      try {
        const offlineEngine = initOfflineEngine();
        setEngine(offlineEngine);

        // Load initial data
        const db = await getDB();

        // Load locations
        const buildingsData = await offlineEngine.getBuildings();
        setBuildings(buildingsData);

        let initialFloors: Floor[] = [];
        if (buildingsData.length > 0) {
          initialFloors = await offlineEngine.getFloors(buildingsData[0].bl_id);
          setFloors(initialFloors);

          if (initialFloors.length > 0) {
            const roomsData = await offlineEngine.getRooms(
              buildingsData[0].bl_id,
              initialFloors[0].LevelName
            );
            setRooms(roomsData);
          }
        }

        // Load equipment
        const equipmentData = await offlineEngine.getEquipment();
        setEquipment(equipmentData);

        // Load WRs
        const allWRs = await offlineEngine.getWorkRequests();
        const myWRsData = allWRs.filter((wr) =>
          wr.AssignedUserIds?.includes(currentTechnicianId)
        );
        const unassignedData = allWRs.filter((wr) => !wr.AssignedUserIds?.length);

        setMyWRs(myWRsData);
        setUnassignedWRs(unassignedData);

        console.log("App initialized with", {
          buildings: buildingsData.length,
          floors: initialFloors.length,
          equipment: equipmentData.length,
          myWRs: myWRsData.length,
          unassigned: unassignedData.length,
        });
      } catch (err) {
        console.error("Failed to initialize app:", err);
      }
    };

    setupApp();
  }, []);

  const handleSyncNow = async () => {
    if (engine) {
      // Simulate sync operation
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("Sync completed");
    }
  };

  const handleToggleOfflineMode = (isOffline: boolean) => {
    setIsSimulatedOffline(isOffline);
  };

  const handleClaimWR = (wrId: string) => {
    // Claim work request
    const claimed = unassignedWRs.find((wr) => wr.WR_ID === wrId);
    if (claimed) {
      claimed.AssignedUserIds = [currentTechnicianId];
      setMyWRs([...myWRs, claimed]);
      setUnassignedWRs(unassignedWRs.filter((wr) => wr.WR_ID !== wrId));
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

  const handleApplyFilters = () => {
    // Re-filter WRs based on current filters
    let filtered = [...myWRs];

    if (filters.wrId) {
      filtered = filtered.filter((wr) => wr.WR_ID?.includes(filters.wrId));
    }
    if (filters.trade) {
      filtered = filtered.filter((wr) =>
        (wr.TradeName || "").toLowerCase().includes((filters.trade || "").toLowerCase())
      );
    }
    if (filters.bl_id) {
      filtered = filtered.filter((wr) => wr.bl_id === filters.bl_id);
    }

    setMyWRs(filtered);
  };

  // Render based on current view
  const renderContent = () => {
    switch (currentView) {
      case "checklist":
        return selectedWR ? (
          <ChecklistExecutor
            wr={selectedWR}
            steps={checklistSteps}
            onStepComplete={() => {
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
              currentFilters={filters}
              onFiltersChange={(newFilters) => {
                Object.entries(newFilters).forEach(([key, value]) => {
                  setFilter(key as keyof FilterCriteria, value);
                });
              }}
              onApplyFilters={handleApplyFilters}
            />

            <TechnicianHome
              myWRs={myWRs}
              unassignedWRs={unassignedWRs}
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
