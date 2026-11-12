"use client";

import React from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { hasClosureSelection, type ClosureDraft } from "@/lib/pm-closure-requirements";

interface Props {
  workRequest: BaseWorkRequest;
  draft: ClosureDraft;
  setDraft: (draft: ClosureDraft) => void;
  canEdit: boolean;
  onSave: () => void;
  onClose?: () => void;
  message?: string;
}

const toggle = (list: string[], id: string) => list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

export function PmClosureRequirements({ workRequest, draft, setDraft, canEdit, onSave, onClose, message }: Props) {
  const { data } = useCafmStore();
  const schedule = workRequest.ScheduleId ? data.schedules.find((item) => item.ScheduleId === workRequest.ScheduleId && item.SiteId === workRequest.SiteId) : undefined;
  const pmsTeams = new Set(schedule?.affectedTeamIds ?? []);
  const pmsNotices = new Set(schedule?.requirementIds ?? []);
  const record = data.pmCoordination?.find((item) => item.wrId === workRequest.WR_ID);
  const teams = (data.stakeholderTeams ?? []).filter((item) => item.siteId === workRequest.SiteId && item.active);
  const notices = (data.coordinationRequirements ?? []).filter((item) => item.siteId === workRequest.SiteId && item.active);
  const assignedTeams = teams.filter((item) => pmsTeams.has(item.id) || record?.teamStatuses[item.id]);
  const assignedNotices = notices.filter((item) => pmsNotices.has(item.id) || record?.requirementStatuses[item.id]);

  if (!canEdit) {
    return (
      <section className="rounded border bg-white p-4 space-y-2" aria-label="Approvals and notices">
        <h3 className="font-semibold">Approvals &amp; Notices for this PM</h3>
        <div className="flex flex-wrap gap-1.5">
          {assignedTeams.map((item) => <span key={item.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{item.code}</span>)}
          {assignedNotices.map((item) => <span key={item.id} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs">{item.code}</span>)}
          {!assignedTeams.length && !assignedNotices.length && <span className="text-sm text-slate-500">None assigned.</span>}
        </div>
        <p className="text-xs text-slate-500">🔒 Read-only. Supervisors and managers record approvals and notices on closure.</p>
      </section>
    );
  }

  const chip = (id: string, label: string, existing: boolean, selected: boolean, onToggle: () => void, onPms: boolean) => (
    <label key={id} className={`flex items-center gap-1.5 rounded border px-2 py-1 text-sm ${existing ? "bg-slate-100 text-slate-500" : selected ? "border-blue-500 bg-blue-50" : "bg-white"}`}>
      <input type="checkbox" checked={existing || selected} disabled={existing} onChange={onToggle} />
      {label}
      {existing && <span className="text-[10px]">already on PM</span>}
      {!existing && selected && !onPms && schedule && draft.updateLinkedPms && <span className="rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800">+ New on PMS</span>}
    </label>
  );

  return (
    <section className="rounded border bg-white p-4 space-y-3" aria-label="Approvals and notices needed during execution">
      <div>
        <h3 className="font-semibold">Approvals &amp; Notices Needed During Execution</h3>
        <p className="text-xs text-slate-600">Record any team approvals or notices that turned out to be required while executing this PM.</p>
      </div>
      <div className="space-y-1">
        <div className="text-xs font-semibold uppercase text-slate-500">Affected Teams</div>
        <div className="flex flex-wrap gap-2">
          {teams.map((item) => chip(item.id, item.code, !!record?.teamStatuses[item.id], draft.teamIds.includes(item.id), () => setDraft({ ...draft, teamIds: toggle(draft.teamIds, item.id) }), pmsTeams.has(item.id)))}
          {!teams.length && <span className="text-sm text-slate-500">No teams in the site catalog.</span>}
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-xs font-semibold uppercase text-slate-500">Operational Notices</div>
        <div className="flex flex-wrap gap-2">
          {notices.map((item) => chip(item.id, item.name, !!record?.requirementStatuses[item.id], draft.requirementIds.includes(item.id), () => setDraft({ ...draft, requirementIds: toggle(draft.requirementIds, item.id) }), pmsNotices.has(item.id)))}
          {!notices.length && <span className="text-sm text-slate-500">No notices in the site catalog.</span>}
        </div>
      </div>
      <p className="text-xs text-slate-500">Need a different team or notice? Add it under Users &amp; Permissions → Teams &amp; Notices.</p>
      <label className="block text-sm">Note (optional)
        <textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          placeholder="e.g. Required ESA IT firewall/rack unlock during UPS check" className="mt-1 block w-full rounded border p-2" rows={2} />
      </label>
      {schedule && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={draft.updateLinkedPms} onChange={(event) => setDraft({ ...draft, updateLinkedPms: event.target.checked })} />
          <span>Also add selected Teams / Notices to SmartPM Schedule (PMS {schedule.ScheduleId}) for all future WRs</span>
        </label>
      )}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!hasClosureSelection(draft)} onClick={onSave}
          className="rounded bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-40">Save &amp; Update PMS</button>
        {onClose && <button type="button" onClick={onClose}
          className="rounded border border-blue-700 bg-white px-4 py-2 font-semibold text-blue-800 hover:bg-blue-50">Close WR (100%)</button>}
      </div>
    </section>
  );
}
