"use client";

import React from "react";

import { CHANGE_LOG_TYPE_LABELS, CHANGE_LOG_TYPES, defaultChangeLogSettings, type ChangeLogSettings, type ChangeLogType, type SiteId } from "@cafm/shared-schema";

import { useCafmStore } from "@/lib/cafm-store";

interface Props {
  siteId: SiteId;
  canEdit: boolean;
}

/** SuperAdmin-editable list of which change types are recorded in the change log. */
export function ChangeLogSettingsCard({ siteId, canEdit }: Props) {
  const { data, setData } = useCafmStore();
  const settings: ChangeLogSettings = data.changeLogSettings?.siteId === siteId ? data.changeLogSettings : defaultChangeLogSettings(siteId);
  // V67: saved settings can predate the newest CHANGE_LOG_TYPES entry; missing rules
  // stay enabled by default (isChangeTypeEnabled), so show and toggle the full catalogue.
  const rules = CHANGE_LOG_TYPES.map((changeType) =>
    settings.rules.find((rule) => rule.changeType === changeType) ?? { changeType, label: CHANGE_LOG_TYPE_LABELS[changeType], enabled: true });
  const enabledCount = rules.filter((rule) => rule.enabled).length;

  const toggle = (changeType: ChangeLogType) => {
    if (!canEdit) return;
    const nextRules = rules.map((rule) => rule.changeType === changeType ? { ...rule, enabled: !rule.enabled } : rule);
    setData((current) => ({ ...current, changeLogSettings: { siteId, rules: nextRules } }));
  };

  const reset = () => {
    if (!canEdit) return;
    if (!window.confirm("Enable logging for all change types again?")) return;
    setData((current) => ({ ...current, changeLogSettings: defaultChangeLogSettings(siteId) }));
  };

  return (
    <section className="rounded-lg border bg-white p-4 space-y-2">
      <h2 className="text-lg font-semibold">What is logged</h2>
      <p className="text-xs text-slate-600">
        {enabledCount} of {CHANGE_LOG_TYPES.length} change types are recorded in the change log for this site.
        {!canEdit && " 🔒 Read-only — only the CAFM SuperAdmin can change this list."}
      </p>
      <ul className="grid gap-1 sm:grid-cols-2">
        {rules.map((rule) => (
          <li key={rule.changeType}>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" disabled={!canEdit} checked={rule.enabled} onChange={() => toggle(rule.changeType)} />
              <span><span className="font-mono">{rule.changeType}</span> — {rule.label}</span>
            </label>
          </li>
        ))}
      </ul>
      {canEdit && <button type="button" onClick={reset} className="rounded border px-3 py-1 text-xs">↺ Enable all</button>}
    </section>
  );
}
