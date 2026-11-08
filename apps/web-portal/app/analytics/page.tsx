"use client";

import React, { useState } from "react";
import { TrendingUp, Download, BarChart3 } from "lucide-react";
import { QAAnalytics } from "@/components/modules/QAAnalytics";

interface KPICard {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down";
  color: "green" | "blue" | "orange" | "red" | "purple";
}

export default function AnalyticsPage() {
  const [selectedMetric, setSelectedMetric] = useState("pm-compliance");

  const kpis: Record<string, KPICard[]> = {
    "pm-compliance": [
      {
        label: "On-Time Completion",
        value: "87%",
        change: "+3%",
        trend: "up",
        color: "green",
      },
      {
        label: "Within Margin",
        value: "94%",
        change: "+1%",
        trend: "up",
        color: "blue",
      },
      {
        label: "Overdue WRs",
        value: "12",
        change: "-2",
        trend: "up",
        color: "red",
      },
      {
        label: "Average SLA Days",
        value: "2.3",
        change: "-0.4",
        trend: "up",
        color: "purple",
      },
    ],
    workload: [
      {
        label: "Total Open WRs",
        value: "156",
        change: "+8",
        trend: "down",
        color: "orange",
      },
      {
        label: "PM WRs",
        value: "89",
        change: "+2",
        trend: "down",
        color: "blue",
      },
      {
        label: "LJ Backlog",
        value: "45",
        change: "-3",
        trend: "up",
        color: "green",
      },
      {
        label: "FJ (24h)",
        value: "22",
        change: "+5",
        trend: "down",
        color: "red",
      },
    ],
    reliability: [
      {
        label: "Most Problematic Asset",
        value: "Equipment #0001",
        color: "red",
      },
      {
        label: "Failures (Last 30d)",
        value: "8",
        change: "+2",
        trend: "down",
        color: "orange",
      },
      {
        label: "Downtime Hours",
        value: "124.5h",
        change: "+18h",
        trend: "down",
        color: "red",
      },
      {
        label: "Labor Hours",
        value: "68h",
        change: "+12h",
        trend: "down",
        color: "orange",
      },
    ],
    productivity: [
      {
        label: "Avg Hours/Technician",
        value: "34.2h",
        change: "+2.1h",
        trend: "up",
        color: "green",
      },
      {
        label: "Planned vs Actual",
        value: "92%",
        change: "-1%",
        trend: "down",
        color: "blue",
      },
      {
        label: "Top Performer",
        value: "John Smith",
        color: "purple",
      },
      {
        label: "Utilization Rate",
        value: "78%",
        change: "+3%",
        trend: "up",
        color: "green",
      },
    ],
  };

  const getColorClass = (color: string) => {
    const colors: Record<string, string> = {
      green: "bg-green-50 border-green-200",
      blue: "bg-blue-50 border-blue-200",
      orange: "bg-orange-50 border-orange-200",
      red: "bg-red-50 border-red-200",
      purple: "bg-purple-50 border-purple-200",
    };
    return colors[color] || "bg-gray-50 border-gray-200";
  };

  const getTextColorClass = (color: string) => {
    const colors: Record<string, string> = {
      green: "text-green-900",
      blue: "text-blue-900",
      orange: "text-orange-900",
      red: "text-red-900",
      purple: "text-purple-900",
    };
    return colors[color] || "text-gray-900";
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">
              Executive Analytics
            </h1>
            <p className="text-gray-600 mt-2">
              Power BI-style KPI dashboards and operational insights
            </p>
          </div>
          <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
            <Download size={20} />
            Export Report
          </button>
        </div>

        {/* Metric Selector */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { id: "pm-compliance", label: "PM Compliance & SLA" },
            { id: "workload", label: "Backlog & Workload" },
            { id: "reliability", label: "Asset Reliability" },
            { id: "productivity", label: "Technician Productivity" },
            { id: "qa", label: "QA & Technical Audits (5% Quota)" },
          ].map((metric) => (
            <button
              key={metric.id}
              onClick={() => setSelectedMetric(metric.id)}
              className={`px-4 py-3 rounded-lg font-medium transition-colors text-left ${
                selectedMetric === metric.id
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="text-sm">{metric.label}</div>
            </button>
          ))}
        </div>

        {selectedMetric === "qa" ? <QAAnalytics /> : <>
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {kpis[selectedMetric].map((kpi, i) => (
            <div
              key={i}
              className={`border rounded-lg p-6 ${getColorClass(kpi.color)}`}
            >
              <p className={`text-sm font-medium mb-2 ${getTextColorClass(kpi.color)}`}>
                {kpi.label}
              </p>
              <div className="flex items-end justify-between">
                <p className={`text-3xl font-bold ${getTextColorClass(kpi.color)}`}>
                  {kpi.value}
                </p>
                {kpi.change && (
                  <div
                    className={`flex items-center gap-1 text-sm font-semibold ${
                      kpi.trend === "up"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {kpi.change}
                    <TrendingUp
                      size={16}
                      style={{
                        transform:
                          kpi.trend === "down" ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1 */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 size={20} />
              WRs by Status (Last 30 Days)
            </h3>
            <div className="space-y-3 h-64 flex flex-col justify-center">
              {[
                { label: "Issued (50%)", value: 45, max: 156 },
                { label: "Tech Complete (78%)", value: 78, max: 156 },
                { label: "Closed (100%)", value: 33, max: 156 },
              ].map((item, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-700">
                      {item.label}
                    </p>
                    <p className="text-sm font-semibold text-gray-900">
                      {item.value}
                    </p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-full transition-all"
                      style={{ width: `${(item.value / item.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chart 2 */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 size={20} />
              WRs by Trade
            </h3>
            <div className="space-y-3 h-64 flex flex-col justify-center">
              {[
                { label: "HVAC", value: 42, color: "bg-red-500" },
                { label: "Electrical", value: 38, color: "bg-yellow-500" },
                { label: "Plumbing", value: 28, color: "bg-blue-500" },
                { label: "General Maint", value: 48, color: "bg-green-500" },
              ].map((item, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-700">
                      {item.label}
                    </p>
                    <p className="text-sm font-semibold text-gray-900">
                      {item.value}
                    </p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`${item.color} h-full transition-all`}
                      style={{
                        width: `${(item.value / 50) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Export Options */}
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            Scheduled Exports & Integrations
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                title: "Weekly PDF Executive Summary",
                schedule: "Every Monday 6:00 AM",
                recipients: "5 stakeholders",
              },
              {
                title: "Monthly KPI Dataset (.xlsx)",
                schedule: "1st day of month",
                recipients: "Finance team",
              },
              {
                title: "Live BigQuery/OData Feed",
                schedule: "Real-time sync",
                recipients: "Power BI / Looker Studio",
              },
            ].map((export_, i) => (
              <div
                key={i}
                className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors"
              >
                <p className="font-semibold text-gray-900 mb-2">
                  {export_.title}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  Schedule: {export_.schedule}
                </p>
                <p className="text-sm text-gray-600">
                  Recipients: {export_.recipients}
                </p>
              </div>
            ))}
          </div>
        </div>
        </>}
      </div>
    </div>
  );
}
