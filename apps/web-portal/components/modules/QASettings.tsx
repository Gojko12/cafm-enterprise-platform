"use client";

import React, { useState } from "react";
import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { QAInspectorAssignment } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useApp } from "@/lib/hooks/useApp";

export function QAInspectorSettings() {
  const { data, commitSnapshot } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const { currentRole } = useApp();
  const [person, setPerson] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const assignments = data.qaInspectorAssignments ?? [];
  const save = async (next: QAInspectorAssignment[]) => {
    if (currentRole !== "SiteAdministrator") { setError("Only a Site Administrator may edit inspector permissions."); return; }
    setBusy(true); setError("");
    try { await commitSnapshot(data, { ...data, qaInspectorAssignments: next }); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Could not save inspector permissions."); }
    finally { setBusy(false); }
  };
  const update = (id: string, changes: Partial<QAInspectorAssignment>) => void save(assignments.map((entry) => entry.id === id ? { ...entry, ...changes } : entry));
  return <section className="space-y-3 rounded border bg-white p-3"><h2 className="font-bold">Inspector Permissions (Trades &amp; WR Types)</h2>
    <p>Site: {activeSiteId}. Only Site Administrators can edit assignments.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {assignments.filter((entry) => entry.siteId === activeSiteId).map((entry) => <div key={entry.id} className="space-y-2 border-t p-2"><strong>{entry.personName}</strong>
      <div>Trades: {CLASSICAL_TRADES.map((trade) => <label key={trade} className="mr-3"><input type="checkbox" disabled={busy || currentRole !== "SiteAdministrator"} checked={entry.trades.includes(trade)} onChange={(e) => update(entry.id, { trades: e.target.checked ? [...entry.trades, trade] : entry.trades.filter((item) => item !== trade) })} /> {trade}</label>)}</div>
      <div>WR types: {(["PM", "FJ", "LJ"] as const).map((type) => <label key={type} className="mr-3"><input type="checkbox" disabled={busy || currentRole !== "SiteAdministrator"} checked={entry.wrTypes.includes(type)} onChange={(e) => update(entry.id, { wrTypes: e.target.checked ? [...entry.wrTypes, type] : entry.wrTypes.filter((item) => item !== type) })} /> {type}</label>)}</div>
      <button disabled={busy || currentRole !== "SiteAdministrator"} onClick={() => void save(assignments.filter((item) => item.id !== entry.id))}>Remove inspector</button>
    </div>)}
    {currentRole === "SiteAdministrator" && <div><input className="border p-1" value={person} placeholder="Person name" onChange={(e) => setPerson(e.target.value)} /><button disabled={busy || !person.trim()} onClick={() => { const name = person.trim(); if (assignments.some((entry) => entry.siteId === activeSiteId && entry.personName.toLowerCase() === name.toLowerCase())) { setError("This inspector already has an assignment."); return; } void save([...assignments, { id: crypto.randomUUID(), siteId: activeSiteId, personName: name, trades: [], wrTypes: [] }]); setPerson(""); }}>Add inspector</button></div>}
  </section>;
}

export function QAFailureReasonSettings() {
  const { data, commitSnapshot } = useCafmStore();
  const { activePerson, activeSiteId } = useSiteContext();
  const { currentRole } = useApp();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reasons = data.qaFailureReasons ?? [];
  const allowed = currentRole === "SiteAdministrator" || (data.qaInspectorAssignments ?? []).some((entry) => entry.siteId === activeSiteId && entry.personName === activePerson);
  const save = async (next: string[]) => {
    if (!allowed) { setError("Only a QA inspector or Site Administrator can manage failure reasons."); return; }
    setBusy(true); setError("");
    try { await commitSnapshot(data, { ...data, qaFailureReasons: next }); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Could not save reasons."); }
    finally { setBusy(false); }
  };
  return <details className="rounded border bg-white p-2"><summary className="cursor-pointer">⚙ Manage Predefined Failure Reasons</summary>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {reasons.map((reason, index) => <div key={reason} className="flex items-center gap-2 border-b py-1"><span className="flex-1">{reason}</span><button disabled={!allowed || busy || index === 0} onClick={() => { const next = [...reasons]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; void save(next); }}>↑</button><button disabled={!allowed || busy || index === reasons.length - 1} onClick={() => { const next = [...reasons]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; void save(next); }}>↓</button><button disabled={!allowed || busy} onClick={() => void save(reasons.filter((_, i) => i !== index))}>Delete</button></div>)}
    {allowed && <div><input className="border p-1" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New failure reason" /><button disabled={busy || !draft.trim()} onClick={() => { const reason = draft.trim(); if (reasons.some((item) => item.toLowerCase() === reason.toLowerCase())) { setError("Reason already exists."); return; } void save([...reasons, reason]); setDraft(""); }}>Add</button></div>}
  </details>;
}
