"use client";

import React, { useState } from "react";
import { X, Plus, ArrowUp, Download } from "lucide-react";
import { BaseWorkRequest, CLASSICAL_TRADES, LJRole, WR_Type } from "@cafm/shared-schema";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useCafmStore } from "@/lib/cafm-store";
import { LocationEquipmentPickerGroup } from "@/components/common/LocationEquipmentPickerGroup";

interface LJDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (workRequest: Partial<BaseWorkRequest>) => void;
  workRequest?: BaseWorkRequest | null;
  mode: "create" | "view" | "escalate";
}

const LJ_ROLES: LJRole[] = [
  "ESA_TO",
  "ESA_TM",
  "ESA_LJM",
  "ESA_CCM",
  "ESA_DO",
  "ESA_IM",
  "TRADE_CM",
  "TRADE_TM",
  "ESA_LONG_JOB",
  "TRADE_LONG_JOB",
];

// Role-based action mapping
const roleActions: Record<LJRole, string[]> = {
  ESA_TO: [
    "Approve & Order",
    "Approve SAT",
    "Final Approval",
    "Approve Costs",
    "Print Yellow Page",
  ],
  ESA_TM: [
    "Accept RFQ",
    "Approve SAT",
    "Final Approval",
    "Print Yellow Page",
  ],
  ESA_LJM: [
    "Accept RFQ",
    "Convert to RFW",
    "Print Yellow Page",
  ],
  ESA_CCM: [
    "Confirm Invoice Information",
    "Print Yellow Page",
  ],
  ESA_DO: [
    "Approve Drawing/Engineering",
    "Request Review",
    "Approve Acceptance Gate",
    "Print Yellow Page",
  ],
  ESA_IM: [
    "Approve CIFM Inventory",
    "Request Review",
    "Approve Acceptance Gate",
    "Print Yellow Page",
  ],
  TRADE_CM: [
    "Sign Yellow Page",
    "Confirm Payment",
    "Print Yellow Page",
  ],
  TRADE_TM: [
    "Commit",
    "Approve Pre-SAT",
    "Send Invitation",
    "Complete Work",
    "Print Yellow Page",
  ],
  ESA_LONG_JOB: [
    "Approve & Order",
    "Accept RFQ",
    "Approve SAT",
    "Print Yellow Page",
  ],
  TRADE_LONG_JOB: [
    "Commit",
    "Approve Pre-SAT",
    "Send Invitation",
    "Complete Work",
    "Print Yellow Page",
  ],
};

export function LongJobDrawer({
  isOpen,
  onClose,
  onSubmit,
  workRequest,
  mode,
}: LJDrawerProps) {
  const { activeSiteId, activeLJRole } = useSiteContext();
  const { data } = useCafmStore();
  const [formData, setFormData] = useState<Partial<BaseWorkRequest>>({
    SiteId: activeSiteId,
    EstimatedCostEur: 0,
    RequiresSAT: false,
    RequiresDrawingUpdate: false,
    RequiresInventoryUpdate: false,
    ...workRequest,
  });

  const [escalationCost, setEscalationCost] = useState<number>(750);
  const siteBuildings = data.buildings.filter((item) => item.SiteId === activeSiteId);
  const siteFloors = data.floors.filter((item) => item.SiteId === activeSiteId);
  const siteRooms = data.rooms.filter((item) => item.SiteId === activeSiteId);
  const siteEquipment = data.equipment.filter((item) => item.SiteId === activeSiteId);
  const selectedBuilding =
    siteBuildings.find((item) => item.bl_id === formData.bl_id) ?? null;
  const selectedFloor =
    siteFloors.find(
      (item) =>
        item.bl_id === formData.bl_id && item.LevelName === formData.LevelName,
    ) ?? null;
  const selectedRoom =
    siteRooms.find(
      (item) =>
        item.bl_id === formData.bl_id &&
        item.LevelName === formData.LevelName &&
        item.RoomCode === formData.RoomCode,
    ) ?? null;

  const handleLocationChange = ({
    building,
    floor,
    room,
  }: {
    building: (typeof siteBuildings)[number] | null;
    floor: (typeof siteFloors)[number] | null;
    room: (typeof siteRooms)[number] | null;
  }) => {
    setFormData({
      ...formData,
      bl_id: building?.bl_id,
      LevelName: floor?.LevelName,
      RoomCode: room?.RoomCode,
    });
  };

  const handleEquipmentChange = (equipmentCodes: string[]) => {
    const equipment =
      equipmentCodes.length === 1
        ? siteEquipment.find((item) => item.EquipmentCode === equipmentCodes[0])
        : undefined;
    setFormData({
      ...formData,
      EquipmentCodes: equipmentCodes,
      ...(equipment
        ? {
            bl_id: equipment.bl_id,
            LevelName: equipment.LevelName,
            RoomCode: equipment.RoomCode,
          }
        : {}),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    onClose();
  };

  const handleEscalate = () => {
    const ljForm = {
      ...formData,
      WR_Type: "LJ" as WR_Type,
      OriginatingFJ_WR_ID: workRequest?.WR_ID,
      Percentage: 10,
      WorkRequestStatus: "Requested",
      WorkRequestSubstatus: "Work Request from Fast Job - On Hold",
      EstimatedCostEur: escalationCost,
    };
    onSubmit(ljForm);
    onClose();
  };

  const availableActions =
    activeLJRole && roleActions[activeLJRole] ? roleActions[activeLJRole] : [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl rounded-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold">
            {mode === "create" && "Create Long Job"}
            {mode === "view" && "Long Job Details"}
            {mode === "escalate" && "Escalate to Long Job"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Standalone Creation */}
          {mode === "create" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Title
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.Description || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, Description: e.target.value })
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Work request description"
                  />
                </div>

                <label className="block text-sm font-medium text-gray-700">
                  Trade *
                  <select required value={formData.TradeId || ""} onChange={(e) => setFormData({ ...formData, TradeId: e.target.value, TradeName: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg">
                    <option value="">Select trade</option>
                    {CLASSICAL_TRADES.map((trade) => <option key={trade} value={trade}>{trade}</option>)}
                  </select>
                </label>
                <div className="col-span-2 space-y-3">
                  <LocationEquipmentPickerGroup
                    buildings={siteBuildings}
                    floors={siteFloors}
                    rooms={siteRooms}
                    equipment={siteEquipment}
                    selectedBuilding={selectedBuilding}
                    selectedFloor={selectedFloor}
                    selectedRoom={selectedRoom}
                    selectedEquipmentCodes={formData.EquipmentCodes || []}
                    onLocationChange={handleLocationChange}
                    onEquipmentChange={handleEquipmentChange}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Estimated Cost (EUR)
                  </label>
                  <input
                    type="number"
                    value={formData.EstimatedCostEur || 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        EstimatedCostEur: parseFloat(e.target.value),
                      })
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                    min="750"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Problem Location
                </label>
                <input
                  type="text"
                  value={formData.ProblemLocation || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, ProblemLocation: e.target.value })
                  }
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Room or Equipment location"
                />
              </div>

              {/* Acceptance Gates Configuration */}
              <div className="border-t pt-4">
                <h3 className="font-semibold text-sm mb-3">
                  Acceptance Gate Requirements
                </h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.RequiresSAT || false}
                      onChange={(e) =>
                        setFormData({ ...formData, RequiresSAT: e.target.checked })
                      }
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Requires SAT (Site Acceptance Test)</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.RequiresDrawingUpdate || false}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          RequiresDrawingUpdate: e.target.checked,
                        })
                      }
                      className="w-4 h-4"
                    />
                    <span className="text-sm">
                      Requires Drawing/Engineering Update
                    </span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.RequiresInventoryUpdate || false}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          RequiresInventoryUpdate: e.target.checked,
                        })
                      }
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Requires CIFM Inventory Update</span>
                  </label>
                </div>
              </div>

              {/* Available Actions for Role */}
              {availableActions.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-sm mb-3">
                    Available Actions for {activeLJRole}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {availableActions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium hover:bg-blue-200"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Create LJ at 0%
              </button>
            </form>
          )}

          {/* Escalation Mode */}
          {mode === "escalate" && workRequest && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">
                  Escalate Fast Job to Long Job
                </h3>
                <p className="text-sm text-blue-800">
                  Fast Jobs under 750 EUR can be escalated to Long Jobs when the
                  scope exceeds initial estimates.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Original FJ Description
                </label>
                <input
                  type="text"
                  value={workRequest.Description}
                  disabled
                  className="mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Current Estimated Cost (EUR)
                </label>
                <input
                  type="number"
                  value={workRequest.EstimatedCostEur || 0}
                  disabled
                  className="mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Escalation Threshold: 750 EUR</strong>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Revised Estimated Cost (EUR)
                </label>
                <input
                  type="number"
                  value={escalationCost}
                  onChange={(e) => setEscalationCost(parseFloat(e.target.value))}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                  min="750"
                  placeholder="Minimum 750 EUR"
                />
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-sm mb-3">
                  New LJ Acceptance Gate Requirements
                </h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.RequiresSAT || false}
                      onChange={(e) =>
                        setFormData({ ...formData, RequiresSAT: e.target.checked })
                      }
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Requires SAT</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.RequiresDrawingUpdate || false}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          RequiresDrawingUpdate: e.target.checked,
                        })
                      }
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Requires Drawing/Engineering Update</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.RequiresInventoryUpdate || false}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          RequiresInventoryUpdate: e.target.checked,
                        })
                      }
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Requires CIFM Inventory Update</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleEscalate}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium flex items-center justify-center gap-2"
                >
                  <ArrowUp size={18} />
                  Escalate to LJ at 10%
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* View Mode */}
          {mode === "view" && workRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase">
                    WR ID
                  </label>
                  <p className="mt-1 text-sm font-medium">{workRequest.WR_ID}</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase">
                    Status
                  </label>
                  <p className="mt-1 text-sm font-medium">
                    {workRequest.Percentage}% - {workRequest.WorkRequestSubstatus}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">
                  Description
                </label>
                <p className="mt-1 text-sm">{workRequest.Description}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">
                  Estimated Cost
                </label>
                <p className="mt-1 text-sm font-medium">
                  {workRequest.EstimatedCostEur} EUR
                </p>
              </div>

              {/* Available Actions */}
              {availableActions.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-sm mb-3">
                    Available Actions
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {availableActions.map((action) => (
                      <button
                        key={action}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium flex items-center justify-center gap-2"
              >
                <Download size={18} />
                Print Yellow Page
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
