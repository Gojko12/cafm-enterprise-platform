"use client";

import React, { useState } from "react";
import type { BaseWorkRequest, SatisfactionFollowUpStatus } from "@cafm/shared-schema";
import { formatDateTimeDDMMYYYY } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { addFollowUpNote, isDissatisfied, recipientLabel } from "@/lib/fj-satisfaction";

type Method = "Phone Call" | "Email Sent" | "In-Person" | "Internal Note";
const METHODS: Method[] = ["Phone Call", "Email Sent", "In-Person", "Internal Note"];
const STATUSES: { value: SatisfactionFollowUpStatus; label: string }[] = [
  { value: "Needs_Follow_Up", label: "Needs Follow-Up" }, { value: "Contacted", label: "Contacted" },
  { value: "In_Progress", label: "In Progress" }, { value: "Resolved", label: "Resolved" },
];

export function RatingEmailModal({ wr, onClose }: { wr: BaseWorkRequest; onClose: () => void }) {
  const survey = wr.Satisfaction;
  const link = `/rate-fj/${encodeURIComponent(wr.WR_ID)}${survey?.token ? `?token=${survey.token}` : ""}`;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Requestor rating email">
      <div className="w-full max-w-lg space-y-3 rounded-lg bg-white p-5 shadow-xl">
        <div className="text-xs text-slate-500">
          <div>To: {survey?.sentToEmail ?? wr.RequestorEmail ?? "—"}</div>
          <div>Sent: {survey?.sentAt ? formatDateTimeDDMMYYYY(survey.sentAt) : "Not sent yet"}</div>
          <div className="font-semibold text-slate-800">Subject: How was your service? {wr.WR_ID}</div>
        </div>
        <div className="space-y-2 rounded border bg-slate-50 p-3 text-sm">
          <p>Dear {wr.RequestorName ?? "colleague"},</p>
          <p>Your request “{wr.Description}” has been completed. Please tell us if the service was OK.</p>
          <a href={link} target="_blank" rel="noreferrer" className="inline-block rounded bg-blue-600 px-3 py-1.5 text-white">Rate this service</a>
        </div>
        <div className="text-right"><button type="button" onClick={onClose} className="rounded border px-3 py-1 text-sm">Close</button></div>
      </div>
    </div>
  );
}

export function DissatisfactionPanel({ wr, canEdit, actorName, onReopen }: { wr: BaseWorkRequest; canEdit: boolean; actorName: string; onReopen: () => void }) {
  const { data, setData } = useCafmStore();
  const [method, setMethod] = useState<Method>("Phone Call");
  const [status, setStatus] = useState<SatisfactionFollowUpStatus>("Contacted");
  const [text, setText] = useState("");
  const survey = wr.Satisfaction;
  if (!survey || !isDissatisfied(wr)) return null;
  const add = () => {
    if (!text.trim()) return;
    setData((current) => addFollowUpNote(current, wr.WR_ID, { by: actorName, method, status, text: text.trim() }));
    setText("");
  };
  return (
    <section className="space-y-3 rounded border-2 border-red-300 bg-red-50 p-4" aria-label="Requestor Dissatisfaction & Team Leader Follow-Up">
      <h3 className="text-sm font-bold text-red-900">Requestor Dissatisfaction &amp; Team Leader Follow-Up</h3>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div><dt className="text-slate-500">Requestor</dt><dd>{wr.RequestorName ?? "—"}</dd></div>
        <div><dt className="text-slate-500">Email</dt><dd>{wr.RequestorEmail ?? "—"}</dd></div>
        <div><dt className="text-slate-500">Phone</dt><dd>{wr.RequestorPhone ?? "—"}</dd></div>
        <div><dt className="text-slate-500">Rating</dt><dd className="text-amber-600">{"★".repeat(survey.ratingStars ?? 0)}{"☆".repeat(5 - (survey.ratingStars ?? 0))}</dd></div>
        <div className="col-span-2"><dt className="text-slate-500">Feedback {survey.feedbackAt ? `(${formatDateTimeDDMMYYYY(survey.feedbackAt)})` : ""}</dt><dd>{survey.feedbackText || "—"}</dd></div>
        <div className="col-span-2"><dt className="text-slate-500">Notified</dt><dd className="flex flex-wrap gap-1">{survey.notifiedRecipients.length ? survey.notifiedRecipients.map((email) => <span key={email} className="rounded bg-white px-2 py-0.5 ring-1 ring-red-200">{recipientLabel(data, email)}</span>) : "—"}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-2">
        {wr.RequestorEmail && <a href={`mailto:${wr.RequestorEmail}?subject=${encodeURIComponent(`Follow-up on ${wr.WR_ID}`)}`} className="rounded border bg-white px-3 py-1 text-xs">✉ Reply by Email</a>}
        {wr.RequestorPhone && <a href={`tel:${wr.RequestorPhone.replace(/\s/g, "")}`} className="rounded border bg-white px-3 py-1 text-xs">📞 Call Requestor ({wr.RequestorPhone})</a>}
        {canEdit && <button type="button" onClick={onReopen} className="rounded bg-red-700 px-3 py-1 text-xs text-white">↺ Reopen FJ for Rework</button>}
      </div>
      <div className="space-y-2">
        <h4 className="text-xs font-semibold">Internal Follow-Up Notes — contact requestor directly via email or phone and log outcome here</h4>
        <ul className="space-y-1 text-xs">
          {survey.followUpNotes.map((note) => <li key={note.id} className="rounded bg-white p-2 ring-1 ring-slate-200">
            <span className="font-mono">{formatDateTimeDDMMYYYY(note.at)}</span> · {note.by} · {note.method} · <b>{STATUSES.find((s) => s.value === note.status)?.label}</b><div>{note.text}</div>
          </li>)}
          {survey.followUpNotes.length === 0 && <li className="text-slate-500">No follow-up logged yet.</li>}
        </ul>
        {canEdit ? <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Contact method" value={method} onChange={(e) => setMethod(e.target.value as Method)} className="rounded border px-2 py-1 text-xs">{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
          <select aria-label="Follow-up status" value={status} onChange={(e) => setStatus(e.target.value as SatisfactionFollowUpStatus)} className="rounded border px-2 py-1 text-xs">{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <input aria-label="Follow-up note" value={text} onChange={(e) => setText(e.target.value)} placeholder="Outcome of contact…" className="min-w-48 flex-1 rounded border px-2 py-1 text-xs" />
          <button type="button" onClick={add} className="rounded bg-blue-600 px-3 py-1 text-xs text-white">Log note</button>
        </div> : <p className="text-[11px] text-slate-500">🔒 Only Team Leaders, Trade Managers, Helpdesk and admins can log follow-up notes.</p>}
      </div>
    </section>
  );
}
