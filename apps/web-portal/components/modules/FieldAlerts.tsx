"use client";

import React, { useState } from "react";
import type { BaseWorkRequest, TechnicianFieldUpdate } from "@cafm/shared-schema";
import { fieldReasonLabels, urgencyLabels, urgencyOrder } from "../../lib/field-updates";

type Alert = { wr: BaseWorkRequest; update: TechnicianFieldUpdate };
export function FieldAlerts({ requests, canReply, onShow, onOpen, onReply }: {
  requests: BaseWorkRequest[];
  canReply: boolean;
  onShow: (wr: BaseWorkRequest, update: TechnicianFieldUpdate) => void;
  onOpen: (id: string) => void;
  onReply: (wr: BaseWorkRequest, update: TechnicianFieldUpdate, reply: string, status: "Acknowledged" | "Resolved") => Promise<void>;
}) {
  const [editing, setEditing] = useState<Alert | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alerts = requests.flatMap((wr) => (wr.technicianFieldUpdates ?? []).filter((update) => update.status !== "Resolved").map((update) => ({ wr, update }))).sort((a, b) => urgencyOrder[a.update.urgency] - urgencyOrder[b.update.urgency] || b.update.createdAt.localeCompare(a.update.createdAt));
  const openCount = alerts.filter(({ update }) => update.status === "Open").length;
  if (!alerts.length && !editing) return null;
  const respond = (status: "Acknowledged" | "Resolved") => {
    if (!editing || !reply.trim()) { setError("Enter a reply before acknowledging or resolving."); return; }
    setBusy(true); setError("");
    void onReply(editing.wr, editing.update, reply.trim(), status).then(() => setEditing(null)).catch((problem: unknown) => setError(problem instanceof Error ? problem.message : "Could not save reply.")).finally(() => setBusy(false));
  };
  return <section className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3"><h2 className="font-bold">📣 Technician Field Updates &amp; Blockers ({openCount} Open)</h2>
    {alerts.map(({ wr, update }) => <article key={update.id} className="rounded border bg-white p-2"><p><strong>{urgencyLabels[update.urgency]}</strong> · {update.status} · {update.craftpersonName} · {wr.WR_ID} · {wr.bl_id} / {wr.LevelName ?? "—"} / {wr.RoomCode ?? "—"}</p><p><strong>{fieldReasonLabels[update.reasonCategory]}</strong> · {update.message}</p>{update.teamLeaderReply && <p>💬 {update.teamLeaderReply}</p>}<div className="mt-1 flex flex-wrap gap-2"><button className="rounded border px-2 py-1" onClick={() => onShow(wr, update)}>📍 Show on Calendar</button><button disabled={!canReply} title={!canReply ? "Scheduling permission required" : undefined} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => { setEditing({ wr, update }); setReply(update.teamLeaderReply ?? ""); setError(""); }}>💬 Reply &amp; Resolve</button><button className="rounded border px-2 py-1" onClick={() => onOpen(wr.WR_ID)}>Open WR Details</button></div></article>)}
    {editing && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"><div role="dialog" aria-modal="true" aria-label="Reply to technician" className="w-full max-w-lg space-y-3 rounded bg-white p-4"><h2 className="font-bold">Reply to {editing.update.craftpersonName} · {editing.wr.WR_ID}</h2><p>{editing.update.message}</p><textarea aria-label="Team Leader reply" className="w-full rounded border p-2" value={reply} onChange={(event) => setReply(event.target.value)} />{error && <p role="alert" className="text-rose-700">{error}</p>}<div className="flex flex-wrap gap-2"><button disabled={busy} className="rounded bg-amber-600 p-2 text-white" onClick={() => respond("Acknowledged")}>Reply &amp; Acknowledge</button><button disabled={busy} className="rounded bg-emerald-700 p-2 text-white" onClick={() => respond("Resolved")}>Reply &amp; Resolve</button><button disabled={busy} className="rounded border p-2" onClick={() => setEditing(null)}>Cancel</button></div></div></div>}
  </section>;
}
