"use client";

import React, { useMemo, useState } from "react";

import { CHANGE_LOG_TYPE_LABELS, CHANGE_LOG_TYPES, type ChangeLogType, type SiteId } from "@cafm/shared-schema";

import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";

import { ChangeLogSettingsCard } from "./ChangeLogSettingsCard";

const cell = "w-full rounded border border-slate-300 px-2 py-1 text-xs";

export function ChangeLogView() {
  const { activeSiteId } = useSiteContext();
  const { data } = useCafmStore();
  const { profile } = useActiveUserPermissions();
  const canEditSettings = profile?.isSuperAdmin === true;

  const [typeFilter, setTypeFilter] = useState<ChangeLogType | "all">("all");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const all = (data.changeLog ?? []).filter((entry) => entry.siteId === activeSiteId);
    const filtered = all.filter((entry) =>
      (typeFilter === "all" || entry.changeType === typeFilter) &&
      (!search || `${entry.recordKey} ${entry.oldKey} ${entry.newKey} ${entry.oldValue} ${entry.newValue} ${entry.modifiedBy} ${entry.collection}`.toLowerCase().includes(search.toLowerCase())));
    return [...filtered].sort((a, b) => b.at.localeCompare(a.at));
  }, [data.changeLog, activeSiteId, typeFilter, search]);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Change Log · {activeSiteId}</h1>
        <p className="text-sm text-slate-600">
          Important changes recorded per site. Old key and new key differ only when the key itself was renamed.
          Newest first; capped at 500 entries per site.
        </p>
      </header>

      <ChangeLogSettingsCard siteId={activeSiteId as SiteId} canEdit={canEditSettings} />

      <section className="rounded-lg border bg-white p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Change type filter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ChangeLogType | "all")} className={cell}>
            <option value="all">All change types ({CHANGE_LOG_TYPES.length})</option>
            {CHANGE_LOG_TYPES.map((t) => <option key={t} value={t}>{t} — {CHANGE_LOG_TYPE_LABELS[t]}</option>)}
          </select>
          <input aria-label="Search log" placeholder="Search key, value, person…" value={search} onChange={(e) => setSearch(e.target.value)} className={`${cell} max-w-72`} />
          <span className="text-xs text-slate-500">{rows.length} shown</span>
        </div>
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="p-1">Date</th><th className="p-1">Time</th><th className="p-1">Change type</th><th className="p-1">Collection</th>
                <th className="p-1">Key (old → new)</th><th className="p-1">Old value</th><th className="p-1">New value</th><th className="p-1">Modified by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.id} className="border-t align-top">
                  <td className="p-1 whitespace-nowrap font-mono">{entry.modifiedDate}</td>
                  <td className="p-1 whitespace-nowrap font-mono">{entry.modifiedTime}</td>
                  <td className="p-1 whitespace-nowrap"><span className="font-mono">{entry.changeType}</span></td>
                  <td className="p-1 whitespace-nowrap font-mono">{entry.collection}</td>
                  <td className="p-1 font-mono whitespace-nowrap">
                    {entry.oldKey === entry.newKey ? entry.newKey : `${entry.oldKey} → ${entry.newKey}`}
                  </td>
                  <td className="p-1 max-w-56 break-all text-slate-600">{entry.oldValue || "—"}</td>
                  <td className="p-1 max-w-56 break-all">{entry.newValue || "—"}</td>
                  <td className="p-1 whitespace-nowrap">{entry.modifiedBy}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="p-4 text-center text-slate-500">No changes recorded yet{search || typeFilter !== "all" ? " for this filter" : ""}.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
