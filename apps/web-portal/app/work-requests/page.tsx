"use client";

import React, { useState } from "react";
import { WorkRequestEngine } from "@/components/modules/WorkRequestEngine";
import { LongJobDrawer } from "@/components/modules/LongJobDrawer";
import { FastJobModal, type FastJobData } from "@/components/modules/FastJobModal";
import { ChecklistExecutor } from "@/components/modules/ChecklistExecutor";
import type { BaseWorkRequest, PM_ScheduleStep } from "@cafm/shared-schema";
import { WR_Statuses } from "@cafm/shared-schema";

const SAMPLE_WORK_REQUESTS: BaseWorkRequest[] = [
  {
    WR_ID: "2026000001",
    JobID: "PM-001",
    WR_Type: "PM",
    ESAWorkType: "Preventive Maintenance",
    Description: "Monthly HVAC system inspection",
    TradeId: "HVAC-01",
    TradeName: "HVAC",
    EquipmentCodes: ["0000000001"],
    ExpectedHours: 2,
    TotalTimeMinutes: 0,
    CreatedDate: new Date().toISOString(),
    StartDate: new Date().toISOString(),
    DueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    MarginDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    WorkRequestStatus: "Issued",
    WorkRequestSubstatus: "Issued",
    Percentage: 50,
    bl_id: "BL001",
    LevelName: "Floor 1",
    RoomCode: "R101",
    StartDateTBD: false,
    AssignedCraftpersonIds: [],
    AssignedUserIds: [],
    CreatedBy: "admin@cafm.local",
    IsFrozen: false,
  },
  {
    WR_ID: "2026000002",
    JobID: "LJ-001",
    WR_Type: "LJ",
    ESAWorkType: "Corrective Maintenance",
    Description: "Replace faulty electrical panel breaker",
    TradeId: "ELEC-01",
    TradeName: "Electrical",
    EquipmentCodes: ["0000000002"],
    ExpectedHours: 4,
    TotalTimeMinutes: 120,
    CreatedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    StartDate: new Date().toISOString(),
    DueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    MarginDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    WorkRequestStatus: "Technically Completed",
    WorkRequestSubstatus: "Technically Completed",
    Percentage: 78,
    bl_id: "BL002",
    LevelName: "Floor 2",
    RoomCode: "R205",
    StartDateTBD: false,
    AssignedCraftpersonIds: ["cp-001"],
    AssignedUserIds: [],
    CreatedBy: "admin@cafm.local",
    IsFrozen: false,
  },
  {
    WR_ID: "2026000003",
    WR_Type: "FJ",
    ESAWorkType: "Corrective Maintenance",
    Description: "Replace broken door handle",
    TradeId: "MAINT-01",
    TradeName: "General Maintenance",
    EquipmentCodes: ["0000000003"],
    ExpectedHours: 0.5,
    TotalTimeMinutes: 25,
    CreatedDate: new Date().toISOString(),
    StartDate: new Date().toISOString(),
    DueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    MarginDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    WorkRequestStatus: "Closed",
    WorkRequestSubstatus: "Approved",
    Percentage: 100,
    bl_id: "BL001",
    LevelName: "Floor 1",
    RoomCode: "R103",
    StartDateTBD: false,
    AssignedCraftpersonIds: [],
    AssignedUserIds: [],
    CreatedBy: "admin@cafm.local",
    IsFrozen: false,
  },
];

const SAMPLE_CHECKLIST_STEPS: PM_ScheduleStep[] = [
  {
    StepId: "step-001",
    Title: "Inspect air filter condition",
    Instructions: "Check if the air filter shows signs of clogging or dust accumulation.",
    SortOrder: 1,
    InputType: "Boolean",
    Options: [],
    IsRequired: true,
    RequiresPhotoOnFailure: true,
    RequiresCommentOnFailure: true,
  },
  {
    StepId: "step-002",
    Title: "Measure system airflow (CFM)",
    Instructions:
      "Use an anemometer to measure airflow at the return duct. Expected range: 800-1200 CFM.",
    SortOrder: 2,
    InputType: "Numeric",
    Unit: "CFM",
    MinThreshold: 800,
    MaxThreshold: 1200,
    Options: [],
    IsRequired: true,
    RequiresPhotoOnFailure: false,
    RequiresCommentOnFailure: true,
  },
  {
    StepId: "step-003",
    Title: "Refrigerant pressure check",
    Instructions: "Record low-side and high-side pressure readings.",
    SortOrder: 3,
    InputType: "FreeText",
    Options: [],
    IsRequired: false,
    RequiresPhotoOnFailure: false,
    RequiresCommentOnFailure: false,
  },
  {
    StepId: "step-004",
    Title: "Select thermostat status",
    SortOrder: 4,
    InputType: "SingleSelect",
    Options: [
      {
        OptionId: "opt-001",
        Label: "Working correctly",
        Value: "ok",
        SortOrder: 1,
        TriggersFailure: false,
      },
      {
        OptionId: "opt-002",
        Label: "Inaccurate reading",
        Value: "inaccurate",
        SortOrder: 2,
        TriggersFailure: true,
      },
      {
        OptionId: "opt-003",
        Label: "Not responding",
        Value: "failed",
        SortOrder: 3,
        TriggersFailure: true,
      },
    ],
    IsRequired: true,
    RequiresPhotoOnFailure: true,
    RequiresCommentOnFailure: true,
  },
];

export default function WorkRequestsPage() {
  const [selectedRequest, setSelectedRequest] = useState<BaseWorkRequest | null>(
    null
  );
  const [showLJDrawer, setShowLJDrawer] = useState(false);
  const [showFJModal, setShowFJModal] = useState(false);
  const [showChecklistExecutor, setShowChecklistExecutor] = useState(false);
  const [workRequests, setWorkRequests] = useState(SAMPLE_WORK_REQUESTS);

  const handleSelectRequest = (wr: BaseWorkRequest) => {
    setSelectedRequest(wr);
    if (wr.WR_Type === "LJ") {
      setShowLJDrawer(true);
    } else if (wr.WR_Type === "PM") {
      setShowChecklistExecutor(true);
    }
  };

  const handleFastJobSubmit = (data: FastJobData) => {
    // Create new Fast Job WR
    const newWR: BaseWorkRequest = {
      WR_ID: `2026${String(Date.now()).slice(-6)}`,
      WR_Type: "FJ",
      ESAWorkType: "Corrective Maintenance",
      Description: data.description,
      TradeId: "MAINT-01",
      TradeName: "General Maintenance",
      EquipmentCodes: [data.equipmentCode],
      ExpectedHours: data.timeSpentMinutes / 60,
      TotalTimeMinutes: data.timeSpentMinutes,
      CreatedDate: data.createdAt,
      StartDate: data.createdAt,
      DueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      MarginDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      WorkRequestStatus: "Closed",
      WorkRequestSubstatus: "Approved",
      Percentage: 78,
      bl_id: data.bl_id,
      LevelName: data.levelName,
      RoomCode: data.roomCode,
      StartDateTBD: false,
      AssignedCraftpersonIds: [],
      AssignedUserIds: [],
      CreatedBy: "technician@cafm.local",
      IsFrozen: false,
    };

    setWorkRequests([...workRequests, newWR]);
  };

  const handleChecklistComplete = () => {
    // Update WR status to 78% Technically Completed
    if (selectedRequest) {
      const updated = workRequests.map((wr) =>
        wr.WR_ID === selectedRequest.WR_ID
          ? {
              ...wr,
              Percentage: 78,
              WorkRequestStatus: "Technically Completed",
              WorkRequestSubstatus: "Technically Completed",
            }
          : wr
      );
      setWorkRequests(updated);
    }
    setShowChecklistExecutor(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Tabs */}
        <div className="bg-white rounded-t-lg border-b border-gray-200">
          <div className="px-6 py-4 flex gap-8">
            <button className="px-4 py-2 text-blue-600 border-b-2 border-blue-600 font-semibold">
              All Work Requests
            </button>
            <button className="px-4 py-2 text-gray-600 hover:text-gray-900">
              PM Schedules
            </button>
            <button className="px-4 py-2 text-gray-600 hover:text-gray-900">
              Technical Audits
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-b-lg p-6">
          <WorkRequestEngine
            workRequests={workRequests}
            onSelectRequest={handleSelectRequest}
            onCreateFastJob={() => setShowFJModal(true)}
          />
        </div>
      </div>

      {/* Drawers and Modals */}
      {showLJDrawer && (
        <LongJobDrawer
          workRequest={selectedRequest}
          onClose={() => {
            setShowLJDrawer(false);
            setSelectedRequest(null);
          }}
          onStatusChange={(phase, percentage) => {
            if (selectedRequest) {
              const updated = workRequests.map((wr) =>
                wr.WR_ID === selectedRequest.WR_ID
                  ? { ...wr, Percentage: percentage }
                  : wr
              );
              setWorkRequests(updated);
            }
          }}
        />
      )}

      <FastJobModal
        isOpen={showFJModal}
        onClose={() => setShowFJModal(false)}
        onSubmit={handleFastJobSubmit}
      />

      {selectedRequest && (
        <ChecklistExecutor
          isOpen={showChecklistExecutor}
          workRequestId={selectedRequest.WR_ID}
          steps={SAMPLE_CHECKLIST_STEPS}
          onClose={() => {
            setShowChecklistExecutor(false);
            setSelectedRequest(null);
          }}
          onComplete={handleChecklistComplete}
        />
      )}
    </div>
  );
}
