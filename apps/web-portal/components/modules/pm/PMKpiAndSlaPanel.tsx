"use client";

import React from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "@cafm/shared-schema";
import { laborRows } from "@/components/modules/WorkRequestLabor";
import type { DemoData } from "@/lib/cafm-data";

interface Props {
  workRequest: BaseWorkRequest;
  craftspeople: DemoData["craftspeople"];
  updateWorkRequest: (change: (current: BaseWorkRequest) => BaseWorkRequest, logText?: string) => void;
  actorName: string;
  checklistTotal: number;
  checklistCompleted: number;
  unfavourableCount: number;
  followUpCount: number;
}

const card = "rounded-lg border bg-white p-4";
const row = (label: string, value: React.ReactNode) => <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 text-sm">
  <span className="text-xs font-medium text-slate-500">{label}</span>
  <span className="text-right font-medium text-slate-900">{value ?? "—"}</span>
</div>;

const euro = (value: number) => value.toLocaleString("en-IE", { style: "currency", currency: "EUR" });

function lastTransitionAt(wr: BaseWorkRequest, percentage: number): string | undefined {
  const pattern = new RegExp(`to ${percentage}%`);
  const matches = (wr.Activity ?? []).filter((entry) => entry.kind === "log" && pattern.test(entry.text));
  return matches.length ? matches[matches.length - 1].createdAt : undefined;
}

/** `SLA, Costs & KPIs` tab: SLA & Deadlines, Hours & Cost Variance, Quality & Audit. */
export function PMKpiAndSlaPanel({ workRequest: wr, craftspeople, updateWorkRequest, actorName, checklistTotal, checklistCompleted, unfavourableCount, followUpCount }: Props) {
  const rows = laborRows(wr, craftspeople);
  const effectiveMinutes = rows.reduce((sum, item) => sum + item.effective, 0);
  const laborCost = rows.reduce((sum, item) => sum + (item.effective / 60) * item.rate, 0);
  const partsCost = (wr.SpareParts ?? []).reduce((sum, item) => sum + item.quantity * item.unitCostEur, 0);
  const totalActual = (wr.ActualCostEur ?? laborCost + partsCost);
  const expectedHours = wr.ExpectedHours ?? 0;
  const effectiveHours = effectiveMinutes / 60;
  const hoursDelta = effectiveHours - expectedHours;
  const costDelta = totalActual - (wr.EstimatedCostEur ?? 0);

  const closedAt = wr.ClosedAt ?? lastTransitionAt(wr, 100);
  const completed78At = lastTransitionAt(wr, 78);
  const reference = closedAt ?? new Date().toISOString();
  const due = wr.DueDate, margin = wr.MarginDate;
  const slaState = !due ? "No SLA" : reference.slice(0, 10) <= due.slice(0, 10) ? "On Track"
    : margin && reference.slice(0, 10) <= margin.slice(0, 10) ? "In Margin" : "Breached";
  const slaTone = slaState === "On Track" ? "bg-emerald-100 text-emerald-900" : slaState === "In Margin" ? "bg-amber-100 text-amber-900"
    : slaState === "Breached" ? "bg-rose-100 text-rose-900" : "bg-slate-100 text-slate-700";

  return <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-3">
      <section className={card} aria-label="SLA and deadlines">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">SLA &amp; Deadlines</h3>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${slaTone}`}>{slaState}</span>
        </div>
        {row("Due date", due ? formatDateDDMMYYYY(due) : "—")}
        {row("Margin date", margin ? formatDateDDMMYYYY(margin) : "—")}
        {row("Technically Completed (78%)", completed78At ? formatDateTimeDDMMYYYY(completed78At) : "—")}
        {row("Closed (100%)", closedAt ? formatDateTimeDDMMYYYY(closedAt) : "—")}
        {row("On-Hold 55% reason", wr.FreezeReason ?? wr.PlannedFreezeText ?? "—")}
        <label className="mt-3 block text-sm">Downtime (minutes)
          <input type="number" min="0" value={wr.DowntimeMinutes ?? 0}
            onChange={(event) => updateWorkRequest((current) => ({
              ...current, DowntimeMinutes: Math.max(0, Number(event.target.value)),
            }), `Downtime KPI updated by ${actorName}`)}
            className="mt-1 block w-full rounded border px-3 py-2" />
        </label>
      </section>

      <section className={card} aria-label="Hours and cost variance">
        <h3 className="mb-2 font-semibold">Hours &amp; Cost Variance</h3>
        {row("Expected hours", expectedHours.toFixed(2))}
        {row("Effective hours", effectiveHours.toFixed(2))}
        {row("Hours variance", <span className={hoursDelta > 0 ? "text-rose-700" : "text-emerald-700"}>{hoursDelta >= 0 ? "+" : ""}{hoursDelta.toFixed(2)} h</span>)}
        {row("Estimated cost", euro(wr.EstimatedCostEur ?? 0))}
        {row("Actual labor", euro(laborCost))}
        {row("Parts / materials", euro(partsCost))}
        {row("Total actual cost", <strong>{euro(totalActual)}</strong>)}
        {row("Cost variance", <span className={costDelta > 0 ? "text-rose-700" : "text-emerald-700"}>{costDelta >= 0 ? "+" : ""}{euro(costDelta)}</span>)}
      </section>

      <section className={card} aria-label="Quality and audit">
        <h3 className="mb-2 font-semibold">Quality &amp; Audit</h3>
        {row("Checklist completion", checklistTotal ? `${checklistCompleted} / ${checklistTotal} steps (${Math.round((checklistCompleted / checklistTotal) * 100)}%)` : "No checklist")}
        {row("Unfavourable steps", unfavourableCount ? <span className="font-semibold text-rose-700">{unfavourableCount}</span> : "0")}
        {row("Follow-Up Fast Jobs", followUpCount)}
        {row("QA audit status", wr.QA_AuditStatus === "QA_Failed_ActionRequired" ? <span className="font-semibold text-rose-700">⚠ QA rework required</span> : wr.QA_AuditStatus ?? "None")}
        {row("QA inspection", wr.QA_InspectionStatus ?? "—")}
        {wr.QA_IssueDescription && row("QA issue", wr.QA_IssueDescription)}
      </section>
    </div>
    <section className={card}>
      <label className="block text-sm font-semibold">KPI Notes
        <textarea value={wr.KPINotes ?? ""}
          onChange={(event) => updateWorkRequest((current) => ({ ...current, KPINotes: event.target.value }))}
          className="mt-1 block min-h-24 w-full rounded border p-3 font-normal" />
      </label>
    </section>
  </div>;
}
