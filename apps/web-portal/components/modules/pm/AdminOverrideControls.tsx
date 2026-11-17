"use client";

import React, { useState } from "react";
import type { GovernanceProof } from "@/lib/wr-governance-types";

interface Props {
  title: string;
  kind: GovernanceProof["kind"];
  wrId: string;
  current: number;
  choices: ReadonlyArray<readonly [number, string]>;
  onSubmit: (target: number, proof: GovernanceProof) => Promise<void>;
}

export function AdminOverrideControls({ title, kind, wrId, current, choices, onSubmit }: Props) {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const available = choices.filter(([percentage]) => percentage !== current);
  const submit = async () => {
    const percentage = Number(target);
    const comment = reason.trim();
    if (!target || !available.some(([value]) => value === percentage) || comment.length < 5) return;
    if (!window.confirm(`Review: ${current}% -> ${percentage}%\nReason: ${comment}\n\nContinue?`)) return;
    const confirmed1At = new Date().toISOString();
    if (!window.confirm(kind === "pm-reactivation"
      ? "Confirm reopening this closed or cancelled compliance record."
      : "Confirm pushing this Long Job to the selected stage.")) return;
    const confirmed2At = new Date(Math.max(Date.now(), Date.parse(confirmed1At) + 1)).toISOString();
    setBusy(true);
    setError("");
    try {
      await onSubmit(percentage, { wrId, kind, reason: comment, confirmed1At, confirmed2At });
      setReason("");
      setTarget("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The action could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  return <section className="space-y-3 rounded border border-amber-300 bg-amber-50 p-4">
    <h3 className="font-semibold">{title}</h3>
    <label className="block text-sm">Target stage
      <select value={target} onChange={(event) => setTarget(event.target.value)} className="ml-2 rounded border bg-white p-2">
        <option value="">Select a stage</option>
        {available.map(([value, label]) => <option key={value} value={value}>{value}% {label}</option>)}
      </select>
    </label>
    <label className="block text-sm">{kind === "pm-reactivation" ? "Reactivation Reason" : "Override Reason"} (minimum 5 characters)
      <textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 block w-full rounded border p-2" rows={2} />
    </label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="button" disabled={busy || !target || reason.trim().length < 5} onClick={() => void submit()}
      className="rounded bg-amber-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving..." : title}</button>
  </section>;
}
