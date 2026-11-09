"use client";

import React, { useEffect, useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { OverviewTable } from "@/components/common/TableColumns";
import { QAChecklistReview } from "@/components/modules/QAChecklistReview";
import { QAAuditPanel } from "@/components/modules/QAAuditPanel";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useQAActions } from "@/lib/use-qa-actions";
import { useSiteContext } from "@/lib/contexts/SiteContext";

export function QAReworkMonitor({ requests, onOpen, focusId }: { requests: BaseWorkRequest[]; onOpen: (id: string) => void; focusId?: string }) {
  const { data } = useCafmStore();
  const { profile, permissions } = useActiveUserPermissions();
  const { activeSiteId } = useSiteContext();
  const actions = useQAActions();
  const [id, setId] = useState("");
  useEffect(() => { if (focusId) setId(focusId); }, [focusId]);
  const [reason, setReason] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const active = requests.find((wr) => wr.WR_ID === id);
  const leader = !!profile && !!(profile.isTeamLeader || profile.isSiteAdmin || profile.isSuperAdmin || permissions?.canOverwriteLaborTime);
  const inspector = !!permissions?.canAuditDoInspection;
  const run = async (fn: () => Promise<void>, message: string) => {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); setNotice(message); } catch (problem) { setError(problem instanceof Error ? problem.message : "Could not save QA operation."); } finally { setBusy(false); }
  };
  const challengeStatus = (wr: BaseWorkRequest) => {
    const challenges = wr.qaTeamLeaderChallenges ?? [];
    if (challenges.some((item) => !item.isReadByInspector)) return "🔔 Unread Challenge";
    const last = challenges[challenges.length - 1];
    return !last ? "None" : last.resolutionStatus === "Pending" ? "Read — Pending Decision" : last.resolutionStatus === "Accepted_ReopenCancelled" ? "Challenge Accepted" : "Challenge Rejected";
  };
  const names = (wr: BaseWorkRequest) => wr.AssignedCraftpersonIds.map((id) => {
    const p = data.craftspeople.find((person) => person.SiteId === activeSiteId && person.id === id);
    return p ? `${p.Name} ${p.LastName}`.trim() : id;
  }).join(", ") || "Unassigned";
  const columns = [
    { id: "unread", label: "Unread Alert", value: challengeStatus, render: (wr: BaseWorkRequest) => (wr.qaTeamLeaderChallenges ?? []).some((c) => !c.isReadByInspector) ? <span className="animate-pulse font-bold text-rose-700">🔔 UNREAD TL CHALLENGE</span> : "—" },
    { id: "wr", label: "WR / Type", value: (wr: BaseWorkRequest) => `${wr.WR_ID} / ${wr.WR_Type}` },
    { id: "location", label: "Trade / Location", value: (wr: BaseWorkRequest) => `${wr.TradeName ?? ""} · ${wr.bl_id} / ${wr.LevelName ?? ""} / ${wr.RoomCode ?? ""}` },
    { id: "person", label: "Assigned Craftsperson", value: names },
    { id: "progress", label: "Team Progress", value: (wr: BaseWorkRequest) => wr.qaTeamLeaderChallenges?.some((c) => c.resolutionStatus === "Pending") ? "⚖️ Challenged by Team Leader" : wr.Percentage === 78 ? "✅ 78% Rework Completed — Ready for Inspector Re-Check" : wr.Percentage === 50 ? "🔧 50% Rework In Progress by Team" : `${wr.Percentage}% ${wr.WorkRequestSubstatus}` },
    { id: "issue", label: "Original Issue", value: (wr: BaseWorkRequest) => wr.QA_IssueDescription },
    { id: "challenge", label: "Challenge Status", value: challengeStatus },
    { id: "count", label: "Re-Inspection Count", value: (wr: BaseWorkRequest) => wr.qaReinspectionCount ?? 0 },
  ];
  return <section className="space-y-3"><h2 className="text-xl font-bold">Re-Opened WRs &amp; Team Leader Challenges</h2>
    {error && <p role="alert" className="bg-rose-100 p-2">{error}</p>}{notice && <p role="status" className="bg-emerald-100 p-2">{notice}</p>}
    <div className="flex gap-2"><div className="min-w-0 flex-1"><OverviewTable preferenceKey="qa-rework" columns={columns} rows={requests} rowKey={(wr) => wr.WR_ID} onRow={(wr) => { setId(wr.WR_ID); setReason(""); setNote(""); setError(""); }} viewportClassName="max-h-[calc(100vh-260px)] overflow-auto rounded border" /></div>
      {active && <aside className="w-1/2 max-h-[calc(100vh-260px)] space-y-3 overflow-y-auto rounded border bg-white p-3"><header className="sticky top-0 z-10 border-b bg-white pb-2"><strong>{active.WR_ID} · {active.Description}</strong><div><button className="underline" onClick={() => onOpen(active.WR_ID)}>Open Full WR Details</button> · <button onClick={() => setId("")}>✕ Close</button></div></header>
        {(active.qaTeamLeaderChallenges ?? []).map((challenge) => <section key={challenge.id} className="space-y-2 rounded border border-amber-400 bg-amber-50 p-3"><strong>⚖️ {challenge.teamLeaderName} · {new Date(challenge.createdAt).toLocaleString()}</strong><p>{challenge.challengeReason}</p><p>{challenge.isReadByInspector ? `Read by ${challenge.readByInspectorName ?? "inspector"} at ${challenge.readByInspectorAt ?? "unknown time"}` : "🔔 Unread by inspector" } · {challenge.resolutionStatus}</p>
          {inspector && !challenge.isReadByInspector && <button className="rounded bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700" disabled={busy} onClick={() => void run(() => actions.markChallengeRead(active.WR_ID, challenge.id), "Challenge marked as read.")}>👁️ Mark Challenge as Read</button>}
          {challenge.inspectorResponse && <p>Inspector response: {challenge.inspectorResponse}</p>}
          {inspector && challenge.resolutionStatus === "Pending" && <><label className="block">Inspector Response<textarea className="block w-full border p-2" value={responses[challenge.id] ?? ""} onChange={(e) => setResponses((old) => ({ ...old, [challenge.id]: e.target.value }))} /></label><div className="flex flex-wrap gap-2"><button className="rounded bg-emerald-700 p-2 text-white disabled:opacity-50" disabled={busy || !challenge.isReadByInspector || !responses[challenge.id]?.trim()} onClick={() => void run(() => actions.resolveChallenge(active.WR_ID, challenge.id, true, responses[challenge.id]), "Challenge accepted.")}>✓ Accept Challenge — Cancel Re-Open &amp; Set WR to 100%</button><button className="rounded bg-rose-700 p-2 text-white disabled:opacity-50" disabled={busy || !challenge.isReadByInspector || !responses[challenge.id]?.trim()} onClick={() => void run(() => actions.resolveChallenge(active.WR_ID, challenge.id, false, responses[challenge.id]), "Challenge rejected; rework required.")}>✕ Reject Challenge — Keep Rework at 50%</button></div></>}
        </section>)}
        {leader && active.Percentage === 50 && ["QA_Failed_ActionRequired", "QA_Corrected"].includes(active.QA_AuditStatus ?? "") && <section className="space-y-2 rounded border p-3"><h3 className="font-bold">⚖️ Challenge This Re-Opening to Inspector</h3><textarea className="w-full border p-2" aria-label="Challenge reason" value={reason} onChange={(e) => setReason(e.target.value)} /><button className="rounded bg-indigo-700 p-2 text-white disabled:opacity-50" disabled={busy || !reason.trim()} onClick={() => void run(async () => { await actions.submitChallenge(active.WR_ID, reason); setReason(""); }, "Challenge submitted; inspector has not yet read it.")}>📨 Submit Challenge to QA Inspector</button></section>}
        <h3 className="font-bold">Inspector Re-Check &amp; Re-Inspection</h3><p>Original finding: {active.QA_IssueDescription || "—"}</p><QAChecklistReview wr={active} />
        {active.WR_Type === "FJ" && <section className="rounded border p-2"><h4 className="font-bold">Execution checklist</h4>{(active.todoSteps ?? []).map((step) => <div key={step.id} className="border-t py-1"><strong>{step.order}. {step.title}</strong><p>{step.instruction} · {step.completed ? "Completed" : "Open"} {step.isFavourable === undefined ? "" : step.isFavourable ? "· Favourable" : "· Unfavourable"}</p><p>{step.technicianComment}</p>{step.photoUrls?.map((url, index) => <a className="mr-2 underline" href={url} target="_blank" rel="noreferrer" key={index}>Photo {index + 1}</a>)}</div>)}{!active.todoSteps?.length && <p>No checklist recorded.</p>}</section>}
        <section><h4 className="font-bold">Technician time sessions</h4>{(active.timeSessions ?? []).map((s) => <p key={s.id}>{s.craftpersonName} · {s.startedAt} – {s.endedAt ?? "running"} · {s.durationMinutes} min</p>)}{(active.MobileWorkSessions ?? []).filter((s) => !(active.timeSessions ?? []).some((t) => t.id === s.SessionId)).map((s) => <p key={s.SessionId}>{s.TechnicianId} · {s.StartedAt} – {s.StoppedAt} · {s.TotalTimeMinutes} min</p>)}{!active.timeSessions?.length && !active.MobileWorkSessions?.length && <p>No timer sessions.</p>}</section>
        <section><h4 className="font-bold">Recent comments</h4>{(active.Activity ?? []).filter((entry) => entry.kind === "comment").slice(-10).reverse().map((entry) => <p key={entry.id}>{entry.actorName}: {entry.text}</p>)}</section>
        {inspector && <section className="space-y-2 rounded border p-2"><label className="block">Re-inspection note<textarea className="block w-full border p-2" value={note} onChange={(e) => setNote(e.target.value)} /></label><p className="text-xs">Re-check requires the team to complete rework to 78% and resolve pending challenges.</p><div className="flex flex-wrap gap-2"><button className="rounded bg-emerald-700 p-2 text-white disabled:opacity-50" disabled={busy || active.Percentage !== 78} onClick={() => void run(() => actions.recheck(active.WR_ID, true, note), "Re-check passed and audit verified.")}>✓ Re-Check Passed — Verify &amp; Close Audit (100%)</button><button className="rounded bg-rose-700 p-2 text-white disabled:opacity-50" disabled={busy || active.Percentage !== 78 || !note.trim()} onClick={() => void run(() => actions.recheck(active.WR_ID, false, note), "Re-check failed; work reopened.")}>⚠ Work Still Incorrect — Fail Re-Check &amp; Re-Open to 50%</button></div></section>}
        <QAAuditPanel wr={active} />
      </aside>}
    </div>
  </section>;
}
