"use client";

import { useMemo, useState } from "react";
import { PM_GATE_LABELS, formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "@cafm/shared-schema";
import type { PmGateState, SiteCoordinationRequirement, SiteStakeholderTeam } from "@cafm/shared-schema";
import { DateInputDDMMYYYY } from "@/components/common/DateInputDDMMYYYY";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { appendLog, createFreezeFromItem, generateNewsflash, postponeItem, setTeamStatus, upsertRecord } from "@/lib/pm-coordination";
import type { CoordinationItem } from "@/lib/pm-coordination";

const GATE_STYLE: Record<PmGateState, string> = {
  None: "bg-slate-100 text-slate-600", Action: "bg-amber-100 text-amber-900", Discussion: "bg-sky-100 text-sky-900",
  Postpone: "bg-rose-100 text-rose-900", Cleared: "bg-emerald-100 text-emerald-900",
};
export function GatePill({ state }: { state: PmGateState }) {
  const icon = state === "Cleared" ? "✅" : state === "Postpone" ? "⛔" : state === "None" ? "" : "⚠️";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${GATE_STYLE[state]}`}>{icon} {PM_GATE_LABELS[state]}</span>;
}
export function TeamBadge({ item, small = false }: { item: { code: string; color: string; title?: string }; small?: boolean }) {
  return <span title={item.title ?? item.code} className={`inline-flex items-center rounded-full font-semibold text-white ${small ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"}`} style={{ backgroundColor: item.color }}>{item.code}</span>;
}

const STATUS_LABEL: Record<string, string> = { Pending: "Pending", In_Discussion: "In Discussion", Approved: "Approved", Conditional: "Conditional (with window)", Postpone_Requested: "Postpone Requested" };
const REQ_LABEL: Record<string, string> = { Not_Started: "Not Started", Drafted: "Drafted", Published_Done: "Published / Sent" };
const input = "rounded border px-2 py-1 text-sm";

export function PmCoordinationWorkspace({ item, onClose }: { item: CoordinationItem; onClose?: () => void }) {
  const { data, setData } = useCafmStore();
  const { permissions } = useActiveUserPermissions();
  const { activePerson, currentUser } = useSiteContext();
  const actor = currentUser?.DisplayName ?? activePerson ?? "Current user";
  const canEdit = !!(permissions?.canDefinePMSchedule || permissions?.canManageLocationFreezes);
  const canFreeze = !!permissions?.canManageLocationFreezes;
  const teams = data.stakeholderTeams ?? [];
  const requirements = data.coordinationRequirements ?? [];
  const itemTeams = item.teamIds.map((id) => teams.find((team) => team.id === id)).filter((team): team is SiteStakeholderTeam => !!team);
  const itemRequirements = item.requirementIds.map((id) => requirements.find((entry) => entry.id === id)).filter((entry): entry is SiteCoordinationRequirement => !!entry);
  const [noteText, setNoteText] = useState("");
  const [noteTeam, setNoteTeam] = useState("");
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeReason, setPostponeReason] = useState("");
  const [freezeStart, setFreezeStart] = useState(item.targetDate);
  const [freezeEnd, setFreezeEnd] = useState(item.targetDate);
  const [freezeReason, setFreezeReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const log = useMemo(() => [...(item.record?.discussionLog ?? [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [item.record]);
  const postponeTeam = item.gate.postponeTeams[0] ?? itemTeams[0];

  const mutate = (change: (record: NonNullable<typeof item.record>) => NonNullable<typeof item.record>) => setData((current) => upsertRecord(current, item, change, actor));
  const blockedBy = !canEdit ? "You do not have permission to edit coordination." : "";

  return <div className="space-y-4 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <GatePill state={item.gate.state} />
      <span className="font-semibold">{item.source === "WR" ? `WR ${item.wrId}` : `Forecast PMS ${item.pmsId}`}</span>
      <span>Target {formatDateDDMMYYYY(item.targetDate)} <span className="rounded bg-slate-100 px-1 text-xs">T{item.daysUntil >= 0 ? "-" : "+"}{Math.abs(item.daysUntil)}d</span></span>
      <span className="text-slate-600">{item.equipment} · {item.location}</span>
    </div>
    {item.impact && <p className="rounded bg-amber-50 p-2 text-amber-900">Impact: {item.impact}</p>}
    {item.gate.windows.length > 0 && <p className="rounded bg-emerald-50 p-2 font-semibold text-emerald-900">Agreed time window: {item.gate.windows.map((entry) => `${entry.code} ${entry.window}`).join(" · ")}</p>}
    {blockedBy && <p className="text-xs text-slate-500">{blockedBy}</p>}
    {message && <p role="status" className="rounded bg-emerald-50 p-2 text-emerald-800">{message}</p>}
    {error && <p role="alert" className="rounded bg-rose-50 p-2 text-rose-800">{error}</p>}

    <section className="space-y-2">
      <h3 className="font-bold">Team alignment</h3>
      {!itemTeams.length && <p className="text-slate-500">No teams tagged on this PMS.</p>}
      <div className="grid gap-2 md:grid-cols-2">
        {itemTeams.map((team) => {
          const entry = item.record?.teamStatuses[team.id];
          return <div key={team.id} className="space-y-1 rounded border-l-4 bg-white p-3 shadow-sm" style={{ borderLeftColor: team.color }}>
            <div className="flex items-center justify-between gap-2"><span><TeamBadge item={team} /> <strong>{team.name}</strong></span>{!team.requiresApproval && <span className="text-xs text-slate-500">Informational</span>}</div>
            <select aria-label={`${team.code} status`} disabled={!canEdit} className={`${input} w-full`} value={entry?.status ?? "Pending"}
              onChange={(event) => mutate((record) => setTeamStatus(record, team, { status: event.target.value as NonNullable<typeof entry>["status"] }, actor))}>
              {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input aria-label={`${team.code} contact person`} disabled={!canEdit} className={`${input} w-full`} placeholder={team.contactInfo ?? "Contact person"} defaultValue={entry?.contactPerson ?? ""} key={`c-${team.id}-${entry?.updatedAt}`}
              onBlur={(event) => { if (event.target.value !== (entry?.contactPerson ?? "")) mutate((record) => setTeamStatus(record, team, { contactPerson: event.target.value }, actor, false)); }} />
            <input aria-label={`${team.code} agreed time window`} disabled={!canEdit} className={`${input} w-full`} placeholder="Agreed time window, e.g. 14:30–17:00" defaultValue={entry?.agreedWindow ?? ""} key={`w-${team.id}-${entry?.updatedAt}`}
              onBlur={(event) => { if (event.target.value !== (entry?.agreedWindow ?? "")) mutate((record) => appendLog(setTeamStatus(record, team, { agreedWindow: event.target.value }, actor, false), actor, `${team.code}: agreed window set to ${event.target.value || "none"}`, { teamId: team.id, outcomeTag: "Note" })); }} />
            {entry && <p className="text-xs text-slate-500">Updated {formatDateTimeDDMMYYYY(entry.updatedAt)} by {entry.updatedBy}</p>}
          </div>;
        })}
      </div>
    </section>

    <section className="space-y-2">
      <h3 className="font-bold">Notices &amp; requirements</h3>
      {!itemRequirements.length && <p className="text-slate-500">No notices tagged on this PMS.</p>}
      {itemRequirements.map((requirement) => {
        const entry = item.record?.requirementStatuses[requirement.id];
        const status = entry?.status ?? "Not_Started";
        const setReq = (patch: Partial<NonNullable<typeof entry>>, text?: string, tag?: "Notice_Sent" | "Note") => mutate((record) => {
          const now = new Date().toISOString();
          const next = { ...record, requirementStatuses: { ...record.requirementStatuses, [requirement.id]: { status, ...entry, ...patch, updatedAt: now, updatedBy: actor } } };
          return text ? appendLog(next, actor, text, { requirementId: requirement.id, outcomeTag: tag ?? "Note" }) : next;
        });
        return <div key={requirement.id} className="space-y-2 rounded border-l-4 bg-white p-3 shadow-sm" style={{ borderLeftColor: requirement.color }}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span><TeamBadge item={requirement} /> <strong>{requirement.name}</strong> <span className="text-xs text-slate-500">{requirement.category}{requirement.mandatoryBeforeStart ? " · mandatory before start" : ""}</span></span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold">{REQ_LABEL[status]}</span></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!canEdit} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => setReq({ status: status === "Not_Started" ? "Drafted" : status, draftBody: generateNewsflash(item, teams, requirement) }, `${requirement.code} text auto-generated`)}>Auto-Generate Newsflash Text</button>
            <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={!entry?.draftBody} onClick={() => { void navigator.clipboard?.writeText(entry?.draftBody ?? ""); setMessage("Copied to clipboard."); }}>Copy to Clipboard</button>
            <button type="button" disabled={!canEdit || status === "Not_Started"} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => setReq({ status: "Not_Started" })}>Reset</button>
          </div>
          <textarea aria-label={`${requirement.code} text`} disabled={!canEdit} rows={5} className={`${input} w-full font-mono`} key={`d-${requirement.id}-${entry?.updatedAt}`} defaultValue={entry?.draftBody ?? ""} placeholder="Notice text…"
            onBlur={(event) => { if (event.target.value !== (entry?.draftBody ?? "")) setReq({ draftBody: event.target.value, status: status === "Not_Started" && event.target.value.trim() ? "Drafted" : status }); }} />
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label={`${requirement.code} reference`} disabled={!canEdit} className={`${input} min-w-48 flex-1`} placeholder="Sent reference / note" key={`r-${requirement.id}-${entry?.updatedAt}`} defaultValue={entry?.referenceNote ?? ""}
              onBlur={(event) => { if (event.target.value !== (entry?.referenceNote ?? "")) setReq({ referenceNote: event.target.value }); }} />
            <button type="button" disabled={!canEdit || status === "Published_Done"} className="rounded bg-emerald-700 px-3 py-1 text-white disabled:opacity-50"
              onClick={() => setReq({ status: "Published_Done", completedAt: new Date().toISOString() }, `${requirement.code} published/sent on ${formatDateDDMMYYYY(new Date().toISOString().slice(0, 10))}`, "Notice_Sent")}>Mark Published / Sent</button>
          </div>
          {entry?.completedAt && <p className="text-xs text-emerald-800">Sent {formatDateDDMMYYYY(entry.completedAt.slice(0, 10))}{entry.referenceNote ? ` · ${entry.referenceNote}` : ""}</p>}
        </div>;
      })}
    </section>

    <section className="space-y-2">
      <h3 className="font-bold">Discussion log</h3>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Discussion team tag" className={input} value={noteTeam} onChange={(event) => setNoteTeam(event.target.value)}><option value="">General</option>{itemTeams.map((team) => <option key={team.id} value={team.id}>{team.code}</option>)}</select>
        <input aria-label="Discussion note" disabled={!canEdit} className={`${input} min-w-48 flex-1`} value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Log a discussion note…" />
        <button type="button" disabled={!canEdit || !noteText.trim()} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50"
          onClick={() => { const text = noteText.trim(); mutate((record) => appendLog(record, actor, text, { teamId: noteTeam || undefined, outcomeTag: "Note" })); setNoteText(""); }}>+ Log Discussion Note</button>
      </div>
      <ul className="max-h-56 space-y-1 overflow-auto">
        {log.map((entry) => <li key={entry.id} className="rounded bg-slate-50 p-2"><span className="text-xs text-slate-500">{formatDateTimeDDMMYYYY(entry.timestamp)} · {entry.author}{entry.teamId ? ` · ${teams.find((team) => team.id === entry.teamId)?.code ?? entry.teamId}` : ""}{entry.outcomeTag && entry.outcomeTag !== "Note" ? ` · ${entry.outcomeTag.replace(/_/g, " ")}` : ""}</span><p>{entry.message}</p></li>)}
        {!log.length && <li className="text-slate-500">No discussion yet.</li>}
      </ul>
    </section>

    <section className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2 rounded border bg-white p-3">
        <h3 className="font-bold">↪ Postpone / Reschedule PM</h3>
        <DateInputDDMMYYYY aria-label="New PM date" value={postponeDate} onValueChange={setPostponeDate} disabled={!canEdit} />
        <input aria-label="Reschedule reason" disabled={!canEdit} className={`${input} w-full`} placeholder="Reason" value={postponeReason} onChange={(event) => setPostponeReason(event.target.value)} />
        <button type="button" disabled={!canEdit || !postponeDate} className="rounded bg-amber-600 px-3 py-1 text-white disabled:opacity-50" onClick={() => {
          const result = postponeItem(data, item, postponeDate, postponeReason, actor, postponeTeam?.code ?? "team");
          if (result.error) { setError(result.error); return; }
          setError(""); setData(() => result.data); setMessage(`Rescheduled to ${formatDateDDMMYYYY(postponeDate)}.`); onClose?.();
        }}>Reschedule PM</button>
      </div>
      <div className="space-y-2 rounded border bg-white p-3">
        <h3 className="font-bold">❄ Create Location Freeze from Request</h3>
        <div className="flex flex-wrap gap-2"><DateInputDDMMYYYY aria-label="Freeze start" value={freezeStart} onValueChange={setFreezeStart} disabled={!canFreeze} /><DateInputDDMMYYYY aria-label="Freeze end" value={freezeEnd} onValueChange={setFreezeEnd} disabled={!canFreeze} /></div>
        <input aria-label="Freeze reason" disabled={!canFreeze} className={`${input} w-full`} placeholder="Reason, e.g. LEOP launch support" value={freezeReason} onChange={(event) => setFreezeReason(event.target.value)} />
        <button type="button" disabled={!canFreeze || !freezeStart || !freezeEnd} className="rounded bg-sky-700 px-3 py-1 text-white disabled:opacity-50" onClick={() => {
          const result = createFreezeFromItem(data, item, freezeStart, freezeEnd, freezeReason, actor);
          if (result.error) { setError(result.error); return; }
          setError(""); setData(() => result.data); setMessage("Location Freeze created.");
        }}>Create Location Freeze</button>
        {!canFreeze && <p className="text-xs text-slate-500">Requires freeze management permission.</p>}
      </div>
    </section>

    <section className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">Decision override:</span>
      <select aria-label="Decision override" disabled={!canEdit} className={input} value={item.record?.decisionOverride ?? ""}
        onChange={(event) => { const value = (event.target.value || null) as "Hold_Postponed" | "Force_Cleared" | null; mutate((record) => appendLog({ ...record, decisionOverride: value }, actor, `Decision override: ${value ?? "none"}`, { outcomeTag: "Note" })); }}>
        <option value="">None (automatic)</option><option value="Hold_Postponed">Hold / Postponed</option><option value="Force_Cleared">Force Cleared</option>
      </select>
    </section>
  </div>;
}
