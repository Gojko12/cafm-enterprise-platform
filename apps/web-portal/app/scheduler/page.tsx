"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, Users } from "lucide-react";

interface ScheduledWR {
  wrId: string;
  type: "PM" | "LJ" | "FJ";
  title: string;
  hours: number;
  dueDate: string;
  status: "Issued" | "InProgress" | "Frozen" | "Completed";
}

interface CraftspersonDay {
  craftperson: string;
  trade: string;
  date: string;
  allocatedHours: number;
  shiftHours: number;
  workRequests: ScheduledWR[];
}

const SAMPLE_SCHEDULE: CraftspersonDay[] = [
  {
    craftperson: "John Smith",
    trade: "HVAC",
    date: new Date().toISOString(),
    allocatedHours: 6.5,
    shiftHours: 8,
    workRequests: [
      {
        wrId: "2026000001",
        type: "PM",
        title: "HVAC Monthly Inspection",
        hours: 2,
        dueDate: new Date().toISOString(),
        status: "Issued",
      },
      {
        wrId: "2026000004",
        type: "LJ",
        title: "Refrigerant Refill",
        hours: 4.5,
        dueDate: new Date().toISOString(),
        status: "InProgress",
      },
    ],
  },
];

export default function SchedulerPage() {
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Issued":
        return "bg-yellow-100 border-yellow-300 text-yellow-900";
      case "InProgress":
        return "bg-blue-100 border-blue-300 text-blue-900";
      case "Frozen":
        return "bg-orange-100 border-orange-300 text-orange-900";
      case "Completed":
        return "bg-green-100 border-green-300 text-green-900";
      default:
        return "bg-gray-100 border-gray-300 text-gray-900";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "PM":
        return "bg-purple-600";
      case "LJ":
        return "bg-blue-600";
      case "FJ":
        return "bg-green-600";
      default:
        return "bg-gray-600";
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-gray-900">Dispatch Scheduler</h1>
          <p className="text-gray-600 mt-2">
            Interactive timeline for craftspeople and work request assignment
          </p>
        </div>

        {/* View Controls */}
        <div className="bg-white rounded-lg p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getTime() - 86400000))}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-lg font-semibold min-w-fit px-4">
              {currentDate.toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getTime() + 86400000))}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="flex gap-2">
            {(["day", "week", "month"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === mode
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Craftspeople Schedule */}
          <div className="lg:col-span-3 space-y-4">
            {SAMPLE_SCHEDULE.map((day) => (
              <div key={day.craftperson} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users size={20} className="text-blue-600" />
                    <div>
                      <p className="font-semibold text-gray-900">
                        {day.craftperson}
                      </p>
                      <p className="text-sm text-gray-600">{day.trade}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-700">
                      {day.allocatedHours} / {day.shiftHours}h
                    </p>
                    <p className="text-xs text-gray-600">Allocated / Available</p>
                  </div>
                </div>

                {/* Capacity Bar */}
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-700">Daily Capacity</span>
                    <div className="flex-1 bg-gray-300 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          day.allocatedHours > day.shiftHours
                            ? "bg-red-500"
                            : day.allocatedHours > day.shiftHours * 0.9
                            ? "bg-yellow-500"
                            : "bg-green-500"
                        }`}
                        style={{
                          width: `${Math.min((day.allocatedHours / day.shiftHours) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Work Requests */}
                <div className="p-6 space-y-3">
                  {day.workRequests.map((wr) => (
                    <div
                      key={wr.wrId}
                      className={`border-l-4 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow ${getStatusColor(wr.status)}`}
                      style={{
                        borderLeftColor: {
                          PM: "#9333ea",
                          LJ: "#2563eb",
                          FJ: "#16a34a",
                        }[wr.type],
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-1 rounded text-xs font-semibold text-white ${getTypeColor(wr.type)}`}>
                              {wr.type}
                            </span>
                            <p className="font-semibold text-sm">{wr.wrId}</p>
                          </div>
                          <p className="text-sm">{wr.title}</p>
                        </div>
                        <span className="text-sm font-medium">
                          {wr.hours}h
                        </span>
                      </div>
                    </div>
                  ))}

                  <button className="w-full px-4 py-2 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors">
                    + Assign WR to {day.craftperson}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Unassigned Trade Pool */}
          <div className="bg-white rounded-lg border border-gray-200 h-fit p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Unassigned Trade Pool</h3>

            <div className="space-y-3">
              {[
                { trade: "HVAC", count: 3, urgent: 1 },
                { trade: "Electrical", count: 5, urgent: 2 },
                { trade: "Plumbing", count: 2, urgent: 0 },
              ].map((pool) => (
                <div
                  key={pool.trade}
                  className="border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-gray-900">{pool.trade}</p>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded font-medium">
                      {pool.count} open
                    </span>
                  </div>
                  {pool.urgent > 0 && (
                    <p className="text-xs text-red-600 font-medium">
                      ⚠ {pool.urgent} overdue
                    </p>
                  )}
                </div>
              ))}
            </div>

            <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
              View Unassigned WRs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
