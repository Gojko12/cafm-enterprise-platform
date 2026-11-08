"use client";

import React, { useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { isQACompleted, qaDate, qaStatus } from "@/lib/qa-audits";
import { addDays } from "@/lib/dispatch";

type SortKey = "age" | "id" | "type" | "trade" | "location" | "person" | "issue";

export function QAAnalytics({ onResolve }: { onResolve?: (id: string) => void }) {
  const { data } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const [period, setPeriod] = useState<"month" | "week">("month");
  const [dimension, setDimension] = useState<"trade" | "building" | "person">("trade");
  const [sort, setSort] = useState<SortKey>("age");
  const [descending, setDescending] = useState(true);
  const requests = data.workRequests.filter((wr) => wr.SiteId === activeSiteId);
  const completed = requests.filter(isQACompleted);
  const periodKey = (wr: BaseWorkRequest) => {
    const date = qaDate(wr);
    if (period === "month") return date.slice(0, 7);
    const day = new Date(`${date}T12:00:00`);
    return Number.isNaN(day.getTime()) ? "Unknown" : addDays(date, -((day.getDay() + 6) % 7));
  };
  const periods = [...new Set(completed.map(periodKey))].sort().reverse();
  const names = new Map(data.craftspeople.filter((person) => person.SiteId === activeSiteId).map((person) => [person.id, `${person.Name} ${person.LastName}`]));
  const resolved = completed.filter((wr) => ["QA_Passed", "QA_Failed_ActionRequired", "QA_Corrected", "QA_Verified"].includes(qaStatus(wr)));
  const groups = new Map<string, { pass: number; rework: number }>();
  resolved.forEach((wr) => {
    const keys = dimension === "trade" ? [wr.TradeName || "Unspecified"] : dimension === "building" ? [wr.bl_id || "Unspecified"] : wr.AssignedCraftpersonIds.length ? wr.AssignedCraftpersonIds.map((id) => names.get(id) ?? id) : ["Unassigned"];
    [...new Set(keys)].forEach((key) => { const group = groups.get(key) ?? { pass: 0, rework: 0 }; if (qaStatus(wr) === "QA_Passed") group.pass++; else group.rework++; groups.set(key, group); });
  });
  const age = (wr: BaseWorkRequest) => {
    const date = Date.parse(wr.QA_InspectedDate ?? "");
    return Number.isFinite(date) ? Math.max(0, Math.floor((Date.now() - date) / 86400000)) : null;
  };
  const open = requests.filter((wr) => qaStatus(wr) === "QA_Failed_ActionRequired" && !wr.QA_CorrectionComment?.trim());
  const value = (wr: BaseWorkRequest): string | number => sort === "age" ? age(wr) ?? -1 : sort === "id" ? wr.WR_ID : sort === "type" ? wr.WR_Type : sort === "trade" ? wr.TradeName ?? "" : sort === "location" ? `${wr.bl_id} / ${wr.RoomCode ?? ""}` : sort === "person" ? wr.AssignedCraftpersonIds.map((id) => names.get(id) ?? id).join(", ") : wr.QA_IssueDescription ?? "";
  open.sort((a, b) => { const av = value(a), bv = value(b); const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv)); return (descending ? -result : result) || a.WR_ID.localeCompare(b.WR_ID); });
  return <section className="space-y-5 rounded border bg-white p-4 text-sm">
    <h2 className="text-xl font-bold">Quality Assurance &amp; Audit BI Dashboard</h2>
    <div><h3 className="font-bold">5% Sampling Compliance</h3><label>Group by <select value={period} onChange={(e) => setPeriod(e.target.value === "week" ? "week" : "month")}><option value="month">Month</option><option value="week">Week starting Monday</option></select></label>
      <p className="text-xs">Bars show completed inspections; pending selections are shown separately. Completion dates for older records may use the last update date.</p>
      {periods.length === 0 && <p>No completed work requests.</p>}
      {periods.map((key) => <div key={key} className="my-2 rounded border p-2"><strong>{period === "week" ? "Week of " : ""}{key}</strong>{(["PM", "FJ", "LJ"] as const).map((type) => { const group = completed.filter((wr) => periodKey(wr) === key && wr.WR_Type === type); const count = group.filter((wr) => qaStatus(wr) !== "None" && qaStatus(wr) !== "SelectedForAudit").length; const selected = group.filter((wr) => qaStatus(wr) === "SelectedForAudit").length; const percent = group.length ? count * 100 / group.length : 0; return <div key={type} className="my-1"><div className={group.length && percent < 5 ? "font-bold text-red-700" : ""}>{type}: {group.length} completed · {count} audited · {selected} pending · {group.length ? `${percent.toFixed(1)}%` : "—"}</div><div className="h-3 rounded bg-slate-200" aria-label={`${type}: ${count} of ${group.length}`}><div className={`h-3 rounded ${group.length && percent < 5 ? "bg-red-600" : "bg-blue-600"}`} style={{ width: `${percent}%` }} /></div></div>; })}</div>)}
    </div>
    <div><h3 className="font-bold">First-time QA verdicts</h3><label>Break down by <select value={dimension} onChange={(e) => { const v = e.target.value; if (v === "trade" || v === "building" || v === "person") setDimension(v); }}><option value="trade">Trade</option><option value="building">Building</option><option value="person">Craftsperson</option></select></label><p className="text-xs">Passed on first inspection versus failed, corrected or verified; pending selections excluded.</p>
      {[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, counts]) => { const total = counts.pass + counts.rework; const pass = counts.pass * 100 / total; return <div key={name} className="my-2"><div>{name}: {pass.toFixed(1)}% first-time pass ({counts.pass}) · {(100 - pass).toFixed(1)}% rework ({counts.rework})</div><div className="flex h-3 overflow-hidden rounded bg-slate-200"><div className="bg-green-600" style={{ width: `${pass}%` }} /><div className="bg-rose-600" style={{ width: `${100 - pass}%` }} /></div></div>; })}{!groups.size && <p>No inspection verdicts.</p>}
    </div>
    <div className="overflow-auto"><h3 className="font-bold">Open QA issues ageing</h3><table className="w-full text-left"><thead><tr>{([["id", "WR ID"], ["type", "Type"], ["trade", "Trade"], ["location", "Building / Room"], ["person", "Craftsperson"], ["issue", "Issue"], ["age", "Days Open"]] as const).map(([key, title]) => <th key={key}><button onClick={() => { if (sort === key) setDescending(!descending); else { setSort(key); setDescending(key === "age"); } }}>{title}{sort === key ? descending ? " ↓" : " ↑" : ""}</button></th>)}<th>Action</th></tr></thead><tbody>{open.map((wr) => <tr key={wr.WR_ID} className="border-t"><td>{wr.WR_ID}</td><td>{wr.WR_Type}</td><td>{wr.TradeName || "—"}</td><td>{wr.bl_id} / {wr.RoomCode || "—"}</td><td>{wr.AssignedCraftpersonIds.map((id) => names.get(id) ?? id).join(", ") || "—"}</td><td>{wr.QA_IssueDescription}</td><td>{age(wr) ?? "Unknown"}</td><td>{onResolve ? <button className="underline" onClick={() => onResolve(wr.WR_ID)}>Open &amp; Resolve</button> : <a className="underline" href={`/technical-audits?focusWrId=${encodeURIComponent(wr.WR_ID)}`}>Open &amp; Resolve</a>}</td></tr>)}</tbody></table>{!open.length && <p>No open QA issues.</p>}</div>
  </section>;
}
