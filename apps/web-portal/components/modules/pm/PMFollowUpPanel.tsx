"use client";

import React from "react";
import type { BaseWorkRequest, PM_ScheduleStep } from "@cafm/shared-schema";
import { formatDateDDMMYYYY } from "@cafm/shared-schema";
import { SmartDataGrid } from "@/components/common/SmartDataGrid";
import type { SmartGridColumn } from "@/components/common/SmartDataGrid";

interface Props {
  canOpenFollowUpFJ: boolean | undefined;
  fastJobDescription: string;
  setFastJobDescription: (value: string) => void;
  fastJobUrgency: string;
  setFastJobUrgency: (value: string) => void;
  addFollowUp: () => void;
  followUpFilter: string;
  setFollowUpFilter: (value: string) => void;
  fastJobStep: string;
  setFastJobStep: (value: string) => void;
  checklistSteps: PM_ScheduleStep[];
  linkedFastJobs: BaseWorkRequest[];
  linkedLongJobs: BaseWorkRequest[];
  onNavigate: (workRequestId: string) => void;
  onEscalateToLJ: (workRequest: BaseWorkRequest) => void;
}

export function PMFollowUpPanel({ canOpenFollowUpFJ, fastJobDescription, setFastJobDescription, fastJobUrgency, setFastJobUrgency, addFollowUp, followUpFilter, setFollowUpFilter, fastJobStep, setFastJobStep, checklistSteps, linkedFastJobs, linkedLongJobs, onNavigate, onEscalateToLJ }: Props) {
  const filtered = linkedFastJobs.filter((job) =>
    `${job.WR_ID} ${job.Description} ${job.ProblemLocation ?? ""}`.toLowerCase().includes(followUpFilter.toLowerCase()));
  const columns: Array<SmartGridColumn<BaseWorkRequest>> = [
    { id: "id", label: "FJ WR ID", value: (job) => job.WR_ID, defaultWidth: 110 },
    { id: "title", label: "Title", value: (job) => job.Description, defaultWidth: 260 },
    { id: "status", label: "Status", value: (job) => `${job.WorkRequestStatus} · ${job.WorkRequestSubstatus}`, defaultWidth: 180 },
    { id: "pct", label: "Substatus %", value: (job) => `${job.Percentage}%`, sortValue: (job) => job.Percentage, defaultWidth: 100 },
    { id: "step", label: "Originating checklist step", value: (job) => job.originatingChecklistStepLabel ?? job.originatingChecklistStepId ?? "—", defaultWidth: 200 },
    { id: "due", label: "Due date", value: (job) => job.DueDate ? formatDateDDMMYYYY(job.DueDate) : "—", sortValue: (job) => job.DueDate ?? "", defaultWidth: 100 },
    { id: "start", label: "Start date", value: (job) => job.StartDate ? formatDateDDMMYYYY(job.StartDate) : "—", sortValue: (job) => job.StartDate ?? "", defaultWidth: 100 },
  ];
  return <div className="space-y-4">
    <section className="space-y-3 rounded border bg-white p-4">
      <h3 className="font-semibold">+ Create Linked Fast Job</h3>
      <p className="text-sm text-slate-600">New Fast Jobs are linked to this PM and inherit its equipment and location. Fast Jobs are limited to costs below 750 EUR.</p>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
        <input aria-label="Fast Job description" value={fastJobDescription}
          onChange={(event) => setFastJobDescription(event.target.value)} placeholder="Description"
          className="rounded border px-3 py-2" />
        <select aria-label="Fast Job urgency" value={fastJobUrgency}
          onChange={(event) => setFastJobUrgency(event.target.value)} className="rounded border px-3 py-2">
          {["Low", "Normal", "High", "Urgent"].map((item) => <option key={item}>{item}</option>)}
        </select>
        <button type="button" disabled={!canOpenFollowUpFJ} title={canOpenFollowUpFJ ? undefined : "Your role does not include the Open Follow-Up FJ permission."} onClick={addFollowUp}
          className="rounded bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-40">+ Create Linked Fast Job</button>
      </div>
      <label className="block text-sm">Originating checklist step <select aria-label="Originating checklist step" value={fastJobStep} onChange={(event) => setFastJobStep(event.target.value)} className="rounded border px-3 py-2"><option value="">General follow-up</option>{checklistSteps.map((step) => <option key={step.StepId} value={step.StepId}>{step.Title}</option>)}</select></label>
    </section>

    <section className="space-y-3 rounded border bg-white p-4">
      <h3 className="font-semibold">Linked Follow-Up Fast Jobs ({linkedFastJobs.length})</h3>
      <input aria-label="Filter follow-up Fast Jobs" placeholder="Filter follow-up Fast Jobs..."
        value={followUpFilter} onChange={(event) => setFollowUpFilter(event.target.value)}
        className="block w-full max-w-md rounded border px-3 py-2" />
      <SmartDataGrid
        tableId="pm-follow-up-fjs"
        columns={columns}
        rows={filtered}
        rowKey={(job) => job.WR_ID}
        countLabel="follow-up Fast Jobs"
        emptyText="No linked Follow-Up Fast Jobs."
        maxHeightClass="max-h-[50vh]"
        trailing={{ header: "Actions", width: 190, cell: (job) => <span className="space-x-2 whitespace-nowrap">
          <button type="button" onClick={() => onNavigate(job.WR_ID)} className="text-blue-700 underline">Open FJ →</button>
          {/* Escalation is hidden on closed (100%) and cancelled (27%) rows. */}
          {!job.EscalatedToLJ_WR_ID && job.Percentage !== 100 && job.Percentage !== 27 && <button type="button" onClick={() => onEscalateToLJ(job)} className="text-orange-700 underline">Escalate to LJ</button>}
          {job.EscalatedToLJ_WR_ID && <button type="button" onClick={() => onNavigate(job.EscalatedToLJ_WR_ID!)} className="text-orange-700 underline">Open LJ</button>}
        </span> }}
      />
    </section>

    {linkedLongJobs.length > 0 && <div className="space-y-1 rounded border bg-white p-3"><h4 className="font-semibold">Linked Long Jobs</h4>{linkedLongJobs.map((job) => <p key={job.WR_ID}><button type="button" className="text-blue-700 underline" onClick={() => onNavigate(job.WR_ID)}>Open LJ {job.WR_ID} →</button> · {job.Description} · {job.Percentage}%</p>)}</div>}
  </div>;
}
