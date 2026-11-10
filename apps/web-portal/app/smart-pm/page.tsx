"use client";

import React, { useState } from "react";
import { CLASSICAL_TRADES, PM_FREQUENCY_RANKS, PM_ChecklistStandardSchema, blueprintLayers, compileBlueprintChecklist } from "@cafm/shared-schema";
import type { PM_ChecklistStandard, PMFrequencyCode, PM_Schedule, PM_ScheduleStep } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import type { DemoData } from "@/lib/cafm-data";
import { createPmOrder, changeFamilyAnchor, sharedFamilyAnchor, validateBlueprintFamilies } from "@/lib/pm-orders";
import { frequencyOf, occurrenceKey, previewCycles, reconcileOpenPMs, resolveBlueprintSchedule } from "@/lib/pm-suppression";
import { generatePMWorkRequests } from "@/lib/pm-generation";
import { ChecklistBuilder } from "@/components/modules/ChecklistBuilder";
import { CraftpersonShiftWorkspace } from "@/components/modules/CraftpersonShiftWorkspace";
import { SuppressionLog } from "@/components/modules/SuppressionWorkspace";
import { FrequencyPill } from "@/components/common/PmFrequency";
import { PMWorkRequestPopup } from "@/components/modules/PMWorkRequestPopup";

const tabs = ["1. Checklist Blueprints & Families", "2. Equipment PM Plans (PMS 00001+)", "3. All PM Schedules (00001+)", "4. WR Generator & Suppression Audit Log"];
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
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState("");
  const [equipmentQuery, setEquipmentQuery] = useState("");
  const [selectedFamily, setSelectedFamily] = useState("");
  const [selectedBlueprint, setSelectedBlueprint] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState("");
  const [creating, setCreating] = useState<Partial<PM_ChecklistStandard>>();
  const [familyDialog, setFamilyDialog] = useState(false);
  const [familyName, setFamilyName] = useState("");
  const [familyTrade, setFamilyTrade] = useState<string>(CLASSICAL_TRADES[0]);
  const [assign, setAssign] = useState<{ blueprintIds: string[]; equipmentIds: string[]; anchor: string }>();
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ blueprint: "", family: "", frequency: "", equipment: "" });
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [horizon, setHorizon] = useState(365);
  const [mode, setMode] = useState<"horizon" | "selected" | "single">("horizon");
  const [open, setOpen] = useState<string>();
  const canBlueprint = !!permissions?.canDefineChecklistPM;
  const canAssign = !!permissions?.canAssignPMPToEQ && !!permissions?.canDefinePMSchedule;
  const canGenerate = !!permissions?.canGeneratePM_WR;
  const permittedTrade = (trade: string) => !profile?.vpaTrades.length || profile.vpaTrades.some((item) => item === trade);
  const blueprints = data.blueprints.filter((item) => item.SiteId === site && item.IsActive && permittedTrade(item.TradeId));
  const equipment = data.equipment.filter((item) => item.SiteId === site && (!profile?.vpaBuildingIds.length || profile.vpaBuildingIds.includes(item.bl_id)));
  const orders = data.schedules.filter((item) => item.SiteId === site && item.IsActive && blueprints.some((bp) => bp.ChecklistCode === item.ChecklistCode) && equipment.some((asset) => item.EquipmentCodes.includes(asset.EquipmentCode)));
  const families = [...new Set(blueprints.filter((bp) => bp.blueprintMode === "family_ladder").map((bp) => bp.familyId!))];
  const family = selectedFamily || families[0];
  const familyBlueprints = blueprints.filter((bp) => bp.blueprintMode === "family_ladder" && bp.familyId === family).sort((a, b) => rank(a) - rank(b));
  const selected = blueprints.find((bp) => bp.ChecklistCode === selectedBlueprint) ?? familyBlueprints[0];
  const asset = equipment.find((item) => item.EquipmentCode === selectedEquipment) ?? equipment[0];
  const assetOrders = orders.filter((item) => item.EquipmentCodes.includes(asset?.EquipmentCode));
  const lowerSteps = (bp: PM_ChecklistStandard): PM_ScheduleStep[] => blueprintLayers(bp, data.blueprints.filter((item) => item.SiteId === site))
    .filter((item) => item.ChecklistCode !== bp.ChecklistCode).flatMap((item) => item.Steps.map((step) => ({ ...step, originFrequency: item.frequencyCode, isInherited: true })));
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (problem) { setError(problem instanceof Error ? problem.message : "The operation could not be completed."); }
    finally { setBusy(false); }
  };
  const persist = async (next: DemoData, message: string) => {
    validateBlueprintFamilies(next.blueprints);
    await commitSnapshot(data, next, { optimistic: true });
    setNotice(message);
  };
  const saveBlueprint = (bp: PM_ChecklistStandard) => run(async () => {
    if (!canBlueprint || !permittedTrade(bp.TradeId)) throw new Error("Permission required to define this blueprint.");
    const parsed = PM_ChecklistStandardSchema.parse({ ...bp, SiteId: site });
    const original = data.blueprints.find((item) => item.SiteId === site && item.ChecklistCode === bp.ChecklistCode);
    if (creating && original) throw new Error("This blueprint code is already in use.");
    if (original && original.frequencyCode !== parsed.frequencyCode) throw new Error("A blueprint frequency is locked. Create a new frequency blueprint instead.");
    const nextBlueprints = [...data.blueprints.filter((item) => !(item.SiteId === site && item.ChecklistCode === parsed.ChecklistCode)), parsed];
    const nextSchedules = data.schedules.map((order) => order.SiteId === site ? resolveBlueprintSchedule(order, nextBlueprints) : order);
    await persist({ ...data, blueprints: nextBlueprints, schedules: nextSchedules }, "Blueprint saved. Every assigned machine now uses these rules for future work; executed WR snapshots are preserved.");
    setCreating(undefined); setSelectedBlueprint(parsed.ChecklistCode); setSelectedFamily(parsed.familyId ?? "");
  });
  const startNew = (inFamily: boolean) => {
    if (!canBlueprint) { setError("Permission required to define blueprints."); return; }
    const template = inFamily ? familyBlueprints[0] : undefined;
    const available = codes.filter((code) => !inFamily || !familyBlueprints.some((bp) => bp.frequencyCode === code));
    if (!available.length) { setError("This family already defines every frequency."); return; }
    setCreating({ ChecklistCode: `${site}-BP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, SiteId: site, blueprintMode: inFamily ? "family_ladder" : "standalone",
      familyId: template?.familyId, familyName: template?.familyName, TradeId: template?.TradeId ?? CLASSICAL_TRADES.find(permittedTrade),
      frequencyCode: available[0] });
  };
  const openAssign = (ids: string[], assetId?: string) => {
    setAssignmentQuery("");
    setAssign({ blueprintIds: ids, equipmentIds: assetId ? [assetId] : [], anchor: new Date().toISOString().slice(0, 10) });
  };
  const assignOrders = () => run(async () => {
    if (!canAssign || !assign?.blueprintIds.length || !assign.equipmentIds.length) throw new Error("Select at least one blueprint and machine, with assignment permission.");
    const next = [...data.schedules];
    let count = 0;
    for (const id of assign.equipmentIds) for (const bpId of assign.blueprintIds) {
      const machine = equipment.find((item) => item.EquipmentCode === id);
      const bp = blueprints.find((item) => item.ChecklistCode === bpId);
      if (!machine || !bp) throw new Error("A selected machine or blueprint is no longer available.");
      if (next.some((item) => item.SiteId === site && item.IsActive && item.ChecklistCode === bpId && item.EquipmentCodes.includes(id))) continue;
      next.push(createPmOrder(next, data.blueprints, bp, machine, assign.anchor, actor, data.pmsOrderHighWatermark)); count++;
    }
    if (!count) throw new Error("All selected blueprints are already assigned to these machines.");
    await persist({ ...data, schedules: next }, `Created ${count} five-digit PMS order(s). Existing family anchor dates were retained.`);
    setAssign(undefined);
  });
  const changeAnchor = (order: PM_Schedule, anchor: string) => run(async () => {
    if (!permissions?.canDefinePMSchedule) throw new Error("Permission required to change equipment anchors.");
    await persist({ ...data, schedules: changeFamilyAnchor(data.schedules, data.blueprints, order, anchor) }, "Equipment anchor synchronized across this machine's family orders only.");
  });
  const remove = (order: PM_Schedule) => run(async () => {
    if (!canAssign) throw new Error("Assignment permission required.");
    await persist({ ...data, schedules: data.schedules.map((item) => item.ScheduleId === order.ScheduleId && item.SiteId === site ? { ...item, IsActive: false, UpdatedAt: new Date().toISOString() } : item) }, `PMS #${order.ScheduleId} removed from the active plan. Historical WR links are retained.`);
  });
  const reconcile = () => run(async () => {
    if (!canGenerate) throw new Error("Permission required to generate/reconcile work.");
    const result = reconcileOpenPMs(data.workRequests, orders, data.blueprints, data.suppressedPmOccurrences ?? [], new Date().toISOString());
    await persist({ ...data, workRequests: result.workRequests, suppressedPmOccurrences: result.suppressedPmOccurrences }, `${result.suppressed} unstarted overlapping PM WR(s) suppressed. Executed work was preserved.`);
  });
  const generate = () => run(async () => {
    if (!canGenerate) throw new Error("Generation permission required.");
    const result = generatePMWorkRequests({ schedules: orders, blueprints: data.blueprints, equipment: data.equipment, workRequests: data.workRequests,
      siteId: site, mode, selectedIds: selectedOrders, horizonDays: horizon, now: new Date(), craftspeople: data.craftspeople,
      suppressedPmOccurrences: data.suppressedPmOccurrences, actor: { id: actor, name: actor, role: profile?.primaryRole ?? "TeamLeader" } });
    const byId = new Map(result.schedules.map((item) => [item.ScheduleId, item]));
    await persist({ ...data, workRequests: result.workRequests, suppressedPmOccurrences: result.suppressedPmOccurrences,
      schedules: data.schedules.map((item) => byId.get(item.ScheduleId) ?? item) }, `Generated ${result.generated} WR(s); skipped ${result.skipped} duplicate cycle(s).`);
  });
  const currentWr = data.workRequests.find((wr) => wr.SiteId === site && wr.WR_ID === open);
  const matching = (value: string, search: string) => value.toLowerCase().includes(search.toLowerCase().trim());
  const showBlueprint = (bp: PM_ChecklistStandard) => { setSelectedBlueprint(bp.ChecklistCode); setSelectedFamily(bp.familyId ?? ""); setCreating(undefined); };
  return <div className="mx-auto max-w-[1600px] space-y-4 p-4">
    <h1 className="text-2xl font-bold">SmartPM · Blueprints &amp; Equipment Plans</h1>
    <nav className="flex flex-wrap gap-2" aria-label="SmartPM sections">{tabs.map((name, i) => <button key={name} aria-current={tab === i ? "page" : undefined} className={`${button} ${tab === i ? "border-blue-600 bg-blue-50 text-blue-800" : ""}`} onClick={() => setTab(i)}>{name}</button>)}</nav>
    {error && <p role="alert" className="rounded bg-rose-100 p-3 text-rose-900">{error}</p>}
    {notice && <p role="status" className="rounded bg-emerald-50 p-3">{notice}</p>}
    {busy && <p role="status">Saving…</p>}
    {tab === 0 && <div className="flex flex-col items-start gap-4 md:flex-row">
      <aside className="w-full shrink-0 space-y-3 rounded-xl border bg-white p-3 md:w-80"><input aria-label="Search blueprint families" className={`${field} w-full`} placeholder="Search blueprints & families" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex flex-wrap gap-2"><button disabled={busy || !canBlueprint} className={button} onClick={() => { setError(""); setFamilyTrade(CLASSICAL_TRADES.find(permittedTrade) ?? ""); setFamilyDialog(true); }}>+ New Family</button><button disabled={busy || !canBlueprint} className={button} onClick={() => startNew(false)}>+ New Blueprint</button></div>
        <h2 className="font-bold">Blueprint Families</h2>{families.map((id) => {
          const items = blueprints.filter((bp) => bp.familyId === id).sort((a, b) => rank(a) - rank(b));
          if (!matching(`${items[0].familyName} ${items.map((bp) => bp.Title).join(" ")}`, query)) return null;
          const assigned = new Set(orders.filter((order) => items.some((bp) => bp.ChecklistCode === order.ChecklistCode)).flatMap((order) => order.EquipmentCodes)).size;
          return <button key={id} className={`${button} w-full text-left ${selected?.familyId === id ? "border-blue-600 bg-blue-50" : ""}`} onClick={() => showBlueprint(items[0])}><strong>{items[0].familyName}</strong><p className="text-xs">{items.map((bp) => bp.frequencyCode).join(" → ")}</p><p className="text-xs font-normal">Assigned across {assigned} machines</p></button>;
        })}
        <h2 className="font-bold">Standalone Blueprints</h2>{blueprints.filter((bp) => bp.blueprintMode === "standalone" && matching(bp.Title, query)).map((bp) => <button key={bp.ChecklistCode} className={`${button} w-full text-left`} onClick={() => showBlueprint(bp)}>{bp.Title} <FrequencyPill code={bp.frequencyCode} /></button>)}
      </aside>
      <section className="min-w-0 flex-1 space-y-4">
        {!creating && selected && <><header className="space-y-3 rounded-xl border bg-white p-4"><h2 className="text-xl font-bold">{selected.familyName ?? selected.Title}</h2><p>{selected.TradeName}</p>
          <p className="rounded bg-sky-50 p-3 text-sm">{selected.blueprintMode === "family_ladder" ? "Any equipment assigned 2+ blueprints from this family automatically suppresses lower intervals on overlapping cycles and inherits their checklist steps." : "Standalone inspection: runs independently, never suppresses and is never suppressed."}</p>
          <div className="flex flex-wrap gap-2">{selected.blueprintMode === "family_ladder" && <button className={button} disabled={!canBlueprint || busy} onClick={() => startNew(true)}>+ Add Frequency Blueprint to Family</button>}<button disabled={!canAssign || busy} className={button} onClick={() => openAssign(selected.familyId ? familyBlueprints.map((bp) => bp.ChecklistCode) : [selected.ChecklistCode])}>Assign Family / Blueprint to Equipment…</button></div>
          <div className="flex flex-wrap gap-2">{(selected.familyId ? familyBlueprints : [selected]).map((bp, i) => <button key={bp.ChecklistCode} onClick={() => showBlueprint(bp)} className={`${button} ${selected.ChecklistCode === bp.ChecklistCode ? "border-blue-600 bg-blue-50" : ""}`}><span className="text-xs">X{i + 1} · {bp.ChecklistCode}</span><p><FrequencyPill code={bp.frequencyCode} /> · +{bp.Steps.length} steps →</p></button>)}</div>
        </header></>}
        {(creating || selected) ? <fieldset disabled={busy || !canBlueprint}><ChecklistBuilder key={creating ? `new:${creating.ChecklistCode}` : `${selected!.ChecklistCode}:${selected!.Version}`}
          initialBlueprint={creating ? undefined : selected} blueprintDefaults={creating} frequencyCode={creating?.frequencyCode ?? selected?.frequencyCode}
          allBlueprints={data.blueprints.filter((bp) => bp.SiteId === site)}
          availableFrequencies={creating?.familyId ? codes.filter((code) => !blueprints.some((bp) => bp.familyId === creating.familyId && bp.frequencyCode === code)) : codes}
          inheritedSteps={creating ? creating.familyId ? blueprints.filter((bp) => bp.familyId === creating.familyId && bp.frequencyCode && PM_FREQUENCY_RANKS[bp.frequencyCode] < PM_FREQUENCY_RANKS[creating.frequencyCode!]).flatMap((bp) => bp.Steps.map((step) => ({ ...step, originFrequency: bp.frequencyCode }))) : [] : lowerSteps(selected!)}
          onSave={saveBlueprint} /></fieldset> : <p>Create a family or standalone blueprint to begin.</p>}
        {creating && <button className={button} onClick={() => setCreating(undefined)}>Cancel new blueprint</button>}
      </section>
    </div>}
    {tab === 1 && <div className="flex flex-col items-start gap-4 md:flex-row">
      <aside className="w-full shrink-0 space-y-2 rounded-xl border bg-white p-3 md:w-80"><input aria-label="Search equipment PM plans" className={`${field} w-full`} placeholder="Equipment, building or room" value={equipmentQuery} onChange={(e) => setEquipmentQuery(e.target.value)} />
        {equipment.filter((item) => matching(`${item.EquipmentCode} ${item.EquipmentName} ${item.bl_id} ${item.RoomCode}`, equipmentQuery)).map((item) => {
          const assigned = orders.filter((order) => order.EquipmentCodes.includes(item.EquipmentCode));
          const start = assigned[0]?.anchorDate ?? new Date().toISOString().slice(0, 10);
          const count = assigned.length ? previewCycles(assigned, item.EquipmentCode, start, 12).winners.length : 0;
          return <button key={item.EquipmentCode} className={`${button} w-full text-left ${asset?.EquipmentCode === item.EquipmentCode ? "border-blue-600" : ""}`} onClick={() => setSelectedEquipment(item.EquipmentCode)}>{item.EquipmentCode} · {item.EquipmentName}<p className="text-xs font-normal">{assigned.length} active PMS · <span className="rounded-full bg-emerald-100 px-2">{count} WRs/year</span></p></button>;
        })}
      </aside>
      <section className="min-w-0 flex-1 space-y-4">{asset && <><header className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4"><div><h2 className="text-xl font-bold">{asset.EquipmentCode} · {asset.EquipmentName}</h2><p>{asset.bl_id} / {asset.LevelName} / {asset.RoomCode}</p></div><button disabled={!canAssign || busy} className={button} onClick={() => openAssign([], asset.EquipmentCode)}>+ Assign Blueprint (New PMS)</button></header>
        {[...new Set(assetOrders.map((order) => order.suppressionMode === "independent" ? `standalone:${order.ScheduleId}` : order.suppressionGroupKey!))].map((id) => {
          const group = assetOrders.filter((order) => (order.suppressionMode === "independent" ? `standalone:${order.ScheduleId}` : order.suppressionGroupKey) === id);
          return <section key={id} className="space-y-3 rounded-xl border bg-white p-4"><h3 className="font-bold">{group[0].suppressionGroupName} {group[0].suppressionMode === "independent" ? "· Standalone" : "· Family"}</h3>
            <label className="text-sm">Equipment Anchor Date <input type="date" className={field} disabled={busy || !permissions?.canDefinePMSchedule} value={group[0].anchorDate ?? ""} onChange={(e) => { if (e.target.value) void changeAnchor(group[0], e.target.value); }} /></label>
            <p className="text-xs text-slate-500">{group[0].suppressionMode === "independent" ? "This anchor belongs only to this standalone order." : "One shared date for all family orders on this machine. Other machines keep their own date."}</p>
            <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["PMS #", "Blueprint Name", "Locked Freq", "Compiled Steps", "Remove"].map((text) => <th key={text} className="p-2">{text}</th>)}</tr></thead><tbody>{group.map((order) => <tr className="border-t" key={order.ScheduleId}><td className="p-2 font-mono">{order.ScheduleId}</td><td>{blueprints.find((bp) => bp.ChecklistCode === order.ChecklistCode)?.Title}</td><td><FrequencyPill code={order.frequencyCode} /></td><td><CompiledPreview id={order.ChecklistCode} blueprints={data.blueprints.filter((bp) => bp.SiteId === site)} /></td><td><button className={button} disabled={!canAssign || busy} onClick={() => void remove(order)}>Remove</button></td></tr>)}</tbody></table></div>
            <CycleStrip schedules={group} equipment={asset.EquipmentCode} />
          </section>;
        })}
        {!assetOrders.length && <p>No blueprints assigned to this equipment.</p>}
      </>}</section>
    </div>}
    {tab === 2 && <section className="space-y-3 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap gap-2"><select aria-label="Filter by blueprint" className={field} value={filters.blueprint} onChange={(e) => setFilters({ ...filters, blueprint: e.target.value })}><option value="">All Blueprints</option>{blueprints.map((bp) => <option key={bp.ChecklistCode} value={bp.ChecklistCode}>{bp.Title}</option>)}</select><select aria-label="Filter by family" className={field} value={filters.family} onChange={(e) => setFilters({ ...filters, family: e.target.value })}><option value="">All Families / Standalone</option><option value="standalone">Standalone</option>{families.map((id) => <option key={id} value={id}>{blueprints.find((bp) => bp.familyId === id)?.familyName}</option>)}</select><select aria-label="Filter frequency" className={field} value={filters.frequency} onChange={(e) => setFilters({ ...filters, frequency: e.target.value })}><option value="">All Frequencies</option>{codes.map((code) => <option key={code}>{code}</option>)}</select><input aria-label="Filter equipment" className={field} placeholder="Equipment" value={filters.equipment} onChange={(e) => setFilters({ ...filters, equipment: e.target.value })} /></div>
      <p className="text-sm">Select orders here for the WR Generator. Frequency comes exclusively from the linked blueprint.</p>
      <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["Select", "PMS #", "Equipment", "Room", "Blueprint", "Family / Standalone", "Locked Freq", "Anchor Date", "Default Tech"].map((text) => <th key={text} className="p-2">{text}</th>)}</tr></thead><tbody>{orders.filter((order) => {
        const bp = blueprints.find((item) => item.ChecklistCode === order.ChecklistCode)!;
        const machine = equipment.find((item) => order.EquipmentCodes.includes(item.EquipmentCode));
        return (!filters.blueprint || bp.ChecklistCode === filters.blueprint) && (!filters.family || (filters.family === "standalone" ? bp.blueprintMode === "standalone" : bp.familyId === filters.family)) && (!filters.frequency || bp.frequencyCode === filters.frequency) && matching(`${machine?.EquipmentCode} ${machine?.EquipmentName}`, filters.equipment);
      }).map((order) => <tr className="border-t" key={order.ScheduleId}><td className="p-2"><input type="checkbox" aria-label={`Select PMS ${order.ScheduleId}`} checked={selectedOrders.includes(order.ScheduleId)} onChange={(e) => setSelectedOrders((current) => e.target.checked ? [...current, order.ScheduleId] : current.filter((id) => id !== order.ScheduleId))} /></td><td className="font-mono">{order.ScheduleId}</td><td><button className="text-blue-700 underline" onClick={() => { setSelectedEquipment(order.EquipmentCodes[0]); setTab(1); }}>{order.EquipmentCodes[0]}</button></td><td>{order.RoomCode}</td><td>{blueprints.find((bp) => bp.ChecklistCode === order.ChecklistCode)?.Title}</td><td>{order.suppressionMode === "independent" ? "Standalone" : order.suppressionGroupName}</td><td><FrequencyPill code={order.frequencyCode} /></td><td>{order.anchorDate}</td><td>{order.defaultTechnicianNames?.join(", ") || "Not set"}</td></tr>)}</tbody></table></div>
    </section>}
    {tab === 3 && <section className="space-y-4"><div className="flex flex-wrap items-end gap-3 rounded-xl border p-4"><label>Generation mode<select className={`ml-2 ${field}`} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="horizon">All orders within horizon</option><option value="selected">Selected orders ({selectedOrders.length})</option><option value="single">Single selected order</option></select></label><label>Horizon days<input className={`${field} ml-2 w-24`} type="number" min={1} max={365} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} /></label><button className={button} disabled={busy || !canGenerate} onClick={() => void generate()}>Generate PM WRs</button><button disabled={busy || !canGenerate} className={button} onClick={() => void reconcile()}>⚡ Reconcile &amp; Suppress Overlapping Open PMs</button></div>
      <SuppressionLog entries={(data.suppressedPmOccurrences ?? []).filter((entry) => entry.siteId === site && equipment.some((item) => item.EquipmentCode === entry.equipmentCode))} onOpen={setOpen} />
      <details className="rounded border p-3"><summary className="cursor-pointer font-semibold">Craftperson VPA &amp; Shift Management</summary><CraftpersonShiftWorkspace /></details>
    </section>}
    {familyDialog && <div role="dialog" aria-modal="true" aria-label="New blueprint family" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"><form className="space-y-4 rounded-xl bg-white p-5" onSubmit={(e) => {
      e.preventDefault();
      if (!canBlueprint || !familyName.trim()) { setError("A family name and blueprint definition permission are required."); return; }
      if (!permittedTrade(familyTrade)) { setError("This trade is outside your VPA."); return; }
      const id = `FAM-${site}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      setCreating({ ChecklistCode: `${site}-BP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, SiteId: site, familyId: id, familyName: familyName.trim(), TradeId: familyTrade, blueprintMode: "family_ladder", frequencyCode: "03M" });
      setFamilyDialog(false); setTab(0);
    }}><h2 className="font-bold">New Family · define its first frequency blueprint</h2>{error && <p role="alert" className="rounded bg-rose-100 p-2 text-rose-900">{error}</p>}<input required className={field} aria-label="Family name" placeholder="Family name" value={familyName} onChange={(e) => setFamilyName(e.target.value)} /><select aria-label="Family trade" className={field} value={familyTrade} onChange={(e) => setFamilyTrade(e.target.value)}>{CLASSICAL_TRADES.filter(permittedTrade).map((trade) => <option key={trade}>{trade}</option>)}</select><div className="flex gap-2"><button className={button}>Continue to Checklist</button><button type="button" className={button} onClick={() => setFamilyDialog(false)}>Cancel</button></div></form></div>}
    {assign && <div role="dialog" aria-modal="true" aria-label="Assign blueprints to equipment" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"><div className="max-h-[90vh] w-full max-w-3xl space-y-3 overflow-auto rounded-xl bg-white p-5"><h2 className="text-lg font-bold">Assign Family / Blueprint to Equipment</h2><p className="text-sm">Choose blueprints and machines. Frequency and family rules are read-only; existing equipment-family anchors are retained.</p>
      {error && <p role="alert" className="rounded bg-rose-100 p-2 text-rose-900">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2"><fieldset className="max-h-64 space-y-2 overflow-auto rounded border p-2"><legend>Checklist Blueprints</legend>{blueprints.map((bp) => <label key={bp.ChecklistCode} className="block text-sm"><input type="checkbox" checked={assign.blueprintIds.includes(bp.ChecklistCode)} onChange={(e) => setAssign({ ...assign, blueprintIds: e.target.checked ? [...assign.blueprintIds, bp.ChecklistCode] : assign.blueprintIds.filter((id) => id !== bp.ChecklistCode) })} /> {bp.Title} <FrequencyPill code={bp.frequencyCode} /><span className="block pl-5 text-xs text-slate-500">{bp.familyName ?? "Standalone"}</span></label>)}</fieldset>
        <fieldset className="max-h-64 space-y-2 overflow-auto rounded border p-2"><legend>Equipment</legend><input className={field} placeholder="Search machines" aria-label="Search assignment machines" value={assignmentQuery} onChange={(e) => setAssignmentQuery(e.target.value)} />{equipment.filter((item) => matching(`${item.EquipmentCode} ${item.EquipmentName}`, assignmentQuery)).map((item) => <label key={item.EquipmentCode} className="block text-sm"><input type="checkbox" checked={assign.equipmentIds.includes(item.EquipmentCode)} onChange={(e) => setAssign({ ...assign, equipmentIds: e.target.checked ? [...assign.equipmentIds, item.EquipmentCode] : assign.equipmentIds.filter((id) => id !== item.EquipmentCode) })} /> {item.EquipmentCode} · {item.EquipmentName}</label>)}</fieldset></div>
      {(() => {
        const anchors = assign.equipmentIds.flatMap((id) => assign.blueprintIds.flatMap((bpId) => {
          const bp = blueprints.find((item) => item.ChecklistCode === bpId);
          const anchor = bp ? sharedFamilyAnchor(data.schedules, data.blueprints, id, bp) : undefined;
          return anchor ? [{ id, anchor, family: bp!.familyName }] : [];
        }));
        const locked = assign.equipmentIds.length === 1 && assign.blueprintIds.length === 1 && anchors.length === 1;
        return <><label>Anchor Date <input type="date" required className={field} disabled={locked} value={locked ? anchors[0].anchor : assign.anchor} onChange={(e) => setAssign({ ...assign, anchor: e.target.value })} /></label>{anchors.map((item, i) => <p key={`${item.id}-${i}`} className="text-xs text-blue-800">{item.id} · {item.family}: locked to {item.anchor}</p>)}</>;
      })()}
      <div className="flex gap-2"><button disabled={busy || !canAssign} className={button} onClick={() => void assignOrders()}>Create PMS Orders</button><button disabled={busy} className={button} onClick={() => setAssign(undefined)}>Cancel</button></div>
    </div></div>}
    {currentWr?.WR_Type === "PM" && <PMWorkRequestPopup workRequest={currentWr} onClose={() => setOpen(undefined)} onNavigate={setOpen} onEscalateToLJ={() => setError("Create Long Jobs from the work request overview.")} />}
  </div>;
}

function CompiledPreview({ id, blueprints }: { id: string; blueprints: PM_ChecklistStandard[] }) {
  const steps = compileBlueprintChecklist(id, blueprints);
  return <details><summary className="cursor-pointer text-blue-700">{steps.length} steps · preview</summary><div className="max-h-64 space-y-2 overflow-auto rounded border p-2">{steps.map((step) => <p key={step.StepId} className="text-xs"><FrequencyPill code={step.originFrequency} inherited={step.isInherited} /> {step.Title}{step.replacesStepLabel && <span className="block text-amber-800">{step.replacesStepLabel}</span>}</p>)}</div></details>;
}

function CycleStrip({ schedules, equipment }: { schedules: PM_Schedule[]; equipment: string }) {
  const from = schedules[0].anchorDate!;
  const preview = previewCycles(schedules, equipment, from, 12);
  return <div className="space-y-2"><p className="rounded bg-emerald-50 p-2 text-sm font-semibold">Result: {preview.winners.length} WRs/year instead of {preview.winners.length + preview.suppressed.length} — {preview.suppressed.length} duplicates prevented</p><div className="flex max-h-64 flex-wrap gap-2 overflow-auto">{preview.winners.map((item) => {
    const lower = preview.suppressed.filter((entry) => occurrenceKey(entry.coveredBy) === occurrenceKey(item));
    return <article key={occurrenceKey(item)} className="rounded border p-2 text-xs"><strong>{item.dueDate} · PMS #{item.schedule.ScheduleId}</strong><p><FrequencyPill code={frequencyOf(item.schedule)} /></p>{lower.length > 0 && <p className="text-amber-800">Suppresses {lower.map((entry) => `PMS #${entry.occurrence.schedule.ScheduleId} (${frequencyOf(entry.occurrence.schedule)})`).join(", ")}</p>}</article>;
  })}</div></div>;
}
