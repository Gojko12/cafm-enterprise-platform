"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, Building, Calendar, CheckCircle, Clock, Cog, Map, Users, Wrench, Zap,
} from "lucide-react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { formatDateDDMMYYYY } from "@cafm/shared-schema";
import { useApp } from "@/lib/hooks/useApp";
import { useCafmStore } from "@/lib/cafm-store";
import { completionMs, dueMs, isActiveAt, isCancelled, isOverdueAt, isOverMarginAt } from "@/lib/analytics-engine";
import { QAReportNotifications } from "@/components/modules/QAReportNotifications";

const WR_TYPE_TONE: Record<string, string> = {
  PM: "bg-blue-100 text-blue-800",
  FJ: "bg-emerald-100 text-emerald-800",
  LJ: "bg-amber-100 text-amber-800",
};

const QUICK_ACTIONS = [
  { href: "/locations", icon: Building, title: "Manage Locations", text: "Configure buildings, floors, and rooms" },
  { href: "/equipment", icon: Cog, title: "Equipment Registry", text: "Asset management & QR code generation" },
  { href: "/floor-plans", icon: Map, title: "Floor Plans", text: "Interactive 2D room visualizations" },
  { href: "/preventive-maintenance", icon: Wrench, title: "Preventive Maintenance", text: "Execute and track PM work requests" },
  { href: "/scheduler", icon: Calendar, title: "Scheduler", text: "Dispatch calendar and craftsperson shifts" },
  { href: "/fast-jobs", icon: Zap, title: "Fast Jobs", text: "Rapid corrective tickets and follow-ups" },
];

export default function DashboardPage() {
  const { currentRole } = useApp();
  const { data } = useCafmStore();
  const workRequests = data.workRequests;

  const metrics = useMemo(() => {
    const now = Date.now();
    const active = workRequests.filter((wr) => isActiveAt(wr, now));
    const activeByType = (type: string) => active.filter((wr) => wr.WR_Type === type).length;
    const overdue = workRequests
      .filter((wr) => isOverdueAt(wr, now))
      .sort((a, b) => (dueMs(a) ?? 0) - (dueMs(b) ?? 0));
    const overMargin = workRequests.filter((wr) => isOverMarginAt(wr, now)).length;
    const pmDueToDate = workRequests.filter((wr) =>
      wr.WR_Type === "PM" && !isCancelled(wr) && (dueMs(wr) ?? Infinity) <= now);
    const pmOnTime = pmDueToDate.filter((wr) => {
      const completed = completionMs(wr);
      return completed !== null && completed <= (dueMs(wr) ?? completed);
    });
    const compliance = pmDueToDate.length > 0 ? Math.round((pmOnTime.length / pmDueToDate.length) * 100) : null;
    const trades = new Set(data.craftspeople.map((person) => person.Trade)).size;
    return {
      activeCount: active.length,
      pmCount: activeByType("PM"),
      fjCount: activeByType("FJ"),
      ljCount: activeByType("LJ"),
      overdue,
      overMargin,
      compliance,
      pmOnTime: pmOnTime.length,
      pmDueToDate: pmDueToDate.length,
      craftspeople: data.craftspeople.length,
      trades,
    };
  }, [workRequests, data.craftspeople]);

  const ACTIVITY_PAGE_SIZE = 20;
  const [activityQuery, setActivityQuery] = useState("");
  const [activityVisible, setActivityVisible] = useState(ACTIVITY_PAGE_SIZE);
  const activityRef = useRef<HTMLDivElement | null>(null);

  const recentActivity = useMemo(() => {
    const entries = workRequests.flatMap((wr) =>
      (wr.Activity ?? []).map((entry) => ({
        wrId: wr.WR_ID, wrType: wr.WR_Type, createdAt: entry.createdAt,
        actorName: entry.actorName, kind: entry.kind, text: entry.text,
      })));
    return entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [workRequests]);

  // Keyword filter over the full history (the history itself is never
  // rendered in one pass, only the batches below are).
  const filteredActivity = useMemo(() => {
    const q = activityQuery.trim().toLowerCase();
    if (!q) return recentActivity;
    return recentActivity.filter((entry) =>
      [entry.wrId, entry.actorName, entry.kind, entry.text, entry.createdAt]
        .some((field) => (field ?? "").toLowerCase().includes(q)));
  }, [recentActivity, activityQuery]);

  // A new keyword restarts from the first batch.
  useEffect(() => {
    setActivityVisible(ACTIVITY_PAGE_SIZE);
  }, [activityQuery]);

  const shownActivity = filteredActivity.slice(0, activityVisible);

  // Lazy batches: extend the visible window only when the user scrolls
  // near the bottom of the panel's own scroll area.
  const handleActivityScroll = () => {
    const el = activityRef.current;
    if (!el || activityVisible >= filteredActivity.length) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
      setActivityVisible((v) => v + ACTIVITY_PAGE_SIZE);
    }
  };

  const stats = [
    {
      label: "Active Work Requests", value: metrics.activeCount,
      sub: `${metrics.pmCount} PM · ${metrics.fjCount} FJ · ${metrics.ljCount} LJ`,
      icon: AlertCircle, color: "text-blue-600", bg: "bg-blue-50",
    },
    {
      label: "Overdue WRs", value: metrics.overdue.length,
      sub: `${metrics.overMargin} past margin date`,
      icon: Clock, color: "text-red-600", bg: "bg-red-50",
    },
    {
      label: "PM On-Time Compliance",
      value: metrics.compliance === null ? "—" : `${metrics.compliance}%`,
      sub: `${metrics.pmOnTime} of ${metrics.pmDueToDate} PMs due to date`,
      icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50",
    },
    {
      label: "Registered Craftspeople", value: metrics.craftspeople,
      sub: `${metrics.trades} trades covered`,
      icon: Users, color: "text-purple-600", bg: "bg-purple-50",
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

      {/* Key Metrics (live from site state) */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className={`${stat.bg} rounded-lg border border-gray-200 p-6 shadow-sm`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">{stat.label}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
                  <p className="text-xs text-gray-500 font-medium mt-2">{stat.sub}</p>
                </div>
                <Icon size={28} className={stat.color} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Overdue Spotlight */}
      {metrics.overdue.length > 0 && (
        <div className="max-w-7xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Overdue Spotlight</h2>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {metrics.overdue.slice(0, 5).map((wr: BaseWorkRequest) => (
              <Link key={wr.WR_ID} href="/work-requests" className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
                <span className="font-mono text-sm text-gray-700">{wr.WR_ID}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${WR_TYPE_TONE[wr.WR_Type] ?? "bg-gray-100 text-gray-800"}`}>
                  {wr.WR_Type}
                </span>
                <span className="flex-1 truncate text-sm text-gray-700">{wr.Description}</span>
                {wr.MarginDate && <span className="text-xs text-gray-400">Margin {formatDateDDMMYYYY(wr.MarginDate)}</span>}
                <span className="text-xs font-semibold text-red-600">Due {formatDateDDMMYYYY(wr.DueDate ?? wr.CreatedDate)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold text-gray-900">Recent Activity</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={activityQuery}
              onChange={(e) => setActivityQuery(e.target.value)}
              placeholder="Search by keyword, ID or user"
              className="w-72 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <span className="text-xs text-gray-500 whitespace-nowrap">
              Showing {shownActivity.length} of {filteredActivity.length}
            </span>
          </div>
        </div>
        <div
          ref={activityRef}
          onScroll={handleActivityScroll}
          className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-[480px] overflow-y-auto"
        >
          {recentActivity.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-500">No activity recorded for this site yet.</p>
          )}
          {recentActivity.length > 0 && filteredActivity.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-500">No entries match your search.</p>
          )}
          {shownActivity.map((entry) => (
            <div key={`${entry.wrId}-${entry.createdAt}-${entry.text}`} className="flex items-baseline gap-3 px-4 py-3">
              <span className="font-mono text-xs text-gray-400">{formatDateDDMMYYYY(entry.createdAt)}</span>
              <span className="font-mono text-xs text-gray-600">{entry.wrId}</span>
              <span className="text-xs font-semibold text-gray-700">{entry.actorName}</span>
              <span className="flex-1 truncate text-sm text-gray-600">{entry.text}</span>
            </div>
          ))}
          {shownActivity.length < filteredActivity.length && (
            <p className="px-4 py-2 text-xs text-gray-400">Scroll for more...</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="max-w-7xl mx-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg hover:border-blue-300 transition-all">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{action.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{action.text}</p>
                  </div>
                  <Icon size={24} className="text-blue-600" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Live Data Summary */}
      <div className="max-w-7xl mx-auto bg-slate-50 border border-slate-200 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <Cog size={24} className="text-slate-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-slate-900">Live Site Data</h3>
            <p className="text-sm text-slate-700 mt-1">
              {data.buildings.length} building(s), {data.floors.length} floor(s), {data.rooms.length} room(s),{" "}
              {data.equipment.length} equipment item(s), {workRequests.length} work request(s).
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Synchronized live against the CAFM state backend with revision-based conflict checks; the numbers above are computed from the current site state, not mocked values.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
