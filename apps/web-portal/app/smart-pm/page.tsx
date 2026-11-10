"use client";

import React, { useState } from "react";
import { CLASSICAL_TRADES, PM_FREQUENCY_RANKS, PM_ChecklistStandardSchema, pmTargetKey } from "@cafm/shared-schema";
import type { PM_ChecklistStandard, PMFrequencyCode, PM_Schedule } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import type { DemoData } from "@/lib/cafm-data";
import { createTargetPmOrder, nextBlueprintCode, nextFamilyId, validateBlueprintFamilies, rephasePmAssignments } from "@/lib/pm-orders";
import { reconcileOpenPMs, resolveBlueprintSchedule } from "@/lib/pm-suppression";
import { shiftPmSchedule } from "@/lib/pm-schedule-shift";
import { pmPlanTargets } from "@/lib/pm-plan-targets";
import { generatePMWorkRequests } from "@/lib/pm-generation";
import { ChecklistBuilder } from "@/components/modules/ChecklistBuilder";
import { SuppressionLog } from "@/components/modules/SuppressionWorkspace";
import { FrequencyPill } from "@/components/common/PmFrequency";
import { PMWorkRequestPopup } from "@/components/modules/PMWorkRequestPopup";
import { PmSchedulesGrid } from "@/components/modules/PmSchedulesGrid";
import { PmTargetPlans } from "@/components/modules/PmTargetPlans";
import { PmAssignmentModal } from "@/components/modules/PmAssignmentModal";
import type { PMAssignment } from "@/components/modules/PmAssignmentModal";
import { BlueprintChangeHistory, ChecklistChangeHistory } from "@/components/modules/BlueprintChangeHistory";

const tabs = ["1. Checklist Blueprints & Families", "2. Equipment & Location PM Plans (PMS 00001+)", "3. All PM Schedules (00001+)", "4. WR Generator · Suppression & Change Audit Log"];
const button = "rounded-lg border bg-white px-3 py-2 text-sm font-semibold hover:bg-sky-50 disabled:opacity-40";
const field = "rounded-lg border bg-white p-2 text-sm";
const codes = Object.keys(PM_FREQUENCY_RANKS) as PMFrequencyCode[];
const rank = (bp: PM_ChecklistStandard) => PM_FREQUENCY_RANKS[bp.frequencyCode!];

export default function SmartPMPage() {
  const { activeSiteId, activePerson } = useSiteContext();
  return <SmartPMWorkspace key={activeSiteId} site={activeSiteId} actor={activePerson} />;
}
function SmartPMWorkspace({ site, actor }: { site: DemoData["sites"][number]; actor: string }) {
  const { data, commitSnapshot } = useCafmStore();
  const { profile, permissions } = useActiveUserPermissions();
  const [tab, setTab] = useState(0), [query, setQuery] = useState("");
  const [selectedBlueprint, setSelectedBlueprint] = useState(""), [selectedTarget, setSelectedTarget] = useState("");
  const [creating, setCreating] = useState<Partial<PM_ChecklistStandard>>();
  const [familyDialog, setFamilyDialog] = useState(false), [familyName, setFamilyName] = useState(""), [familyTrade, setFamilyTrade] = useState("");
  const [assign, setAssign] = useState<PMAssignment>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]), [horizon, setHorizon] = useState(365);
  const [mode, setMode] = useState<"horizon" | "selected" | "single">("horizon"), [open, setOpen] = useState<string>();
  const canBlueprint = !!permissions?.canDefineChecklistPM;
  const canAssign = !!permissions?.canAssignPMPToEQ && !!permissions?.canDefinePMSchedule;
  const permittedTrade = (trade: string) => !profile?.vpaTrades.length || profile.vpaTrades.some((item) => item === trade);
  const blueprints = data.blueprints.filter((item) => item.SiteId === site && item.IsActive && permittedTrade(item.TradeId));
  const targets = pmPlanTargets(data, site, profile?.vpaBuildingIds);
  const orders = data.schedules.filter((order) => order.SiteId === site && order.IsActive && blueprints.some((bp) => bp.ChecklistCode === order.ChecklistCode) && targets.some((target) => target.id === pmTargetKey(order)));
  const selected = blueprints.find((bp) => bp.ChecklistCode === selectedBlueprint) ?? blueprints.find((bp) => bp.blueprintMode === "family_ladder") ?? blueprints[0];
  const families = [...new Set(blueprints.filter((bp) => bp.blueprintMode === "family_ladder").map((bp) => bp.familyId!))];
  const familyBlueprints = blueprints.filter((bp) => bp.familyId && bp.familyId === selected?.familyId).sort((a, b) => rank(a) - rank(b));
  const audits = (data.blueprintAuditLog ?? []).filter((entry) => entry.siteId === site && data.blueprints.some((bp) => bp.SiteId === site && bp.ChecklistCode === entry.blueprintCode && permittedTrade(bp.TradeId)));
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (problem) { setError(problem instanceof Error ? problem.message : "The operation could not be completed."); }
    finally { setBusy(false); }
  };
  const persist = async (next: DemoData, message: string) => {
    next = { ...next, schedules: rephasePmAssignments(data.schedules, next.schedules) };
    validateBlueprintFamilies(next.blueprints);
    await commitSnapshot(data, next, { optimistic: true }); setNotice(message);
  };
  const saveBlueprint = (bp: PM_ChecklistStandard) => run(async () => {
    if (!canBlueprint || !permittedTrade(bp.TradeId)) throw new Error("Permission required to define this blueprint.");
    const parsed = PM_ChecklistStandardSchema.parse({ ...bp, SiteId: site });
    const original = data.blueprints.find((item) => item.SiteId === site && item.ChecklistCode === bp.ChecklistCode);
    if (creating && original) throw new Error("This blueprint code is already in use. Reopen creation to allocate a new code.");
    if (original && original.frequencyCode !== parsed.frequencyCode) throw new Error("Blueprint frequency is locked. Create a new blueprint instead.");
    const nextBlueprints = [...data.blueprints.filter((item) => !(item.SiteId === site && item.ChecklistCode === parsed.ChecklistCode)), parsed];
    await persist({ ...data, blueprints: nextBlueprints, schedules: data.schedules.map((order) => resolveBlueprintSchedule(order, nextBlueprints)) },
      "Blueprint saved with revision history. Future WRs use these rules; executed snapshots are preserved.");
    setCreating(undefined); setSelectedBlueprint(parsed.ChecklistCode);
  });
  const startNew = (inFamily: boolean) => {
    if (!canBlueprint) { setError("Permission required to define blueprints."); return; }
    const available = codes.filter((code) => !inFamily || !familyBlueprints.some((bp) => bp.frequencyCode === code));
    if (!available.length) { setError("This family already defines every frequency."); return; }
    const template = inFamily ? familyBlueprints[0] : undefined;
    setCreating({ ChecklistCode: nextBlueprintCode(data.blueprints, available[0], data.blueprintHighWatermark), SiteId: site,
      blueprintMode: inFamily ? "family_ladder" : "standalone", familyId: template?.familyId, familyName: template?.familyName,
      TradeId: template?.TradeId ?? CLASSICAL_TRADES.find(permittedTrade), frequencyCode: available[0] });
  };
  const openAssign = (ids: string[], target?: string) => {
    setError(""); setAssign({ blueprintIds: ids, targetIds: target ? [target] : [], anchor: new Date().toISOString().slice(0, 10) });
  };
  const assignOrders = (draft: PMAssignment) => run(async () => {
    if (!canAssign || !draft.blueprintIds.length || !draft.targetIds.length) throw new Error("Select blueprints and targets with assignment permission.");
    const next = [...data.schedules]; let count = 0;
    for (const id of draft.targetIds) for (const code of draft.blueprintIds) {
      const target = targets.find((item) => item.id === id), bp = blueprints.find((item) => item.ChecklistCode === code);
      if (!target || !bp) throw new Error("A selected target or blueprint is no longer available.");
      if (next.some((order) => order.IsActive && order.SiteId === site && order.ChecklistCode === code && pmTargetKey(order) === id)) continue;
      next.push(createTargetPmOrder(next, data.blueprints, bp, target, draft.anchor, actor, data.pmsOrderHighWatermark)); count++;
    }
    if (!count) throw new Error("All selected blueprints are already assigned to these targets.");
    await persist({ ...data, schedules: next }, `Created ${count} PMS orders. Existing target-family anchors were retained.`); setAssign(undefined);
  });
  const remove = (order: PM_Schedule) => run(async () => {
    if (!canAssign) throw new Error("Assignment permission required.");
    await persist({ ...data, schedules: data.schedules.map((item) => item.ScheduleId === order.ScheduleId && item.SiteId === site ? { ...item, IsActive: false, UpdatedAt: new Date().toISOString() } : item) }, `PMS #${order.ScheduleId} deactivated; historical WR links retained.`);
  });
  const shift = async (order: PM_Schedule, cycle: string, date: string, action: "move" | "keep", peak: number) => {
    setBusy(true); setError("");
    try {
      if (!permissions?.canDefinePMSchedule) throw new Error("Schedule definition permission required.");
      const result = shiftPmSchedule(data.schedules, data.blueprints, data.workRequests, order, cycle, date, action, actor, new Date().toISOString(), peak);
      await persist({ ...data, ...result }, "Cycle date and lockstep peak position saved. Started/completed WRs retained.");
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Could not shift schedule."); throw problem; }
    finally { setBusy(false); }
  };
  const reconcile = () => run(async () => {
    if (!permissions?.canGeneratePM_WR) throw new Error("Generation permission required.");
    const result = reconcileOpenPMs(data.workRequests, orders, data.blueprints, data.suppressedPmOccurrences ?? [], new Date().toISOString());
    await persist({ ...data, workRequests: result.workRequests, suppressedPmOccurrences: result.suppressedPmOccurrences }, `${result.suppressed} unstarted overlapping PM WR(s) suppressed.`);
  });
  const generate = () => run(async () => {
    if (!permissions?.canGeneratePM_WR) throw new Error("Generation permission required.");
    const result = generatePMWorkRequests({ schedules: orders, blueprints: data.blueprints, equipment: data.equipment, workRequests: data.workRequests,
      siteId: site, mode, selectedIds: selectedOrders, horizonDays: horizon, now: new Date(), craftspeople: data.craftspeople,
      suppressedPmOccurrences: data.suppressedPmOccurrences, actor: { id: actor, name: actor, role: profile?.primaryRole ?? "TeamLeader" } });
    const byId = new Map(result.schedules.map((item) => [item.ScheduleId, item]));
    await persist({ ...data, workRequests: result.workRequests, suppressedPmOccurrences: result.suppressedPmOccurrences, schedules: data.schedules.map((item) => byId.get(item.ScheduleId) ?? item) }, `Generated ${result.generated} WR(s); skipped ${result.skipped} duplicates.`);
  });
  const currentWr = data.workRequests.find((wr) => wr.SiteId === site && wr.WR_ID === open);
  const matching = (value: string) => value.toLowerCase().includes(query.trim().toLowerCase());
  const showBlueprint = (bp: PM_ChecklistStandard) => { setSelectedBlueprint(bp.ChecklistCode); setCreating(undefined); };
  return <div className="mx-auto max-w-[1600px] space-y-4 p-4"><h1 className="text-2xl font-bold">SmartPM · Blueprints &amp; Target Plans</h1>
    <nav className="flex flex-wrap gap-2" aria-label="SmartPM sections">{tabs.map((name, i) => <button key={name} aria-current={tab === i ? "page" : undefined} className={`${button} ${tab === i ? "border-blue-600 bg-blue-50 text-blue-800" : ""}`} onClick={() => setTab(i)}>{name}</button>)}</nav>
    {error && <p role="alert" className="rounded bg-rose-100 p-3 text-rose-900">{error}</p>}{notice && <p role="status" className="rounded bg-emerald-50 p-3">{notice}</p>}{busy && <p role="status">Saving…</p>}
    {tab === 0 && <div className="flex flex-col items-start gap-4 md:flex-row"><aside className="w-full shrink-0 space-y-3 rounded-xl border bg-white p-3 md:w-80">
      <input aria-label="Search blueprint families" className={`${field} w-full`} placeholder="Search CB, family, title or trade" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="flex flex-wrap gap-2"><button disabled={busy || !canBlueprint} className={button} onClick={() => { setError(""); setFamilyTrade(CLASSICAL_TRADES.find(permittedTrade) ?? ""); setFamilyDialog(true); }}>+ New Family</button><button disabled={busy || !canBlueprint} className={button} onClick={() => startNew(false)}>+ New Blueprint</button></div>
      <h2 className="font-bold">Blueprint Families</h2>{families.map((id) => {
        const items = blueprints.filter((bp) => bp.familyId === id).sort((a, b) => rank(a) - rank(b));
        if (!matching(`${id} ${items[0].familyName} ${items.map((bp) => `${bp.ChecklistCode} ${bp.Title} ${bp.TradeName}`).join(" ")}`)) return null;
        const assigned = new Set(orders.filter((order) => items.some((bp) => bp.ChecklistCode === order.ChecklistCode)).map(pmTargetKey)).size;
        return <button key={id} className={`${button} w-full text-left ${selected?.familyId === id ? "border-blue-600 bg-blue-50" : ""}`} onClick={() => showBlueprint(items[0])}><strong>{id} · {items[0].familyName}</strong><p className="text-xs">{items.map((bp) => bp.frequencyCode).join(" → ")}</p><p className="text-xs font-normal">Assigned across {assigned} machines / locations</p></button>;
      })}
      <h2 className="font-bold">Standalone Blueprints</h2>{blueprints.filter((bp) => bp.blueprintMode === "standalone" && matching(`${bp.ChecklistCode} ${bp.Title} ${bp.TradeName}`)).map((bp) => <button key={bp.ChecklistCode} className={`${button} w-full text-left`} onClick={() => showBlueprint(bp)}>{bp.ChecklistCode} · {bp.Title} <FrequencyPill code={bp.frequencyCode} /></button>)}
    </aside><section className="min-w-0 flex-1 space-y-4">
      {!creating && selected && <header className="space-y-3 rounded-xl border bg-white p-4"><h2 className="text-xl font-bold">{selected.familyId} · {selected.familyName ?? selected.Title}</h2><p>{selected.TradeName}</p>
        <p className="rounded bg-sky-50 p-3 text-sm">{selected.blueprintMode === "family_ladder" ? "Any equipment or location assigned 2+ blueprints from this family automatically suppresses lower intervals on overlapping cycles and inherits their checklist steps." : "Standalone inspection: runs independently, never suppresses and is never suppressed."}</p>
        <div className="flex flex-wrap gap-2">{selected.blueprintMode === "family_ladder" && <button className={button} disabled={!canBlueprint || busy} onClick={() => startNew(true)}>+ Add Frequency Blueprint to Family</button>}<button disabled={!canAssign || busy} className={button} onClick={() => openAssign(selected.familyId ? familyBlueprints.map((bp) => bp.ChecklistCode) : [selected.ChecklistCode])}>Assign Family / Blueprint to Equipment or Location…</button></div>
        <div className="flex flex-wrap gap-2">{(selected.familyId ? familyBlueprints : [selected]).map((bp) => <button key={bp.ChecklistCode} onClick={() => showBlueprint(bp)} className={`${button} ${selected.ChecklistCode === bp.ChecklistCode ? "border-blue-600 bg-blue-50" : ""}`}>{bp.ChecklistCode}<p><FrequencyPill code={bp.frequencyCode} /> · +{bp.Steps.length} steps →</p></button>)}</div>
      </header>}
      {(creating || selected) ? <fieldset disabled={busy || !canBlueprint}><ChecklistBuilder key={creating ? `new:${creating.ChecklistCode}` : `${selected!.ChecklistCode}:${selected!.Version}`} initialBlueprint={creating ? undefined : selected} blueprintDefaults={creating} frequencyCode={creating?.frequencyCode ?? selected?.frequencyCode}
        allBlueprints={data.blueprints.filter((bp) => bp.SiteId === site)} blueprintHighWatermark={data.blueprintHighWatermark}
        availableFrequencies={creating?.familyId ? codes.filter((code) => !blueprints.some((bp) => bp.familyId === creating.familyId && bp.frequencyCode === code)) : codes} onSave={saveBlueprint} /></fieldset> : <p>Create a family or standalone blueprint to begin.</p>}
      {!creating && selected && <BlueprintChangeHistory entries={audits.filter((entry) => entry.blueprintCode === selected.ChecklistCode)} />}
      {creating && <button className={button} onClick={() => setCreating(undefined)}>Cancel new blueprint</button>}
    </section></div>}
    {tab === 1 && <PmTargetPlans targets={targets} orders={orders} blueprints={blueprints} requests={data.workRequests} selected={selectedTarget} onSelect={setSelectedTarget} onAssign={(id) => openAssign([], id)} onRemove={(order) => void remove(order)} onShift={shift} busy={busy} canEdit={canAssign} error={error} />}
    {tab === 2 && <PmSchedulesGrid orders={orders} blueprints={blueprints} data={data} selected={selectedOrders} onSelect={setSelectedOrders} onOpen={(order) => { setSelectedTarget(pmTargetKey(order)); setTab(1); }} />}
    {tab === 3 && <section className="space-y-4"><div className="flex flex-wrap items-end gap-3 rounded-xl border p-4"><label>Generation mode<select className={`ml-2 ${field}`} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="horizon">All orders within horizon</option><option value="selected">Selected orders ({selectedOrders.length})</option><option value="single">Single selected order</option></select></label><label>Horizon days<input className={`${field} ml-2 w-24`} type="number" min={1} max={365} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} /></label><button className={button} disabled={busy || !permissions?.canGeneratePM_WR} onClick={() => void generate()}>Generate PM WRs</button><button disabled={busy || !permissions?.canGeneratePM_WR} className={button} onClick={() => void reconcile()}>⚡ Reconcile &amp; Suppress Overlapping Open PMs</button></div>
      <SuppressionLog entries={(data.suppressedPmOccurrences ?? []).filter((entry) => entry.siteId === site && orders.some((order) => order.ScheduleId === entry.suppressedPmsId))} onOpen={setOpen} />
      <BlueprintChangeHistory entries={audits} /><ChecklistChangeHistory requests={data.workRequests.filter((wr) => wr.SiteId === site && permittedTrade(wr.TradeId ?? ""))} />
    </section>}
    {familyDialog && <div role="dialog" aria-modal="true" aria-label="New blueprint family" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"><form className="space-y-4 rounded-xl bg-white p-5" onSubmit={(e) => {
      e.preventDefault();
      if (!canBlueprint || !familyName.trim() || !permittedTrade(familyTrade)) { setError("A family name, permitted trade and blueprint permission are required."); return; }
      setCreating({ ChecklistCode: nextBlueprintCode(data.blueprints, "03M", data.blueprintHighWatermark), SiteId: site, familyId: nextFamilyId(data.blueprints), familyName: familyName.trim(), TradeId: familyTrade, blueprintMode: "family_ladder", frequencyCode: "03M" }); setFamilyDialog(false); setTab(0);
    }}><h2 className="font-bold">{nextFamilyId(data.blueprints)} · New Blueprint Family</h2>{error && <p role="alert" className="text-rose-700">{error}</p>}<input required className={field} aria-label="Family name" placeholder="Family name" value={familyName} onChange={(e) => setFamilyName(e.target.value)} /><select aria-label="Family trade" className={field} value={familyTrade} onChange={(e) => setFamilyTrade(e.target.value)}>{CLASSICAL_TRADES.filter(permittedTrade).map((trade) => <option key={trade}>{trade}</option>)}</select><div className="flex gap-2"><button className={button}>Continue to Checklist</button><button type="button" className={button} onClick={() => setFamilyDialog(false)}>Cancel</button></div></form></div>}
    {assign && <PmAssignmentModal initial={assign} blueprints={blueprints} targets={targets} schedules={data.schedules} busy={busy} error={error} onClose={() => setAssign(undefined)} onCreate={(draft) => void assignOrders(draft)} />}
    {currentWr?.WR_Type === "PM" && <PMWorkRequestPopup workRequest={currentWr} onClose={() => setOpen(undefined)} onNavigate={setOpen} onEscalateToLJ={() => setError("Create Long Jobs from the work request overview.")} />}
  </div>;
}
