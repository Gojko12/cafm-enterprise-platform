import React, { useState } from "react";
import type { TechnicianFieldUpdate } from "@cafm/shared-schema";
import { fieldReasonLabels, urgencyLabels } from "../../../web-portal/lib/field-updates";

type Draft = Pick<TechnicianFieldUpdate, "reasonCategory" | "urgency" | "message">;
export function FieldUpdateModal({ wrId, submit, close }: { wrId: string; submit: (draft: Draft) => Promise<void>; close: () => void }) {
  const [reasonCategory, setReason] = useState<Draft["reasonCategory"]>("NeedAccess");
  const [urgency, setUrgency] = useState<Draft["urgency"]>("InfoOnly");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-4"><form role="dialog" aria-modal="true" aria-label="Push Update / Issue to Team Leader" className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-auto rounded bg-white p-4" onSubmit={(event) => {
    event.preventDefault();
    if (!message.trim()) { setError("Enter a comment explaining the issue."); return; }
    setBusy(true); setError("");
    void submit({ reasonCategory, urgency, message: message.trim() }).then(close).catch((problem: unknown) => setError(problem instanceof Error ? problem.message : "Could not save your update.")).finally(() => setBusy(false));
  }}>
    <h2 className="text-lg font-bold">Push Update / Issue to Team Leader · {wrId}</h2>
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><strong>📞 Remember: Talk to or call your Team Leader directly!</strong><p>Sending this notification flags the WR on the Team Leader&apos;s Dispatch Calendar—but if you are blocked right now or need urgent access/tools, please also call or speak to your Team Leader directly.</p></div>
    <label className="block">Reason / Issue Category<select className="block w-full rounded border p-2" value={reasonCategory} onChange={(event) => setReason(event.target.value as Draft["reasonCategory"])}>{(Object.entries(fieldReasonLabels) as Array<[Draft["reasonCategory"], string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="block">Urgency for Team Leader Action<select className="block w-full rounded border p-2" value={urgency} onChange={(event) => setUrgency(event.target.value as Draft["urgency"])}>{(Object.entries(urgencyLabels) as Array<[Draft["urgency"], string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="block">Technician Comment / Explanation<textarea required className="block w-full rounded border p-2" value={message} onChange={(event) => setMessage(event.target.value)} /></label>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    <div className="flex gap-2"><button disabled={busy} className="rounded bg-blue-700 p-2 text-white">Send Update</button><button type="button" disabled={busy} className="rounded border p-2" onClick={close}>Cancel</button></div>
  </form></div>;
}
