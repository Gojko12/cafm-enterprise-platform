"use client";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "@cafm/shared-schema";

import React, { useEffect, useState } from "react";
import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { OverviewTable } from "@/components/common/TableColumns";
import { MultiSelectFilter } from "@/components/common/MultiSelectFilter";
import { QAAuditPanel } from "@/components/modules/QAAuditPanel";
import { QAChecklistReview } from "@/components/modules/QAChecklistReview";
import { QAAnalytics } from "@/components/modules/QAAnalytics";
import { QABatchReview, QAReportsArchive } from "@/components/modules/QABatchReview";
import { QAReworkMonitor } from "@/components/modules/QAReworkMonitor";
import { QAInspectorSettings, QAFailureReasonSettings } from "@/components/modules/QASettings";
import { PMWorkRequestPopup } from "@/components/modules/PMWorkRequestPopup";
import { FJWorkRequestPopup } from "@/components/modules/FJWorkRequestPopup";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useQAActions } from "@/lib/use-qa-actions";
import { isQACompleted, isQAEligibleType, qaMatches, qaStatus } from "@/lib/qa-audits";
import { addDays, calendarDate } from "@/lib/dispatch";
import { DateInputDDMMYYYY } from "@/components/common/DateInputDDMMYYYY";

type Tab = "pool" | "queue" | "qr" | "report" | "rework" | "analytics" | "reasons";
export default function TechnicalAuditsPage() {
  const { data } = useCafmStore();
  const { profile, permissions } = useActiveUserPermissions();
  const { activeSiteId } = useSiteContext();
  const actions = useQAActions();
  const [tab, setTab] = useState<Tab>("pool");
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [types, setTypes] = useState<string[] | null>(null);
  const [trades, setTrades] = useState<string[] | null>(null);
  const [target, setTarget] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [id, setId] = useState("");
  const [popup, setPopup] = useState("");
  const [equipment, setEquipment] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { const params = new URLSearchParams(window.location.search); const focus = params.get("focusWrId"); if (focus) { setId(focus); setTab("rework"); } else if (params.get("tab") === "report") setTab("report"); else if (params.get("tab") === "analytics") setTab("analytics"); }, []);
  const canInspectTabs = !!(permissions?.canAuditDoInspection && (profile?.isQAInspector || profile?.isSuperAdmin));
  const canChooseTabs = canInspectTabs && !!permissions?.canAuditChooseWRs;
  const canReworkTabs = !!(canInspectTabs || profile?.isTeamLeader || profile?.isSiteAdmin || profile?.isSuperAdmin);
  const canAnalytics = !!(canReworkTabs || profile?.primaryRole === "TechnicalOfficer");
  const canReasons = canInspectTabs && !!permissions?.canManageFailureReasons;
  const visibleTabs: Tab[] = [...(canInspectTabs ? ["pool", "queue", "qr", "report"] as Tab[] : []), ...(canReworkTabs ? ["rework"] as Tab[] : []), ...(canAnalytics ? ["analytics"] as Tab[] : []), ...(canReasons ? ["reasons"] as Tab[] : [])];
  useEffect(() => { if (visibleTabs.length && !visibleTabs.includes(tab)) setTab(visibleTabs[0]); }, [tab, canChooseTabs, canInspectTabs, canReworkTabs, canAnalytics, canReasons]);
  const today = calendarDate(new Date());
  const start = period === "week" ? addDays(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7)) : period === "month" ? `${today.slice(0, 7)}-01` : period === "custom" ? from : "";
  const end = period === "custom" ? to : period === "all" ? "" : today;
  const requests = data.workRequests.filter((wr) => wr.SiteId === activeSiteId && isQAEligibleType(wr) && !!profile &&
    (wr.WR_Type === "PM" || wr.WR_Type === "FJ") && !!permissions && permissions.auditWRTypes.includes(wr.WR_Type) &&
    permissions.auditTrades.some((trade) => trade === wr.TradeName || trade === wr.TradeId) &&
    (!profile.vpaBuildingIds.length || profile.vpaBuildingIds.includes(wr.bl_id)));
  const rework = data.workRequests.filter((wr) => wr.SiteId === activeSiteId && isQAEligibleType(wr) && !!profile &&
    (!profile.vpaBuildingIds.length || profile.vpaBuildingIds.includes(wr.bl_id)) &&
    ((profile.isTeamLeader || profile.isSiteAdmin || profile.isSuperAdmin) ? (!profile.vpaTrades.length || profile.vpaTrades.some((trade) => trade === wr.TradeName || trade === wr.TradeId)) :
      !!permissions && (wr.WR_Type === "PM" || wr.WR_Type === "FJ") && permissions.auditWRTypes.includes(wr.WR_Type) && permissions.auditTrades.some((trade) => trade === wr.TradeName || trade === wr.TradeId)) &&
    (["QA_Failed_ActionRequired", "QA_Corrected"].includes(qaStatus(wr)) || ["QA_Failed_ActionRequired", "QA_Corrected"].includes(wr.qaStagedVerdict?.previousStatus ?? "") || (wr.WorkRequestSubstatus ?? "").includes("Re-opened") || !!wr.qaTeamLeaderChallenges?.length));
  const unread = rework.reduce((count, wr) => count + (wr.qaTeamLeaderChallenges ?? []).filter((challenge) => !challenge.isReadByInspector).length, 0);
  const completed = requests.filter((wr) => qaMatches(wr, { dateFrom: start || undefined, dateTo: end || undefined }));
  const queue = requests.filter((wr) => ["ToBeInspected", "QA_Staged_Pass", "QA_Staged_Fail"].includes(qaStatus(wr)) && !wr.qaStagedVerdict?.previousStatus);
  const staged = data.workRequests.filter((wr) => wr.SiteId === activeSiteId && !!wr.qaStagedVerdict);
  const active = requests.find((wr) => wr.WR_ID === id && (tab !== "queue" || queue.some((item) => item.WR_ID === wr.WR_ID)));
  const popupWR = [...requests, ...rework].find((wr) => wr.WR_ID === popup);
  const run = async (operation: () => Promise<void>, message: string) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); setSelected([]); setNotice(message); } catch (problem) { setError(problem instanceof Error ? problem.message : "Audit operation failed."); } finally { setBusy(false); }
  };
  const quota = (items: BaseWorkRequest[]) => {
    const target = Math.ceil(items.length * 0.05);
    const count = items.filter((wr) => qaStatus(wr) !== "None").length;
    return { target, count, gap: Math.max(0, target - count), percent: items.length ? count * 100 / items.length : 0 };
  };
  const total = quota(completed);
  const filtered = completed.filter((wr) => (types === null || types.includes(wr.WR_Type)) && (trades === null || trades.includes(wr.TradeName ?? "")));
  const pickGap = Math.max(0, (target === "" ? quota(filtered).target : Number(target)) - quota(filtered).count);
  const rows = tab === "queue" ? queue : tab === "qr" ? requests.filter((wr) => isQACompleted(wr) && (wr.EquipmentCodes ?? []).includes(equipment)) : completed;
  const selectedRows = rows.filter((wr) => selected.includes(wr.WR_ID));
  const columns = [
    { id: "select", label: "Select", value: (wr: BaseWorkRequest) => wr.WR_ID, render: (wr: BaseWorkRequest) => <input type="checkbox" checked={selected.includes(wr.WR_ID)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelected((old) => event.target.checked ? [...old, wr.WR_ID] : old.filter((item) => item !== wr.WR_ID))} /> },
    { id: "id", label: "WR ID", value: (wr: BaseWorkRequest) => wr.WR_ID },
    { id: "type", label: "Type", value: (wr: BaseWorkRequest) => wr.WR_Type },
    { id: "qa", label: "QA Status", value: qaStatus },
    { id: "mode", label: "Selection Mode", value: (wr: BaseWorkRequest) => wr.QA_SelectionMode === "ComputerRandom5Percent" ? "🤖 Computer Picked" : wr.QA_SelectionMode === "ManualInspectorPick" ? "👤 Human Picked" : wr.QA_SelectionMode ?? "—" },
    { id: "trade", label: "Trade", value: (wr: BaseWorkRequest) => wr.TradeName },
    { id: "location", label: "Building / Room", value: (wr: BaseWorkRequest) => `${wr.bl_id} / ${wr.RoomCode ?? ""}` },
    { id: "equipment", label: "Equipment", value: (wr: BaseWorkRequest) => (wr.EquipmentCodes ?? []).join(", ") },
    { id: "person", label: "Completed By", value: (wr: BaseWorkRequest) => wr.AssignedCraftpersonIds.join(", ") },
    { id: "hours", label: "Actual / Estimated", value: (wr: BaseWorkRequest) => `${((wr.TotalTimeMinutes ?? 0) / 60).toFixed(1)} / ${wr.ExpectedHours ?? 0} h` },
    { id: "inspector", label: "Inspector", value: (wr: BaseWorkRequest) => wr.QA_InspectedBy },
    { id: "issue", label: "Issue", value: (wr: BaseWorkRequest) => wr.QA_IssueDescription ?? "" },
    { id: "actions", label: "Actions", value: () => "", render: (wr: BaseWorkRequest) => <span><button onClick={(event) => { event.stopPropagation(); setId(wr.WR_ID); }}>Inspect</button>{" "}<button onClick={(event) => { event.stopPropagation(); setPopup(wr.WR_ID); }}>Open Full WR Details</button>{tab === "queue" && <button disabled={busy || !canChooseTabs} onClick={(event) => { event.stopPropagation(); void run(() => actions.transitionAudits([wr.WR_ID], "unselect"), "Removed from queue."); }}> ✕ Remove from Queue</button>}</span> },
  ];
  if (!visibleTabs.length) return <main className="p-4"><h1 className="text-2xl font-bold">Technical Audits</h1><p className="mt-4 rounded border bg-slate-50 p-4">Technical Audits is restricted to QA Inspectors, Team Leaders, Technical Officers and Administrators.</p></main>;
  if (!visibleTabs.includes(tab)) return <main className="p-4">Loading permitted audit view…</main>;
  return <main className="space-y-3 p-4 text-sm"><div className="flex items-center gap-3"><h1 className="text-2xl font-bold">Technical Audits</h1><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{profile?.primaryRole ?? "Authorized user"} · tabs based on role and permissions</span></div>
    {(tab === "pool" || tab === "queue" || tab === "qr") && <>
    <div><select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="all">All Time</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="custom">Custom Date Range</option></select>{period === "custom" && <><DateInputDDMMYYYY aria-label="Audit date from" value={from} onValueChange={setFrom} /><DateInputDDMMYYYY aria-label="Audit date to" value={to} onValueChange={setTo} /></>}</div>
    <section className="space-y-3 rounded border bg-white p-3"><div className="grid gap-2 md:grid-cols-4">{[["Total Completed WRs", completed.length], ["5% Target Needed", total.target], ["Chosen / Audited So Far", `${total.count} (${total.percent.toFixed(1)}%)`], ["Still Needed to Choose", total.gap]].map(([label, value]) => <div key={label} className="rounded bg-slate-100 p-2"><strong>{label}</strong><p className="text-xl">{value}</p></div>)}</div>
      <div className="grid gap-2 md:grid-cols-3"><div>Overall PM + FJ: {total.count} / {completed.length} ({total.percent.toFixed(1)}%) · target {total.target}<progress className="block w-full" max={Math.max(1, completed.length)} value={total.count} /></div>{(["PM", "FJ"] as const).map((type) => { const group = completed.filter((wr) => wr.WR_Type === type); const q = quota(group); return <div key={type}>{type} Audits (5% target): {q.count} / {group.length} ({q.percent.toFixed(1)}%) · target {q.target}<progress className="block w-full" max={Math.max(1, group.length)} value={q.count} /></div>; })}</div>
      <div className="overflow-auto"><table className="w-full text-left"><thead><tr>{["Trade", "Completed WRs", "5% Target", "Chosen / Audited", "Still Needed"].map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{CLASSICAL_TRADES.map((trade) => { const group = completed.filter((wr) => wr.TradeName === trade); const q = quota(group); return <tr key={trade} className="border-t"><td>{trade}</td><td>{group.length}</td><td>{q.target}</td><td>{q.count} / {group.length} ({q.percent.toFixed(1)}%)</td><td>{q.gap}</td></tr>; })}</tbody></table></div><p className="text-xs">Period uses completion date when recorded, otherwise last update. Reopened QA failures remain in their original completion cohort.</p>
      <div className="flex flex-wrap gap-2"><button disabled={busy || !permissions?.canAuditChooseWRs} className="rounded bg-blue-700 p-2 text-white disabled:opacity-50" onClick={() => void run(() => actions.autoSelect5PercentQAAudits({ dateFrom: start || undefined, dateTo: end || undefined, wrTypes: types === null ? undefined : types.filter((type): type is "PM" | "FJ" => type === "PM" || type === "FJ"), trades: trades ?? undefined, targetCount: target === "" ? undefined : Number(target) }), "Random selection saved.")}>🎲 Auto-Pick Remaining Missing WRs ({Number.isFinite(pickGap) ? pickGap : "—"} needed)</button><MultiSelectFilter label="WR Types" value={types} onChange={setTypes} options={["PM", "FJ"].map((item) => ({ value: item, label: item }))} /><MultiSelectFilter label="Trades" value={trades} onChange={setTrades} options={CLASSICAL_TRADES.map((item) => ({ value: item, label: item }))} /><label>Target count <input className="w-24 border" type="number" min="0" step="1" value={target} placeholder="5%" onChange={(e) => setTarget(e.target.value)} /></label></div>
    </section></>}
    <nav className="flex flex-wrap gap-2">{([["pool", "1. Completed WRs Pool (Select)"], ["queue", `2. Active Inspection Queue (${queue.length})`], ["report", `3. Commit Findings & Team Leader Report (${staged.length} Staged)`], ["rework", `4. Re-Opened WRs & TL Challenges (🔔 ${unread} Unread)`], ["analytics", "5. QA BI Analytics & Committed Reports"], ["reasons", "6. Predefined Failure Reasons"]] as const).filter(([key]) => visibleTabs.includes(key)).map(([key, title]) => <button key={key} className={`rounded border p-2 ${tab === key ? "border-blue-700 bg-blue-600 font-semibold text-white shadow-sm" : "border-slate-300 bg-white text-slate-700"}`} aria-pressed={tab === key} onClick={() => { setTab(key); setSelected([]); }}>{title}</button>)}</nav>
    {(tab === "queue" || tab === "qr") && <button className="underline" onClick={() => setTab(tab === "queue" ? "qr" : "queue")}>{tab === "queue" ? "Equipment QR Spot-Check" : "Back to inspection queue"}</button>}
    {error && <p role="alert" className="bg-red-100 p-2">{error}</p>}{notice && <p role="status" className="bg-green-100 p-2">{notice}</p>}
    {tab === "pool" && <button disabled={busy || !permissions?.canAuditChooseWRs || !selectedRows.length} onClick={() => void run(() => actions.manualSelectForQAAudit(selectedRows.map((wr) => wr.WR_ID), "ManualInspectorPick"), "Selected for audit.")}>+ Add selected to QA Audit</button>}
    {tab === "queue" && <button disabled={busy || !canChooseTabs || !selectedRows.length} onClick={() => void run(() => actions.transitionAudits(selectedRows.map((wr) => wr.WR_ID), "unselect"), "Removed from queue.")}>✕ Unselect / Remove Selected from Queue</button>}
    {tab === "qr" && <label>Equipment code <select value={equipment} onChange={(e) => setEquipment(e.target.value)}><option value="">Select equipment</option>{data.equipment.map((item) => <option key={item.EquipmentCode} value={item.EquipmentCode}>{item.EquipmentCode} · {item.EquipmentName}</option>)}</select></label>}
    {tab === "reasons" ? <QAFailureReasonSettings /> : tab === "report" ? <QABatchReview staged={staged} onEdit={(wrId) => { setTab("queue"); setId(wrId); }} onQueue={() => setTab("queue")} /> : tab === "rework" ? <QAReworkMonitor requests={rework} onOpen={setPopup} focusId={id} /> : tab === "analytics" ? <div className="space-y-3"><QAAnalytics onResolve={canReworkTabs ? (wrId) => { setId(wrId); setTab("rework"); } : undefined} /><QAReportsArchive /><QAInspectorSettings /></div> : <div className="flex gap-2"><div className="min-w-0 flex-1"><OverviewTable preferenceKey="qa-audits" rows={rows} columns={columns} rowKey={(wr) => wr.WR_ID} onRow={(wr) => setId(wr.WR_ID)} viewportClassName="max-h-[calc(100vh-260px)] overflow-auto rounded border" /></div>{active && <aside className="w-1/2 max-h-[calc(100vh-260px)] space-y-3 overflow-y-auto rounded border bg-white p-3 pr-2"><header className="sticky top-0 z-10 border-b bg-white pb-2"><h2 className="font-bold">{active.WR_ID} · {active.Description}</h2><button onClick={() => setPopup(active.WR_ID)}>Open Full WR Details</button>{" · "}<button onClick={() => setId("")}>✕ Close</button>{" · "}<button onClick={(event) => event.currentTarget.closest("aside")?.querySelector("#qa-verdict")?.scrollIntoView({ behavior: "smooth", block: "start" })}>↓ Jump to Verdict</button></header><p>Craftspeople: {active.AssignedCraftpersonIds.join(", ")} · Actual: {active.TotalTimeMinutes ?? 0} min · Estimated: {active.ExpectedHours ?? 0} h</p><p>Parts: {(active.SpareParts ?? []).map((part) => `${part.description} (${part.quantity})`).join(", ") || "—"}</p><QAChecklistReview key={active.WR_ID} wr={active} />{tab === "qr" && qaStatus(active) === "None" && <button disabled={busy} onClick={() => void run(() => actions.manualSelectForQAAudit([active.WR_ID], "QRScanOnSite"), "Selected for QR audit.")}>Select WR (QR Spot-Check)</button>}<div id="qa-verdict" className="scroll-mt-24"><QAAuditPanel wr={active} onReviewBatch={() => setTab("report")} /></div><h3>History</h3>{[...(active.Activity ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => <p key={item.id}>{formatDateTimeDDMMYYYY(item.createdAt)} · {item.text}</p>)}</aside>}</div>}
    {popupWR?.WR_Type === "PM" && <PMWorkRequestPopup workRequest={popupWR} onClose={() => setPopup("")} onNavigate={setPopup} onEscalateToLJ={() => setError("Create Long Jobs from the work request overview.")} />}
    {popupWR?.WR_Type === "FJ" && <FJWorkRequestPopup workRequest={popupWR} onClose={() => setPopup("")} onNavigate={setPopup} onEscalateToLJ={() => setError("Create Long Jobs from the work request overview.")} />}
  </main>;
}
