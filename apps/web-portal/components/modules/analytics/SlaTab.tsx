"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { formatDateDDMMYYYY } from "@cafm/shared-schema";
import {
  breachChurn, netTrendPct, pointInTimeBreachSeries, slaKpis, toCsv,
  type BreachChurn, type CheckpointGranularity, type WrTypeFilter,
} from "@/lib/analytics-engine";
import { ColumnChart, KpiCard, Section, type ColumnChartPoint, type DrilldownRequest } from "./analytics-ui";

const PM_COLOR = "#2563eb";
const FJ_COLOR = "#10b981";
const WINDOWS = [{ key: 1, label: "Past Day" }, { key: 7, label: "Past Week" }, { key: 30, label: "Past Month" }] as const;

function Toggle<T extends string | number>({ options, value, onChange }: {
  options: ReadonlyArray<{ key: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded border border-gray-300 text-xs font-medium">
      {options.map((option) => (
        <button key={String(option.key)} onClick={() => onChange(option.key)} aria-pressed={value === option.key}
          className={`px-2.5 py-1.5 ${value === option.key ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ChurnFlow({ title, churn, onDrilldown }: {
  title: string;
  churn: BreachChurn;
  onDrilldown: (request: DrilldownRequest) => void;
}) {
  const scale = Math.max(churn.prior.length, churn.newlyEnteredStillOpen.length + churn.newlyEnteredClosed.length, churn.current.length, 1);
  const windowLabel = churn.windowDays === 1 ? "past 24h" : churn.windowDays === 7 ? "past 7 days" : "past 30 days";
  const metricLabel = churn.metric === "overdue" ? "OverDue" : "OverMargin";
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <h4 className="text-xs font-bold text-gray-900">{title}</h4>
      <p className="mb-2 text-[11px] text-gray-500">Breach churn over the {windowLabel}</p>
      <div className="grid grid-cols-2 gap-2">
        <KpiCard tone="slate" label="Prior Breach Cohort" value={churn.prior.length}
          sub={`Already ${metricLabel} at window start`}
          onClick={() => onDrilldown({ title: `${metricLabel}: prior breach cohort`, subtitle: `In breach at window start (${windowLabel})`, wrs: churn.prior })} />
        <KpiCard tone="green" label="Closed from Prior Breach" value={churn.closedFromPrior.length}
          sub={churn.recoveryPct === null ? "No prior cohort" : `${churn.recoveryPct.toFixed(1)}% recovered`}
          onClick={() => onDrilldown({ title: `${metricLabel}: recovered from breach`, subtitle: `Closed during the ${windowLabel}`, wrs: churn.closedFromPrior })} />
        <KpiCard tone="red" label="Newly Entered Breach" value={churn.newlyEnteredStillOpen.length + churn.newlyEnteredClosed.length}
          sub={`${churn.newlyEnteredStillOpen.length} still open · ${churn.newlyEnteredClosed.length} crossed & closed`}
          onClick={() => onDrilldown({ title: `${metricLabel}: newly entered breach`, subtitle: `Crossed the ${metricLabel} threshold during the ${windowLabel}`, wrs: [...churn.newlyEnteredStillOpen, ...churn.newlyEnteredClosed] })} />
        <KpiCard tone={churn.netChange > 0 ? "red" : churn.netChange < 0 ? "green" : "slate"} label="Net Change"
          value={`${churn.netChange > 0 ? "+" : ""}${churn.netChange}`}
          sub={`${churn.current.length} currently ${metricLabel}`}
          onClick={() => onDrilldown({ title: `${metricLabel}: current breach backlog`, wrs: churn.current })} />
      </div>
      {/* Diverging recovery vs inflow bars */}
      <div className="mt-3 space-y-1 text-[10px] text-gray-600">
        <div className="flex items-center gap-1">
          <div className="flex h-3 flex-1 justify-end overflow-hidden rounded-l bg-gray-100">
            <div className="h-full bg-emerald-500" style={{ width: `${(churn.closedFromPrior.length / scale) * 100}%` }} />
          </div>
          <span className="w-24 text-center font-semibold">Recovered {churn.closedFromPrior.length}</span>
          <div className="flex h-3 flex-1 overflow-hidden rounded-r bg-gray-100">
            <div className="h-full bg-red-500" style={{ width: `${(churn.newlyEnteredStillOpen.length / scale) * 100}%` }} />
          </div>
        </div>
        <div className="flex justify-between"><span>← Breach recovery</span><span>New breach inflow →</span></div>
      </div>
    </div>
  );
}

export function SlaTab({ wrs, now, onDrilldown, registerExport }: {
  wrs: BaseWorkRequest[];
  now: Date;
  onDrilldown: (request: DrilldownRequest) => void;
  registerExport: (build: () => { name: string; csv: string }) => void;
}) {
  const [typeFilter, setTypeFilter] = useState<WrTypeFilter>("ALL");
  const [granularity, setGranularity] = useState<CheckpointGranularity>("monthly");
  const [windowDays, setWindowDays] = useState<1 | 7 | 30>(7);

  const series = useMemo(() => pointInTimeBreachSeries(wrs, granularity, now), [wrs, granularity, now]);
  const kpis = useMemo(() => slaKpis(wrs, now), [wrs, now]);
  const overdueTrend = useMemo(() => netTrendPct(pointInTimeBreachSeries(wrs, "monthly", now), "overdue"), [wrs, now]);
  const overdueChurn = useMemo(() => breachChurn(wrs, "overdue", windowDays, typeFilter, now), [wrs, windowDays, typeFilter, now]);
  const overMarginChurn = useMemo(() => breachChurn(wrs, "overmargin", windowDays, typeFilter, now), [wrs, windowDays, typeFilter, now]);

  const buildPoints = (metric: "overdue" | "overmargin"): ColumnChartPoint[] => series.map((point) => {
    const pm = metric === "overdue" ? point.pmOverdue : point.pmOverMargin;
    const fj = metric === "overdue" ? point.fjOverdue : point.fjOverMargin;
    const segments = [
      ...(typeFilter !== "FJ" ? [{ name: "PM", value: pm.length, color: PM_COLOR }] : []),
      ...(typeFilter !== "PM" ? [{ name: "FJ", value: fj.length, color: FJ_COLOR }] : []),
    ];
    const total = (typeFilter !== "FJ" ? pm.length : 0) + (typeFilter !== "PM" ? fj.length : 0);
    return { key: point.date, label: point.label, segments, line: total };
  });

  const drill = (metric: "overdue" | "overmargin") => (point: ColumnChartPoint) => {
    const checkpoint = series.find((entry) => entry.date === point.key);
    if (!checkpoint) return;
    const pm = metric === "overdue" ? checkpoint.pmOverdue : checkpoint.pmOverMargin;
    const fj = metric === "overdue" ? checkpoint.fjOverdue : checkpoint.fjOverMargin;
    const list = [...(typeFilter !== "FJ" ? pm : []), ...(typeFilter !== "PM" ? fj : [])];
    onDrilldown({
      title: `${metric === "overdue" ? "OverDue" : "OverMargin"} WRs at ${point.label}`,
      subtitle: `Point-in-time snapshot · ${typeFilter === "ALL" ? "PM + FJ" : typeFilter}`,
      wrs: list,
    });
  };

  useEffect(() => {
    registerExport(() => ({
      name: `sla-overdue-overmargin-${granularity}.csv`,
      csv: toCsv(
        ["Checkpoint (DD-MM-YYYY)", "PM OverDue", "FJ OverDue", "Total OverDue", "PM OverMargin", "FJ OverMargin", "Total OverMargin"],
        series.map((point) => [point.label, point.pmOverdue.length, point.fjOverdue.length,
          point.pmOverdue.length + point.fjOverdue.length, point.pmOverMargin.length, point.fjOverMargin.length,
          point.pmOverMargin.length + point.fjOverMargin.length]),
      ),
    }));
  }, [registerExport, series, granularity]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Toggle options={[{ key: "ALL", label: "PM + FJ" }, { key: "PM", label: "PM" }, { key: "FJ", label: "FJ" }] as const} value={typeFilter} onChange={setTypeFilter} />
        <Toggle options={[{ key: "monthly", label: "Monthly (01-MM-2026)" }, { key: "weekly", label: "Weekly (12w)" }, { key: "daily", label: "Daily (30d)" }] as const} value={granularity} onChange={setGranularity} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard tone="green" label="On-Time %" value={kpis.onTimePct === null ? "—" : `${kpis.onTimePct.toFixed(1)}%`} sub="Completed 2026 PM + FJ" />
        <KpiCard tone="blue" label="Within Margin %" value={kpis.withinMarginPct === null ? "—" : `${kpis.withinMarginPct.toFixed(1)}%`} sub="Completed 2026 PM + FJ" />
        <KpiCard tone="red" label="Current OverDue" value={kpis.currentOverdue.length}
          onClick={() => onDrilldown({ title: "Currently OverDue WRs", wrs: kpis.currentOverdue })} sub="Click to drill down" />
        <KpiCard tone="amber" label="Current OverMargin" value={kpis.currentOverMargin.length}
          onClick={() => onDrilldown({ title: "Currently OverMargin WRs", wrs: kpis.currentOverMargin })} sub="Click to drill down" />
        <KpiCard tone="purple" label={`Net Trend since ${formatDateDDMMYYYY("2026-01-01")}`}
          value={overdueTrend === null ? "—" : `${overdueTrend >= 0 ? "▼" : "▲"} ${Math.abs(overdueTrend).toFixed(0)}%`}
          sub={overdueTrend !== null && overdueTrend >= 0 ? "OverDue backlog reduced" : "OverDue backlog grew"} />
      </div>

      <Section title={`Point-in-Time OverDue WRs (${formatDateDDMMYYYY("2026-01-01")} → Today)`}>
        <ColumnChart points={buildPoints("overdue")} lineName="Total trend" onBarClick={drill("overdue")} />
      </Section>

      <Section title={`Point-in-Time OverMargin WRs (${formatDateDDMMYYYY("2026-01-01")} → Today)`}>
        <ColumnChart points={buildPoints("overmargin")} lineName="Total trend" onBarClick={drill("overmargin")} />
      </Section>

      <Section title="Breach Churn & Recovery" right={<Toggle options={WINDOWS} value={windowDays} onChange={(value) => setWindowDays(value as 1 | 7 | 30)} />}>
        <div className="grid gap-3 lg:grid-cols-2">
          <ChurnFlow title="OverDue Flow" churn={overdueChurn} onDrilldown={onDrilldown} />
          <ChurnFlow title="OverMargin Flow" churn={overMarginChurn} onDrilldown={onDrilldown} />
        </div>
      </Section>
    </div>
  );
}
