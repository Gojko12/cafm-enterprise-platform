import type { BaseWorkRequest, PM_ScheduleStep } from "@cafm/shared-schema";
import { formatDateDDMMYYYY } from "@cafm/shared-schema";

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
  return (
<section className="space-y-4 rounded border bg-white p-4">
            <h3 className="font-semibold">Create FastJob</h3>
            <p className="text-sm text-slate-600">New Fast Jobs are linked to this PM and inherit its equipment and location. Fast Jobs are limited to costs below 750 EUR.</p>
            <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
              <input aria-label="Fast Job description" value={fastJobDescription}
                onChange={(event) => setFastJobDescription(event.target.value)} placeholder="Description"
                className="rounded border px-3 py-2" />
              <select aria-label="Fast Job urgency" value={fastJobUrgency}
                onChange={(event) => setFastJobUrgency(event.target.value)} className="rounded border px-3 py-2">
                {["Low", "Normal", "High", "Urgent"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <button type="button" disabled={!canOpenFollowUpFJ} onClick={addFollowUp}
                className="rounded bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-40">Create FastJob</button>
            </div>
            <input aria-label="Filter follow-up Fast Jobs" placeholder="Filter follow-up Fast Jobs..."
              value={followUpFilter} onChange={(event) => setFollowUpFilter(event.target.value)}
              className="rounded border px-3 py-2" />
            <label className="block text-sm">Originating checklist step <select aria-label="Originating checklist step" value={fastJobStep} onChange={(event) => setFastJobStep(event.target.value)} className="rounded border px-3 py-2"><option value="">General follow-up</option>{checklistSteps.map((step) => <option key={step.StepId} value={step.StepId}>{step.Title}</option>)}</select></label>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead className="bg-slate-50"><tr>
                  {["FJ WR ID", "Title", "Status", "Substatus %", "Originating checklist step", "Due date", "Start date", "Actions"].map((title) => <th key={title} className="p-3">{title}</th>)}
                </tr></thead>
                <tbody>{linkedFastJobs.filter((job) =>
                  `${job.WR_ID} ${job.Description} ${job.ProblemLocation ?? ""}`.toLowerCase().includes(followUpFilter.toLowerCase()),
                ).map((job) => <tr key={job.WR_ID} className="border-t">
                  <td className="p-3">{job.WR_ID}</td><td className="p-3">{job.Description}</td>
                  <td className="p-3">{job.WorkRequestStatus} · {job.WorkRequestSubstatus}</td><td className="p-3">{job.Percentage}%</td>
                  <td className="p-3">{job.originatingChecklistStepLabel ?? job.originatingChecklistStepId ?? "—"}</td><td className="p-3">{job.DueDate ? formatDateDDMMYYYY(job.DueDate) : "—"}</td>
                  <td className="p-3">{job.StartDate ? formatDateDDMMYYYY(job.StartDate) : "—"}</td>
                  <td className="space-x-2 p-3">
                    <button type="button" onClick={() => onNavigate(job.WR_ID)} className="text-blue-700 underline">Open FJ →</button>
                    {job.WR_Type === "FJ" && !job.EscalatedToLJ_WR_ID && <button type="button" onClick={() => onEscalateToLJ(job)} className="text-orange-700 underline">Escalate to LJ</button>}
                    {job.EscalatedToLJ_WR_ID && <button type="button" onClick={() => onNavigate(job.EscalatedToLJ_WR_ID!)} className="text-orange-700 underline">Open LJ</button>}
                  </td>
                </tr>)}
                {!linkedFastJobs.length && <tr><td colSpan={8} className="p-5 text-center text-slate-500">No linked Follow-Up Fast Jobs.</td></tr>}
                </tbody>
              </table>
            </div>
            {linkedLongJobs.length > 0 && <div className="space-y-1 rounded border p-3"><h4 className="font-semibold">Linked Long Jobs</h4>{linkedLongJobs.map((job) => <p key={job.WR_ID}><button type="button" className="text-blue-700 underline" onClick={() => onNavigate(job.WR_ID)}>Open LJ {job.WR_ID} →</button> · {job.Description} · {job.Percentage}%</p>)}</div>}
          </section>
  );
}
