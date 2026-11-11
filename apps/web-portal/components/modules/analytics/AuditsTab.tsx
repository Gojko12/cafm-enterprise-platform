"use client";

import React, { useEffect, useMemo, useState } from "react";
import { formatDateDDMMYYYY } from "@cafm/shared-schema";
import type { AuditFinding } from "@/lib/audit-assurance-types";
import { auditFindingAnalytics, formatDays, formatPct, toCsv, type AnalyticsFilters, type NormalizedFinding } from "@/lib/analytics-engine";
import { QAAnalytics } from "@/components/modules/QAAnalytics";
import { ColumnChart, HBarRow, KpiCard, Section } from "./analytics-ui";

type SortKey = "due" | "severity" | "discovered" | "equipment";
const SEVERITY_ORDER = { Critical: 0, Major: 1, Minor: 2 } as const;

export function AuditsTab({ findings, siteId, filters, now, registerExport }: {
  findings: AuditFinding[];
  siteId: string;
  filters: AnalyticsFilters;
  now: Date;
  registerExport: (build: () => { name: string; csv: string }) => void;
}) {
  const [sort, setSort] = useState<SortKey>("due");
  const analytics = useMemo(() => auditFindingAnalytics(findings, siteId, filters, now), [findings, siteId, filters, now]);

  const openRows = useMemo(() => {
    const rows = [...analytics.overdueFindings, ...analytics.openInWindow];
    return rows.sort((a, b) => {
      if (sort === "severity") return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sort === "discovered") return a.finding.discoveredAt.localeCompare(b.finding.discoveredAt);
      if (sort === "equipment") return a.finding.equipmentId.localeCompare(b.finding.equipmentId);
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    });
  }, [analytics, sort]);

  useEffect(() => {
    registerExport(() => ({
      name: "audit-findings.csv",
      csv: toCsv(
        ["Finding", "Severity", "Equipment", "Building", "Discovered (DD-MM-YYYY)", "Due (DD-MM-YYYY)", "Status", "Addressed (DD-MM-YYYY)", "Overdue"],
        analytics.all.map((entry) => [entry.finding.title, entry.severity, `${entry.finding.equipmentId} ${entry.finding.equipmentName}`,
          entry.finding.buildingId, formatDateDDMMYYYY(entry.finding.discoveredAt), entry.dueDate ? formatDateDDMMYYYY(entry.dueDate) : "—",
          entry.addressed ? "Addressed" : entry.overdue ? "Overdue" : "Open", entry.addressedAt ? formatDateDDMMYYYY(entry.addressedAt) : "—",
          entry.overdue ? "YES" : "no"]),
      ),
    }));
  }, [registerExport, analytics]);

  const severityColor = (severity: NormalizedFinding["severity"]) =>
    severity === "Critical" ? "bg-red-100 text-red-800" : severity === "Major" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700";

  const header = (key: SortKey, label: string) => (
    <button onClick={() => setSort(key)} className={sort === key ? "text-blue-700" : ""}>{label}{sort === key ? " ↓" : ""}</button>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard tone="slate" label="Total Findings" value={analytics.totalFindings} sub="2026 technical audits" />
        <KpiCard tone="green" label="Addressed" value={`${analytics.addressedCount} (${formatPct(analytics.addressedPct)})`}
          sub={`${analytics.addressedOnTimeCount} on time · ${analytics.addressedLateCount} late`} />
        <KpiCard tone="blue" label="Open — In Window" value={analytics.openInWindow.length} sub="Due date still ahead" />
        <KpiCard tone="red" label="Overdue Findings" value={analytics.overdueFindings.length} sub="Past due & unaddressed" />
        <KpiCard tone="purple" label="Avg Remediation" value={`${formatDays(analytics.avgRemediationDays)} days`} sub="Discovery → addressed" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Findings by Severity">
          <div className="space-y-1">
            {(["Critical", "Major", "Minor"] as const).map((severity) => {
              const bucket = analytics.bySeverity[severity];
              const max = Math.max(1, ...Object.values(analytics.bySeverity).map((entry) => entry.total));
              return <HBarRow key={severity} label={severity} value={bucket.total} max={max}
                color={severity === "Critical" ? "#dc2626" : severity === "Major" ? "#f59e0b" : "#64748b"}
                display={`${bucket.total} total · ${bucket.open} open · ${bucket.overdue} overdue`} />;
            })}
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase text-gray-500">By building</p>
          <div className="space-y-1">
            {analytics.byBuilding.map((entry) => (
              <HBarRow key={entry.buildingId} label={entry.buildingId} value={entry.total}
                max={Math.max(1, analytics.byBuilding[0]?.total ?? 1)} color="#2563eb"
                display={`${entry.total} findings · ${entry.overdue} overdue`} />
            ))}
          </div>
        </Section>

        <Section title="Monthly Findings Opened vs Addressed (2026)">
          <ColumnChart mode="grouped"
            points={analytics.monthlyTrend.map((month) => ({
              key: month.month, label: month.label,
              segments: [
                { name: "Opened", value: month.opened, color: "#dc2626" },
                { name: "Addressed", value: month.addressed, color: "#10b981" },
              ],
            }))} />
        </Section>
      </div>

      <Section title="Overdue & Open Audit Findings">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-[11px] uppercase text-gray-500">
                <th className="py-1.5 pr-2">Finding</th>
                <th className="pr-2">{header("severity", "Severity")}</th>
                <th className="pr-2">{header("equipment", "Equipment")}</th>
                <th className="pr-2">{header("discovered", "Discovered")}</th>
                <th className="pr-2">{header("due", "Due")}</th>
                <th className="pr-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {openRows.map((entry) => (
                <tr key={entry.finding.id} className={`border-b border-gray-100 ${entry.overdue ? "bg-red-50" : ""}`}>
                  <td className="max-w-80 py-1.5 pr-2">
                    <span className="font-semibold text-gray-900">{entry.finding.title}</span>
                    <span className="block truncate text-[10px] text-gray-500">{entry.finding.observation}</span>
                  </td>
                  <td className="pr-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${severityColor(entry.severity)}`}>{entry.severity}</span></td>
                  <td className="pr-2">{entry.finding.equipmentId}<span className="block text-[10px] text-gray-500">{entry.finding.equipmentName}</span></td>
                  <td className="pr-2">{formatDateDDMMYYYY(entry.finding.discoveredAt)}</td>
                  <td className={`pr-2 ${entry.overdue ? "font-bold text-red-700" : ""}`}>{entry.dueDate ? formatDateDDMMYYYY(entry.dueDate) : "—"}</td>
                  <td className="pr-2">{entry.overdue
                    ? <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">OVERDUE</span>
                    : <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">In window</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!openRows.length && <p className="py-4 text-center text-xs text-gray-500">No open audit findings. 🎉</p>}
        </div>
      </Section>

      {/* Existing 5% QA sampling compliance & first-time verdicts (DD-MM-YYYY labels) */}
      <QAAnalytics />
    </div>
  );
}
