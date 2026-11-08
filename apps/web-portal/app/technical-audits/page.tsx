"use client";

import React, { useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { OverviewTable } from "@/components/common/TableColumns";
import { MultiSelectFilter } from "@/components/common/MultiSelectFilter";
import { QAAuditPanel } from "@/components/modules/QAAuditPanel";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useQAActions } from "@/lib/use-qa-actions";
import { isQACompleted, qaDate, qaMatches, qaStatus } from "@/lib/qa-audits";
import { addDays, calendarDate } from "@/lib/dispatch";

export default function TechnicalAuditsPage() {
  const { data } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const actions = useQAActions();
  const [tab, setTab] = useState<"queue" | "pool" | "qr" | "report">("queue");
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [types, setTypes] = useState<string[] | null>(null);
  const [buildings, setBuildings] = useState<string[] | null>(null);
  const [trades, setTrades] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [id, setId] = useState("");
  const [equipment, setEquipment] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const today = calendarDate(new Date());
  const start = period === "week" ? addDays(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7)) : period === "month" ? `${today.slice(0, 7)}-01` : period === "custom" ? from : "";
  const end = period === "custom" ? to : period === "all" ? "" : today;
  const requests = data.workRequests.filter((wr) => wr.SiteId === activeSiteId);
  const completed = requests.filter((wr) => qaMatches(wr, { dateFrom: start || undefined, dateTo: end || undefined }));
  const active = requests.find((wr) => wr.WR_ID === id);
  const run = async (operation: () => Promise<void>, message: string) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); setNotice(message); } catch (problem) { setError(problem instanceof Error ? problem.message : "Audit operation failed."); } finally { setBusy(false); }
  };
  const quota = (items: BaseWorkRequest[]) => ({ target: items.length ? Math.ceil(items.length * 0.05) : 0, selected: items.filter((wr) => qaStatus(wr) !== "None").length });
  const overall = quota(completed);
  const columns = [
    { id: "select", label: "Select", value: (wr: BaseWorkRequest) => wr.WR_ID, render: (wr: BaseWorkRequest) => <input type="checkbox" checked={selected.includes(wr.WR_ID)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelected((old) => event.target.checked ? [...old, wr.WR_ID] : old.filter((item) => item !== wr.WR_ID))} /> },
    { id: "id", label: "WR ID", value: (wr: BaseWorkRequest) => wr.WR_ID },
    { id: "type", label: "Type", value: (wr: BaseWorkRequest) => wr.WR_Type },
    { id: "qa", label: "QA Status", value: qaStatus },
    { id: "mode", label: "Selection Mode", value: (wr: BaseWorkRequest) => wr.QA_SelectionMode },
    { id: "trade", label: "Trade", value: (wr: BaseWorkRequest) => wr.TradeName },
    { id: "location", label: "Building / Room", value: (wr: BaseWorkRequest) => `${wr.bl_id} / ${wr.RoomCode ?? ""}` },
    { id: "equipment", label: "Equipment", value: (wr: BaseWorkRequest) => wr.EquipmentCodes.join(", ") },
    { id: "person", label: "Completed By", value: (wr: BaseWorkRequest) => wr.AssignedCraftpersonIds.join(", ") },
    { id: "hours", label: "Actual / Estimated", value: (wr: BaseWorkRequest) => `${((wr.TotalTimeMinutes ?? 0) / 60).toFixed(1)} / ${wr.ExpectedHours ?? 0} h` },
    { id: "inspector", label: "Inspector", value: (wr: BaseWorkRequest) => wr.QA_InspectedBy },
    { id: "issue", label: "Issue / Correction", value: (wr: BaseWorkRequest) => `${wr.QA_IssueDescription ?? ""} ${wr.QA_CorrectionComment ?? ""}` },
    { id: "actions", label: "Actions", value: () => "", render: (wr: BaseWorkRequest) => <span><button onClick={(event) => { event.stopPropagation(); setId(wr.WR_ID); }}>Inspect</button>{wr.QA_AuditStatus === "SelectedForAudit" && wr.QA_SelectionMode === "ComputerRandom5Percent" && <button disabled={busy} onClick={(event) => { event.stopPropagation(); void run(() => actions.swapRandomQAAuditWR(wr.WR_ID), "Audit swapped."); }}> 🔄 Swap</button>}</span> },
  ];
  const rows = tab === "queue" ? requests.filter((wr) => qaStatus(wr) !== "None") : tab === "qr" ? requests.filter((wr) => isQACompleted(wr) && wr.EquipmentCodes.includes(equipment)) : completed;
  return <main className="space-y-3 p-4 text-sm"><h1 className="text-2xl font-bold">Technical Audits</h1>
    <div className="flex flex-wrap gap-2"><select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="all">All Time</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="custom">Custom Date Range</option></select>{period === "custom" && <><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></>}</div>
    <div className="rounded border bg-white p-3"><strong>Completed: {completed.length} · 5% Target: {overall.target} · Selected / audited: {overall.selected} / {overall.target}</strong><progress className="block w-full" max={Math.max(1, overall.target)} value={overall.selected} />{(["PM", "FJ", "LJ"] as const).map((type) => { const q = quota(completed.filter((wr) => wr.WR_Type === type)); return <div key={type}>{type} Audits: {q.selected} / {q.target} <progress max={Math.max(1, q.target)} value={q.selected} /></div>; })}<p className="text-xs">Period uses recorded completion date where available, otherwise the last update date. Selected audits count toward the target.</p></div>
    <nav className="flex flex-wrap gap-2">{([["queue", "My QA Audit Queue"], ["pool", "All Completed WRs Pool"], ["qr", "Equipment QR Spot-Check"], ["report", "QA Reporting & BI Analytics"]] as const).map(([key, title]) => <button key={key} className="rounded border bg-white p-2" aria-pressed={tab === key} onClick={() => setTab(key)}>{title}</button>)}</nav>
    {error && <p role="alert" className="bg-red-100 p-2">{error}</p>}{notice && <p role="status" className="bg-green-100 p-2">{notice}</p>}
    {tab === "queue" && <div className="flex flex-wrap gap-2"><button disabled={busy} className="rounded bg-blue-700 p-2 text-white" onClick={() => void run(() => actions.autoSelect5PercentQAAudits({ dateFrom: start || undefined, dateTo: end || undefined, wrTypes: types === null ? undefined : types.filter((type): type is "PM" | "FJ" | "LJ" => type === "PM" || type === "FJ" || type === "LJ"), buildingIds: buildings ?? undefined, trades: trades ?? undefined }), "Random selection saved.")}>🎲 Auto-Select 5% Random WRs</button><MultiSelectFilter label="WR Types" value={types} onChange={setTypes} options={["PM", "FJ", "LJ"].map((item) => ({ value: item, label: item }))} /><MultiSelectFilter label="Buildings" value={buildings} onChange={setBuildings} options={data.buildings.map((item) => ({ value: item.bl_id, label: item.bl_id }))} /><MultiSelectFilter label="Trades" value={trades} onChange={setTrades} options={[...new Set(requests.map((wr) => wr.TradeName).filter((value): value is string => !!value))].map((item) => ({ value: item, label: item }))} /></div>}
    {tab === "pool" && <button disabled={busy || !selected.length} onClick={() => void run(() => actions.manualSelectForQAAudit(selected, "ManualInspectorPick").then(() => setSelected([])), "Selected for audit.")}>+ Add selected to QA Audit</button>}
    {tab === "qr" && <label>Equipment code <select value={equipment} onChange={(e) => setEquipment(e.target.value)}><option value="">Select equipment</option>{data.equipment.map((item) => <option key={item.EquipmentCode} value={item.EquipmentCode}>{item.EquipmentCode} · {item.EquipmentName}</option>)}</select></label>}
    {tab === "report" ? <div className="space-y-2"><h2 className="font-bold">Monthly sampling compliance</h2>{[...new Set(completed.map((wr) => qaDate(wr).slice(0, 7)))].sort().map((month) => <div key={month}>{month}: {(["PM", "FJ", "LJ"] as const).map((type) => { const group = completed.filter((wr) => wr.WR_Type === type && qaDate(wr).startsWith(month)); const q = quota(group); return <span key={type} className={q.selected < q.target ? "text-red-700" : "text-green-700"}> {type} {q.selected}/{q.target} ({group.length} completed) </span>; })}</div>)}<h2 className="font-bold">Open QA issues</h2>{requests.filter((wr) => qaStatus(wr) === "QA_Failed_ActionRequired" && !wr.QA_CorrectionComment).map((wr) => <p key={wr.WR_ID}><button className="underline" onClick={() => { setTab("queue"); setId(wr.WR_ID); }}>{wr.WR_ID} · {wr.QA_IssueDescription}</button></p>)}</div> : <div className="flex gap-2"><div className="min-w-0 flex-1"><OverviewTable preferenceKey="qa-audits" rows={rows} columns={columns} rowKey={(wr) => wr.WR_ID} onRow={(wr) => setId(wr.WR_ID)} /></div>{active && <aside className="w-1/2 space-y-3 overflow-auto rounded border bg-white p-3"><button onClick={() => setId("")}>✕ Close</button><h2 className="font-bold">{active.WR_ID} · {active.Description}</h2><p>Craftspeople: {active.AssignedCraftpersonIds.join(", ")} · Actual: {active.TotalTimeMinutes ?? 0} min · Estimated: {active.ExpectedHours ?? 0} h</p><p>Parts: {(active.SpareParts ?? []).map((part) => `${part.description} (${part.quantity})`).join(", ") || "—"}</p><h3 className="font-bold">Checklist</h3>{(active.ChecklistSteps ?? []).map((step) => <p key={step.StepId}>{step.Title}: {String(active.ChecklistResults?.find((answer) => answer.stepId === step.StepId)?.value ?? "—")}</p>)}{tab === "qr" && qaStatus(active) === "None" && <button disabled={busy} onClick={() => void run(() => actions.manualSelectForQAAudit([active.WR_ID], "QRScanOnSite"), "Selected for QR audit.")}>Inspect This WR (QR Spot-Check)</button>}<QAAuditPanel wr={active} /><h3>History</h3>{[...(active.Activity ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => <p key={item.id}>{item.createdAt} · {item.text}</p>)}</aside>}</div>}
  </main>;
}
