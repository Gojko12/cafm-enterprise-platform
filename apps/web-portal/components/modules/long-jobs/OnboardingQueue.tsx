"use client";

import React, { useMemo, useState } from "react";
import type { OnboardingRequest, SiteId } from "@cafm/shared-schema";
import { CLASSICAL_TRADES, PLATFORM_SITE_IDS } from "@cafm/shared-schema";
import { stateRequest, useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import type { DemoData } from "@/lib/cafm-data";
import {
  ONBOARDING_FM_ROLES, blankOnboardingDraft, canApproveAsSiteAdmin, canApproveAsTeamLeader, canInitiateOnboarding, completeByHr, decideOnboarding,
  isDdMmYyyy, isHrActor, submitOnboarding, validateOnboardingDraft, type ApprovalDecision, type ApprovalStep,
} from "@/lib/onboarding";

const field = "mt-0.5 w-full rounded border px-2 py-1 text-sm";
const label = "text-xs font-semibold text-slate-600";
const roleName = (value?: string) => ONBOARDING_FM_ROLES.find(([id]) => id === value)?.[1] ?? value ?? "—";

function useOnboardingActions() {
  const { data, setData } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const { profile } = useActiveUserPermissions();
  const actor = { name: activePerson, profile };
  const [notice, setNotice] = useState("");

  const apply = (change: (current: DemoData) => DemoData) => {
    const preview = change(data);
    setData((current) => change(current));
    // Best effort: keep the master directory consistent on the other sites.
    if ((preview.cifmPeople?.length ?? 0) === (data.cifmPeople?.length ?? 0)) return;
    void Promise.allSettled(PLATFORM_SITE_IDS.filter((site) => site !== activeSiteId).map(async (site) => {
      const result = await stateRequest(site, activePerson, "GET");
      if (!result.state || typeof result.state !== "object") return;
      await stateRequest(site, activePerson, "POST", { revision: result.revision, state: { ...(result.state as Record<string, unknown>), cifmPeople: preview.cifmPeople } });
    })).then((results) => setNotice(results.some((item) => item.status === "rejected") ? "Saved here. Other sites will pick up the new person when an administrator opens them." : ""));
  };
  return { data, apply, actor, profile, notice, activeSiteId };
}

const statusStyle: Record<string, string> = {
  Pending_Approvals: "bg-amber-100 text-amber-800", Pending_HR: "bg-amber-100 text-amber-800", Changes_Requested: "bg-orange-100 text-orange-800",
  Rejected: "bg-rose-100 text-rose-800", Completed_Onboarded: "bg-emerald-100 text-emerald-800",
};
const approvalStyle: Record<string, string> = {
  Pending: "bg-slate-100 text-slate-600", Approved: "bg-emerald-100 text-emerald-800", Changes_Requested: "bg-orange-100 text-orange-800", Rejected: "bg-rose-100 text-rose-800",
  Pending_HR: "bg-slate-100 text-slate-600", Completed_By_HR: "bg-emerald-100 text-emerald-800",
};
const Pill = ({ text, tone }: { text: string; tone: string }) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{text.replace(/_/g, " ")}</span>;

function RequestCard({ request }: { request: OnboardingRequest }) {
  const { apply, actor, profile } = useOnboardingActions();
  const [trade, setTrade] = useState(request.primaryTrade ?? "Mechanical");
  const [trades, setTrades] = useState<string[]>(request.allowedTrades ?? []);
  const [hours, setHours] = useState(request.weeklyHoursCapacity ?? 40);
  const [role, setRole] = useState(request.fmSystemRole ?? "Craftsperson");
  const [sites, setSites] = useState<string[]>(request.assignedSiteIds ?? [request.stationedSiteId]);
  const [comment, setComment] = useState("");
  const open = request.status === "Pending_Approvals" || request.status === "Changes_Requested" || request.status === "Pending_HR";
  const tlOk = canApproveAsTeamLeader(profile, request);
  const saOk = canApproveAsSiteAdmin(profile, request);
  const hr = isHrActor(profile);

  const decide = (step: ApprovalStep, decision: ApprovalDecision) => apply((current) => decideOnboarding(current, request.id, step, decision, actor, comment,
    step === "teamLeader" ? { primaryTrade: trade, allowedTrades: Array.from(new Set([trade, ...trades])), weeklyHoursCapacity: hours } : { fmSystemRole: role, assignedSiteIds: sites }));
  const toggle = (list: string[], value: string, set: (next: string[]) => void) => set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  return <article className="rounded-lg border bg-white p-3 text-sm shadow-sm">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="font-semibold text-slate-900">{request.fullName}</h3>
      <Pill text={request.track === "FM_STAFF" ? "FM Staff" : "Non-FM Employee"} tone={request.track === "FM_STAFF" ? "bg-indigo-100 text-indigo-800" : "bg-cyan-100 text-cyan-800"} />
      <Pill text={request.status} tone={statusStyle[request.status] ?? "bg-slate-100"} />
      <span className="ml-auto text-xs text-slate-500">Start {request.startDate} · submitted by {request.submittedBy}</span>
    </div>
    <p className="mt-1 text-xs text-slate-600">
      {request.departmentTeam} · {request.organization} · {request.stationedSiteId}{request.stationedRoomId ? ` · ${request.stationedBuildingId} / ${request.stationedFloorId} / Room ${request.stationedRoomId}` : ""} · {request.email}
      {request.track === "FM_STAFF" && <> · {roleName(request.fmSystemRole)} · {request.primaryTrade} ({(request.allowedTrades ?? []).join(", ") || "—"}) · {request.weeklyHoursCapacity ?? 40} h/week</>}
    </p>
    {request.notes && <p className="mt-1 text-xs italic text-slate-500">{request.notes}</p>}
    {request.track === "FM_STAFF" ? <div className="mt-2 grid gap-3 md:grid-cols-2">
      {([["teamLeader", "Team Leader", request.teamLeaderApproval, tlOk, "Only a Team Leader of this site/trade (or Super Admin) can approve."],
        ["siteAdmin", "Site Administrator", request.siteAdminApproval, saOk, "Only a Site Administrator of this site (or Super Admin) can approve."]] as const).map(([step, title, approval, allowed, hint]) =>
        <div key={step} className="rounded border bg-slate-50 p-2">
          <div className="flex items-center justify-between"><span className="font-medium">{title} approval</span><Pill text={approval?.status ?? "Pending"} tone={approvalStyle[approval?.status ?? "Pending"]} /></div>
          {approval?.actorName && <p className="text-xs text-slate-500">{approval.actorName}{approval.comment ? ` — ${approval.comment}` : ""}</p>}
          {open && approval?.status !== "Approved" && (allowed ? <div className="mt-2 space-y-2">
            {step === "teamLeader" ? <>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Primary trade<select value={trade} onChange={(event) => setTrade(event.target.value)} className={field}>{CLASSICAL_TRADES.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className={label}>Weekly hours<input type="number" min={0} max={80} value={hours} onChange={(event) => setHours(Math.max(0, Math.min(80, Number(event.target.value) || 0)))} className={field} /></label>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">{CLASSICAL_TRADES.map((item) => <label key={item} className="flex items-center gap-1"><input type="checkbox" checked={trades.includes(item) || item === trade} disabled={item === trade} onChange={() => toggle(trades, item, setTrades)} />{item}</label>)}</div>
            </> : <>
              <label className={label}>FM system role<select value={role} onChange={(event) => setRole(event.target.value)} className={field}>{ONBOARDING_FM_ROLES.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>
              <div className="flex flex-wrap gap-2 text-xs">{PLATFORM_SITE_IDS.map((item) => <label key={item} className="flex items-center gap-1"><input type="checkbox" checked={sites.includes(item)} onChange={() => toggle(sites, item, setSites)} />{item}</label>)}</div>
            </>}
            <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Comment (optional)" className={field} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => decide(step, "Approved")} disabled={step === "siteAdmin" && sites.length === 0} className="rounded bg-emerald-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">Approve as {title}</button>
              <button type="button" onClick={() => decide(step, "Changes_Requested")} className="rounded border px-3 py-1 text-xs">Request Changes</button>
              <button type="button" onClick={() => decide(step, "Rejected")} className="rounded border border-rose-300 px-3 py-1 text-xs text-rose-700">Reject</button>
            </div>
          </div> : <p className="mt-2 text-xs text-slate-500">{hint}</p>)}
        </div>)}
    </div> : <div className="mt-2 rounded border bg-slate-50 p-2">
      <div className="flex items-center justify-between"><span className="font-medium">HR Administrator</span><Pill text={request.hrApproval?.status ?? "Pending_HR"} tone={approvalStyle[request.hrApproval?.status ?? "Pending_HR"]} /></div>
      {request.hrApproval?.actorName && <p className="text-xs text-slate-500">{request.hrApproval.actorName}</p>}
      {open && (hr
        ? <button type="button" onClick={() => apply((current) => completeByHr(current, request.id, actor))} className="mt-2 rounded bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">Complete Onboarding</button>
        : <p className="mt-2 text-xs text-slate-500">Final onboarding is performed by HR Administrator.</p>)}
    </div>}
  </article>;
}

export function OnboardingQueue() {
  const { data, notice } = useOnboardingActions();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const all = data.onboardingRequests ?? [];
  const rows = useMemo(() => all.filter((item) => filter === "all" || item.status !== "Completed_Onboarded").sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)), [all, filter]);
  return <section className="space-y-3">
    <div className="flex items-center gap-2 text-sm">
      {([["open", "Open requests"], ["all", "All incl. completed"]] as const).map(([id, text]) =>
        <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded px-3 py-1 ${filter === id ? "bg-blue-600 text-white" : "bg-slate-100"}`}>{text}</button>)}
      <span className="text-xs text-slate-500">FM staff need Team Leader and Site Administrator approval; Non-FM employees are completed by HR.</span>
    </div>
    {notice && <p role="status" className="rounded bg-amber-50 p-2 text-xs text-amber-900">{notice}</p>}
    {rows.length === 0 ? <p className="rounded border bg-white p-4 text-sm text-slate-500">No onboarding requests.</p> : rows.map((item) => <RequestCard key={item.id} request={item} />)}
  </section>;
}

export function OnboardPersonModal({ onClose }: { onClose: () => void }) {
  const { data, apply, actor, profile, activeSiteId } = useOnboardingActions();
  const [draft, setDraft] = useState<OnboardingRequest>(() => blankOnboardingDraft(activeSiteId, actor.name, "NON_FM_EMPLOYEE"));
  const [error, setError] = useState("");
  const set = (patch: Partial<OnboardingRequest>) => setDraft((current) => ({ ...current, ...patch }));
  const hr = isHrActor(profile);
  const fm = draft.track === "FM_STAFF";
  const buildings = data.buildings.filter((item) => item.SiteId === draft.stationedSiteId);
  const floors = data.floors.filter((item) => item.SiteId === draft.stationedSiteId && item.bl_id === draft.stationedBuildingId);
  const rooms = data.rooms.filter((item) => item.SiteId === draft.stationedSiteId && item.bl_id === draft.stationedBuildingId && item.LevelName === draft.stationedFloorId);
  const allowed = canInitiateOnboarding(profile);

  const switchTrack = (track: OnboardingRequest["track"]) => setDraft({ ...blankOnboardingDraft(draft.stationedSiteId as SiteId, actor.name, track),
    fullName: draft.fullName, email: draft.email, phone: draft.phone, departmentTeam: draft.departmentTeam, notes: draft.notes, startDate: draft.startDate });
  const submit = () => {
    const problem = !allowed ? "Your role cannot initiate onboarding requests." : validateOnboardingDraft(draft);
    if (problem) { setError(problem); return; }
    apply((current) => submitOnboarding(current, draft, actor).data);
    onClose();
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3" role="dialog" aria-modal="true" aria-label="Onboard New Person">
    <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-2.5"><h2 className="text-base font-semibold">Onboard New Person</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-slate-500">×</button></header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <div className="flex gap-2 text-sm">
          {([["NON_FM_EMPLOYEE", "Non-FM Employee (HR)"], ["FM_STAFF", "FM Staff / Contractor"]] as const).map(([id, text]) =>
            <button key={id} type="button" onClick={() => switchTrack(id)} className={`rounded px-3 py-1.5 ${draft.track === id ? "bg-blue-600 text-white" : "bg-slate-100"}`}>{text}</button>)}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={label}>Full name *<input value={draft.fullName} onChange={(event) => set({ fullName: event.target.value })} className={field} /></label>
          <label className={label}>Email *<input type="email" value={draft.email} onChange={(event) => set({ email: event.target.value })} className={field} /></label>
          <label className={label}>Phone<input value={draft.phone} onChange={(event) => set({ phone: event.target.value })} className={field} /></label>
          <label className={label}>Start date (DD-MM-YYYY) *<input value={draft.startDate} onChange={(event) => set({ startDate: event.target.value })} aria-invalid={!isDdMmYyyy(draft.startDate)} className={field} /></label>
          <label className={label}>Organization<select value={draft.organization} onChange={(event) => set({ organization: event.target.value as "ESA" | "Contractor" })} className={field}><option>ESA</option><option>Contractor</option></select></label>
          <label className={label}>Department / team *<input value={draft.departmentTeam} onChange={(event) => set({ departmentTeam: event.target.value })} className={field} /></label>
          <label className={label}>Site<select value={draft.stationedSiteId} onChange={(event) => set({ stationedSiteId: event.target.value, stationedBuildingId: "", stationedFloorId: "", stationedRoomId: "", assignedSiteIds: fm ? [event.target.value] : undefined })} className={field}>
            {[activeSiteId].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className={label}>Building<select value={draft.stationedBuildingId} onChange={(event) => set({ stationedBuildingId: event.target.value, stationedFloorId: "", stationedRoomId: "" })} className={field}>
            <option value="">—</option>{buildings.map((item) => <option key={item.bl_id} value={item.bl_id}>{item.bl_id}</option>)}</select></label>
          <label className={label}>Floor<select value={draft.stationedFloorId} onChange={(event) => set({ stationedFloorId: event.target.value, stationedRoomId: "" })} className={field}>
            <option value="">—</option>{floors.map((item) => <option key={item.LevelName}>{item.LevelName}</option>)}</select></label>
          <label className={label}>Room<select value={draft.stationedRoomId} onChange={(event) => set({ stationedRoomId: event.target.value })} className={field}>
            <option value="">—</option>{rooms.map((item) => <option key={item.RoomCode} value={item.RoomCode}>{item.RoomCode}{item.Name ? ` · ${item.Name}` : ""}</option>)}</select></label>
          {fm && <>
            <label className={label}>Proposed FM role<select value={draft.fmSystemRole} onChange={(event) => set({ fmSystemRole: event.target.value })} className={field}>{ONBOARDING_FM_ROLES.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>
            <label className={label}>Primary trade<select value={draft.primaryTrade} onChange={(event) => set({ primaryTrade: event.target.value, allowedTrades: Array.from(new Set([event.target.value, ...(draft.allowedTrades ?? [])])) })} className={field}>{CLASSICAL_TRADES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className={label}>Weekly hours capacity<input type="number" min={0} max={80} value={draft.weeklyHoursCapacity ?? 40} onChange={(event) => set({ weeklyHoursCapacity: Math.max(0, Math.min(80, Number(event.target.value) || 0)) })} className={field} /></label>
          </>}
          <label className={`${label} md:col-span-2`}>Notes<textarea rows={2} value={draft.notes} onChange={(event) => set({ notes: event.target.value })} className={field} /></label>
        </div>
        <p className="rounded bg-slate-50 p-2 text-xs text-slate-600">{fm
          ? "FM staff are activated once both the Team Leader and the Site Administrator have approved."
          : hr ? "As HR Administrator your submission completes onboarding immediately." : "Final onboarding is performed by HR Administrator — this will be added to the HR queue."}</p>
        {!allowed && <p className="text-xs text-rose-700">Your role cannot initiate onboarding requests.</p>}
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t bg-slate-50 px-4 py-2.5">
        <button type="button" onClick={onClose} className="rounded border px-3 py-1.5 text-sm">Cancel</button>
        <button type="button" onClick={submit} disabled={!allowed} className="rounded bg-blue-700 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">{!fm && hr ? "Onboard Now" : "Submit Request"}</button>
      </footer>
    </div>
  </div>;
}
