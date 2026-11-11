"use client";

/**
 * Shared UI primitives for the Executive Analytics dashboard: KPI cards,
 * interactive SVG column/bar charts with hover tooltips and click-to-drilldown,
 * the WR drilldown drawer, and CSV download helpers. All dates are DD-MM-YYYY.
 */

import React, { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { formatDateDDMMYYYY } from "@cafm/shared-schema";

// ---------------------------------------------------------------------------
// KPI cards & sections
// ---------------------------------------------------------------------------

export type KpiTone = "green" | "blue" | "red" | "amber" | "purple" | "slate" | "cyan";

const KPI_TONES: Record<KpiTone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  blue: "border-blue-200 bg-blue-50 text-blue-900",
  red: "border-red-200 bg-red-50 text-red-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  purple: "border-purple-200 bg-purple-50 text-purple-900",
  slate: "border-slate-200 bg-slate-50 text-slate-900",
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-900",
};

export function KpiCard({ label, value, sub, tone = "slate", onClick }: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: KpiTone;
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold leading-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] opacity-80">{sub}</p>}
    </>
  );
  const className = `rounded-lg border p-3 text-left ${KPI_TONES[tone]} ${onClick ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`;
  return onClick
    ? <button type="button" onClick={onClick} className={className}>{content}</button>
    : <div className={className}>{content}</div>;
}

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Interactive SVG column chart (stacked / grouped) with trend line & tooltips
// ---------------------------------------------------------------------------

export interface ChartSegment {
  name: string;
  value: number;
  color: string;
}

export interface ColumnChartPoint {
  key: string;
  /** DD-MM-YYYY (or similar) axis label. */
  label: string;
  segments: ChartSegment[];
  /** Optional trend value plotted as a line (same unit as bars unless lineIsPct). */
  line?: number;
}

export function ColumnChart({ points, mode = "stacked", height = 230, lineName, lineIsPct, referenceY, onBarClick, emptyText }: {
  points: ColumnChartPoint[];
  mode?: "stacked" | "grouped";
  height?: number;
  lineName?: string;
  /** Plot `line` against a fixed 0–100% right-hand axis (Pareto curves). */
  lineIsPct?: boolean;
  referenceY?: { value: number; label: string; color?: string };
  onBarClick?: (point: ColumnChartPoint, index: number) => void;
  emptyText?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const width = 760;
  const margin = { top: 14, right: lineIsPct ? 38 : 12, bottom: 34, left: 34 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const totals = points.map((point) => mode === "stacked"
    ? point.segments.reduce((sum, segment) => sum + segment.value, 0)
    : Math.max(0, ...point.segments.map((segment) => segment.value)));
  const maxValue = Math.max(1, ...totals, referenceY && !lineIsPct ? referenceY.value : 0,
    ...(!lineIsPct ? points.map((point) => point.line ?? 0) : [0]));
  const yScale = (value: number) => innerH - (value / maxValue) * innerH;
  const slot = innerW / Math.max(points.length, 1);
  const barWidth = Math.min(40, slot * 0.62);
  const xCenter = (index: number) => margin.left + slot * index + slot / 2;
  const labelEvery = Math.ceil(points.length / 14);

  if (!points.length || !points.some((point, index) => totals[index] > 0 || (point.line ?? 0) > 0)) {
    return <p className="py-8 text-center text-xs text-gray-500">{emptyText ?? "No data for the current filters."}</p>;
  }

  const hovered = hover !== null ? points[hover] : null;
  return (
    <div ref={containerRef} className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
        {/* Y grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = margin.top + innerH - fraction * innerH;
          return (
            <g key={fraction}>
              <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="#e5e7eb" strokeWidth={1} />
              <text x={margin.left - 5} y={y + 3} textAnchor="end" fontSize={9} fill="#6b7280">{Math.round(fraction * maxValue)}</text>
            </g>
          );
        })}
        {lineIsPct && [0, 50, 100].map((pct) => (
          <text key={pct} x={width - margin.right + 4} y={margin.top + innerH - (pct / 100) * innerH + 3} fontSize={9} fill="#7c3aed">{pct}%</text>
        ))}
        {referenceY && !lineIsPct && (
          <g>
            <line x1={margin.left} x2={width - margin.right} y1={margin.top + yScale(referenceY.value)} y2={margin.top + yScale(referenceY.value)}
              stroke={referenceY.color ?? "#64748b"} strokeDasharray="5 4" strokeWidth={1.5} />
            <text x={width - margin.right - 2} y={margin.top + yScale(referenceY.value) - 4} textAnchor="end" fontSize={9} fill={referenceY.color ?? "#64748b"}>{referenceY.label}</text>
          </g>
        )}
        {/* Bars */}
        {points.map((point, index) => {
          const cx = xCenter(index);
          const groupCount = Math.max(point.segments.length, 1);
          const groupedWidth = barWidth / groupCount;
          let stackY = margin.top + innerH;
          return (
            <g key={point.key}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover((current) => (current === index ? null : current))}
              onClick={onBarClick ? () => onBarClick(point, index) : undefined}
              className={onBarClick ? "cursor-pointer" : undefined}>
              {/* Hit area */}
              <rect x={cx - slot / 2} y={margin.top} width={slot} height={innerH} fill={hover === index ? "rgba(59,130,246,0.08)" : "transparent"} />
              {point.segments.map((segment, segmentIndex) => {
                const h = (segment.value / maxValue) * innerH;
                if (mode === "stacked") {
                  stackY -= h;
                  return <rect key={segment.name} x={cx - barWidth / 2} y={stackY} width={barWidth} height={h} fill={segment.color} rx={1.5} />;
                }
                return <rect key={segment.name} x={cx - barWidth / 2 + segmentIndex * groupedWidth} y={margin.top + yScale(segment.value)}
                  width={groupedWidth - 1} height={h} fill={segment.color} rx={1.5} />;
              })}
              {(index % labelEvery === 0 || index === points.length - 1) && (
                <text x={cx} y={height - 8} textAnchor="middle" fontSize={8.5} fill="#6b7280"
                  transform={points.length > 16 ? `rotate(-38 ${cx} ${height - 8})` : undefined}>{point.label}</text>
              )}
            </g>
          );
        })}
        {/* Trend line */}
        {points.some((point) => point.line !== undefined) && (
          <>
            <polyline fill="none" stroke="#7c3aed" strokeWidth={2}
              points={points.map((point, index) => {
                const value = point.line ?? 0;
                const y = lineIsPct ? margin.top + innerH - (value / 100) * innerH : margin.top + yScale(value);
                return `${xCenter(index)},${y}`;
              }).join(" ")} />
            {points.map((point, index) => {
              const value = point.line ?? 0;
              const y = lineIsPct ? margin.top + innerH - (value / 100) * innerH : margin.top + yScale(value);
              return <circle key={point.key} cx={xCenter(index)} cy={y} r={2.4} fill="#7c3aed" />;
            })}
          </>
        )}
      </svg>
      {/* Tooltip */}
      {hovered && hover !== null && (
        <div className="pointer-events-none absolute z-10 min-w-40 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: `${(xCenter(hover) / width) * 100}%`, top: 0, transform: `translateX(${hover > points.length / 2 ? "-105%" : "5%"})` }}>
          <p className="font-bold text-gray-900">{hovered.label}</p>
          {hovered.segments.map((segment) => (
            <p key={segment.name} className="flex items-center gap-1.5 text-gray-700">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: segment.color }} />
              {segment.name}: <strong>{segment.value}</strong>
            </p>
          ))}
          {mode === "stacked" && hovered.segments.length > 1 && (
            <p className="mt-0.5 border-t pt-0.5 font-semibold text-gray-900">Total: {hovered.segments.reduce((sum, segment) => sum + segment.value, 0)}</p>
          )}
          {hovered.line !== undefined && lineName && (
            <p className="text-purple-700">{lineName}: <strong>{lineIsPct ? `${hovered.line.toFixed(1)}%` : Math.round(hovered.line * 10) / 10}</strong></p>
          )}
          {onBarClick && <p className="mt-0.5 text-[10px] text-blue-600">Click to drill down</p>}
        </div>
      )}
      {/* Legend */}
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
        {points[0]?.segments.map((segment) => (
          <span key={segment.name} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: segment.color }} /> {segment.name}
          </span>
        ))}
        {lineName && <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-purple-600" /> {lineName}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bar rows (stage dwell, histograms, breakdowns)
// ---------------------------------------------------------------------------

export function HBarRow({ label, value, max, color = "#2563eb", display, sub, onClick }: {
  label: string;
  value: number;
  max: number;
  color?: string;
  display?: string;
  sub?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="font-semibold text-gray-900">{display ?? value}</span>
      </div>
      <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full transition-all" style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`, background: color }} />
      </div>
      {sub && <p className="mt-0.5 text-[10px] text-gray-500">{sub}</p>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className="block w-full rounded px-1 py-1 text-left hover:bg-blue-50">{body}</button>
    : <div className="px-1 py-1">{body}</div>;
}

// ---------------------------------------------------------------------------
// WR drilldown drawer
// ---------------------------------------------------------------------------

export interface DrilldownRequest {
  title: string;
  subtitle?: string;
  wrs: BaseWorkRequest[];
}

export function DrilldownDrawer({ request, onClose, onOpenWr }: {
  request: DrilldownRequest;
  onClose: () => void;
  onOpenWr: (wr: BaseWorkRequest) => void;
}) {
  const sorted = useMemo(() => [...request.wrs].sort((a, b) => (a.DueDate ?? "").localeCompare(b.DueDate ?? "") || a.WR_ID.localeCompare(b.WR_ID)), [request.wrs]);
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-slate-950/40 no-print" role="presentation" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Work request drilldown"
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">{request.title}</h3>
            <p className="text-xs text-gray-600">{request.subtitle ?? `${request.wrs.length} work request(s)`}</p>
          </div>
          <button aria-label="Close drilldown" onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X size={16} /></button>
        </header>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {sorted.map((wr) => (
            <button key={`${wr.SiteId}-${wr.WR_ID}`} onClick={() => onOpenWr(wr)} className="block w-full px-4 py-2 text-left text-xs hover:bg-blue-50">
              <span className="flex items-center gap-2">
                <span className="font-bold text-blue-700 underline">{wr.WR_ID}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${wr.WR_Type === "PM" ? "bg-blue-100 text-blue-800" : wr.WR_Type === "FJ" ? "bg-emerald-100 text-emerald-800" : "bg-purple-100 text-purple-800"}`}>{wr.WR_Type}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">{wr.Percentage}%</span>
                <span className="text-gray-500">{wr.TradeName ?? "—"}</span>
              </span>
              <span className="mt-0.5 block truncate text-gray-700">{wr.Description}</span>
              <span className="mt-0.5 block text-[10px] text-gray-500">
                {wr.bl_id} · Created {formatDateDDMMYYYY(wr.CreatedDate)} · Due {formatDateDDMMYYYY(wr.DueDate) || "—"} · Margin {formatDateDDMMYYYY(wr.MarginDate) || "—"}
                {wr.ClosedAt ? ` · Closed ${formatDateDDMMYYYY(wr.ClosedAt)}` : wr.CompletedAt ? ` · Completed ${formatDateDDMMYYYY(wr.CompletedAt)}` : ""}
              </span>
            </button>
          ))}
          {!sorted.length && <p className="p-6 text-center text-xs text-gray-500">No work requests in this bucket.</p>}
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV download helper
// ---------------------------------------------------------------------------

export function downloadCsv(fileName: string, csv: string) {
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
