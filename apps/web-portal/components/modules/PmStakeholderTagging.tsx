"use client";

import { useState } from "react";
import type { PM_Schedule } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { TeamBadge } from "@/components/modules/PmCoordinationWorkspace";

export function ScheduleBadges({ order }: { order: Pick<PM_Schedule, "affectedTeamIds" | "requirementIds"> }) {
  const { data } = useCafmStore();
  const teams = (order.affectedTeamIds ?? []).map((id) => (data.stakeholderTeams ?? []).find((item) => item.id === id)).filter((item) => !!item);
  const reqs = (order.requirementIds ?? []).map((id) => (data.coordinationRequirements ?? []).find((item) => item.id === id)).filter((item) => !!item);
  if (!teams.length && !reqs.length) return <span className="text-xs text-slate-400">—</span>;
  return <span className="flex flex-wrap gap-1">
    {teams.map((item) => <TeamBadge key={item!.id} item={{ code: item!.code, color: item!.color, title: `${item!.name} · ${item!.defaultLeadDays}d lead` }} small />)}
    {reqs.map((item) => <TeamBadge key={item!.id} item={{ code: `📢 ${item!.code}`, color: item!.color, title: item!.name }} small />)}
  </span>;
}

export function StakeholderTagEditor({ order, canEdit, onClose }: { order: PM_Schedule; canEdit: boolean; onClose: () => void }) {
  const { data, setData } = useCafmStore();
  const teams = (data.stakeholderTeams ?? []).filter((item) => item.siteId === order.SiteId && (item.active || order.affectedTeamIds?.includes(item.id)));
  const requirements = (data.coordinationRequirements ?? []).filter((item) => item.siteId === order.SiteId && (item.active || order.requirementIds?.includes(item.id)));
  const [teamIds, setTeamIds] = useState<string[]>(order.affectedTeamIds ?? []);
  const [reqIds, setReqIds] = useState<string[]>(order.requirementIds ?? []);
  const [lead, setLead] = useState<string>(order.coordinationLeadDays === undefined ? "" : String(order.coordinationLeadDays));
  const [impact, setImpact] = useState(order.impactSummary ?? "");
  const suggested = Math.max(0, ...teams.filter((item) => teamIds.includes(item.id)).map((item) => item.defaultLeadDays), ...requirements.filter((item) => reqIds.includes(item.id)).map((item) => item.defaultLeadDays));
  const toggle = (list: string[], id: string, set: (value: string[]) => void) => set(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-sm font-semibold disabled:opacity-50 ${active ? "text-white" : "bg-white text-slate-700"}`;
  const save = () => {
    const parsed = lead.trim() === "" ? undefined : Math.max(0, Math.round(Number(lead)) || 0);
    const now = new Date().toISOString();
    setData((current) => ({ ...current, schedules: current.schedules.map((item) => item.SiteId === order.SiteId && item.ScheduleId === order.ScheduleId ? {
      ...item, affectedTeamIds: teamIds.length ? teamIds : undefined, requirementIds: reqIds.length ? reqIds : undefined,
      coordinationLeadDays: teamIds.length || reqIds.length ? parsed ?? suggested : undefined, impactSummary: impact.trim() || undefined, UpdatedAt: now,
    } : item) }));
    onClose();
  };
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label="Stakeholder Alignment and Notices" className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-auto rounded bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <h2 className="text-lg font-bold">Stakeholder Alignment &amp; Notices · PMS #{order.ScheduleId}</h2>
      <div><h3 className="mb-1 font-semibold">Affected teams</h3><div className="flex flex-wrap gap-2">{teams.map((item) => <button key={item.id} type="button" disabled={!canEdit} aria-pressed={teamIds.includes(item.id)} className={chip(teamIds.includes(item.id))} style={teamIds.includes(item.id) ? { backgroundColor: item.color, borderColor: item.color } : { borderColor: item.color }} onClick={() => toggle(teamIds, item.id, setTeamIds)}>{item.code}</button>)}{!teams.length && <span className="text-sm text-slate-500">No teams configured for this site.</span>}</div></div>
      <div><h3 className="mb-1 font-semibold">Notices</h3><div className="flex flex-wrap gap-2">{requirements.map((item) => <button key={item.id} type="button" disabled={!canEdit} aria-pressed={reqIds.includes(item.id)} className={chip(reqIds.includes(item.id))} style={reqIds.includes(item.id) ? { backgroundColor: item.color, borderColor: item.color } : { borderColor: item.color }} onClick={() => toggle(reqIds, item.id, setReqIds)}>📢 {item.code}</button>)}{!requirements.length && <span className="text-sm text-slate-500">No notices configured for this site.</span>}</div></div>
      <label className="block text-sm font-semibold">Advance Coordination Lead Time (days)
        <input aria-label="Advance Coordination Lead Time (days)" type="number" min={0} disabled={!canEdit} className="ml-2 w-24 rounded border px-2 py-1 font-normal" placeholder={String(suggested)} value={lead} onChange={(event) => setLead(event.target.value)} />
        <span className="ml-2 font-normal text-slate-500">Default: {suggested} (max of selected)</span></label>
      <label className="block text-sm font-semibold">Operational Impact / Disruption Note
        <textarea aria-label="Operational Impact / Disruption Note" rows={3} disabled={!canEdit} className="mt-1 w-full rounded border px-2 py-1 font-normal" value={impact} onChange={(event) => setImpact(event.target.value)} /></label>
      <div className="flex justify-end gap-2"><button type="button" className="rounded border px-3 py-1" onClick={onClose}>{canEdit ? "Cancel" : "Close"}</button>{canEdit && <button type="button" className="rounded bg-blue-700 px-3 py-1 text-white" onClick={save}>Save</button>}</div>
    </div>
  </div>;
}
