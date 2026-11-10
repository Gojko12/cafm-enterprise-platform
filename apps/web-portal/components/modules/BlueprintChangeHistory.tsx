"use client";

import type { BlueprintAuditEntry, BaseWorkRequest } from "@cafm/shared-schema";

export function BlueprintChangeHistory({ entries }: { entries: BlueprintAuditEntry[] }) {
  return <details className="rounded border bg-amber-50/50 p-3"><summary className="cursor-pointer font-semibold">Blueprint Change History ({entries.length})</summary>
    {entries.map((entry) => <article key={entry.id} className="mt-2 rounded border bg-white p-3 text-sm"><strong>{entry.blueprintCode} · {entry.action}</strong><p>{entry.summary}</p><small>{entry.actor} · {entry.timestamp}</small><details><summary>Exact before / after</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}</pre></details></article>)}
  </details>;
}
export function ChecklistChangeHistory({ requests }: { requests: BaseWorkRequest[] }) {
  const entries = requests.flatMap((wr) => (wr.ChecklistHistory ?? []).filter((entry) => entry.actionType === "Checklist Correction").map((entry) => ({ ...entry, wr: wr.WR_ID })));
  return <details className="rounded border bg-white p-3"><summary className="cursor-pointer font-semibold">WR Checklist Corrections ({entries.length})</summary>{entries.map((entry) => <p key={entry.id} className="border-t p-2 text-sm">WR #{entry.wr} · {entry.timestamp} · {entry.details}</p>)}</details>;
}
