"use client";

import React, { useState } from "react";
import { X, ArrowUp } from "lucide-react";
import { BaseWorkRequest, CLASSICAL_TRADES, LJRole, WR_Type, LJ_TRANSITION_MATRIX } from "@cafm/shared-schema";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useCafmStore } from "@/lib/cafm-store";
import { LocationEquipmentPickerGroup } from "@/components/common/LocationEquipmentPickerGroup";
import { WRActivityTimeline } from "@/components/modules/WRActivityTimeline";
import { useApp } from "@/lib/hooks/useApp";
import { WR_Statuses } from "@cafm/shared-schema";
import { AcceptanceGatesPanel } from "./AcceptanceGatesPanel";
import { ChecklistExecutor } from "@/components/modules/ChecklistExecutor";

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
  const { activeSiteId, activeLJRole, currentUser } = useSiteContext();
  const { data, setData } = useCafmStore();
  const { currentRole } = useApp();
  const initialTrack = workRequest?.ProcessTrack ?? (workRequest && workRequest.Percentage >= 30 ? "RFW" : "RFQ");
  const initialAction = LJ_TRANSITION_MATRIX.find((entry) => entry.percentage === workRequest?.Percentage && entry.track === initialTrack)
    ?.allowedActions.find((action) => action.actionName !== "Save");
  const defaultRole = workRequest?.Percentage === 81
    ? workRequest.RequiresDrawingUpdate ? "ESA_DO" : workRequest.RequiresInventoryUpdate ? "ESA_IM" : "ESA_TO"
    : initialAction?.allowedRoles[0] ?? "ESA_TO";
  const [actingRole, setActingRole] = useState<LJRole>(activeLJRole ?? defaultRole);
  const [executingChecklist, setExecutingChecklist] = useState(false);
  const [formData, setFormData] = useState<Partial<BaseWorkRequest>>({
    SiteId: activeSiteId,
    EstimatedCostEur: 0,
    RequiresSAT: false,
    RequiresDrawingUpdate: false,
    RequiresInventoryUpdate: false,
    ProcessTrack: "RFQ",
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
      EquipmentCodes: [],
      bl_id: building?.bl_id,
      LevelName: floor?.LevelName,
      RoomCode: room?.RoomCode,
    });
  };

  const handleEquipmentChange = (equipmentCodes: string[]) => {
    if (equipmentCodes.length > 1) {
      alert("Select only one equipment item for a long job.");
      return;
    }
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
    if (!formData.bl_id || !formData.TradeId || !formData.Description?.trim()) {
      alert("A description, trade and building are required.");
      return;
    }
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

  const updateWorkRequest = (percentage: number, updates: Partial<BaseWorkRequest>, description: string) => {
    if (!workRequest) return;
    const actorName = currentUser?.DisplayName ?? "Current user";
    setData((current) => ({ ...current, workRequests: current.workRequests.map((wr) => {
      if (wr.WR_ID !== workRequest.WR_ID || wr.SiteId !== workRequest.SiteId || wr.Percentage !== workRequest.Percentage) return wr;
      const now = new Date().toISOString();
      return { ...wr, ...updates, Percentage: percentage, UpdatedAt: now, Activity: [...(wr.Activity ?? []), {
        id: crypto.randomUUID(), kind: "log" as const, actorId: currentUser?.UserId ?? "current-user",
        actorName, actorRole: actingRole, createdAt: now,
        text: `${description}${percentage !== wr.Percentage ? ` (${wr.Percentage}% to ${percentage}%)` : ""} by ${actorName}`,
      }] };
    }) }));
  };
  const track = workRequest?.ProcessTrack ?? (workRequest && workRequest.Percentage >= 30 ? "RFW" : "RFQ");
  const transitionEntry = workRequest && LJ_TRANSITION_MATRIX.find((entry) => entry.percentage === workRequest.Percentage && entry.track === track);
  const schedule = workRequest?.ScheduleId ? data.schedules.find((item) => item.ScheduleId === workRequest.ScheduleId && item.SiteId === workRequest.SiteId) : undefined;
  const blueprint = schedule ? data.blueprints.find((item) => item.ChecklistCode === schedule.ChecklistCode && item.SiteId === workRequest?.SiteId) : undefined;

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
                <label className="block text-sm font-medium text-gray-700">
                  Process Track
                  <select value={formData.ProcessTrack ?? "RFQ"} onChange={(e) =>
                    setFormData({ ...formData, ProcessTrack: e.target.value === "RFW" ? "RFW" : "RFQ" })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg">
                    <option value="RFQ">RFQ (Request for Quotation)</option>
                    <option value="RFW">RFW (Request for Work)</option>
                  </select>
                </label>
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

              {workRequest.WR_Type === "LJ" && <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Process", track], ["Trade", workRequest.TradeName],
                    ["Location", [workRequest.bl_id, workRequest.LevelName, workRequest.RoomCode].filter(Boolean).join(" / ")],
                    ["Equipment", workRequest.EquipmentCodes.join(", ")],
                    ["Actual cost", workRequest.ActualCostEur === undefined ? undefined : `${workRequest.ActualCostEur} EUR`],
                    ["Created", workRequest.CreatedDate], ["Start", workRequest.StartDate], ["Due", workRequest.DueDate],
                    ["Margin", workRequest.MarginDate], ["Originating FJ", workRequest.OriginatingFJ_WR_ID],
                    ["Parent PM", workRequest.ParentPM_WR_ID],
                  ].map(([label, value]) => <div key={label}><span className="font-semibold">{label}: </span>{value || "Not set"}</div>)}
                </div>
                <div className="bg-gray-200 rounded h-2"><div className="bg-blue-600 rounded h-2" style={{ width: `${workRequest.Percentage}%` }} /></div>
                <div className="border rounded p-4 space-y-3">
                  <h3 className="font-semibold">Stage Transition Actions</h3>
                  <label className="block text-sm">Act as LJ Role
                    <select value={actingRole} onChange={(e) => setActingRole(e.target.value as LJRole)} className="block border rounded p-2">
                      {LJ_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {transitionEntry?.allowedActions.filter((action) => action.actionName !== "Save" && !(workRequest.Percentage >= 78 && workRequest.Percentage < 94)).map((action) => {
                      const target = action.actionName === "Technically Completed" && !workRequest.RequiresSAT && !workRequest.RequiresDrawingUpdate && !workRequest.RequiresInventoryUpdate ? 94 : action.targetPercentage;
                      return <button type="button" key={action.actionName} disabled={!action.allowedRoles.includes(actingRole)}
                        className="bg-blue-600 text-white px-3 py-2 rounded text-sm disabled:opacity-40"
                        onClick={() => {
                          const nextTrack = target === 23 || target === 27 || target === 29 ? "RFQ" : target >= 30 ? "RFW" : track;
                          const next = LJ_TRANSITION_MATRIX.find((entry) => entry.percentage === target && entry.track === nextTrack);
                          if (!next) { alert(`No lifecycle configuration exists for ${target}%.`); return; }
                          updateWorkRequest(target, { ProcessTrack: nextTrack, WorkRequestSubstatus: next.label,
                            WorkRequestStatus: target >= 100 ? "Closed" : target >= 78 ? "Technically Completed" : target >= 32 ? "Issued" : "Requested" },
                            `LJ ${action.actionName}`);
                        }}>{action.actionName} → {target}% [{action.allowedRoles.join(" / ")}]</button>;
                    })}
                    {!transitionEntry && <p>No lifecycle configuration for this stage and track.</p>}
                    {transitionEntry && transitionEntry.allowedActions.length === 0 && <p>No further stage transitions.</p>}
                  </div>
                </div>
                <AcceptanceGatesPanel workRequest={workRequest} role={actingRole} onStatusChange={(percentage, updates, description) =>
                  updateWorkRequest(percentage, updates, description ?? "Acceptance gate updated")} />
              </>}

              {workRequest.WR_Type !== "LJ" && workRequest.Percentage === 78 && currentRole === "TeamLeader" && (
                <div className="bg-blue-50 border border-blue-200 rounded p-4 space-y-3">
                  <h3 className="font-semibold">Team Leader Checklist &amp; WR Overview</h3>
                  {[100, 50].map((percentage) => <button key={percentage} type="button" className="mr-2 bg-blue-600 text-white px-3 py-2 rounded"
                    onClick={() => {
                      const status = WR_Statuses.find((item) => item.ESAWorkType === workRequest.ESAWorkType && item.Percentage === percentage);
                      if (!status) {
                        alert(`No ${percentage}% status is configured for ${workRequest.ESAWorkType}.`);
                        return;
                      }
                      const actorName = currentUser?.DisplayName ?? "Current user";
                      setData((current) => ({ ...current, workRequests: current.workRequests.map((wr) => {
                        if (wr.WR_ID !== workRequest.WR_ID || wr.SiteId !== workRequest.SiteId || wr.Percentage !== 78) return wr;
                        const now = new Date().toISOString();
                        return { ...wr, ...status, UpdatedAt: now, Activity: [...(wr.Activity ?? []), {
                          id: crypto.randomUUID(), kind: "log" as const, actorId: currentUser?.UserId ?? "current-user",
                          actorName, actorRole: currentRole, createdAt: now,
                          text: `WR pushed from 78% to ${percentage}% by ${actorName}`,
                        }] };
                      }) }));
                    }}>{percentage === 100 ? "Push WR to 100% (Completed)" : "Reopen to 50%"}</button>)}
                </div>
              )}
              {workRequest.WR_Type === "PM" && <>
                <section className="border-t pt-4 space-y-3">
                  <h3 className="font-semibold">Checklist Answers</h3>
                  {!blueprint && <p className="text-sm text-gray-600">No checklist blueprint is linked to this work request.</p>}
                  {blueprint?.Steps.map((step) => {
                    const answer = workRequest.ChecklistResults?.find((item) => item.stepId === step.StepId);
                    return <div key={step.StepId} className="border rounded p-3 text-sm space-y-1">
                      <p className="font-medium">{step.Title}</p>
                      <p>{answer ? Array.isArray(answer.value) ? answer.value.map((value) => step.Options.find((option) => option.Value === value)?.Label ?? value).join(", ") :
                        step.Options.find((option) => option.Value === answer.value)?.Label ?? String(answer.value) : "Not answered"}</p>
                      {answer && step.InputType !== "FreeText" && <span className={`inline-block rounded px-2 py-1 font-semibold ${answer.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{answer.passed ? "FAVOURABLE" : "UNFAVOURABLE"}</span>}
                      {answer?.comment && <p>Failure comment: {answer.comment}</p>}
                      {answer?.photoPaths?.map((photo) => <img key={photo} src={photo} alt="Failure evidence" className="max-h-32" />)}
                    </div>;
                  })}
                  {blueprint && workRequest.Percentage === 50 && <button type="button" className="px-3 py-2 bg-blue-600 text-white rounded" onClick={() => setExecutingChecklist(true)}>Execute Checklist</button>}
                </section>
                {blueprint && executingChecklist && <ChecklistExecutor isOpen workRequestId={workRequest.WR_ID} steps={blueprint.Steps} initialResults={workRequest.ChecklistResults}
                  onClose={() => setExecutingChecklist(false)}
                  onClear={(stepId) => setData((current) => ({ ...current, workRequests: current.workRequests.map((wr) => {
                    if (wr.WR_ID !== workRequest.WR_ID || wr.SiteId !== workRequest.SiteId || wr.Percentage !== 50) return wr;
                    const actorName = currentUser?.DisplayName ?? "Current user";
                    return { ...wr, ChecklistResults: (wr.ChecklistResults ?? []).filter((item) => item.stepId !== stepId),
                      Activity: [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log" as const,
                        actorId: currentUser?.UserId ?? "current-user", actorName, actorRole: currentRole,
                        createdAt: new Date().toISOString(), text: `Step ${stepId} answer cleared by ${actorName}` }] };
                  }) }))}
                  onProgress={(result) => setData((current) => ({ ...current, workRequests: current.workRequests.map((wr) => {
                    if (wr.WR_ID !== workRequest.WR_ID || wr.SiteId !== workRequest.SiteId || wr.Percentage !== 50) return wr;
                    const previous = wr.ChecklistResults?.find((item) => item.stepId === result.stepId);
                    const changed = !previous || JSON.stringify(previous.value) !== JSON.stringify(result.value) || previous.passed !== result.passed;
                    const actorName = currentUser?.DisplayName ?? "Current user";
                    return { ...wr, ChecklistResults: [...(wr.ChecklistResults ?? []).filter((item) => item.stepId !== result.stepId), result],
                      Activity: changed ? [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log" as const,
                        actorId: currentUser?.UserId ?? "current-user", actorName, actorRole: currentRole, createdAt: new Date().toISOString(),
                        text: blueprint.Steps.find((item) => item.StepId === result.stepId)?.InputType === "FreeText"
                          ? `Step ${result.stepId} answered by ${actorName}`
                          : `Step ${result.stepId} marked ${result.passed ? "favourable" : "unfavourable"} by ${actorName}` }] : wr.Activity };
                  }) }))}
                  onComplete={(results) => {
                    const status = WR_Statuses.find((item) => item.ESAWorkType === workRequest.ESAWorkType && item.Percentage === 78);
                    if (!status) { alert(`No 78% status is configured for ${workRequest.ESAWorkType}.`); return; }
                    const actorName = currentUser?.DisplayName ?? "Current user";
                    setData((current) => ({ ...current, workRequests: current.workRequests.map((wr) => {
                      if (wr.WR_ID !== workRequest.WR_ID || wr.SiteId !== workRequest.SiteId || wr.Percentage !== 50) return wr;
                      const now = new Date().toISOString();
                      return { ...wr, ...status, ChecklistResults: results, UpdatedAt: now, Activity: [...(wr.Activity ?? []), {
                        id: crypto.randomUUID(), kind: "log" as const, actorId: currentUser?.UserId ?? "current-user",
                        actorName, actorRole: currentRole, createdAt: now,
                        text: `${actorName} finished checklist (${results.length}/${blueprint.Steps.length} steps, ${results.filter((result) => result.passed).length} favourable, ${results.filter((result) => !result.passed).length} unfavourable); WR set to 78%`,
                      }] };
                    }) }));
                  }} />}
              </>}
              <WRActivityTimeline workRequest={workRequest} />

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
