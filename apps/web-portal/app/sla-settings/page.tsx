"use client";

import React, { useMemo, useState } from "react";
import type { SiteSlaConfig, SlaRule, UrgencyCode } from "@cafm/shared-schema";
import { SITE_LABELS, defaultSiteSlaConfig, formatDateDDMMYYYY } from "@cafm/shared-schema";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useApp } from "@/lib/hooks/useApp";
import { getSiteSlaConfig } from "@/lib/fj-satisfaction";
import { describeRule } from "@/lib/fj-sla";
import { DateInputDDMMYYYY } from "@/components/common/DateInputDDMMYYYY";

const cell = "w-full rounded border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-100";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SlaSettingsPage() {
  const { activeSiteId } = useSiteContext();
  const { data, setData } = useCafmStore();
  const { profile } = useActiveUserPermissions();
  const { currentRole } = useApp();
  const canEdit = !!(profile?.isSuperAdmin || profile?.isSiteAdmin || currentRole === "ESA_TM" || currentRole === "SiteAdministrator");
  const config = useMemo(() => getSiteSlaConfig(data, activeSiteId), [data, activeSiteId]);
  const [customEmail, setCustomEmail] = useState("");
  const [tradeForRecipients, setTradeForRecipients] = useState<string>("Mechanical");
  const [newHoliday, setNewHoliday] = useState({ date: "", name: "" });
  const [error, setError] = useState("");
  const levels = [...config.urgencyLevels].sort((a, b) => a.order - b.order);
  const people = data.userAccessProfiles.filter((item) => item.siteId === activeSiteId && item.email && !item.linkedCraftpersonId);

  const save = (next: SiteSlaConfig) => { if (canEdit) setData((current) => ({ ...current, siteSlaConfig: { ...next, siteId: activeSiteId } })); };
  const setRule = (trade: string, code: UrgencyCode, patch: Partial<SlaRule>) =>
    save({ ...config, matrix: { ...config.matrix, [trade]: { ...config.matrix[trade], [code]: { ...config.matrix[trade][code], ...patch } } } });
  const setLevel = (code: UrgencyCode, patch: Partial<SiteSlaConfig["urgencyLevels"][number]>) =>
    save({ ...config, urgencyLevels: config.urgencyLevels.map((item) => item.code === code ? { ...item, ...patch } : item) });
  const selectedFor = (scope: string) => scope === "all" ? config.dissatisfactionRecipients.allTrades : config.dissatisfactionRecipients.byTrade[scope] ?? [];
  const toggleRecipient = (scope: string, email: string) => {
    const current = selectedFor(scope);
    const next = current.includes(email) ? current.filter((item) => item !== email) : [...current, email];
    const recipients = config.dissatisfactionRecipients;
    save({ ...config, dissatisfactionRecipients: scope === "all" ? { ...recipients, allTrades: next } : { ...recipients, byTrade: { ...recipients.byTrade, [scope]: next } } });
  };
  const addCustom = (scope: string) => {
    const email = customEmail.trim();
    if (!EMAIL.test(email)) { setError("Enter a valid email address."); return; }
    setError(""); setCustomEmail("");
    if (!selectedFor(scope).includes(email)) toggleRecipient(scope, email);
  };
  const addHoliday = () => {
    if (!/^\d{2}-\d{2}-\d{4}$/.test(newHoliday.date) || !newHoliday.name.trim()) { setError("Pick the holiday date (DD-MM-YYYY) and enter a name."); return; }
    setError("");
    save({ ...config, holidays: [...config.holidays, { date: newHoliday.date, name: newHoliday.name.trim() }] });
    setNewHoliday({ date: "", name: "" });
  };
  const recipientList = (scope: string) => {
    const selected = selectedFor(scope);
    const custom = selected.filter((email) => !people.some((person) => person.email === email));
    return <div className="space-y-1">
      <div className="grid gap-1 sm:grid-cols-2">
        {people.map((person) => <label key={person.id} className="flex items-center gap-2 text-xs">
          <input type="checkbox" disabled={!canEdit} checked={selected.includes(person.email!)} onChange={() => toggleRecipient(scope, person.email!)} />
          <span>{person.fullName} · {person.email} <span className="text-slate-500">({person.primaryRole})</span></span>
        </label>)}
      </div>
      {custom.map((email) => <label key={email} className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={!canEdit} checked onChange={() => toggleRecipient(scope, email)} /> {email} <span className="text-slate-500">(custom)</span></label>)}
      {canEdit && <div className="flex gap-2 pt-1">
        <input aria-label="Custom email" value={customEmail} onChange={(e) => setCustomEmail(e.target.value)} placeholder="Add custom email…" className={cell} />
        <button type="button" onClick={() => addCustom(scope)} className="rounded bg-blue-600 px-3 py-1 text-xs text-white">Add</button>
      </div>}
    </div>;
  };
  const resetMatrix = () => {
    if (!window.confirm("Reset urgency levels and the SLA matrix to defaults? Holidays and recipients are kept.")) return;
    const defaults = defaultSiteSlaConfig(activeSiteId);
    save({ ...config, urgencyLevels: defaults.urgencyLevels, matrix: defaults.matrix });
  };

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">SLA Settings · {SITE_LABELS[activeSiteId] ?? activeSiteId}</h1>
        <p className="text-sm text-slate-600">Urgency levels, Trade × Urgency SLA targets, public holidays and dissatisfaction notification recipients for Fast Jobs.</p>
        {!canEdit && <p className="mt-1 rounded border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-900">🔒 Read-only. Only Site Administrators, Super Admins and ESA Trade Managers can edit SLA settings.</p>}
        {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
      </header>

      <section className="rounded-lg border bg-white p-4 space-y-2">
        <h2 className="text-lg font-semibold">1. Urgency Levels</h2>
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <thead><tr className="text-left text-slate-600"><th className="p-1">Order</th><th className="p-1">Label</th><th className="p-1">Color</th><th className="p-1">Description</th></tr></thead>
          <tbody>{levels.map((level) => <tr key={level.code} className="border-t">
            <td className="p-1 w-20"><input type="number" aria-label={`${level.code} order`} disabled={!canEdit} value={level.order} onChange={(e) => setLevel(level.code, { order: Number(e.target.value) || 1 })} className={cell} /></td>
            <td className="p-1"><input aria-label={`${level.code} label`} disabled={!canEdit} value={level.label} onChange={(e) => setLevel(level.code, { label: e.target.value || level.label })} className={cell} /></td>
            <td className="p-1 w-24"><input type="color" aria-label={`${level.code} color`} disabled={!canEdit} value={level.color} onChange={(e) => setLevel(level.code, { color: e.target.value })} className="h-7 w-full" /></td>
            <td className="p-1"><input aria-label={`${level.code} description`} disabled={!canEdit} value={level.description} onChange={(e) => setLevel(level.code, { description: e.target.value })} className={cell} /></td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="rounded-lg border bg-white p-4 space-y-2">
        <h2 className="text-lg font-semibold">2. Trade × Urgency SLA Matrix</h2>
        <p className="text-xs text-slate-600">Each cell: target, unit, margin, clock (24/7 or business days), and whether weekend/holiday call-out is allowed.</p>
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <thead><tr className="text-left text-slate-600"><th className="p-1">Trade</th>{levels.map((level) => <th key={level.code} className="p-1" style={{ color: level.color }}>{level.label}</th>)}</tr></thead>
          <tbody>{Object.keys(config.matrix).map((trade) => <tr key={trade} className="border-t align-top">
            <th className="p-1 text-left">{trade}</th>
            {levels.map((level) => {
              const rule = config.matrix[trade]?.[level.code];
              if (!rule) return <td key={level.code} className="p-1">—</td>;
              return <td key={level.code} className="p-1 min-w-44">
                <div className="space-y-1 rounded border border-slate-200 p-1">
                  <div className="flex gap-1">
                    <input type="number" min={0.5} step={0.5} aria-label={`${trade} ${level.code} target`} disabled={!canEdit} value={rule.targetValue} onChange={(e) => setRule(trade, level.code, { targetValue: Math.max(0.5, Number(e.target.value) || 1) })} className={cell} />
                    <select aria-label={`${trade} ${level.code} unit`} disabled={!canEdit} value={rule.targetUnit} onChange={(e) => setRule(trade, level.code, { targetUnit: e.target.value as SlaRule["targetUnit"] })} className={cell}><option value="hours">hours</option><option value="days">days</option></select>
                  </div>
                  <label className="flex items-center gap-1">Margin <input type="number" min={0} step={0.5} aria-label={`${trade} ${level.code} margin`} disabled={!canEdit} value={rule.marginHoursOrDays ?? 0} onChange={(e) => setRule(trade, level.code, { marginHoursOrDays: Math.max(0, Number(e.target.value) || 0) })} className={cell} /></label>
                  <select aria-label={`${trade} ${level.code} clock`} disabled={!canEdit} value={rule.clockMode} onChange={(e) => setRule(trade, level.code, { clockMode: e.target.value as SlaRule["clockMode"] })} className={cell}><option value="24x7">24/7 clock</option><option value="BUSINESS_DAYS">Business days</option></select>
                  <label className="flex items-center gap-1"><input type="checkbox" disabled={!canEdit} checked={rule.allowWeekendHolidayRequest} onChange={(e) => setRule(trade, level.code, { allowWeekendHolidayRequest: e.target.checked })} /> Weekend/holiday call-out</label>
                  <p className="text-[10px] text-slate-500">{describeRule(rule)}</p>
                </div>
              </td>;
            })}
          </tr>)}</tbody>
        </table></div>
        {canEdit && <button type="button" onClick={resetMatrix} className="rounded border px-3 py-1 text-xs">↺ Reset Matrix to Defaults</button>}
      </section>

      <section className="rounded-lg border bg-white p-4 space-y-2">
        <h2 className="text-lg font-semibold">3. Public Holidays</h2>
        <ul className="space-y-1 text-xs">{config.holidays.map((holiday, index) => <li key={`${holiday.date}-${index}`} className="flex items-center gap-2">
          <span className="w-24 font-mono">{holiday.date}</span><span className="flex-1">{holiday.name}</span>
          {canEdit && <button type="button" onClick={() => save({ ...config, holidays: config.holidays.filter((_, i) => i !== index) })} className="text-red-600">Remove</button>}
        </li>)}</ul>
        {canEdit && <div className="flex flex-wrap items-center gap-2">
          <DateInputDDMMYYYY aria-label="Holiday date" className={`${cell} max-w-36`} value="" onValueChange={(iso) => setNewHoliday((current) => ({ ...current, date: iso ? formatDateDDMMYYYY(iso) : "" }))} />
          <span className="text-xs">{newHoliday.date}</span>
          <input aria-label="Holiday name" placeholder="Holiday name" value={newHoliday.name} onChange={(e) => setNewHoliday((current) => ({ ...current, name: e.target.value }))} className={`${cell} max-w-64`} />
          <button type="button" onClick={addHoliday} className="rounded bg-blue-600 px-3 py-1 text-xs text-white">Add Holiday</button>
        </div>}
      </section>

      <section className="rounded-lg border bg-white p-4 space-y-3">
        <h2 className="text-lg font-semibold">4. Dissatisfaction Feedback Notification List</h2>
        <p className="text-xs text-slate-600">When a requestor rates a completed Fast Job “Service Not OK”, these people are notified. Follow-up is by direct email or phone, not chat.</p>
        <div><h3 className="text-sm font-medium">All trades</h3>{recipientList("all")}</div>
        <div><h3 className="text-sm font-medium">Per trade
          <select aria-label="Trade for recipients" value={tradeForRecipients} onChange={(e) => setTradeForRecipients(e.target.value)} className="ml-2 rounded border px-2 py-1 text-xs">
            {Object.keys(config.matrix).map((trade) => <option key={trade}>{trade}</option>)}
          </select></h3>{recipientList(tradeForRecipients)}</div>
      </section>
    </div>
  );
}
