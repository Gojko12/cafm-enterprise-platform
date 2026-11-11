"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BaseWorkRequest, Equipment } from "@cafm/shared-schema";
import type { AuditFinding } from "@/lib/audit-assurance-types";
import {
  badActorAnalytics, formatDays, formatHours, normalizeFinding, toCsv, type AnalyticsFilters, type BadActor,
} from "@/lib/analytics-engine";
import { LocateInBimButton } from "@/components/common/LocateInBim";
import { ColumnChart, KpiCard, Section, type DrilldownRequest } from "./analytics-ui";

type SortKey = "score" | "fj" | "pm" | "findings" | "open" | "hours";

export function AssetsTab({ wrs, findings, equipment, siteId, filters, now, onDrilldown, registerExport }: {
  wrs: BaseWorkRequest[];
  findings: AuditFinding[];
  equipment: Equipment[];
  siteId: string;
  filters: AnalyticsFilters;
  now: Date;
  onDrilldown: (request: DrilldownRequest) => void;
  registerExport: (build: () => { name: string; csv: string }) => void;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>("score");
  const normalizedFindings = useMemo(() => findings
    .filter((finding) => finding.siteId === siteId && (!filters.buildingId || finding.buildingId === filters.buildingId) && (!filters.trade || finding.trade === filters.trade))
    .map((finding) => normalizeFinding(finding, now)), [findings, siteId, filters, now]);
  const actors = useMemo(() => badActorAnalytics(wrs, normalizedFindings, equipment, now), [wrs, normalizedFindings, equipment, now]);

  const last30 = now.getTime() - 30 * 86_400_000;
  const issuesLast30 = useMemo(() => actors.reduce((sum, actor) =>
    sum + actor.reactiveFJs.filter((wr) => Date.parse(`${wr.CreatedDate.slice(0, 10)}T12:00:00Z`) >= last30).length, 0), [actors, last30]);
  const fleetMtbf = useMemo(() => {
    const values = actors.map((actor) => actor.mtbfDays).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }, [actors]);
  const fleetMttr = useMemo(() => {
    const values = actors.map((actor) => actor.mttrHours).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }, [actors]);
  const totalRepairHours = actors.reduce((sum, actor) => sum + actor.totalRepairHours, 0);
  const totalDowntime = actors.reduce((sum, actor) => sum + actor.estimatedDowntimeHours, 0);

  const sorted = useMemo(() => [...actors].sort((a, b) => {
    const value = (actor: BadActor) => sort === "score" ? actor.issueScore : sort === "fj" ? actor.reactiveFJs.length
      : sort === "pm" ? actor.unfavourablePmSteps : sort === "findings" ? actor.auditFindings.length
        : sort === "open" ? actor.openWRs.length : actor.totalRepairHours;
    return value(b) - value(a) || a.equipmentCode.localeCompare(b.equipmentCode);
  }), [actors, sort]);

  const allAssetWrs = (actor: BadActor) => {
    const unique = new Map<string, BaseWorkRequest>();
    for (const wr of [...actor.reactiveFJs, ...actor.unfavourablePmWRs, ...actor.linkedLJs, ...actor.openWRs, ...actor.overdueWRs]) unique.set(wr.WR_ID, wr);
    return [...unique.values()];
  };

  useEffect(() => {
    registerExport(() => ({
      name: "problematic-equipment-pareto.csv",
      csv: toCsv(
        ["Rank", "Equipment Code", "Name", "Location", "Issue Score", "Reactive FJs", "Unfavourable PM Steps", "Audit Findings", "Linked LJs", "Open WRs", "Overdue WRs", "Repair Hours", "Downtime Hours", "MTBF Days", "MTTR Hours", "Cumulative %"],
        actors.map((actor, index) => [index + 1, actor.equipmentCode, actor.equipmentName, actor.location, actor.issueScore,
          actor.reactiveFJs.length, actor.unfavourablePmSteps, actor.auditFindings.length, actor.linkedLJs.length,
          actor.openWRs.length, actor.overdueWRs.length, formatHours(actor.totalRepairHours), formatHours(actor.estimatedDowntimeHours),
          formatDays(actor.mtbfDays), formatDays(actor.mttrHours), `${actor.cumulativePct.toFixed(1)}%`]),
      ),
    }));
  }, [registerExport, actors]);

  const header = (key: SortKey, label: string) => (
    <button onClick={() => setSort(key)} className={`${sort === key ? "text-blue-700" : ""}`}>{label}{sort === key ? " ↓" : ""}</button>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard tone="red" label="#1 Most Problematic" value={actors[0] ? actors[0].equipmentCode : "—"}
          sub={actors[0] ? `${actors[0].equipmentName} · ${actors[0].issueScore} issues` : "No issues recorded"}
          onClick={actors[0] ? () => onDrilldown({ title: `${actors[0].equipmentCode} · ${actors[0].equipmentName} — WR history`, wrs: allAssetWrs(actors[0]) }) : undefined} />
        <KpiCard tone="amber" label="Reactive Issues (30d)" value={issuesLast30} sub="New reactive FJs fleet-wide" />
        <KpiCard tone="blue" label="Fleet MTBF" value={`${formatDays(fleetMtbf)} d`} sub="Mean days between reactive failures" />
        <KpiCard tone="purple" label="Fleet MTTR" value={formatHours(fleetMttr)} sub="Mean repair hours per failure" />
        <KpiCard tone="slate" label="Repair / Downtime" value={`${formatHours(totalRepairHours)}`} sub={`${formatHours(totalDowntime)} estimated downtime`} />
      </div>

      <Section title="Top Problematic Equipment — Stacked Issue Breakdown + Pareto Curve">
        <ColumnChart lineName="Cumulative %" lineIsPct
          points={sorted.slice(0, 12).map((actor) => ({
            key: actor.equipmentCode,
            label: actor.equipmentCode.replace(/^0+/, "#"),
            segments: [
              { name: "Reactive FJ", value: actor.reactiveFJs.length, color: "#dc2626" },
              { name: "Unfavourable PM", value: actor.unfavourablePmSteps, color: "#f59e0b" },
              { name: "Audit Findings", value: actor.auditFindings.length, color: "#7c3aed" },
              { name: "Long Jobs", value: actor.linkedLJs.length, color: "#2563eb" },
            ],
            line: actor.cumulativePct,
          }))}
          onBarClick={(point) => {
            const actor = actors.find((entry) => entry.equipmentCode === point.key);
            if (actor) onDrilldown({ title: `${actor.equipmentCode} · ${actor.equipmentName} — issue history`, subtitle: actor.location, wrs: allAssetWrs(actor) });
          }} />
      </Section>

      <Section title="Problematic Assets (sortable)">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-[11px] uppercase text-gray-500">
                <th className="py-1.5 pr-2">Equipment</th>
                <th className="pr-2">{header("score", "Issue Score")}</th>
                <th className="pr-2">{header("fj", "Reactive FJ")}</th>
                <th className="pr-2">{header("pm", "Unfav. PM")}</th>
                <th className="pr-2">{header("findings", "Findings")}</th>
                <th className="pr-2">{header("open", "Open / Overdue")}</th>
                <th className="pr-2">{header("hours", "Repair h")}</th>
                <th className="pr-2">MTBF / MTTR</th>
                <th className="pr-2">Pareto %</th>
                <th className="pr-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((actor) => (
                <tr key={actor.equipmentCode} className="border-b border-gray-100">
                  <td className="py-1.5 pr-2">
                    <span className="font-bold text-gray-900">{actor.equipmentCode}</span>
                    <span className="block text-[10px] text-gray-500">{actor.equipmentName} · {actor.location}</span>
                  </td>
                  <td className="pr-2 font-bold text-red-700">{actor.issueScore}</td>
                  <td className="pr-2">{actor.reactiveFJs.length}</td>
                  <td className="pr-2">{actor.unfavourablePmSteps}</td>
                  <td className="pr-2">{actor.auditFindings.length}</td>
                  <td className="pr-2">{actor.openWRs.length} / <span className={actor.overdueWRs.length ? "font-bold text-red-700" : ""}>{actor.overdueWRs.length}</span></td>
                  <td className="pr-2">{formatHours(actor.totalRepairHours)}</td>
                  <td className="pr-2">{formatDays(actor.mtbfDays)}d / {formatDays(actor.mttrHours)}h</td>
                  <td className="pr-2">{actor.cumulativePct.toFixed(1)}%</td>
                  <td className="pr-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <button className="text-blue-700 underline" onClick={() => onDrilldown({ title: `${actor.equipmentCode} — WR history`, subtitle: actor.location, wrs: allAssetWrs(actor) })}>History</button>
                      <button className="text-blue-700 underline" onClick={() => router.push(`/equipment?eq=${encodeURIComponent(actor.equipmentCode)}`)}>Registry</button>
                      {actor.equipment && (
                        <LocateInBimButton siteId={siteId} buildingId={actor.equipment.bl_id} bimBuildingId={actor.equipment.bimBuildingId}
                          equipmentCode={actor.equipmentCode} hasBimLink={!!actor.equipment.bimGlobalId} className="text-indigo-700 underline" />
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sorted.length && <p className="py-4 text-center text-xs text-gray-500">No equipment issues recorded for the current filters.</p>}
        </div>
      </Section>
    </div>
  );
}
