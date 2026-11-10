"use client";

import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "@cafm/shared-schema";
import type { BlueprintAuditEntry, BaseWorkRequest } from "@cafm/shared-schema";

const formatSnapshot = (value: unknown) => JSON.stringify(value, (_key, item: unknown) => {
  if (typeof item !== "string") return item;
  if (/^\d{4}-\d{2}-\d{2}$/.test(item)) return formatDateDDMMYYYY(item);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(item)) return formatDateTimeDDMMYYYY(item);
  return item;
}, 2);

export function BlueprintChangeHistory({ entries }: { entries: BlueprintAuditEntry[] }) {
  return <details className="rounded border bg-amber-50/50 p-3"><summary className="cursor-pointer font-semibold">Blueprint Change History ({entries.length})</summary>
    {entries.map((entry) => <article key={entry.id} className="mt-2 rounded border bg-white p-3 text-sm"><strong>{entry.blueprintCode} · {entry.action}</strong><p>{entry.summary}</p><small>{entry.actor} · {formatDateTimeDDMMYYYY(entry.timestamp)}</small><details><summary>Exact before / after</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{formatSnapshot({ before: entry.before, after: entry.after })}</pre></details></article>)}
  </details>;
}
export function ChecklistChangeHistory({ requests }: { requests: BaseWorkRequest[] }) {
  const entries = requests.flatMap((wr) => (wr.ChecklistHistory ?? []).filter((entry) => entry.actionType === "Checklist Correction").map((entry) => ({ ...entry, wr: wr.WR_ID })));
  return <details className="rounded border bg-white p-3"><summary className="cursor-pointer font-semibold">WR Checklist Corrections ({entries.length})</summary>{entries.map((entry) => <p key={entry.id} className="border-t p-2 text-sm">WR #{entry.wr} · {formatDateTimeDDMMYYYY(entry.timestamp)} · {entry.details}</p>)}</details>;
}
