"use client";

import React, { useMemo, useState } from "react";
import type { PM_Schedule } from "@cafm/shared-schema";
import { pmTargetLabel } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { addDays, calendarDate } from "@/lib/dispatch";
import { RECURRENCE_PATTERNS, WEEKDAY_LABELS, applyPmsAutoSchedule, frequencyLabel, isAutoScheduleReady, nextScheduledDate, timeWindowLabel } from "@/lib/pms-auto-schedule";
import { reconcileOpenPMs } from "@/lib/pm-suppression";
import { createPmOrder } from "@/lib/pm-orders";
import { FrequencyPill } from "../common/PmFrequency";
import { DateInputDDMMYYYY } from "../common/DateInputDDMMYYYY";

type Pattern = (typeof RECURRENCE_PATTERNS)[number];
const input = "rounded border bg-white px-1 py-0.5 text-xs";
const button = "rounded border bg-white px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50";

export function PmsDefaultSchedules({ onNotice }: { onNotice: (message: string) => void }) {
  const { data, commitSnapshot } = useCafmStore();
  const { profile, permissions } = useActiveUserPermissions();
  const { activeSiteId, activePerson } = useSiteContext();
  const canEdit = !!permissions?.canScheduleCraftperson;
  const people = useMemo(() => data.craftspeople.filter((item) => item.SiteId === activeSiteId), [data.craftspeople, activeSiteId]);
  const blueprints = useMemo(() => data.blueprints.filter((item) => item.SiteId === activeSiteId && item.IsActive), [data.blueprints, activeSiteId]);
  const trades = profile?.vpaTrades ?? [];
  const tradeOf = (pms: PM_Schedule) => blueprints.find((item) => item.ChecklistCode === pms.ChecklistCode)?.TradeName ?? "";
  const schedules = data.schedules.filter((item) => item.SiteId === activeSiteId && (trades.length === 0 || trades.includes(tradeOf(item) as never)));
  const [creating, setCreating] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const reconcile = async () => {
    if (!permissions?.canGeneratePM_WR || reconciling) return;
    setReconciling(true);
    try {
      const result = reconcileOpenPMs(data.workRequests, schedules, data.blueprints, data.suppressedPmOccurrences ?? [], new Date().toISOString());
      await commitSnapshot(data, { ...data, workRequests: result.workRequests, suppressedPmOccurrences: result.suppressedPmOccurrences }, { optimistic: true });
      onNotice(`Reconciled PM queue: ${result.suppressed} unstarted overlapping work requests suppressed.`);
    } catch (problem) { onNotice(problem instanceof Error ? problem.message : "Could not reconcile PM queue."); }
    finally { setReconciling(false); }
  };
  const [draft, setDraft] = useState({ title: "Daily Technical Plant Tour", checklistCode: "", equipmentCode: "", pattern: "Daily" as Pattern });

  const save = async (next: PM_Schedule[], message: string, workRequests = data.workRequests) => {
    if (!canEdit) { onNotice("Scheduling permission is required to change PMS default schedules."); return; }
    try {
      await commitSnapshot(data, { ...data, schedules: next, workRequests }, { optimistic: true });
      onNotice(message);
    } catch (problem) {
      onNotice(problem instanceof Error ? problem.message : "Could not save PMS default schedule.");
    }
  };
  const patch = (id: string, changes: Partial<PM_Schedule>, message = "PMS default schedule saved.") =>
    save(data.schedules.map((item) => item.ScheduleId === id ? { ...item, ...changes, UpdatedAt: new Date().toISOString() } : item), message);
  const apply = (pms: PM_Schedule) => {
    const current = data.schedules.find((item) => item.ScheduleId === pms.ScheduleId) ?? pms;
    if (!isAutoScheduleReady(current)) { onNotice("Turn Auto-Schedule on and choose a technician, start time and frequency first."); return; }
    const next = applyPmsAutoSchedule(data.workRequests, current, people, { force: true, from: calendarDate(new Date()) });
    const changed = next.filter((wr, index) => wr !== data.workRequests[index]).length;
    void save(data.schedules, `Auto-scheduled ${changed} open PM work request(s) from ${current.Title ?? current.ScheduleId}.`, next);
  };
  const create = () => {
    const blueprint = blueprints.find((item) => item.ChecklistCode === draft.checklistCode);
    const equipment = data.equipment.find((item) => item.SiteId === activeSiteId && item.EquipmentCode === draft.equipmentCode);
    if (!draft.title.trim() || !blueprint || !equipment) { onNotice("Enter a title and choose a checklist blueprint and equipment."); return; }
    const anchor = calendarDate(new Date());
    let order: PM_Schedule;
    try { order = createPmOrder(data.schedules, data.blueprints, blueprint, equipment, anchor, activePerson, data.pmsOrderHighWatermark); }
    catch (problem) { onNotice(problem instanceof Error ? problem.message : "Could not create PMS order."); return; }
    const rule: PM_Schedule = {
      ...order,
      Title: draft.title.trim(), autoScheduleEnabled: false, defaultRecurrencePattern: draft.pattern,
      defaultWeekdays: draft.pattern === "Daily" ? [1, 2, 3, 4, 5] : draft.pattern === "Weekly" || draft.pattern === "Biweekly" ? [1] : undefined,
      defaultDayOfMonth: draft.pattern === "Monthly" || draft.pattern === "Quarterly" ? 1 : undefined,
      defaultStartTime: "08:00", defaultDurationHours: 1, defaultAnchorDate: anchor,
    };
    void save([...data.schedules, rule], `Recurring tour "${rule.Title}" created. Choose a technician and switch Auto-Schedule on.`);
    setCreating(false);
  };

  return <div className="space-y-2" data-testid="pms-default-schedules">
    <div className="flex flex-wrap items-center gap-2 rounded border bg-white p-2">
      <strong>🔁 PMS Default Schedules &amp; Auto-Assign</strong>
      <button disabled={reconciling || !permissions?.canGeneratePM_WR} className={button} onClick={() => void reconcile()}>Reconcile Nested PMs</button>
      <span className="text-slate-600">{schedules.length} PM schedule(s){trades.length ? ` · filtered by your VPA trades: ${trades.join(", ")}` : ""}</span>
      <button type="button" className={`${button} ml-auto`} disabled={!canEdit} onClick={() => setCreating((value) => !value)}>+ Create Recurring Tour / PMS Rule</button>
    </div>
    {creating && <div className="flex flex-wrap items-end gap-2 rounded border bg-blue-50 p-2">
      <label className="grid gap-0.5">Title<input className={input} list="pms-title-suggestions" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
      <datalist id="pms-title-suggestions"><option value="Daily Technical Plant Tour" /><option value="Weekly Chiller & AHU Inspection" /><option value="Weekly Backup Generator Check" /><option value="Monthly Boiler Safety Check" /></datalist>
      <label className="grid gap-0.5">Checklist blueprint<select className={input} value={draft.checklistCode} onChange={(e) => setDraft({ ...draft, checklistCode: e.target.value })}><option value="">Select…</option>{blueprints.map((item) => <option key={item.ChecklistCode} value={item.ChecklistCode}>{item.Title}</option>)}</select></label>
      <label className="grid gap-0.5">Equipment<select className={input} value={draft.equipmentCode} onChange={(e) => setDraft({ ...draft, equipmentCode: e.target.value })}><option value="">Select…</option>{data.equipment.filter((item) => item.SiteId === activeSiteId && item.IsInstallation).map((item) => <option key={item.EquipmentCode} value={item.EquipmentCode}>{item.EquipmentCode} · {item.EquipmentName}</option>)}</select></label>
      <label className="grid gap-0.5">Execution slot pattern (not blueprint frequency)<select className={input} value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value as Pattern })}>{RECURRENCE_PATTERNS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <button type="button" className={button} onClick={create}>Create rule</button>
    </div>}
    <div className="grid gap-2 lg:grid-cols-2">
      {schedules.map((pms) => {
        const next = pms.defaultRecurrencePattern ? nextScheduledDate(pms, pms.defaultAnchorDate && pms.defaultAnchorDate > calendarDate(new Date()) ? pms.defaultAnchorDate : calendarDate(new Date())) : null;
        const openCount = data.workRequests.filter((wr) => wr.SiteId === activeSiteId && wr.WR_Type === "PM" && wr.Percentage === 50 && (wr as { ScheduleId?: string }).ScheduleId === pms.ScheduleId).length;
        const pattern = pms.defaultRecurrencePattern ?? "Weekly";
        const toggleDay = (day: number) => {
          const days = pms.defaultWeekdays ?? [];
          patch(pms.ScheduleId, { defaultWeekdays: days.includes(day) ? days.filter((item) => item !== day) : [...days, day].sort() });
        };
        return <section key={pms.ScheduleId} className={`space-y-2 rounded border p-2 ${pms.autoScheduleEnabled ? "border-blue-400 bg-blue-50/40" : "bg-white"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <strong>{pms.Title ?? pms.ChecklistCode} · {pmTargetLabel(pms)}</strong>
            <span className="rounded bg-slate-100 px-1">PMS #{pms.ScheduleId}</span><FrequencyPill code={blueprints.find((bp) => bp.ChecklistCode === pms.ChecklistCode)?.frequencyCode} />
            <span className="rounded bg-slate-100 px-1">{tradeOf(pms) || "—"}</span>
            <span className="text-slate-600">{openCount} open PM WR(s)</span>
            <button type="button" role="switch" aria-checked={!!pms.autoScheduleEnabled} aria-label={`Auto-Schedule ${pms.ScheduleId}`} disabled={!canEdit}
              onClick={() => patch(pms.ScheduleId, { autoScheduleEnabled: !pms.autoScheduleEnabled }, `Auto-Schedule ${pms.autoScheduleEnabled ? "OFF" : "ON"} for ${pms.ScheduleId}.`)}
              className={`ml-auto rounded-full border px-2 py-0.5 font-semibold ${pms.autoScheduleEnabled ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-slate-700"}`}>Auto-Schedule {pms.autoScheduleEnabled ? "ON" : "OFF"}</button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <fieldset className="space-y-1"><legend className="font-semibold">1. Default Technician(s)</legend>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">{people.map((person) => {
                const on = !!pms.defaultTechnicianIds?.includes(person.id);
                return <button key={person.id} type="button" role="checkbox" aria-checked={on} disabled={!canEdit} onClick={() => {
                  const ids = on ? (pms.defaultTechnicianIds ?? []).filter((id) => id !== person.id) : [...(pms.defaultTechnicianIds ?? []), person.id];
                  patch(pms.ScheduleId, { defaultTechnicianIds: ids, defaultTechnicianNames: ids.map((id) => { const p = people.find((item) => item.id === id); return p ? `${p.Name} ${p.LastName}` : id; }) });
                }} className={`rounded border px-1.5 py-0.5 ${on ? "border-blue-600 bg-blue-600 text-white" : "bg-white"}`}>{person.Name} {person.LastName} · {person.Trade}</button>;
              })}</div>
            </fieldset>
            <fieldset className="space-y-1"><legend className="font-semibold">2. Frequency &amp; Default Day(s)</legend>
              <div className="flex flex-wrap items-center gap-1">
                <select aria-label="Frequency" className={input} disabled={!canEdit} value={pms.defaultRecurrencePattern ?? ""} onChange={(e) => {
                  const next = e.target.value as Pattern;
                  patch(pms.ScheduleId, { defaultRecurrencePattern: next,
                    defaultWeekdays: next === "Daily" ? [1, 2, 3, 4, 5] : next === "Weekly" || next === "Biweekly" ? (pms.defaultWeekdays?.length ? [pms.defaultWeekdays[0]] : [1]) : pms.defaultWeekdays,
                    defaultDayOfMonth: pms.defaultDayOfMonth ?? 1 });
                }}><option value="">Select…</option>{RECURRENCE_PATTERNS.map((item) => <option key={item}>{item}</option>)}</select>
                {(pattern === "Daily" || pattern === "Weekly" || pattern === "Biweekly") && [1, 2, 3, 4, 5, 6, 0].map((day) => {
                  const on = !!pms.defaultWeekdays?.includes(day);
                  return <button key={day} type="button" role="checkbox" aria-checked={on} disabled={!canEdit} onClick={() => toggleDay(day)} className={`rounded border px-1.5 py-0.5 ${on ? "border-blue-600 bg-blue-600 text-white" : "bg-white"}`}>{WEEKDAY_LABELS[day]}</button>;
                })}
                {(pattern === "Monthly" || pattern === "Quarterly") && <label>Day <input type="number" min={1} max={28} className={`${input} w-14`} disabled={!canEdit} value={pms.defaultDayOfMonth ?? 1} onChange={(e) => patch(pms.ScheduleId, { defaultDayOfMonth: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} /></label>}
              </div>
              <label className="flex items-center gap-1">Next Scheduled Date <DateInputDDMMYYYY className={input} disabled={!canEdit} value={pms.defaultAnchorDate ?? ""} onValueChange={(value) => value && patch(pms.ScheduleId, { defaultAnchorDate: value })} aria-label="Next scheduled date" /></label>
              <p className="text-slate-600">{frequencyLabel(pms)}{next ? ` · next occurrence ${next}` : ""}</p>
            </fieldset>
            <fieldset className="space-y-1"><legend className="font-semibold">3. Default Scheduled Time Window</legend>
              <div className="flex flex-wrap items-center gap-1">
                <label>Start <input type="time" className={input} disabled={!canEdit} value={pms.defaultStartTime ?? ""} onChange={(e) => e.target.value && patch(pms.ScheduleId, { defaultStartTime: e.target.value })} /></label>
                <label>Duration (h) <input type="number" step={0.5} min={0.5} max={12} className={`${input} w-16`} disabled={!canEdit} value={pms.defaultDurationHours ?? 1} onChange={(e) => Number(e.target.value) > 0 && patch(pms.ScheduleId, { defaultDurationHours: Number(e.target.value) })} /></label>
                <strong>→ {timeWindowLabel(pms)}</strong>
              </div>
            </fieldset>
            <fieldset className="space-y-1"><legend className="font-semibold">4. Apply</legend>
              <button type="button" className={button} disabled={!canEdit || !isAutoScheduleReady(pms)} onClick={() => apply(pms)}>⚡ Apply to Open PM WRs</button>
              <p className="text-slate-600">Re-schedules this rule&apos;s open 50% PM WRs onto the next occurrences. Newly generated PM WRs are scheduled automatically; Team Leaders can still drag any occurrence on the dispatch calendar.</p>
            </fieldset>
          </div>
        </section>;
      })}
      {schedules.length === 0 && <p className="rounded border bg-white p-2">No PM schedules available for your trades at this site.</p>}
    </div>
  </div>;
}
