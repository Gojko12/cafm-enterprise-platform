"use client";

import React from "react";
import { ArrowUp, Eye } from "lucide-react";
import { WR_Statuses, formatDateDDMMYYYY, formatDateTimeDDMMYYYY, pmTargetLabel } from "@cafm/shared-schema";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { WRSignals } from "@/components/modules/WRSignals";
import { groupLongJobs } from "@/lib/wr-overview";
import { isDissatisfied } from "@/lib/fj-satisfaction";
import { getChecklistProgress, isPmEligibleForExecutionSignals } from "@/lib/wr-signals";
import { canCloseWorkRequestAt100 } from "@/lib/wr-transition-rules";
import type { WorkRequestsQueue } from "./useWorkRequestsQueue";
import type { WR_Type } from "@cafm/shared-schema";

export function WorkRequestCards({ queue, requestType }: { queue: WorkRequestsQueue; requestType: WR_Type }) {
  const {
    data, setData, activeSiteId, currentUser, currentRole, permissions, filteredRequests, groupLJ,
    collapsedGroups, setCollapsedGroups, bucket, correctionDrafts, setCorrectionDrafts, handleViewWR, handleEscalateToLJ,
  } = queue;
  return <div className="grid gap-4">
    {filteredRequests.length === 0 ? (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <p className="text-gray-600">No work requests for {activeSiteId}. Create one to get started.</p>
      </div>
    ) : (
      (requestType === "LJ" && groupLJ ? groupLongJobs(filteredRequests) : [{ key: "all", requests: filteredRequests, percentage: 0, description: "", track: "", cost: 0 }]).map((group) => (
        <React.Fragment key={group.key}>
          {requestType === "LJ" && groupLJ && <button className="rounded border bg-slate-100 p-2 text-left text-sm font-semibold" aria-expanded={!collapsedGroups.includes(group.key)} onClick={() => setCollapsedGroups(collapsedGroups.includes(group.key) ? collapsedGroups.filter((key) => key !== group.key) : [...collapsedGroups, group.key])}>
            {collapsedGroups.includes(group.key) ? "▶" : "▼"} {group.percentage}% · {group.description} · {group.track} · {group.requests.length} LJs · {group.cost.toLocaleString("en-IE", { style: "currency", currency: "EUR" })}
          </button>}
          {(!groupLJ || requestType !== "LJ" || !collapsedGroups.includes(group.key)) && group.requests.map((wr) => (
            <div key={wr.WR_ID} className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
              {/* Card Header */}
              <div className="p-4 flex items-start justify-between border-b border-gray-100">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{wr.WR_ID}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${wr.WR_Type === "LJ" ? "bg-orange-100 text-orange-800" : wr.WR_Type === "FJ" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>{wr.WR_Type}</span>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{wr.Percentage}%</span>
                  </div>
                  <p className="text-gray-700">{wr.Description}</p>
                  <p className="text-sm text-gray-600 mt-1">{wr.ProblemLocation} · {pmTargetLabel(wr)}</p>
                  {wr.WR_Type === "FJ" && (wr.Urgency || wr.OpenedByName || wr.RequestorName || wr.SlaDueAt) && <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-700">
                    {wr.Urgency && <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-900">{wr.Urgency}</span>}
                    {wr.OpenedByName && <span>Opened by: {wr.OpenedByName}{wr.IntakeChannel ? ` (${wr.IntakeChannel})` : ""}</span>}
                    {wr.RequestorName && <span>Requestor: {wr.RequestorName}</span>}
                    {wr.SlaDueAt && <span>SLA: {wr.SlaTargetLabel} → {formatDateTimeDDMMYYYY(wr.SlaDueAt)}</span>}
                    {isDissatisfied(wr) && <span className="rounded bg-red-100 px-2 py-0.5 font-medium text-red-900">Dissatisfied · {wr.Satisfaction?.followUpStatus?.replace(/_/g, " ")}</span>}
                  </p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {isPmEligibleForExecutionSignals(wr) && getChecklistProgress(wr, data).incomplete.length > 0 && <span title="One or more required PM checklist steps are incomplete." className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Checklist incomplete · {getChecklistProgress(wr, data).incomplete.length}</span>}
                    <WRSignals wr={wr} onOpen={handleViewWR} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleViewWR(wr)} className="p-2 hover:bg-gray-100 rounded-lg text-blue-600" aria-label={`Open ${wr.WR_ID}`}>
                    <Eye size={20} />
                  </button>
                  {wr.WR_Type === "FJ" && !wr.EscalatedToLJ_WR_ID && (
                    <button onClick={() => handleEscalateToLJ(wr)} className="p-2 hover:bg-gray-100 rounded-lg text-orange-600" title="Escalate to Long Job">
                      <ArrowUp size={20} />
                    </button>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 bg-gray-50 space-y-2">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Status</p>
                    <p className="font-medium text-gray-900">{wr.WorkRequestSubstatus}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Estimated Cost</p>
                    <p className="font-medium text-gray-900">{wr.EstimatedCostEur} EUR</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Created</p>
                    <p className="font-medium text-gray-900">{formatDateDDMMYYYY(wr.CreatedDate)}</p>
                  </div>
                </div>

                {/* Acceptance Gates Info */}
                {wr.WR_Type === "LJ" && (wr.RequiresSAT || wr.RequiresDrawingUpdate || wr.RequiresInventoryUpdate) && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Required Gates:</p>
                    <div className="flex flex-wrap gap-1">
                      {wr.RequiresSAT && <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">SAT</span>}
                      {wr.RequiresDrawingUpdate && <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">Drawing/Eng</span>}
                      {wr.RequiresInventoryUpdate && <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">CIFM Inventory</span>}
                    </div>
                  </div>
                )}
                {requestType === "PM" && bucket === "passed" && wr.Percentage === 78 && (
                  <button type="button" onClick={() => {
                    if (!permissions?.canCloseWR100) return;
                    if (!canCloseWorkRequestAt100(wr)) { alert("Complete (100%) is available only after Technically Completed (78%)."); return; }
                    const complete = WR_Statuses.find((status) => status.ESAWorkType === wr.ESAWorkType && status.Percentage === 100);
                    if (!complete) { alert(`No 100% WR_Statuses configuration exists for ${wr.ESAWorkType}.`); return; }
                    const now = new Date().toISOString();
                    setData((current) => ({ ...current, workRequests: current.workRequests.map((item) =>
                      item.WR_ID === wr.WR_ID && item.SiteId === wr.SiteId && item.Percentage === 78 ? {
                        ...item, Percentage: 100, WorkRequestStatus: complete.WorkRequestStatus,
                        WorkRequestSubstatus: complete.WorkRequestSubstatus, QA_InspectionStatus: "Passed",
                        ClosedAt: now, UpdatedAt: now, Activity: [...(item.Activity ?? []), {
                          id: crypto.randomUUID(), kind: "log" as const, actorId: currentUser?.UserId ?? "current-user",
                          actorName: currentUser?.DisplayName ?? "Current user", actorRole: currentRole, createdAt: now,
                          text: `Passed PM WR completed at 100% by ${currentUser?.DisplayName ?? "Current user"}`,
                        }],
                      } : item,
                    ) }));
                  }} title={!canCloseWorkRequestAt100(wr) ? "Complete (100%) is available only after Technically Completed (78%)." : undefined} disabled={!permissions?.canCloseWR100 || !canCloseWorkRequestAt100(wr)} className="mt-3 rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Complete (100%)</button>
                )}
                {requestType === "PM" && bucket === "corrected" && (
                  <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                    <p className="text-sm"><strong>QA_IssueDescription:</strong> {wr.QA_IssueDescription || "No issue description recorded."}</p>
                    <p className="text-sm"><strong>QA_CorrectionComment:</strong> {wr.QA_CorrectionComment || "No correction comment recorded."}</p>
                    {wr.QA_AuditStatus === "QA_Failed_ActionRequired" ? <p>Open the work request to submit the correction in the QA audit panel.</p> : <><label className="block text-sm">Correction performed / re-submission comment
                      <textarea value={correctionDrafts[wr.WR_ID] ?? ""} onChange={(event) => setCorrectionDrafts({ ...correctionDrafts, [wr.WR_ID]: event.target.value })}
                        className="mt-1 block w-full rounded border p-2" rows={2} />
                    </label>
                    <button type="button" disabled={!correctionDrafts[wr.WR_ID]?.trim()} onClick={() => {
                      const comment = correctionDrafts[wr.WR_ID]?.trim();
                      if (!comment) return;
                      const now = new Date().toISOString();
                      setData((current) => ({ ...current, workRequests: current.workRequests.map((item) =>
                        item.WR_ID === wr.WR_ID && item.SiteId === wr.SiteId ? {
                          ...item, QA_InspectionStatus: "Pending", AuditInspectionStatus: "To Be Inspected",
                          QA_CorrectionComment: comment, UpdatedAt: now,
                          Activity: [...(item.Activity ?? []), {
                            id: crypto.randomUUID(), kind: "log" as const, actorId: currentUser?.UserId ?? "current-user",
                            actorName: currentUser?.DisplayName ?? "Current user", actorRole: currentRole, createdAt: now,
                            text: `Correction completed and PM WR re-submitted for QA by ${currentUser?.DisplayName ?? "Current user"}: ${comment}`,
                          }],
                        } : item,
                      ) }));
                      setCorrectionDrafts({ ...correctionDrafts, [wr.WR_ID]: "" });
                    }} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Correction Complete &amp; Re-submit</button></>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </React.Fragment>
      ))
    )}
  </div>;
}
