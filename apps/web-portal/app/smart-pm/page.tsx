"use client";

import React, { useState } from "react";
import { ChecklistBuilder } from "@/components/modules/ChecklistBuilder";
import type { PM_ChecklistStandard } from "@cafm/shared-schema";

const SAMPLE_SCHEDULES = [
  {
    scheduleId: "sched-001",
    checklistCode: "HVAC-MONTHLY-001",
    equipmentCodes: ["0000000001"],
    frequency: "Monthly" as const,
    leadTimeDays: 3,
    marginDays: 5,
  },
];

type TabType = "schedules" | "blueprints" | "generator";

export default function SmartPMPage() {
  const [activeTab, setActiveTab] = useState<TabType>("schedules");
  const [blueprints, setBlueprints] = useState<PM_ChecklistStandard[]>([]);
  const [generatorMode, setGeneratorMode] = useState<"single" | "selected" | "horizon">(
    "horizon"
  );
  const [horizonDays, setHorizonDays] = useState(30);

  const handleBlueprintSave = (blueprint: PM_ChecklistStandard) => {
    setBlueprints([...blueprints, blueprint]);
    setActiveTab("schedules");
  };

  const handleGenerateWRs = () => {
    alert(
      `Generated WRs using ${generatorMode} mode for ${generatorMode === "horizon" ? horizonDays + " days" : "selected items"}`
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-gray-900">SmartPM Engine</h1>
          <p className="text-gray-600 mt-2">
            Preventive Maintenance Scheduling & Work Request Generation
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-t-lg border-b border-gray-200 mb-6">
          <div className="px-6 py-4 flex gap-8">
            <button
              onClick={() => setActiveTab("schedules")}
              className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
                activeTab === "schedules"
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-600 border-transparent hover:text-gray-900"
              }`}
            >
              PM Schedules
            </button>
            <button
              onClick={() => setActiveTab("blueprints")}
              className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
                activeTab === "blueprints"
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-600 border-transparent hover:text-gray-900"
              }`}
            >
              Checklist Blueprints
            </button>
            <button
              onClick={() => setActiveTab("generator")}
              className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
                activeTab === "generator"
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-600 border-transparent hover:text-gray-900"
              }`}
            >
              WR Generator
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-b-lg p-6">
          {activeTab === "schedules" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900">PM Schedules</h2>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                        Schedule ID
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                        Checklist
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                        Equipment
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                        Frequency
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                        Lead Time
                      </th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {SAMPLE_SCHEDULES.map((schedule) => (
                      <tr key={schedule.scheduleId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-blue-600">
                          {schedule.scheduleId}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {schedule.checklistCode}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {schedule.equipmentCodes.join(", ")}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                            {schedule.frequency}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {schedule.leadTimeDays} days
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                            Edit
                          </button>
                          <button className="text-red-600 hover:text-red-800 text-sm font-medium">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "blueprints" && (
            <div className="space-y-6">
              <ChecklistBuilder onSave={handleBlueprintSave} />
            </div>
          )}

          {activeTab === "generator" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Generate Work Requests
              </h2>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-blue-900 mb-4">
                  Generation Mode
                </h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-4 border-2 border-blue-300 rounded-lg cursor-pointer hover:bg-blue-100">
                    <input
                      type="radio"
                      name="mode"
                      value="single"
                      checked={generatorMode === "single"}
                      onChange={(e) => setGeneratorMode("single")}
                      className="w-5 h-5"
                    />
                    <div>
                      <p className="font-semibold text-blue-900">Single Schedule</p>
                      <p className="text-sm text-blue-700">
                        Generate one WR from a single PM Schedule
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-4 border-2 border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="mode"
                      value="selected"
                      checked={generatorMode === "selected"}
                      onChange={(e) => setGeneratorMode("selected")}
                      className="w-5 h-5"
                    />
                    <div>
                      <p className="font-semibold text-gray-900">Selected Schedules</p>
                      <p className="text-sm text-gray-600">
                        Generate WRs from multiple selected schedules at once
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-4 border-2 border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="mode"
                      value="horizon"
                      checked={generatorMode === "horizon"}
                      onChange={(e) => setGeneratorMode("horizon")}
                      className="w-5 h-5"
                    />
                    <div>
                      <p className="font-semibold text-gray-900">Horizon Generation</p>
                      <p className="text-sm text-gray-600">
                        Auto-generate all due WRs for the next X days
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {generatorMode === "horizon" && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Horizon Period (days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={horizonDays}
                    onChange={(e) => setHorizonDays(parseInt(e.target.value))}
                    className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-sm text-gray-600 mt-2">
                    Default: 30 days. Prevents duplicate cycle WRs automatically.
                  </p>
                </div>
              )}

              <button
                onClick={handleGenerateWRs}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-lg"
              >
                Generate Work Requests
              </button>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                <p className="font-semibold text-green-900">✓ Generation Features</p>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Automatic duplicate cycle detection</li>
                  <li>• Location hierarchy auto-resolution (Equipment → Room → Floor → Building)</li>
                  <li>• Initial status set to 50% Issued</li>
                  <li>• All PM_WorkRequestStep and PM_StepOption records instantiated</li>
                  <li>• SLA and MarginDate auto-calculated</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
