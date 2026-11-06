"use client";

import React, { useState } from "react";
import { X, Plus, Trash2, Clock, DollarSign, Pause, CheckCircle } from "lucide-react";
import type { BaseWorkRequest } from "@cafm/shared-schema";

interface LJDrawerProps {
  workRequest: BaseWorkRequest | null;
  onClose: () => void;
  onStatusChange?: (status: string, percentage: number) => void;
}

type LJPhase =
  | "Assessment"
  | "QuoteApproval"
  | "FreezeManagement"
  | "Execution"
  | "TechCompletion"
  | "ManagerSignOff";

interface CraftpersonEntry {
  craftpersonId: string;
  name: string;
  trade: string;
  hours: number;
}

interface SparePart {
  partId: string;
  description: string;
  quantity: number;
  unitCost: number;
}

export function LongJobDrawer({ workRequest, onClose, onStatusChange }: LJDrawerProps) {
  const [phase, setPhase] = useState<LJPhase>("Assessment");
  const [craftspeople, setCraftspeople] = useState<CraftpersonEntry[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [freezeName, setFreezeName] = useState("");
  const [freezeReason, setFreezeReason] = useState("");
  const [isFrozen, setIsFrozen] = useState(false);

  if (!workRequest) return null;

  const totalLaborHours = craftspeople.reduce((sum, c) => sum + c.hours, 0);
  const totalPartsCost = spareParts.reduce(
    (sum, p) => sum + p.quantity * p.unitCost,
    0
  );

  const handleAddCraftsperson = () => {
    setCraftspeople([
      ...craftspeople,
      {
        craftpersonId: `craft-${Date.now()}`,
        name: "",
        trade: "",
        hours: 0,
      },
    ]);
  };

  const handleRemoveCraftsperson = (id: string) => {
    setCraftspeople(craftspeople.filter((c) => c.craftpersonId !== id));
  };

  const handleAddPart = () => {
    setSpareParts([
      ...spareParts,
      {
        partId: `part-${Date.now()}`,
        description: "",
        quantity: 1,
        unitCost: 0,
      },
    ]);
  };

  const handleRemovePart = (id: string) => {
    setSpareParts(spareParts.filter((p) => p.partId !== id));
  };

  const handlePhaseChange = (newPhase: LJPhase) => {
    setPhase(newPhase);
    const phasePercentages: Record<LJPhase, number> = {
      Assessment: 50,
      QuoteApproval: 60,
      FreezeManagement: 70,
      Execution: 75,
      TechCompletion: 78,
      ManagerSignOff: 100,
    };
    onStatusChange?.(newPhase, phasePercentages[newPhase]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex justify-end">
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Long Job Management</h2>
            <p className="text-sm text-gray-500 mt-1">{workRequest.WR_ID}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Phase Navigation */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Lifecycle Phase</h3>
            <div className="grid grid-cols-2 gap-3">
              {(["Assessment", "QuoteApproval", "FreezeManagement", "Execution", "TechCompletion", "ManagerSignOff"] as const).map(
                (p) => (
                  <button
                    key={p}
                    onClick={() => handlePhaseChange(p)}
                    className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                      phase === p
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {p === "Assessment"
                      ? "Assessment & Cost"
                      : p === "QuoteApproval"
                      ? "Quote Approval"
                      : p === "FreezeManagement"
                      ? "Freeze/Hold"
                      : p === "Execution"
                      ? "Multi-Craft Exec"
                      : p === "TechCompletion"
                      ? "78% Tech Completion"
                      : "Manager Sign-Off"}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Freeze Management Section */}
          {phase === "FreezeManagement" && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-4">
              <h4 className="font-semibold text-orange-900 flex items-center gap-2">
                <Pause size={18} />
                Hold/Freeze Management
              </h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Active Freeze Name
                </label>
                <input
                  type="text"
                  value={freezeName}
                  onChange={(e) => setFreezeName(e.target.value)}
                  placeholder="e.g., Waiting for spare parts"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason / Planned Freeze Text
                </label>
                <textarea
                  value={freezeReason}
                  onChange={(e) => setFreezeReason(e.target.value)}
                  rows={3}
                  placeholder="Describe why this job is on hold and when it will resume..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="frozen"
                  checked={isFrozen}
                  onChange={(e) => setIsFrozen(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="frozen" className="text-sm font-medium text-gray-700">
                  Mark as Frozen (automatically extends MarginDate)
                </label>
              </div>
            </div>
          )}

          {/* Labor Hours Section */}
          {(phase === "Assessment" || phase === "Execution") && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Clock size={18} />
                  Labor & Craftspeople Tracking
                </h4>
                <button
                  onClick={handleAddCraftsperson}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                >
                  <Plus size={16} />
                  Add Craftsperson
                </button>
              </div>
              <div className="space-y-3">
                {craftspeople.map((cp) => (
                  <div key={cp.craftpersonId} className="flex gap-3 items-start bg-gray-50 p-3 rounded-lg">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        placeholder="Craftsperson name"
                        value={cp.name}
                        onChange={(e) =>
                          setCraftspeople(
                            craftspeople.map((c) =>
                              c.craftpersonId === cp.craftpersonId
                                ? { ...c, name: e.target.value }
                                : c
                            )
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Trade"
                          value={cp.trade}
                          onChange={(e) =>
                            setCraftspeople(
                              craftspeople.map((c) =>
                                c.craftpersonId === cp.craftpersonId
                                  ? { ...c, trade: e.target.value }
                                  : c
                              )
                            )
                          }
                          className="px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                        <input
                          type="number"
                          placeholder="Hours"
                          value={cp.hours}
                          onChange={(e) =>
                            setCraftspeople(
                              craftspeople.map((c) =>
                                c.craftpersonId === cp.craftpersonId
                                  ? { ...c, hours: parseFloat(e.target.value) || 0 }
                                  : c
                              )
                            )
                          }
                          className="px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveCraftsperson(cp.craftpersonId)}
                      className="text-red-600 hover:text-red-800 mt-1"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm text-blue-900 font-semibold">
                  Total Estimated Hours: {totalLaborHours.toFixed(1)} hours
                </p>
              </div>
            </div>
          )}

          {/* Spare Parts Section */}
          {(phase === "Assessment" || phase === "Execution") && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <DollarSign size={18} />
                  Spare Parts & Materials
                </h4>
                <button
                  onClick={handleAddPart}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                >
                  <Plus size={16} />
                  Add Part
                </button>
              </div>
              <div className="space-y-3">
                {spareParts.map((part) => (
                  <div key={part.partId} className="flex gap-3 items-start bg-gray-50 p-3 rounded-lg">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        placeholder="Part description"
                        value={part.description}
                        onChange={(e) =>
                          setSpareParts(
                            spareParts.map((p) =>
                              p.partId === part.partId
                                ? { ...p, description: e.target.value }
                                : p
                            )
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="number"
                          placeholder="Qty"
                          value={part.quantity}
                          onChange={(e) =>
                            setSpareParts(
                              spareParts.map((p) =>
                                p.partId === part.partId
                                  ? { ...p, quantity: parseFloat(e.target.value) || 1 }
                                  : p
                              )
                            )
                          }
                          className="px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                        <input
                          type="number"
                          placeholder="Unit $"
                          value={part.unitCost}
                          onChange={(e) =>
                            setSpareParts(
                              spareParts.map((p) =>
                                p.partId === part.partId
                                  ? { ...p, unitCost: parseFloat(e.target.value) || 0 }
                                  : p
                              )
                            )
                          }
                          className="px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                        <div className="px-3 py-2 bg-white border border-gray-300 rounded text-sm font-medium">
                          ${(part.quantity * part.unitCost).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemovePart(part.partId)}
                      className="text-red-600 hover:text-red-800 mt-1"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="text-sm text-green-900 font-semibold">
                  Total Parts Cost: ${totalPartsCost.toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {/* Completion Section */}
          {(phase === "TechCompletion" || phase === "ManagerSignOff") && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-4">
              <h4 className="font-semibold text-green-900 flex items-center gap-2">
                <CheckCircle size={18} />
                {phase === "TechCompletion"
                  ? "Mark 78% Technically Completed"
                  : "Manager Sign-Off (100%)"}
              </h4>
              <textarea
                placeholder="Completion notes, sign-off comment..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                {phase === "TechCompletion" ? "Mark Tech Complete" : "Sign Off & Close"}
              </button>
            </div>
          )}

          {/* Summary */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-2">
            <h4 className="font-semibold text-gray-900">Current Status</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Phase</p>
                <p className="font-semibold text-gray-900">{phase}</p>
              </div>
              <div>
                <p className="text-gray-600">Estimated Cost</p>
                <p className="font-semibold text-gray-900">
                  ${totalPartsCost.toFixed(2)} + {totalLaborHours.toFixed(1)}h
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
