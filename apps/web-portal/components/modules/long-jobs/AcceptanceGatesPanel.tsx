"use client";

import React, { useState } from "react";
import { BaseWorkRequest, LJAcceptanceGate, LJRole } from "@cafm/shared-schema";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

interface AcceptanceGatesPanelProps {
  workRequest: BaseWorkRequest;
  onStatusChange: (
    newPercentage: number,
    gateUpdates: Partial<BaseWorkRequest>
  ) => void;
  isReadOnly?: boolean;
}

const GATE_ROLES: Record<string, LJRole[]> = {
  SAT: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"],
  DrawingEngineering: ["ESA_DO", "ESA_TO", "ESA_TM", "ESA_LONG_JOB"],
  CIFMInventory: ["ESA_IM", "ESA_TO", "ESA_TM", "ESA_LONG_JOB"],
};

export function AcceptanceGatesPanel({
  workRequest,
  onStatusChange,
  isReadOnly = false,
}: AcceptanceGatesPanelProps) {
  const { activeLJRole } = useSiteContext();
  const [gateStatus, setGateStatus] = useState<
    Record<string, LJAcceptanceGate>
  >({
    SAT: {
      GateType: "SAT",
      IsRequired: workRequest.RequiresSAT || false,
      Status: "Pending",
      AssignedToRole: "ESA_TO",
    },
    DrawingEngineering: {
      GateType: "DrawingEngineering",
      IsRequired: workRequest.RequiresDrawingUpdate || false,
      Status: "Pending",
      AssignedToRole: "ESA_DO",
    },
    CIFMInventory: {
      GateType: "CIFMInventory",
      IsRequired: workRequest.RequiresInventoryUpdate || false,
      Status: "Pending",
      AssignedToRole: "ESA_IM",
    },
  });

  const requiredGates = Object.values(gateStatus).filter((g) => g.IsRequired);
  const approvedGates = requiredGates.filter((g) => g.Status === "Approved");
  const allGatesApproved = requiredGates.length === approvedGates.length;

  const handleGateAction = (gateType: string, action: string) => {
    const gate = gateStatus[gateType];
    let newStatus = gate.Status;

    switch (action) {
      case "requestReview":
        newStatus = "ReviewRequested";
        break;
      case "sendInvitation":
        newStatus = "InvitationSent";
        break;
      case "approve":
        newStatus = "Approved";
        break;
      case "approvePreSAT":
        newStatus = "Pending";
        break;
    }

    const updated = { ...gateStatus, [gateType]: { ...gate, Status: newStatus } };
    setGateStatus(updated);
  };

  const handleTechnicallyCompleted = () => {
    if (requiredGates.length === 0) {
      onStatusChange(94, { Percentage: 94, WorkRequestSubstatus: "All Acceptances Completed" });
    } else {
      onStatusChange(78, { Percentage: 78, WorkRequestSubstatus: "Work Ready for Approvals Cycle" });
    }
  };

  const currentPercentage = workRequest.Percentage;
  const isIn78To94Range = currentPercentage >= 78 && currentPercentage <= 94;

  if (!isIn78To94Range && !requiredGates.some((g) => g.IsRequired)) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-xl font-bold mb-4">
        {currentPercentage < 78
          ? "Acceptance Gate Configuration"
          : "78% - 94% Acceptance Engine"}
      </h2>

      {/* Gate Toggles (if not started yet) */}
      {currentPercentage < 78 && (
        <div className="mb-6 pb-6 border-b border-gray-200">
          <h3 className="font-semibold text-sm mb-3">Required Gates</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={gateStatus.SAT.IsRequired}
                onChange={(e) =>
                  setGateStatus({
                    ...gateStatus,
                    SAT: { ...gateStatus.SAT, IsRequired: e.target.checked },
                  })
                }
                disabled={isReadOnly}
                className="w-4 h-4"
              />
              <span className="text-sm">Requires SAT (Site Acceptance Test)</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={gateStatus.DrawingEngineering.IsRequired}
                onChange={(e) =>
                  setGateStatus({
                    ...gateStatus,
                    DrawingEngineering: {
                      ...gateStatus.DrawingEngineering,
                      IsRequired: e.target.checked,
                    },
                  })
                }
                disabled={isReadOnly}
                className="w-4 h-4"
              />
              <span className="text-sm">Requires Drawing/Engineering Update</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={gateStatus.CIFMInventory.IsRequired}
                onChange={(e) =>
                  setGateStatus({
                    ...gateStatus,
                    CIFMInventory: {
                      ...gateStatus.CIFMInventory,
                      IsRequired: e.target.checked,
                    },
                  })
                }
                disabled={isReadOnly}
                className="w-4 h-4"
              />
              <span className="text-sm">Requires CIFM Inventory Update</span>
            </label>
          </div>
        </div>
      )}

      {/* Gates Status Display (when in 78-94 range) */}
      {isIn78To94Range && requiredGates.length > 0 && (
        <div className="space-y-4 mb-6">
          {requiredGates.map((gate) => (
            <div
              key={gate.GateType}
              className="border border-gray-200 rounded-lg p-4 bg-gray-50"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {gate.Status === "Approved" ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : gate.Status === "InvitationSent" ? (
                    <AlertCircle className="w-5 h-5 text-blue-600" />
                  ) : (
                    <Clock className="w-5 h-5 text-yellow-600" />
                  )}
                  <h4 className="font-semibold text-sm">
                    {gate.GateType === "SAT" && "Site Acceptance Test (SAT)"}
                    {gate.GateType === "DrawingEngineering" && "Drawing/Engineering"}
                    {gate.GateType === "CIFMInventory" && "CIFM Inventory"}
                  </h4>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    gate.Status === "Approved"
                      ? "bg-green-100 text-green-800"
                      : gate.Status === "InvitationSent"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {gate.Status}
                </span>
              </div>

              {gate.AssignedToRole && (
                <p className="text-xs text-gray-600 mb-3">
                  Assigned to: {gate.AssignedToRole}
                </p>
              )}

              {/* Role-specific Actions */}
              <div className="flex flex-wrap gap-2">
                {gate.GateType === "SAT" && activeLJRole && (
                  <>
                    {["TRADE_TM", "TRADE_LONG_JOB"].includes(activeLJRole) && (
                      <button
                        onClick={() => handleGateAction("SAT", "approvePreSAT")}
                        className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
                      >
                        Approve Pre-SAT
                      </button>
                    )}
                    {["ESA_TO", "ESA_TM", "ESA_LONG_JOB"].includes(activeLJRole) && (
                      <>
                        <button
                          onClick={() => handleGateAction("SAT", "requestReview")}
                          className="px-2 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700"
                        >
                          Request Review
                        </button>
                        <button
                          onClick={() => handleGateAction("SAT", "approve")}
                          className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                        >
                          Approve SAT
                        </button>
                      </>
                    )}
                    {["TRADE_TM", "TRADE_LONG_JOB"].includes(activeLJRole) && (
                      <button
                        onClick={() => handleGateAction("SAT", "sendInvitation")}
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                      >
                        Send Invitation
                      </button>
                    )}
                  </>
                )}

                {gate.GateType === "DrawingEngineering" && activeLJRole && (
                  <>
                    {["ESA_DO", "ESA_TO", "ESA_TM", "ESA_LONG_JOB"].includes(activeLJRole) && (
                      <>
                        <button
                          onClick={() => handleGateAction("DrawingEngineering", "requestReview")}
                          className="px-2 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700"
                        >
                          Request Review
                        </button>
                        <button
                          onClick={() => handleGateAction("DrawingEngineering", "approve")}
                          className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                        >
                          Approve Drawing
                        </button>
                      </>
                    )}
                    {["TRADE_TM", "TRADE_LONG_JOB"].includes(activeLJRole) && (
                      <button
                        onClick={() => handleGateAction("DrawingEngineering", "sendInvitation")}
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                      >
                        Send Invitation
                      </button>
                    )}
                  </>
                )}

                {gate.GateType === "CIFMInventory" && activeLJRole && (
                  <>
                    {["ESA_IM", "ESA_TO", "ESA_TM", "ESA_LONG_JOB"].includes(activeLJRole) && (
                      <>
                        <button
                          onClick={() => handleGateAction("CIFMInventory", "requestReview")}
                          className="px-2 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700"
                        >
                          Request Review
                        </button>
                        <button
                          onClick={() => handleGateAction("CIFMInventory", "approve")}
                          className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                        >
                          Approve CIFM
                        </button>
                      </>
                    )}
                    {["TRADE_TM", "TRADE_LONG_JOB"].includes(activeLJRole) && (
                      <button
                        onClick={() => handleGateAction("CIFMInventory", "sendInvitation")}
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                      >
                        Send Invitation
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transition Button */}
      {currentPercentage >= 50 && currentPercentage < 78 && requiredGates.length > 0 && (
        <button
          onClick={handleTechnicallyCompleted}
          disabled={isReadOnly}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
        >
          Mark Technically Completed
          {requiredGates.length === 0
            ? " → 94% (All Acceptances Completed)"
            : " → 78% (Work Ready for Approvals Cycle)"}
        </button>
      )}

      {/* Summary */}
      {isIn78To94Range && requiredGates.length > 0 && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-800">
            <strong>{approvedGates.length}</strong> of <strong>{requiredGates.length}</strong>{" "}
            required gates approved.
            {allGatesApproved && (
              <span className="block mt-1">
                All gates approved! Ready to transition to 94% (All Acceptances Completed).
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
