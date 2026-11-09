"use client";

import React, { useEffect, useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useQAActions } from "@/lib/use-qa-actions";
import { QAAuditPanel } from "@/components/modules/QAAuditPanel";

export function QAReportsArchive() {
  const { data } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const reports = (data.qaAuditReports ?? []).filter((report) => report.siteId === activeSiteId).slice().reverse();
  return <section className="rounded border bg-white p-3"><h3 className="font-bold">Committed QA Reports Archive &amp; Team Leader Notifications</h3>{reports.map((report) => <details className="my-2 rounded border p-2" key={report.id}><summary>{new Date(report.createdAt).toLocaleString()} · {report.inspector} · {report.passedCount} passed / {report.failedCount} failed</summary><p>Addressed to: {report.recipients.join(", ")}</p><p>{report.executiveSummary}</p>{report.items.map((item) => <p key={item.wrId}>{item.wrId} · {item.verdict} · {item.issueDescription} {item.followUpWrId && `· Follow-up ${item.followUpWrId}`}</p>)}</details>)}{!reports.length && <p>No committed reports.</p>}</section>;
}

export function QABatchReview({ staged, onEdit, onQueue }: { staged: BaseWorkRequest[]; onEdit: (id: string) => void; onQueue: () => void }) {
  const { data } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const { profile, permissions } = useActiveUserPermissions();
  const isAuthorizedInspector = !!(permissions?.canAuditDoInspection && (profile?.isQAInspector || profile?.isSuperAdmin));
  const actions = useQAActions();
  const [recipients, setRecipients] = useState<string[]>([]);
  const [person, setPerson] = useState("");
  const [custom, setCustom] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editId, setEditId] = useState("");
  const tradeKey = [...new Set(staged.map((wr) => wr.TradeName ?? ""))].sort().join("|");
  const directory = [...new Set([
    ...data.userAccessProfiles.filter((profile) => profile.siteId === activeSiteId).map((profile) => profile.personName),
    ...data.siteRoleAssignments.filter((assignment) => assignment.SiteId === activeSiteId).map((assignment) => assignment.PersonName),
  ])].sort();
  useEffect(() => {
    const trades = tradeKey.split("|");
    const defaults = [
      ...data.userAccessProfiles.filter((p) => p.siteId === activeSiteId && (p.isTeamLeader || p.isSiteAdmin || p.isSuperAdmin) && (!p.vpaTrades.length || p.vpaTrades.some((trade) => trades.includes(trade)))).map((p) => p.personName),
      ...data.siteRoleAssignments.filter((a) => a.SiteId === activeSiteId && a.ReceiveNotifications && ["ESA_TM", "TRADE_TM"].includes(a.RoleCode) && (a.Trade === "All" || trades.includes(a.Trade))).map((a) => a.PersonName),
    ];
    setRecipients([...new Set(defaults)]);
  }, [activeSiteId, tradeKey]);
  const run = async (operation: () => Promise<void>, success?: string) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); if (success) setNotice(success); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "The batch operation failed."); }
    finally { setBusy(false); }
  };
  const passed = staged.filter((wr) => wr.qaStagedVerdict?.verdict === "Pass").length;
  const failed = staged.length - passed;
  const rate = (n: number) => staged.length ? `${(n * 100 / staged.length).toFixed(1)}%` : "0%";
  const groups = (getKeys: (wr: BaseWorkRequest) => string[]) => [...new Set(staged.flatMap(getKeys))].sort().map((key) => {
    const group = staged.filter((wr) => getKeys(wr).includes(key)), passes = group.filter((wr) => wr.qaStagedVerdict?.verdict === "Pass").length;
    return { key, count: group.length, passes, failures: group.length - passes };
  });
  const personNames = (wr: BaseWorkRequest) => wr.AssignedCraftpersonIds.map((id) => {
    const item = data.craftspeople.find((p) => p.id === id);
    return item ? `${item.Name} ${item.LastName}`.trim() : id;
  });
  const names = (wr: BaseWorkRequest) => personNames(wr).join(", ") || "Unassigned";
  const reasons = staged.flatMap((wr) => wr.qaStagedVerdict?.verdict === "Fail" ? [wr.qaStagedVerdict.failureReason || wr.qaStagedVerdict.issueDescription || "Unspecified"] : []);
  const add = (value: string) => { const clean = value.trim(); if (clean) setRecipients((old) => old.includes(clean) ? old : [...old, clean]); };
  return <section className="space-y-4 rounded border bg-white p-4">
    <h2 className="text-xl font-bold">Staged Audit Batch Review, Report Composer &amp; Team Leader Dispatch Center</h2>
    {error && <p role="alert" className="bg-rose-100 p-2">{error}</p>}{notice && <p role="status" className="bg-emerald-100 p-2">{notice}</p>}
    <div className="space-y-3 rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4"><h3 className="text-lg font-bold">Step 1: Review Staged Inspection Findings ({staged.length} WRs Ready to Commit)</h3><div className="grid gap-2 md:grid-cols-3">{[["Total Staged", staged.length], ["Staged Passes ✓", `${passed} / ${rate(passed)}`], ["Staged Fails / Re-opens ⚠", `${failed} / ${rate(failed)}`]].map(([label, value]) => <div key={label} className="rounded bg-white p-2"><strong>{label}</strong><p>{value}</p></div>)}</div>
    <div className="grid gap-3 md:grid-cols-2">{([["Per Trade", groups((wr) => [wr.TradeName || "Unspecified"])], ["Per Craftsperson", groups((wr) => personNames(wr).length ? personNames(wr) : ["Unassigned"])]] as const).map(([label, rows]) => <div key={label}><h3 className="font-bold">{label}</h3><table className="w-full text-left"><thead><tr><th>Group</th><th>Inspected</th><th>Pass</th><th>Fail</th><th>Pass rate</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key}><td>{row.key}</td><td>{row.count}</td><td>{row.passes}</td><td>{row.failures}</td><td>{(row.passes * 100 / row.count).toFixed(1)}%</td></tr>)}</tbody></table></div>)}</div>
    <p><strong>Top failure reasons:</strong> {[...new Set(reasons)].map((reason) => ({ reason, count: reasons.filter((value) => value === reason).length })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)).map(({ reason, count }) => `${reason} (${count})`).join(", ") || "None"}</p>
    {staged.length ? <div className="overflow-auto rounded border bg-white"><table className="w-full text-left"><thead><tr>{["WR", "Type / Trade", "Location", "Craftsperson", "Verdict / Findings", "Reopen 50%", "Follow-up FJ", "Action"].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{staged.map((wr) => { const verdict = wr.qaStagedVerdict; return <tr className="border-t" key={wr.WR_ID}><td>{wr.WR_ID}</td><td>{wr.WR_Type} / {wr.TradeName}</td><td>{wr.bl_id} / {wr.LevelName} / {wr.RoomCode}</td><td>{names(wr)}</td><td>{verdict?.verdict === "Pass" ? "✓ Pass" : "⚠ Fail"} {verdict?.issueDescription}</td><td>{verdict?.verdict === "Fail" && <input aria-label={`Reopen ${wr.WR_ID}`} type="checkbox" checked={verdict.reopenTo50} disabled={busy || !permissions?.canAuditReopenWR} onChange={(e) => void run(() => actions.updateStagedOptions(wr.WR_ID, { reopenTo50: e.target.checked }))} />}</td><td>{verdict?.verdict === "Fail" && <input aria-label={`Follow-up for ${wr.WR_ID}`} type="checkbox" checked={verdict.spawnFollowUpFJ} disabled={busy || !permissions?.canOpenFollowUpFJ} onChange={(e) => void run(() => actions.updateStagedOptions(wr.WR_ID, { spawnFollowUpFJ: e.target.checked }))} />}</td><td><button className="underline" onClick={() => verdict?.previousStatus ? setEditId(wr.WR_ID) : onEdit(wr.WR_ID)}>Edit</button>{" · "}<button className="underline" disabled={busy} onClick={() => void run(() => actions.unstageVerdict(wr.WR_ID), "Removed from batch.")}>Remove from Batch</button></td></tr>; })}</tbody></table></div> : <div className="rounded border border-dashed bg-white p-6 text-center"><p>No findings are staged yet.</p><button className="text-blue-700 underline" onClick={onQueue}>→ Go to Tab 2 (Active Inspection Queue) to Mark WRs as Pass or Fail</button></div>}{editId && data.workRequests.find((wr) => wr.WR_ID === editId && wr.SiteId === activeSiteId) && <div><button className="underline" onClick={() => setEditId("")}>Close editor</button><QAAuditPanel wr={data.workRequests.find((wr) => wr.WR_ID === editId && wr.SiteId === activeSiteId)!} /></div>}</div>
    <div className="space-y-2 rounded-xl border-2 border-blue-200 bg-blue-50 p-4"><h3 className="text-lg font-bold">Step 2: Addressed Team Leaders &amp; Recipients</h3><div className="flex flex-wrap gap-2">{recipients.map((recipient) => <span key={recipient} className="rounded bg-blue-100 p-1">{recipient} <button aria-label={`Remove ${recipient}`} onClick={() => setRecipients((old) => old.filter((item) => item !== recipient))}>✕</button></span>)}</div>
      <select value={person} onChange={(e) => setPerson(e.target.value)}><option value="">+ Add Person from Site Directory</option>{directory.map((name) => <option key={name}>{name}</option>)}</select><button onClick={() => { add(person); setPerson(""); }}>Add person</button>{" "}
      <input className="border p-1" placeholder="Custom recipient / email" value={custom} onChange={(e) => setCustom(e.target.value)} /><button onClick={() => { add(custom); setCustom(""); }}>+ Add Custom Recipient / Email</button>
    </div>
    <div className="space-y-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4"><h3 className="text-lg font-bold">Step 3: Report Preview &amp; Final Commit</h3><p>{new Date().toLocaleDateString()} · Inspector {activePerson} · {staged.length} inspected, {passed} passed, {failed} failed</p>{groups((wr) => [wr.TradeName || "Unspecified"]).map((group) => <p key={group.key}>{group.key}: {group.passes} passed · {group.failures} failed</p>)}{staged.filter((wr) => wr.qaStagedVerdict?.verdict === "Fail").map((wr) => <p key={wr.WR_ID}>⚠ {wr.WR_ID} · {wr.TradeName} · {wr.bl_id}: {wr.qaStagedVerdict?.issueDescription}</p>)}
      <label className="block">Executive Note / Instructions for Team Leaders<textarea className="block w-full rounded border p-2" value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
      <p className="text-xs text-slate-600">Reports are stored in the portal and shown in-app to matching site-directory recipients. Custom emails are recorded only; no email or external notification is sent.</p>
    <button className="rounded bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50" disabled={busy || !staged.length || !recipients.length || !isAuthorizedInspector} onClick={() => void run(() => actions.commitStagedBatch(staged.map((wr) => wr.WR_ID), recipients, summary), "Findings committed and in-app report saved.")}>🚀 Commit Findings &amp; Send Report to Team Leaders</button></div>
  </section>;
}
