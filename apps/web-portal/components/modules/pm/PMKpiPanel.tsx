import type React from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { laborRows } from "@/components/modules/WorkRequestLabor";

interface Props {
  workRequest: BaseWorkRequest;
  renderField: (label: string, value: string | number | boolean | undefined) => React.ReactNode;
  updateWorkRequest: (change: (current: BaseWorkRequest) => BaseWorkRequest, logText?: string) => void;
  actorName: string;
  craftspeople: Parameters<typeof laborRows>[1];
}

export function PMKpiPanel({ workRequest, renderField, updateWorkRequest, actorName, craftspeople }: Props) {
  return (
<div className="grid gap-4 md:grid-cols-2">
            <section className="rounded border bg-white p-4">
              <h3 className="mb-3 font-semibold">SLA &amp; KPI</h3>
              {renderField("SLA status", workRequest.DueDate && new Date(workRequest.DueDate) < new Date()
                ? "Overdue"
                : workRequest.MarginDate && new Date(workRequest.MarginDate) < new Date()
                  ? "Margin"
                  : "On-Time")}
              {renderField("On-Hold 55% reason", workRequest.FreezeReason ?? workRequest.PlannedFreezeText)}
              <label className="mt-3 block text-sm">Downtime (minutes)
                <input type="number" min="0" value={workRequest.DowntimeMinutes ?? 0}
                  onChange={(event) => updateWorkRequest((current) => ({
                    ...current, DowntimeMinutes: Math.max(0, Number(event.target.value)),
                  }), `Downtime KPI updated by ${actorName}`)}
                  className="mt-1 block w-full rounded border px-3 py-2" />
              </label>
              <label className="mt-3 block text-sm">KPI notes
                <textarea value={workRequest.KPINotes ?? ""}
                  onChange={(event) => updateWorkRequest((current) => ({ ...current, KPINotes: event.target.value }))}
                  className="mt-1 block min-h-24 w-full rounded border p-3" />
              </label>
            </section>
            <section className="rounded border bg-white p-4">
              <h3 className="mb-3 font-semibold">Work Request Metrics</h3>
              {renderField("Expected hours", workRequest.ExpectedHours)}
              {renderField("Effective working time (hours)", (laborRows(workRequest, craftspeople).reduce((sum, item) => sum + item.effective, 0) / 60).toFixed(2))}
              {renderField("Total work session time (minutes)", workRequest.TotalTimeMinutes)}
              {renderField("Estimated cost (EUR)", workRequest.EstimatedCostEur)}
              {renderField("Actual cost (EUR)", workRequest.ActualCostEur)}
            </section>
          </div>
  );
}
