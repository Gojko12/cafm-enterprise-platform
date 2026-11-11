"use client";

import React, { useEffect, useMemo } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { formatDateDDMMYYYY } from "@cafm/shared-schema";
import { formatDays, isActiveAt, longJobAnalytics, LJ_AGE_BUCKETS, toCsv } from "@/lib/analytics-engine";
import { ColumnChart, HBarRow, KpiCard, Section, type DrilldownRequest } from "./analytics-ui";

export function LongJobsTab({ wrs, now, onDrilldown, onOpenWr, registerExport }: {
  wrs: BaseWorkRequest[];
  now: Date;
  onDrilldown: (request: DrilldownRequest) => void;
  onOpenWr: (wr: BaseWorkRequest) => void;
  registerExport: (build: () => { name: string; csv: string }) => void;
}) {
  const lj = useMemo(() => longJobAnalytics(wrs, now), [wrs, now]);
  const nowMs = now.getTime();
  const openBacklog = useMemo(() => wrs.filter((wr) => isActiveAt(wr, nowMs)), [wrs, nowMs]);

  const statusBuckets = useMemo(() => {
    const buckets = [
      { label: "Issued (50%)", match: (wr: BaseWorkRequest) => wr.Percentage === 50 },
      { label: "On Hold (55%)", match: (wr: BaseWorkRequest) => wr.Percentage === 55 },
      { label: "Tech Completed (78–99%)", match: (wr: BaseWorkRequest) => wr.Percentage >= 78 && wr.Percentage < 100 },
      { label: "Early LJ stages (<50%)", match: (wr: BaseWorkRequest) => wr.Percentage > 0 && wr.Percentage < 50 },
    ];
    return buckets.map((bucket) => ({ ...bucket, wrs: openBacklog.filter(bucket.match) }));
  }, [openBacklog]);

  const tradeBuckets = useMemo(() => {
    const map = new Map<string, BaseWorkRequest[]>();
    for (const wr of openBacklog) {
      const trade = wr.TradeName ?? wr.TradeId ?? "Unspecified";
      map.set(trade, [...(map.get(trade) ?? []), wr]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [openBacklog]);

  const maxDwell = Math.max(1, ...lj.stageDwellStats.map((stat) => stat.avgDays ?? 0));
  const maxAge = Math.max(1, ...LJ_AGE_BUCKETS.map((bucket) => lj.openByAgeBucket[bucket].length));

  useEffect(() => {
    registerExport(() => ({
      name: "long-jobs-stage-analytics.csv",
      csv: toCsv(
        ["Stage", "Avg Days", "Median Days", "Max Days", "Currently In Stage"],
        lj.stageDwellStats.map((stat) => [stat.stage, formatDays(stat.avgDays), formatDays(stat.medianDays), formatDays(stat.maxDays), stat.currentCount]),
      ),
    }));
  }, [registerExport, lj]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <KpiCard tone="blue" label="Open LJs Now" value={lj.openNow.length}
          onClick={() => onDrilldown({ title: "Open Long Jobs", wrs: lj.openNow })} sub="Click to drill down" />
        <KpiCard tone="slate" label="Avg Days In Process" value={formatDays(lj.avgDaysInProcessOpen)} sub={`Median ${formatDays(lj.medianDaysInProcessOpen)} days`} />
        <KpiCard tone="purple" label="Avg Start-to-End Cycle" value={`${formatDays(lj.completedLeadTime.avg)} d`}
          sub={`Median ${formatDays(lj.completedLeadTime.median)} · Min ${formatDays(lj.completedLeadTime.min)} · Max ${formatDays(lj.completedLeadTime.max)}`} />
        <KpiCard tone="cyan" label="Blocked / On Hold (55%)" value={lj.blockedOnHold.length}
          onClick={() => onDrilldown({ title: "Blocked / On-Hold Long Jobs", wrs: lj.blockedOnHold })} sub="Click to drill down" />
        <KpiCard tone="red" label="Overdue Target Date" value={lj.overdueTarget.length}
          onClick={() => onDrilldown({ title: "LJs past their target date", wrs: lj.overdueTarget })} sub="Click to drill down" />
        <KpiCard tone="amber" label="Total Open Backlog" value={openBacklog.length}
          onClick={() => onDrilldown({ title: "All open PM / FJ / LJ work requests", wrs: openBacklog })} sub="PM + FJ + LJ" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Stage Dwell-Time Bottlenecks (avg / median days per stage)">
          <div className="space-y-1">
            {lj.stageDwellStats.map((stat) => (
              <HBarRow key={stat.stage} label={`Stage ${stat.stage} · ${stat.currentCount} currently here`}
                value={stat.avgDays ?? 0} max={maxDwell}
                color={(stat.avgDays ?? 0) >= maxDwell * 0.75 ? "#dc2626" : "#2563eb"}
                display={`avg ${formatDays(stat.avgDays)}d · med ${formatDays(stat.medianDays)}d · max ${formatDays(stat.maxDays)}d`}
                onClick={stat.currentCount ? () => onDrilldown({ title: `LJs currently in stage ${stat.stage}`, wrs: stat.currentLjs }) : undefined} />
            ))}
          </div>
        </Section>

        <Section title="Open LJ Ageing Histogram">
          <div className="space-y-1">
            {LJ_AGE_BUCKETS.map((bucket) => (
              <HBarRow key={bucket} label={bucket} value={lj.openByAgeBucket[bucket].length} max={maxAge}
                color={bucket === "90d+" ? "#dc2626" : bucket === "61–90d" ? "#f59e0b" : "#10b981"}
                onClick={lj.openByAgeBucket[bucket].length ? () => onDrilldown({ title: `Open LJs aged ${bucket}`, wrs: lj.openByAgeBucket[bucket] }) : undefined} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded border border-gray-200 p-2">
              <p className="font-semibold text-gray-700">Hours: estimated vs actual</p>
              <p className="text-gray-900">{Math.round(lj.hoursVariance.expected)}h planned · {Math.round(lj.hoursVariance.actual)}h actual
                {lj.hoursVariance.expected > 0 && <span className="ml-1 text-gray-500">({((lj.hoursVariance.actual / lj.hoursVariance.expected) * 100).toFixed(0)}%)</span>}</p>
            </div>
            <div className="rounded border border-gray-200 p-2">
              <p className="font-semibold text-gray-700">Cost: estimated vs actual</p>
              <p className="text-gray-900">€{Math.round(lj.costVariance.estimated).toLocaleString("en-GB")} est · €{Math.round(lj.costVariance.actual).toLocaleString("en-GB")} actual</p>
            </div>
          </div>
        </Section>
      </div>

      <Section title="Monthly LJ Created vs Completed & Lead-Time Trend (2026)">
        <ColumnChart mode="grouped" lineName="Avg lead days"
          points={lj.monthlyThroughput.map((month) => ({
            key: month.month, label: month.label,
            segments: [
              { name: "Created", value: month.created, color: "#2563eb" },
              { name: "Completed", value: month.completed, color: "#10b981" },
            ],
            line: month.avgLeadDays ?? undefined,
          }))} />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Open WRs by Status">
          <div className="space-y-1">
            {statusBuckets.map((bucket) => (
              <HBarRow key={bucket.label} label={bucket.label} value={bucket.wrs.length} max={Math.max(1, ...statusBuckets.map((entry) => entry.wrs.length))}
                onClick={bucket.wrs.length ? () => onDrilldown({ title: `Open WRs · ${bucket.label}`, wrs: bucket.wrs }) : undefined} />
            ))}
          </div>
        </Section>
        <Section title="Open WRs by Trade">
          <div className="space-y-1">
            {tradeBuckets.map(([trade, list]) => (
              <HBarRow key={trade} label={trade} value={list.length} max={Math.max(1, tradeBuckets[0]?.[1].length ?? 1)} color="#7c3aed"
                onClick={() => onDrilldown({ title: `Open WRs · ${trade}`, wrs: list })} />
            ))}
            {!tradeBuckets.length && <p className="py-4 text-center text-xs text-gray-500">No open work requests.</p>}
          </div>
        </Section>
      </div>

      <Section title="Open & Bottlenecked Long Jobs (longest running first)">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-[11px] uppercase text-gray-500">
                <th className="py-1.5 pr-2">LJ ID</th><th className="pr-2">Stage</th><th className="pr-2">Description</th>
                <th className="pr-2">Trade</th><th className="pr-2">Created</th><th className="pr-2">Target</th>
                <th className="pr-2">Age (days)</th><th className="pr-2">Est / Act Hours</th>
              </tr>
            </thead>
            <tbody>
              {lj.longestOpen.map(({ wr, ageDays }) => {
                const overdue = wr.DueDate && wr.DueDate < now.toISOString().slice(0, 10);
                return (
                  <tr key={wr.WR_ID} className="cursor-pointer border-b border-gray-100 hover:bg-blue-50" onClick={() => onOpenWr(wr)}>
                    <td className="py-1.5 pr-2 font-bold text-blue-700 underline">{wr.WR_ID}</td>
                    <td className="pr-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${wr.Percentage === 55 ? "bg-cyan-100 text-cyan-800" : "bg-purple-100 text-purple-800"}`}>{wr.Percentage}%</span></td>
                    <td className="max-w-64 truncate pr-2">{wr.Description}</td>
                    <td className="pr-2">{wr.TradeName ?? "—"}</td>
                    <td className="pr-2">{formatDateDDMMYYYY(wr.CreatedDate)}</td>
                    <td className={`pr-2 ${overdue ? "font-bold text-red-700" : ""}`}>{formatDateDDMMYYYY(wr.DueDate) || "—"}</td>
                    <td className="pr-2 font-semibold">{Math.round(ageDays)}</td>
                    <td className="pr-2">{wr.ExpectedHours ?? "—"} / {Math.round((wr.TotalTimeMinutes ?? 0) / 6) / 10}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!lj.longestOpen.length && <p className="py-4 text-center text-xs text-gray-500">No open Long Jobs.</p>}
        </div>
      </Section>
    </div>
  );
}
