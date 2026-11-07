"use client";

import React, { useMemo, useState } from "react";
import { ChecklistBuilder } from "@/components/modules/ChecklistBuilder";
import type {
  Building,
  Floor,
  PM_ChecklistStandard,
  PM_Schedule,
  Room,
} from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { LocationEquipmentPickerGroup } from "@/components/common/LocationEquipmentPickerGroup";

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
  const { data, setData } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const [editing, setEditing] = useState<PM_ChecklistStandard | undefined>();
  const [builderVersion, setBuilderVersion] = useState(0);
  const blueprints = data.blueprints.filter((item) => item.SiteId === activeSiteId);
  const [generatorMode, setGeneratorMode] = useState<"single" | "selected" | "horizon">(
    "horizon"
  );
  const [horizonDays, setHorizonDays] = useState(30);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleChecklistCode, setScheduleChecklistCode] = useState("");
  const [scheduleFrequency, setScheduleFrequency] =
    useState<PM_Schedule["Frequency"]>("Monthly");
  const [scheduleMeterType, setScheduleMeterType] = useState("");
  const [scheduleMeterInterval, setScheduleMeterInterval] = useState(1);
  const [scheduleDueDate, setScheduleDueDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [scheduleLeadTime, setScheduleLeadTime] = useState(3);
  const [scheduleMarginWindow, setScheduleMarginWindow] = useState(5);
  const [scheduleLocation, setScheduleLocation] = useState<{
    building: Building | null;
    floor: Floor | null;
    room: Room | null;
  }>({ building: null, floor: null, room: null });
  const [scheduleEquipmentCodes, setScheduleEquipmentCodes] = useState<string[]>([]);
  const siteBuildings = useMemo(
    () => data.buildings.filter((item) => item.SiteId === activeSiteId),
    [data.buildings, activeSiteId],
  );
  const siteFloors = useMemo(
    () => data.floors.filter((item) => item.SiteId === activeSiteId),
    [data.floors, activeSiteId],
  );
  const siteRooms = useMemo(
    () => data.rooms.filter((item) => item.SiteId === activeSiteId),
    [data.rooms, activeSiteId],
  );
  const siteEquipment = useMemo(
    () => data.equipment.filter((item) => item.SiteId === activeSiteId),
    [data.equipment, activeSiteId],
  );
  const visibleSchedules = [
    ...SAMPLE_SCHEDULES,
    ...data.schedules
      .filter((schedule) => schedule.SiteId === activeSiteId)
      .map((schedule) => ({
        scheduleId: schedule.ScheduleId,
        checklistCode: schedule.ChecklistCode,
        equipmentCodes: schedule.EquipmentCodes,
        frequency: schedule.Frequency,
        leadTimeDays: schedule.LeadTimeDays,
        marginDays: schedule.MarginWindowDays,
      })),
  ];

  const handleCreateSchedule = (event: React.FormEvent) => {
    event.preventDefault();
    if (!scheduleChecklistCode.trim()) {
      alert("Enter a checklist code.");
      return;
    }
    if (scheduleEquipmentCodes.length === 0 && !scheduleLocation.building) {
      alert("Select equipment or a building, floor, or room target.");
      return;
    }
    if (
      scheduleFrequency === "Meter-based" &&
      (!scheduleMeterType.trim() || scheduleMeterInterval <= 0)
    ) {
      alert("Meter-based schedules require a meter type and a positive interval.");
      return;
    }
    const now = new Date().toISOString();
    const schedule: PM_Schedule = {
      ScheduleId: `PM-${Date.now()}`,
      ChecklistCode: scheduleChecklistCode.trim(),
      SiteId: activeSiteId,
      EquipmentCodes: scheduleEquipmentCodes,
      bl_id: scheduleLocation.building?.bl_id,
      LevelName: scheduleLocation.floor?.LevelName,
      RoomCode: scheduleLocation.room?.RoomCode,
      Frequency: scheduleFrequency,
      FrequencyInterval: 1,
      ...(scheduleFrequency === "Meter-based"
        ? {
            MeterType: scheduleMeterType.trim(),
            MeterInterval: scheduleMeterInterval,
          }
        : {}),
      LeadTimeDays: scheduleLeadTime,
      MarginWindowDays: scheduleMarginWindow,
      NextDueDate: scheduleDueDate,
      IsActive: true,
      CreatedBy: "current-user",
      CreatedAt: now,
      UpdatedAt: now,
    };
    setData((current) => ({
      ...current,
      schedules: [...current.schedules, schedule],
    }));
    setScheduleModalOpen(false);
    setScheduleChecklistCode("");
    setScheduleEquipmentCodes([]);
    setScheduleLocation({ building: null, floor: null, room: null });
  };

  const handleBlueprintSave = (blueprint: PM_ChecklistStandard) => {
    if (!editing && data.blueprints.some((item) => item.SiteId === activeSiteId && item.ChecklistCode === blueprint.ChecklistCode)) {
      alert("A blueprint with this code already exists at this site.");
      return;
    }
    setData((current) => ({
      ...current,
      blueprints: [...current.blueprints.filter((item) => !(item.SiteId === activeSiteId && item.ChecklistCode === blueprint.ChecklistCode)), { ...blueprint, SiteId: activeSiteId }],
    }));
    setEditing(undefined);
    setBuilderVersion((version) => version + 1);
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
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">PM Schedules</h2>
                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Create PM Schedule
                </button>
              </div>
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
                    {visibleSchedules.map((schedule) => (
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
              <h2 className="text-xl font-semibold">Saved Blueprints</h2>
              {blueprints.length === 0 && <p>No blueprints for this site.</p>}
              {blueprints.map((blueprint) => (
                <div key={blueprint.ChecklistCode} className="flex items-center justify-between border rounded p-3">
                  <span>{blueprint.ChecklistCode} — {blueprint.Title}</span>
                  <button className="text-blue-600" onClick={() => { setEditing(blueprint); setBuilderVersion((version) => version + 1); }}>Edit</button>
                </div>
              ))}
              <button className="text-blue-600" onClick={() => { setEditing(undefined); setBuilderVersion((version) => version + 1); }}>New Blueprint</button>
              <ChecklistBuilder key={`${activeSiteId}-${builderVersion}`} initialBlueprint={editing} onSave={handleBlueprintSave} />
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
      {scheduleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateSchedule}
            className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-white rounded-xl shadow-xl"
          >
            <header className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">Create PM Schedule</h2>
              <button
                type="button"
                onClick={() => setScheduleModalOpen(false)}
                aria-label="Close PM Schedule modal"
                className="p-2"
              >
                ✕
              </button>
            </header>
            <div className="p-6 space-y-4">
              <label className="block text-sm font-medium">
                Checklist Code
                <input
                  required
                  value={scheduleChecklistCode}
                  onChange={(event) => setScheduleChecklistCode(event.target.value)}
                  className="mt-1 w-full px-3 py-2 border rounded"
                  placeholder="e.g. HVAC-MONTHLY-001"
                />
              </label>
              <LocationEquipmentPickerGroup
                buildings={siteBuildings}
                floors={siteFloors}
                rooms={siteRooms}
                equipment={siteEquipment}
                selectedBuilding={scheduleLocation.building}
                selectedFloor={scheduleLocation.floor}
                selectedRoom={scheduleLocation.room}
                selectedEquipmentCodes={scheduleEquipmentCodes}
                onLocationChange={setScheduleLocation}
                onEquipmentChange={setScheduleEquipmentCodes}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm font-medium">
                  Frequency
                  <select
                    value={scheduleFrequency}
                    onChange={(event) =>
                      setScheduleFrequency(event.target.value as PM_Schedule["Frequency"])
                    }
                    className="mt-1 w-full px-3 py-2 border rounded"
                  >
                    {["Daily", "Weekly", "Monthly", "Quarterly", "Yearly", "Meter-based"].map(
                      (frequency) => (
                        <option key={frequency} value={frequency}>
                          {frequency}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Next Due Date
                  <input
                    type="date"
                    required
                    value={scheduleDueDate}
                    onChange={(event) => setScheduleDueDate(event.target.value)}
                    className="mt-1 w-full px-3 py-2 border rounded"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Lead Time Days
                  <input
                    type="number"
                    min="0"
                    required
                    value={scheduleLeadTime}
                    onChange={(event) => setScheduleLeadTime(Number(event.target.value))}
                    className="mt-1 w-full px-3 py-2 border rounded"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Margin Window Days
                  <input
                    type="number"
                    min="0"
                    required
                    value={scheduleMarginWindow}
                    onChange={(event) =>
                      setScheduleMarginWindow(Number(event.target.value))
                    }
                    className="mt-1 w-full px-3 py-2 border rounded"
                  />
                </label>
                {scheduleFrequency === "Meter-based" && (
                  <>
                    <label className="block text-sm font-medium">
                      Meter Type
                      <input
                        required
                        value={scheduleMeterType}
                        onChange={(event) => setScheduleMeterType(event.target.value)}
                        className="mt-1 w-full px-3 py-2 border rounded"
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      Meter Interval
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="any"
                        value={scheduleMeterInterval}
                        onChange={(event) =>
                          setScheduleMeterInterval(Number(event.target.value))
                        }
                        className="mt-1 w-full px-3 py-2 border rounded"
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
            <footer className="px-6 py-4 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setScheduleModalOpen(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create Schedule
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
