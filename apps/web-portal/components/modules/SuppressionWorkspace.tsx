"use client";

import React, { useState } from "react";
import { PM_FREQUENCY_RANKS, PM_ScheduleSchema } from "@cafm/shared-schema";
import type { PM_ChecklistStandard, PM_Schedule, PM_ScheduleStep, SuppressedPmOccurrence } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { compileChecklist, frequencyOf, ladderSchedules, occurrenceKey, previewCycles, reconcileOpenPMs, sameLadder } from "@/lib/pm-suppression";
import { ChecklistBuilder } from "./ChecklistBuilder";
import { PMSuppressionFields, suppressionConfig } from "../common/PMSuppressionFields";

export function SuppressionLog({ entries, onOpen }: { entries: SuppressedPmOccurrence[]; onOpen?: (id: string) => void }) {
  return <div className="overflow-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-100"><tr>{["Equipment", "Group", "Suppressed Freq", "Target Date", "Covered By WR #", "Reason"].map((text) => <th key={text} className="p-2">{text}</th>)}</tr></thead><tbody>{entries.map((item) => <tr key={item.id} className="border-t"><td className="p-2">{item.equipmentCode}</td><td>{item.suppressionGroupName}</td><td>{item.suppressedFrequency}</td><td>{item.dueDate}</td><td>{onOpen ? <button className="text-blue-700 underline" onClick={() => onOpen(item.coveredByWrId)}>{item.coveredByWrId} →</button> : item.coveredByWrId}</td><td>Suppressed — covered by {item.coveredByFrequency} WR #{item.coveredByWrId}</td></tr>)}</tbody></table>{!entries.length && <p className="p-3 text-sm text-slate-500">No suppressed occurrences recorded.</p>}</div>;
}

export function SuppressionWorkspace() {
  const { data, commitSnapshot } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const { profile, permissions } = useActiveUserPermissions();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [months, setMonths] = useState(12);
  const [drafts, setDrafts] = useState<Record<string, PM_Schedule>>({});
  const [editing, setEditing] = useState<{ schedule: PM_Schedule; equipment: string }>();
  const visible = data.schedules.filter((item) => item.SiteId === activeSiteId && item.IsActive && (!profile?.vpaBuildingIds.length || !!item.bl_id && profile.vpaBuildingIds.includes(item.bl_id)) &&
    (!profile?.vpaTrades.length || data.blueprints.some((blueprint) => blueprint.ChecklistCode === item.ChecklistCode && blueprint.SiteId === activeSiteId && profile.vpaTrades.some((trade) => trade === blueprint.TradeName || trade === blueprint.TradeId))));
  const equipment = data.equipment.filter((asset) => asset.SiteId === activeSiteId && visible.some((item) => item.EquipmentCodes.includes(asset.EquipmentCode)));
  const previewSchedules = data.schedules.map((item) => drafts[item.ScheduleId] ?? item);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); } catch (problem) { setError(problem instanceof Error ? problem.message : "Could not save suppression configuration."); } finally { setBusy(false); }
  };
  const saveRule = (schedule: PM_Schedule) => run(async () => {
    if (!permissions?.canDefinePMSchedule) throw new Error("Permission required to define PM schedules.");
    const parsed = PM_ScheduleSchema.parse(schedule);
    const now = new Date().toISOString();
    const schedules = data.schedules.map((item) => item.SiteId === activeSiteId && item.ScheduleId === parsed.ScheduleId ? { ...parsed, UpdatedAt: now } :
      parsed.EquipmentCodes.some((code) => sameLadder(parsed, item, code)) ? { ...item, suppressionGroupName: parsed.suppressionGroupName,
        sharedAnchorDate: parsed.sharedAnchorDate, collisionWindowDays: parsed.collisionWindowDays, UpdatedAt: now } : item);
    for (const rule of schedules.filter((item) => item.SiteId === activeSiteId && item.IsActive)) {
      for (const code of rule.EquipmentCodes) compileChecklist(rule, code, schedules, data.blueprints);
    }
    await commitSnapshot(data, { ...data, schedules }, { optimistic: true });
    setDrafts((current) => {
      const next = { ...current };
      for (const rule of schedules.filter((item, index) => item !== data.schedules[index])) delete next[rule.ScheduleId];
      return next;
    });
    setNotice("Group settings saved; shared name, anchor and window also apply to sibling schedules on this asset. Existing executed checklists are unchanged; reconcile unstarted work explicitly.");
  });
  const reconcile = () => run(async () => {
    if (!permissions?.canGeneratePM_WR) throw new Error("Permission required to reconcile PM work requests.");
    const result = reconcileOpenPMs(data.workRequests, visible, data.blueprints, data.suppressedPmOccurrences ?? [], new Date().toISOString());
    await commitSnapshot(data, { ...data, workRequests: result.workRequests, suppressedPmOccurrences: result.suppressedPmOccurrences }, { optimistic: true });
    setNotice(`${result.suppressed} unstarted overlapping PM WR(s) suppressed. Executed work and independent tracks were preserved.`);
  });
  const saveBlueprint = (blueprint: PM_ChecklistStandard) => run(async () => {
    if (!editing || !permissions?.canDefineChecklistPM) throw new Error("Permission required to define checklist delta steps.");
    const blueprints = data.blueprints.map((item) => item.ChecklistCode === blueprint.ChecklistCode && item.SiteId === activeSiteId ? { ...blueprint, SiteId: activeSiteId } : item);
    for (const rule of data.schedules.filter((item) => item.SiteId === activeSiteId && item.IsActive)) {
      for (const code of rule.EquipmentCodes) compileChecklist(rule, code, data.schedules, blueprints);
    }
    await commitSnapshot(data, { ...data, blueprints }, { optimistic: true });
    setEditing(undefined); setNotice("Delta checklist saved. Future generated checklists use the updated inheritance.");
  });
  let inherited: PM_ScheduleStep[] = [];
  if (editing) inherited = ladderSchedules(editing.schedule, editing.equipment, data.schedules)
    .filter((item) => PM_FREQUENCY_RANKS[frequencyOf(item)!] < PM_FREQUENCY_RANKS[frequencyOf(editing.schedule)!])
    .flatMap((schedule) => (data.blueprints.find((item) => item.ChecklistCode === schedule.ChecklistCode && item.SiteId === activeSiteId)?.Steps ?? []).map((step) => ({ ...step, originFrequency: frequencyOf(schedule) })));
  return <div className="space-y-4">
    <h2 className="text-xl font-bold">🔗 Suppression Groups &amp; Nested Cycles</h2>
    <p className="text-sm text-slate-600">Same asset + group key forms one ladder. Higher intervals inherit lower checks. Independent statutory tracks never cancel or get cancelled. Anchor is cycle zero; the first tick is one interval later.</p>
    {error && <p role="alert" className="rounded bg-rose-100 p-3 text-rose-900">{error}</p>}
    {notice && <p role="status" className="rounded bg-emerald-50 p-3">{notice}</p>}
    <button disabled={busy || !permissions?.canGeneratePM_WR} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-40" onClick={reconcile}>⚡ Reconcile &amp; Suppress Overlapping Open PMs</button>
    <label className="ml-3 text-sm">Preview horizon <select className="rounded border p-2" value={months} onChange={(e) => setMonths(Number(e.target.value))}><option value={12}>12 months</option><option value={24}>24 months</option></select></label>
    {editing && <section className="rounded-xl border p-3"><button className="mb-2 underline" onClick={() => setEditing(undefined)}>Close layered editor</button><ChecklistBuilder key={`${editing.schedule.ScheduleId}:${editing.equipment}`} initialBlueprint={data.blueprints.find((item) => item.ChecklistCode === editing.schedule.ChecklistCode && item.SiteId === activeSiteId)} inheritedSteps={inherited} frequencyCode={frequencyOf(editing.schedule)} onSave={saveBlueprint} /></section>}
    {equipment.map((asset) => {
      const schedules = visible.filter((item) => item.EquipmentCodes.includes(asset.EquipmentCode));
      const keys = [...new Set(schedules.map((item) => item.suppressionMode === "independent" ? `independent:${item.ScheduleId}` : item.suppressionGroupKey ?? `ungrouped:${item.ScheduleId}`))];
      return <section key={asset.EquipmentCode} className="space-y-3 rounded-xl border p-3"><h3 className="font-bold">{asset.EquipmentCode} · {asset.EquipmentName}</h3>
        {keys.map((key) => {
          const group = schedules.filter((item) => (item.suppressionMode === "independent" ? `independent:${item.ScheduleId}` : item.suppressionGroupKey ?? `ungrouped:${item.ScheduleId}`) === key)
            .sort((a, b) => (PM_FREQUENCY_RANKS[frequencyOf(a)!] ?? 0) - (PM_FREQUENCY_RANKS[frequencyOf(b)!] ?? 0));
          const previewGroup = group.map((item) => drafts[item.ScheduleId] ?? item);
          const from = previewGroup[0].sharedAnchorDate ?? new Date().toISOString().slice(0, 10);
          let preview: ReturnType<typeof previewCycles> | undefined;
          let problem = "";
          try { preview = previewCycles(previewGroup, asset.EquipmentCode, from, months); } catch (e) { problem = e instanceof Error ? e.message : "Invalid cycle configuration."; }
          return <div key={key} className="space-y-2 rounded-lg bg-slate-50 p-3"><h4 className="font-semibold">{group[0].suppressionGroupName ?? "Ungrouped schedule"} {group[0].suppressionMode === "independent" ? "· Independent Track (Never Cancels)" : "· Cancelling Ladder"}</h4>
            <div className="flex flex-wrap gap-2 text-sm">{group.map((item) => { const steps = data.blueprints.find((bp) => bp.ChecklistCode === item.ChecklistCode && bp.SiteId === activeSiteId)?.Steps ?? []; return <span key={item.ScheduleId} className="rounded border bg-white px-2 py-1">{frequencyOf(item) ?? item.Frequency} · +{steps.length} steps{steps.some((step) => step.replacesStepId) ? ` (replaces ${steps.filter((step) => step.replacesStepId).length})` : ""} →</span>; })}</div>
            {group.map((item) => <RuleEditor key={`${item.ScheduleId}:${item.UpdatedAt}`} schedule={item} disabled={busy || !permissions?.canDefinePMSchedule} save={saveRule} onDraft={(draft) => setDrafts((current) => ({ ...current, [item.ScheduleId]: draft }))} edit={() => setEditing({ schedule: item, equipment: asset.EquipmentCode })} canEditChecklist={!!permissions?.canDefineChecklistPM} />)}
            {problem && <p role="alert" className="text-rose-800">{problem}</p>}
            {preview && <><p className="text-sm font-semibold">{months}-Month Output · {from} · <span className="rounded-full bg-emerald-100 px-2">{preview.winners.length} WRs/{months === 12 ? "yr" : "24mo"} instead of {preview.winners.length + preview.suppressed.length} — {preview.suppressed.length} duplicates prevented</span></p><div className="flex max-h-64 flex-wrap gap-2 overflow-auto">{preview.winners.map((item) => {
              const suppressed = preview!.suppressed.filter((entry) => occurrenceKey(entry.coveredBy) === occurrenceKey(item));
              let count: number | string;
              try { count = compileChecklist(item.schedule, item.equipmentCode, previewSchedules, data.blueprints).length; } catch (e) { count = e instanceof Error ? e.message : "Invalid checklist"; }
              return <div key={occurrenceKey(item)} className="rounded border bg-white p-2 text-xs"><strong>{item.dueDate} · {frequencyOf(item.schedule)}</strong><p>{count} steps total</p>{suppressed.length > 0 && <p className="text-amber-800">suppresses {[...new Set(suppressed.map((entry) => frequencyOf(entry.occurrence.schedule)))].join(" & ")}</p>}</div>;
            })}</div></>}
          </div>;
        })}
      </section>;
    })}
    <h3 className="font-bold">Suppressed Cycles Audit Log</h3><SuppressionLog entries={(data.suppressedPmOccurrences ?? []).filter((item) => item.siteId === activeSiteId && equipment.some((asset) => asset.EquipmentCode === item.equipmentCode))} />
  </div>;
}

function RuleEditor({ schedule, disabled, save, edit, canEditChecklist, onDraft }: { schedule: PM_Schedule; disabled: boolean; save: (item: PM_Schedule) => Promise<void>; edit: () => void; canEditChecklist: boolean; onDraft: (item: PM_Schedule) => void }) {
  const [draft, setDraft] = useState(schedule);
  return <div className="flex flex-wrap items-end gap-2 rounded border bg-white p-2 text-xs"><strong>{schedule.ScheduleId}</strong>
    <PMSuppressionFields disabled={disabled} value={suppressionConfig(draft)} onChange={(changes) => { const next = { ...draft, ...changes }; setDraft(next); onDraft(next); }} />
    <button disabled={disabled} className="rounded bg-blue-700 px-2 py-1 text-white disabled:opacity-40" onClick={() => void save(draft)}>Save / Assign Track</button>
    <button disabled={!canEditChecklist} className="rounded border px-2 py-1" onClick={edit}>Layered checklist editor</button>
  </div>;
}
