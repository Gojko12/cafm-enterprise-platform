"use client";

import React, { useState } from "react";
import { Plus, MoreVertical, ArrowUp, Eye } from "lucide-react";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { LongJobDrawer } from "@/components/modules/long-jobs/LongJobDrawer";
import { AcceptanceGatesPanel } from "@/components/modules/long-jobs/AcceptanceGatesPanel";
import { BaseWorkRequest, WR_Type } from "@cafm/shared-schema";

const mockWorkRequests: BaseWorkRequest[] = [
  {
    WR_ID: "LJ-001-2026",
    JobID: "JOB-001",
    WR_Type: "LJ",
    ESAWorkType: "Corrective Maintenance",
    Description: "HVAC System Replacement - Darmstadt Building A",
    ProblemLocation: "Building A / Floor 3 / HVAC Room",
    EstimatedCostEur: 2500,
    CreatedDate: "2026-11-01",
    WorkRequestStatus: "Requested",
    WorkRequestSubstatus: "New Request for Quotation",
    Percentage: 0,
    SiteId: "SITE-01",
    bl_id: "BL-001",
    LevelName: "Floor 3",
    RoomCode: "HVAC-001",
    AssignedCraftpersonIds: [],
    AssignedUserIds: ["user-001"],
    CreatedBy: "user-001",
    RequiresSAT: true,
    RequiresDrawingUpdate: true,
    RequiresInventoryUpdate: false,
    AcceptanceGates: [],
    UpdatedAt: "2026-11-06",
    IsFrozen: false,
    EquipmentCodes: [],
    TotalTimeMinutes: 0,
    StartDateTBD: false,
  },
  {
    WR_ID: "FJ-002-2026",
    WR_Type: "FJ",
    ESAWorkType: "Corrective Maintenance",
    Description: "Door Repair - Noordwijk Reception",
    ProblemLocation: "Main Reception",
    EstimatedCostEur: 450,
    CreatedDate: "2026-10-20",
    WorkRequestStatus: "Issued",
    WorkRequestSubstatus: "Issued",
    Percentage: 50,
    SiteId: "SITE-02",
    bl_id: "BL-002",
    LevelName: "Floor 1",
    RoomCode: "REC-001",
    AssignedCraftpersonIds: [],
    AssignedUserIds: ["user-002"],
    CreatedBy: "user-002",
    UpdatedAt: "2026-11-05",
    IsFrozen: false,
    EquipmentCodes: [],
    TotalTimeMinutes: 0,
    StartDateTBD: false,
    RequiresSAT: false,
    RequiresDrawingUpdate: false,
    RequiresInventoryUpdate: false,
    AcceptanceGates: [],
  },
  {
    WR_ID: "LJ-003-2026",
    WR_Type: "LJ",
    ESAWorkType: "Corrective Maintenance",
    Description: "Electrical Grid Upgrade - Frascati Building C",
    ProblemLocation: "Building C / Electrical Room",
    EstimatedCostEur: 4500,
    CreatedDate: "2026-10-15",
    WorkRequestStatus: "Issued",
    WorkRequestSubstatus: "Issued and In Process",
    Percentage: 50,
    SiteId: "SITE-03",
    bl_id: "BL-003",
    LevelName: "Basement",
    RoomCode: "ELEC-001",
    AssignedCraftpersonIds: ["tech-001", "tech-002"],
    AssignedUserIds: ["user-003"],
    CreatedBy: "user-003",
    RequiresSAT: true,
    RequiresDrawingUpdate: true,
    RequiresInventoryUpdate: true,
    AcceptanceGates: [],
    UpdatedAt: "2026-11-04",
    IsFrozen: false,
    EquipmentCodes: [],
    TotalTimeMinutes: 0,
    StartDateTBD: false,
  },
];

export default function WorkRequestsPage() {
  const { activeSiteId, activeLJRole } = useSiteContext();
  const [workRequests, setWorkRequests] = useState<BaseWorkRequest[]>(
    mockWorkRequests
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "view" | "escalate">(
    "create"
  );
  const [selectedWR, setSelectedWR] = useState<BaseWorkRequest | null>(null);
  const [selectedForGates, setSelectedForGates] = useState<BaseWorkRequest | null>(null);

  // Filter by active site
  const filteredRequests = workRequests.filter((wr) => wr.SiteId === activeSiteId);

  const handleCreateLJ = () => {
    setSelectedWR(null);
    setDrawerMode("create");
    setDrawerOpen(true);
  };

  const handleViewWR = (wr: BaseWorkRequest) => {
    setSelectedWR(wr);
    setDrawerMode("view");
    setDrawerOpen(true);
  };

  const handleEscalateToLJ = (wr: BaseWorkRequest) => {
    setSelectedWR(wr);
    setDrawerMode("escalate");
    setDrawerOpen(true);
  };

  const handleSubmitWR = (wr: Partial<BaseWorkRequest>) => {
    if (drawerMode === "create") {
      const newWR: BaseWorkRequest = {
        WR_ID: wr.WR_ID || `LJ-${Math.random().toString(36).substring(7).toUpperCase()}-2026`,
        JobID: wr.JobID || `JOB-${Date.now()}`,
        WR_Type: "LJ",
        ESAWorkType: wr.ESAWorkType || "Corrective Maintenance",
        Description: wr.Description || "New Long Job",
        ProblemLocation: wr.ProblemLocation,
        CreatedDate: wr.CreatedDate || new Date().toISOString().split("T")[0],
        WorkRequestStatus: "Requested",
        WorkRequestSubstatus: "New Request for Quotation",
        Percentage: 0,
        SiteId: activeSiteId,
        bl_id: wr.bl_id || "BL-001",
        LevelName: wr.LevelName || "Floor 1",
        RoomCode: wr.RoomCode || "WR-001",
        AssignedCraftpersonIds: [],
        AssignedUserIds: [],
        CreatedBy: "current-user",
        IsFrozen: false,
        EquipmentCodes: wr.EquipmentCodes || [],
        TotalTimeMinutes: wr.TotalTimeMinutes || 0,
        StartDateTBD: false,
        RequiresSAT: wr.RequiresSAT || false,
        RequiresDrawingUpdate: wr.RequiresDrawingUpdate || false,
        RequiresInventoryUpdate: wr.RequiresInventoryUpdate || false,
        AcceptanceGates: wr.AcceptanceGates || [],
        EstimatedCostEur: wr.EstimatedCostEur,
      };
      setWorkRequests([...workRequests, newWR]);
    } else if (drawerMode === "escalate" && selectedWR) {
      const ljWR: BaseWorkRequest = {
        ...selectedWR,
        WR_ID: `LJ-${Math.random().toString(36).substring(7).toUpperCase()}-2026`,
        WR_Type: "LJ",
        OriginatingFJ_WR_ID: selectedWR.WR_ID,
        Percentage: 10,
        WorkRequestStatus: "Requested",
        WorkRequestSubstatus: "Work Request from Fast Job - On Hold",
        EstimatedCostEur: wr.EstimatedCostEur || selectedWR.EstimatedCostEur,
        RequiresSAT: wr.RequiresSAT !== undefined ? wr.RequiresSAT : selectedWR.RequiresSAT || false,
        RequiresDrawingUpdate: wr.RequiresDrawingUpdate !== undefined ? wr.RequiresDrawingUpdate : selectedWR.RequiresDrawingUpdate || false,
        RequiresInventoryUpdate: wr.RequiresInventoryUpdate !== undefined ? wr.RequiresInventoryUpdate : selectedWR.RequiresInventoryUpdate || false,
      };
      setWorkRequests([...workRequests, ljWR]);
    }
  };

  const handleGateStatusChange = (
    wrId: string,
    newPercentage: number,
    updates: Partial<BaseWorkRequest>
  ) => {
    setWorkRequests(
      workRequests.map((wr) =>
        wr.WR_ID === wrId
          ? { ...wr, Percentage: newPercentage, ...updates }
          : wr
      )
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Work Requests</h1>
          <p className="text-gray-600 mt-1">
            Manage Long Jobs (LJ), Fast Jobs (FJ), and PM Work Requests
          </p>
        </div>
        <button
          onClick={handleCreateLJ}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          <Plus size={20} />
          Create LJ
        </button>
      </div>

      {/* Site Filter Badge */}
      <div className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
        Viewing: {activeSiteId}
      </div>

      {/* Work Requests List */}
      <div className="grid gap-4">
        {filteredRequests.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-600">
              No work requests for {activeSiteId}. Create one to get started.
            </p>
          </div>
        ) : (
          filteredRequests.map((wr) => (
            <div
              key={wr.WR_ID}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Card Header */}
              <div className="p-4 flex items-start justify-between border-b border-gray-100">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {wr.WR_ID}
                    </h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        wr.WR_Type === "LJ"
                          ? "bg-orange-100 text-orange-800"
                          : wr.WR_Type === "FJ"
                          ? "bg-green-100 text-green-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {wr.WR_Type}
                    </span>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {wr.Percentage}%
                    </span>
                  </div>
                  <p className="text-gray-700">{wr.Description}</p>
                  <p className="text-sm text-gray-600 mt-1">{wr.ProblemLocation}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewWR(wr)}
                    className="p-2 hover:bg-gray-100 rounded-lg text-blue-600"
                  >
                    <Eye size={20} />
                  </button>
                  {wr.WR_Type === "FJ" && wr.EstimatedCostEur! >= 750 && (
                    <button
                      onClick={() => handleEscalateToLJ(wr)}
                      className="p-2 hover:bg-gray-100 rounded-lg text-orange-600"
                      title="Escalate to Long Job"
                    >
                      <ArrowUp size={20} />
                    </button>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 bg-gray-50 space-y-2">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Status</p>
                    <p className="font-medium text-gray-900">
                      {wr.WorkRequestSubstatus}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Estimated Cost</p>
                    <p className="font-medium text-gray-900">
                      {wr.EstimatedCostEur} EUR
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Created</p>
                    <p className="font-medium text-gray-900">{wr.CreatedDate}</p>
                  </div>
                </div>

                {/* Acceptance Gates Info */}
                {wr.WR_Type === "LJ" && (wr.RequiresSAT || wr.RequiresDrawingUpdate || wr.RequiresInventoryUpdate) && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-700 mb-2">
                      Required Gates:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {wr.RequiresSAT && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                          SAT
                        </span>
                      )}
                      {wr.RequiresDrawingUpdate && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                          Drawing/Eng
                        </span>
                      )}
                      {wr.RequiresInventoryUpdate && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                          CIFM Inventory
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Acceptance Gates Panel Toggle */}
                {wr.WR_Type === "LJ" && wr.Percentage >= 40 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <button
                      onClick={() =>
                        setSelectedForGates(
                          selectedForGates?.WR_ID === wr.WR_ID ? null : wr
                        )
                      }
                      className="text-sm px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      {selectedForGates?.WR_ID === wr.WR_ID
                        ? "Hide Gates Panel"
                        : "Manage Acceptance Gates"}
                    </button>
                  </div>
                )}
              </div>

              {/* Expanded Acceptance Gates Panel */}
              {selectedForGates?.WR_ID === wr.WR_ID && wr.WR_Type === "LJ" && (
                <div className="p-4 border-t border-gray-200 bg-white">
                  <AcceptanceGatesPanel
                    workRequest={wr}
                    onStatusChange={(newPercentage, updates) =>
                      handleGateStatusChange(wr.WR_ID, newPercentage, updates)
                    }
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Drawer */}
      <LongJobDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmitWR}
        workRequest={selectedWR}
        mode={drawerMode}
      />
    </div>
  );
}
