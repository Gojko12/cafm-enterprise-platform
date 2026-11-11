"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import {
  formatHours, formatPct, technicianScorecard, toCsv, type ScorecardWindow,
} from "@/lib/analytics-engine";
import type { DemoData } from "@/lib/cafm-data";
import { ColumnChart, KpiCard, Section, type DrilldownRequest } from "./analytics-ui";

const WINDOWS: ReadonlyArray<{ key: ScorecardWindow; label: string }> = [
  { key: "day", label: "Past Day" },
  { key: "week", label: "Past Week" },
  { key: "month", label: "Past Month" },
  { key: "ytd", label: "YTD 2026" },
];

export function TechniciansTab({ wrs, craftspeople, now, onDrilldown, registerExport }: {
  wrs: BaseWorkRequest[];
  craftspeople: DemoData["craftspeople"];
  now: Date;
  onDrilldown: (request: DrilldownRequest) => void;
  registerExport: (build: () => { name: string; csv: string }) => void;
}) {
  const [window, setWindow] = useState<ScorecardWindow>("week");
  const scorecard = useMemo(() => technicianScorecard(wrs, craftspeople, window, now), [wrs, craftspeople, window, now]);
  const dayCard = useMemo(() => technicianScorecard(wrs, craftspeople, "day", now), [wrs, craftspeople, now]);
  const weekCard = useMemo(() => technicianScorecard(wrs, craftspeople, "week", now), [wrs, craftspeople, now]);
  const monthCard = useMemo(() => technicianScorecard(wrs, craftspeople, "month", now), [wrs, craftspeople, now]);
  const hoursFor = (card: ReturnType<typeof technicianScorecard>, personId: string) =>
    card.stats.find((entry) => entry.personId === personId)?.totalHours ?? 0;

  useEffect(() => {
    registerExport(() => ({
      name: `technician-scorecard-${window}.csv`,
      csv: toCsv(
        ["Technician", "Trade", "Hours PM", "Hours FJ", "Hours LJ", "Total Hours", "Utilization %", "Planned vs Actual %", "Completed WRs", "Reopened WRs", "Reopen %", "FTR %", "Within Margin %", "Avg Hours/WR"],
        scorecard.stats.map((entry) => [entry.name, entry.trade, entry.hoursPM.toFixed(1), entry.hoursFJ.toFixed(1), entry.hoursLJ.toFixed(1),
          entry.totalHours.toFixed(1), formatPct(entry.utilizationPct), formatPct(entry.plannedVsActualPct), entry.completedWRs.length,
          entry.reopenedCount, formatPct(entry.reopenRatePct), formatPct(entry.ftrPct), formatPct(entry.withinMarginPct), formatHours(entry.avgHoursPerWr)]),
      ),
    }));
  }, [registerExport, scorecard, window]);

  const capacity = scorecard.stats[0]?.capacityHours ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded border border-gray-300 text-xs font-medium">
          {WINDOWS.map((option) => (
            <button key={option.key} onClick={() => setWindow(option.key)} aria-pressed={window === option.key}
              className={`px-2.5 py-1.5 ${window === option.key ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard tone="blue" label="Total Logged Hours" value={formatHours(scorecard.totals.hours)} sub={`${scorecard.stats.length} active technician(s)`} />
        <KpiCard tone="green" label="Avg Utilization" value={formatPct(scorecard.totals.avgUtilizationPct)} sub={`vs ${capacity}h capacity`} />
        <KpiCard tone="purple" label="Fleet First-Time-Right" value={formatPct(scorecard.totals.ftrPct)} sub="First QA verdict passed" />
        <KpiCard tone="red" label="Reopened WRs" value={scorecard.totals.reopened} sub="78% → 50% rework events" />
      </div>

      <Section title="Logged Hours per Technician (PM / FJ / LJ)">
        <ColumnChart referenceY={capacity ? { value: capacity, label: `${capacity}h target`, color: "#64748b" } : undefined}
          points={scorecard.stats.map((entry) => ({
            key: entry.personId,
            label: entry.name.split(" ")[0],
            segments: [
              { name: "PM", value: Math.round(entry.hoursPM * 10) / 10, color: "#2563eb" },
              { name: "FJ", value: Math.round(entry.hoursFJ * 10) / 10, color: "#10b981" },
              { name: "LJ", value: Math.round(entry.hoursLJ * 10) / 10, color: "#7c3aed" },
            ],
          }))}
          onBarClick={(point) => {
            const entry = scorecard.stats.find((stat) => stat.personId === point.key);
            if (entry) onDrilldown({ title: `${entry.name} — completed WRs in window`, subtitle: `${entry.totalHours.toFixed(1)}h logged`, wrs: entry.completedWRs });
          }}
          emptyText="No hours were logged in this window." />
      </Section>

      <Section title="Success Rate vs Reopen Rate">
        <ColumnChart mode="grouped"
          points={scorecard.stats.map((entry) => ({
            key: entry.personId,
            label: entry.name.split(" ")[0],
            segments: [
              { name: "FTR %", value: Math.round((entry.ftrPct ?? 0) * 10) / 10, color: "#10b981" },
              { name: "Within Margin %", value: Math.round((entry.withinMarginPct ?? 0) * 10) / 10, color: "#2563eb" },
              { name: "Reopen %", value: Math.round((entry.reopenRatePct ?? 0) * 10) / 10, color: "#dc2626" },
            ],
          }))}
          emptyText="No QA verdicts or completions in this window." />
      </Section>

      <Section title="Technician Performance Leaderboard">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-[11px] uppercase text-gray-500">
                <th className="py-1.5 pr-2">Technician</th><th className="pr-2">Trade</th>
                <th className="pr-2">Hours (Day)</th><th className="pr-2">Hours (Week)</th><th className="pr-2">Hours (Month)</th>
                <th className="pr-2">Utilization</th><th className="pr-2">Planned vs Actual</th>
                <th className="pr-2">Completed</th><th className="pr-2">Reopened</th><th className="pr-2">Reopen %</th>
                <th className="pr-2">FTR %</th><th className="pr-2">Within Margin</th><th className="pr-2">Avg h/WR</th>
              </tr>
            </thead>
            <tbody>
              {scorecard.stats.map((entry) => (
                <tr key={entry.personId} className="cursor-pointer border-b border-gray-100 hover:bg-blue-50"
                  onClick={() => onDrilldown({ title: `${entry.name} — completed WRs in window`, wrs: entry.completedWRs })}>
                  <td className="py-1.5 pr-2 font-bold text-gray-900">{entry.name}</td>
                  <td className="pr-2">{entry.trade}</td>
                  <td className="pr-2">{hoursFor(dayCard, entry.personId).toFixed(1)}</td>
                  <td className="pr-2">{hoursFor(weekCard, entry.personId).toFixed(1)}</td>
                  <td className="pr-2">{hoursFor(monthCard, entry.personId).toFixed(1)}</td>
                  <td className="pr-2">{formatPct(entry.utilizationPct)}</td>
                  <td className="pr-2">{formatPct(entry.plannedVsActualPct)}</td>
                  <td className="pr-2 font-semibold">{entry.completedWRs.length}</td>
                  <td className={`pr-2 ${entry.reopenedCount ? "font-bold text-red-700" : ""}`}>{entry.reopenedCount}</td>
                  <td className="pr-2">{formatPct(entry.reopenRatePct)}</td>
                  <td className="pr-2">{formatPct(entry.ftrPct)}</td>
                  <td className="pr-2">{formatPct(entry.withinMarginPct)}</td>
                  <td className="pr-2">{formatHours(entry.avgHoursPerWr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!scorecard.stats.length && <p className="py-4 text-center text-xs text-gray-500">No technician activity in this window.</p>}
        </div>
      </Section>
    </div>
  );
}
