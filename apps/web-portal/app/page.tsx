"use client";

import React from "react";
import {
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Users,
  Zap,
} from "lucide-react";
import { useApp } from "@/lib/hooks/useApp";
import { getSampleData } from "@/lib/utils/sampleData";
import { QAReportNotifications } from "@/components/modules/QAReportNotifications";

export default function DashboardPage() {
  const { currentRole, useSampleData } = useApp();
  const sampleData = useSampleData ? getSampleData() : { buildings: [], floors: [], rooms: [], equipment: [] };

  const stats = [
    {
      label: "Active Work Requests",
      value: 42,
      change: "+12%",
      icon: AlertCircle,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "PM Compliance",
      value: "94%",
      change: "+3%",
      icon: CheckCircle,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Overdue WRs",
      value: 3,
      change: "-1",
      icon: Clock,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "Assigned Technicians",
      value: 12,
      change: "+2",
      icon: Users,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div className="p-6 space-y-8">
      <QAReportNotifications />
      {/* Welcome Banner */}
      <div className="max-w-7xl mx-auto bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg p-8 text-white">
        <h1 className="text-3xl font-bold">Welcome to Enterprise CAFM</h1>
        <p className="text-blue-100 mt-2">
          Current role: <span className="font-semibold">{currentRole}</span>
        </p>
        <p className="text-blue-100 text-sm mt-4">
          Comprehensive Computer-Aided Facility Management, Preventive Maintenance Planning, and Space Booking Platform
        </p>
      </div>

      {/* Key Metrics */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className={`${stat.bg} rounded-lg border border-gray-200 p-6 shadow-sm`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">
                    {stat.label}
                  </p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {stat.value}
                  </p>
                  <p className="text-xs text-green-600 font-medium mt-2">
                    {stat.change}
                  </p>
                </div>
                <Icon size={28} className={stat.color} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="max-w-7xl mx-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/locations"
            className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer"
          >
            <div className="text-2xl mb-2">📍</div>
            <h3 className="font-semibold text-gray-900">Manage Locations</h3>
            <p className="text-sm text-gray-600 mt-1">
              Configure buildings, floors, and rooms
            </p>
          </a>

          <a
            href="/equipment"
            className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer"
          >
            <div className="text-2xl mb-2">⚙️</div>
            <h3 className="font-semibold text-gray-900">Equipment Registry</h3>
            <p className="text-sm text-gray-600 mt-1">
              Asset management & QR code generation
            </p>
          </a>

          <a
            href="/floor-plans"
            className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer"
          >
            <div className="text-2xl mb-2">🗺️</div>
            <h3 className="font-semibold text-gray-900">Floor Plans</h3>
            <p className="text-sm text-gray-600 mt-1">
              Interactive 2D room visualizations
            </p>
          </a>
        </div>
      </div>

      {/* Sample Data Status */}
      <div className="max-w-7xl mx-auto bg-green-50 border border-green-200 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <Zap size={24} className="text-green-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-green-900">
              ✓ Sample Data Loaded
            </h3>
            <p className="text-sm text-green-700 mt-1">
              This demo uses realistic enterprise sample data:
              {sampleData.buildings && (
                <>
                  {" "}
                  {sampleData.buildings.length} building(s),{" "}
                  {sampleData.floors?.length || 0} floor(s),{" "}
                  {sampleData.rooms?.length || 0} room(s),{" "}
                  {sampleData.equipment?.length || 0} equipment item(s).
                </>
              )}
            </p>
            <p className="text-xs text-green-600 mt-2">
              All modules are fully functional with mock workflows. In production, these connect to Firebase Firestore & Cloud Functions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
