"use client";

// V59 (MASTER_SPEC Section 109): read-only audit trail for location renames.
// Entries are appended by LocationsWorkbench after applyLocationRename has
// rewritten every reference; the log lives in the locationRenameLog blob
// collection (oldest-first, capped at 100 entries). The panel filters to the
// active site and shows newest first.
import { History } from "lucide-react";
import type { LocationRenameLogEntry } from "@/lib/cafm-data";

const kindBadge: Record<LocationRenameLogEntry["kind"], string> = {
  building: "bg-blue-100 text-blue-800",
  floor: "bg-amber-100 text-amber-800",
  room: "bg-emerald-100 text-emerald-800",
};

export function LocationRenameHistory({ entries, siteId }: { entries: LocationRenameLogEntry[]; siteId: string }) {
  const rows = [...entries].filter((entry) => entry.siteId === siteId).reverse();
  return <section className="rounded-lg border bg-white p-4 shadow-sm">
    <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><History size={15} /> Rename history</h2>
    {rows.length === 0 ? <p className="mt-2 text-sm text-slate-500">No renames recorded yet.</p> : (
      <ul className="mt-2 divide-y divide-slate-100">
        {rows.map((entry) => <li key={entry.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${kindBadge[entry.kind]}`}>{entry.kind}</span>
          <span className="font-semibold text-slate-900">{entry.from}</span>
          <span className="text-slate-500">renamed to</span>
          <span className="font-semibold text-slate-900">{entry.to}</span>
          <span className="text-slate-500">by {entry.actor}</span>
          {entry.impact.length > 0 && (
            <span className="text-[11px] text-slate-600">{entry.impact.map((item) => `${item.count} ${item.label}`).join(", ")}</span>
          )}
          <span className="ml-auto text-[11px] text-slate-400">{new Date(entry.at).toLocaleString()}</span>
        </li>)}
      </ul>
    )}
  </section>;
}
