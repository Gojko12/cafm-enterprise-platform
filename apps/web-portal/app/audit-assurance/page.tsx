"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useActiveUserPermissions, useCafmStore, type DemoData } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { auditSystem } from "@/lib/audit-assurance-seed";
import { assuranceStates, calculateDeadline, findingTypes, isFindingOverdue, urgencyLabels, urgencyLevels, validationStatuses, workflowStages, type AuditCampaign, type AuditFinding, type AuditInspection, type AuditUrgency } from "@/lib/audit-assurance-types";
import { ValidationWorkbench } from "@/components/modules/assurance/ValidationWorkbench";
import { CorrectiveActions } from "@/components/modules/assurance/CorrectiveActions";
import { EvidenceVerification } from "@/components/modules/assurance/EvidenceVerification";
import { ConditionMap } from "@/components/modules/assurance/ConditionMap";
import { TrendsSLA } from "@/components/modules/assurance/TrendsSLA";
import { AssuranceReports } from "@/components/modules/assurance/AssuranceReports";
import { AssuranceSettings, AssuranceTemplates, KmisSettings } from "@/components/modules/assurance/AssuranceConfiguration";
import { EquipmentInspectionEditor } from "@/components/modules/assurance/EquipmentInspectionEditor";
import { ahuTemplate, completeEquipmentInspection, defaultKmisConfig } from "@/lib/equipment-inspection";

const tabs = ["Overview", "Audit Campaigns", "Inspection Schedule", "Findings", "Technical Validation", "Corrective Actions", "Evidence & Verification", "Condition Map", "Trends & SLA", "Reports", "Inspection Templates", "Audit Settings"];
const input = "w-full rounded border border-slate-300 px-2 py-1.5";
const button = "rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const panel = "rounded border border-slate-200 bg-white p-4 shadow-sm";
const cell = "border-b border-slate-200 px-3 py-2 text-left align-top";
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID();
const emptyEvidence = () => ({ beforePhotos: [], afterPhotos: [], certificates: [], updatedDrawings: [], replacedParts: [], laborCostEUR: 0, materialCostEUR: 0 });

type Filters = { campaign: string; urgency: string; type: string; validation: string; state: string; building: string; system: string; trade: string; contractor: string };
const emptyFilters: Filters = { campaign: "", urgency: "", type: "", validation: "", state: "", building: "", system: "", trade: "", contractor: "" };

export default function AuditAssurancePage() {
  const { data, commitSnapshot } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const { profile, permissions } = useActiveUserPermissions();
  const authorized = Boolean(permissions?.canAuditDoInspection && (profile?.isQAInspector || profile?.isSuperAdmin));
  const canConfigureKmis = Boolean(profile?.isSiteAdmin || profile?.isSuperAdmin);
  const campaigns = data.auditCampaigns ?? [], findings = data.auditFindings ?? [], inspections = data.auditInspections ?? [];
  const [tab, setTab] = useState(0), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [routeFilters, setRouteFilters] = useState({ campaign: "", building: "", system: "", inspector: "" });
  const [drill, setDrill] = useState<string[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [campaignModal, setCampaignModal] = useState(false), [findingModal, setFindingModal] = useState(false);
  const [scheduleId, setScheduleId] = useState("");
  const [sheetRouteId, setSheetRouteId] = useState("");
  const [sheetTemplateId, setSheetTemplateId] = useState("");
  const [name, setName] = useState(""), [provider, setProvider] = useState("Sophia / SOCOTEC"), [start, setStart] = useState(today()), [end, setEnd] = useState(today()), [inspectors, setInspectors] = useState(activePerson), [methodology, setMethodology] = useState("N0-N4 Dual Condition & Operational Assessment"), [selectedAssets, setSelectedAssets] = useState<string[]>([]), [previousId, setPreviousId] = useState("");
  const [campaignId, setCampaignId] = useState(""), [equipmentId, setEquipmentId] = useState(""), [component, setComponent] = useState(""), [checkpoint, setCheckpoint] = useState(""), [findingType, setFindingType] = useState<AuditFinding["findingType"]>("Condition"), [urgency, setUrgency] = useState<AuditUrgency>("N2"), [discovered, setDiscovered] = useState(today()), [title, setTitle] = useState(""), [observation, setObservation] = useState(""), [remedy, setRemedy] = useState(""), [contractor, setContractor] = useState(""), [responsible, setResponsible] = useState<AuditFinding["responsibleParty"]>("Contractor"), [condition, setCondition] = useState<AuditFinding["conditionScore"]>("B - Fair"), [operational, setOperational] = useState<AuditFinding["operationalStatus"]>("Operational");

  useEffect(() => { setTab(0); setDrill([]); setFilters(emptyFilters); setRouteFilters({ campaign: "", building: "", system: "", inspector: "" }); setSelected(null); setSheetRouteId(""); setCampaignModal(false); setFindingModal(false); setMessage(""); }, [activeSiteId]);
  const sheetRoute = inspections.find((item) => item.id === sheetRouteId);
  const sheetAsset = data.equipment.find((item) => item.EquipmentCode === sheetRoute?.equipmentId);
  const sheetCampaign = campaigns.find((item) => item.id === sheetRoute?.campaignId);
  const existingSheet = data.auditAssurance?.equipmentInspections.find((item) => item.campaignId === sheetCampaign?.id && item.equipmentId === sheetAsset?.EquipmentCode);
  const sheetTemplates = data.auditAssurance?.checkpointTemplates ?? [ahuTemplate];
  const sheetTemplate = sheetTemplates.find((item) => existingSheet ? item.equipmentCategory === existingSheet.equipmentCategory : item.id === sheetTemplateId);
  const filtered = useMemo(() => findings.filter((f) =>
    (!filters.campaign || f.campaignId === filters.campaign) && (!filters.urgency || f.urgency === filters.urgency) &&
    (!filters.type || f.findingType === filters.type) && (!filters.validation || f.validationStatus === filters.validation) &&
    (!filters.state || (filters.state === "@validation" ? ["FindingLogged", "AwaitingValidation"].includes(f.assuranceState) : filters.state === "@work" ? ["Validated_ActionPending", "CorrectiveWorkInProgress"].includes(f.assuranceState) : filters.state === "@overdue" ? isFindingOverdue(f, today()) : f.assuranceState === filters.state)) && (!filters.building || f.buildingId === filters.building) &&
    (!filters.system || f.systemName === filters.system) && (!filters.trade || f.trade === filters.trade) && (!filters.contractor || f.contractorName === filters.contractor)), [findings, filters]);
  const path = (f: AuditFinding) => [f.siteId, f.buildingId, f.systemName, f.equipmentId, f.componentName, f.checkpointName];
  const drilled = findings.filter((f) => drill.every((value, i) => path(f)[i] === value));
  const currentFinding = findings.find((f) => f.id === selected);
  const open = findings.filter((f) => !["FindingVerified_Closed", "Rejected_Archived"].includes(f.assuranceState));
  const campaign = [...campaigns].sort((a, b) => b.startDate.localeCompare(a.startDate)).find((c) => c.completedInspectionsCount > 0 && c.overallConditionRating > 0 && c.overallOperationalRating > 0);
  const previous = campaigns.find((c) => c.id === campaign?.previousCampaignId && c.completedInspectionsCount > 0 && c.overallConditionRating > 0 && c.overallOperationalRating > 0);
  const delta = (value: number, old?: number) => old === undefined ? "No previous completed campaign" : `${value - old >= 0 ? "+" : ""}${(value - old).toFixed(1)} vs previous`;
  const stages = [
    { label: "Inspection", count: inspections.length, tab: 2, state: "" },
    { label: "Finding", count: findings.length, tab: 3, state: "" },
    { label: "Validation", count: findings.filter((f) => ["FindingLogged", "AwaitingValidation"].includes(f.assuranceState)).length, tab: 3, state: "@validation" },
    { label: "Work Order", count: findings.filter((f) => ["Validated_ActionPending", "CorrectiveWorkInProgress"].includes(f.assuranceState)).length, tab: 3, state: "@work" },
    { label: "Evidence", count: findings.filter((f) => f.assuranceState === "WorkCompleted_AwaitingEvidence").length, tab: 3, state: "WorkCompleted_AwaitingEvidence" },
    { label: "Verification", count: findings.filter((f) => f.assuranceState === "EvidenceAccepted_AwaitingVerification").length, tab: 3, state: "EvidenceAccepted_AwaitingVerification" },
    { label: "Trend / SLA", count: open.filter((f) => isFindingOverdue(f, today())).length, tab: 3, state: "@overdue" },
  ];
  const save = async (next: DemoData, success: string) => {
    if (!authorized) { setMessage("QA Inspector permission is required."); return false; }
    setBusy(true); setMessage("");
    try { await commitSnapshot(data, next); setMessage(success); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save assurance data."); return false; }
    finally { setBusy(false); }
  };
  const saveKmis = async (next: DemoData, success: string) => {
    if (!canConfigureKmis) { setMessage("Site administrator permission is required."); return false; }
    setBusy(true); setMessage("");
    try { await commitSnapshot(data, next); setMessage(success); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save KMIS settings."); return false; }
    finally { setBusy(false); }
  };
  const createCampaign = async (event: React.FormEvent) => {
    event.preventDefault();
    const assets = data.equipment.filter((asset) => selectedAssets.includes(asset.EquipmentCode));
    const people = inspectors.split(",").map((person) => person.trim()).filter(Boolean);
    if (!name.trim() || !provider.trim() || !methodology.trim() || !people.length || !assets.length || end < start || !start || !end) { setMessage("Provide a name, provider, methodology, dates, inspector and at least one asset."); return; }
    const id = uid(), now = new Date().toISOString();
    const item: AuditCampaign = { id, name: name.trim(), provider: provider.trim(), siteId: activeSiteId, buildingIds: [...new Set(assets.map((asset) => asset.bl_id))], systems: [...new Set(assets.map((asset) => auditSystem(asset.Category)))], startDate: start, endDate: end, inspectors: people, methodology: methodology.trim(), selectedEquipmentIds: assets.map((asset) => asset.EquipmentCode), plannedInspectionsCount: assets.length, completedInspectionsCount: 0, inaccessibleEquipmentIds: [], overallConditionRating: 0, overallOperationalRating: 0, ...(previousId ? { previousCampaignId: previousId } : {}), workflowStage: "Planning", importedDocuments: [] };
    const routes: AuditInspection[] = assets.map((asset, i) => ({ id: uid(), siteId: activeSiteId, campaignId: id, equipmentId: asset.EquipmentCode, buildingId: asset.bl_id, systemName: auditSystem(asset.Category), checkpointName: "Condition and operation", inspector: people[i % people.length], plannedDate: start, routeOrder: i + 1, accessibility: "Accessible", status: "Planned" }));
    if (await save({ ...data, auditCampaigns: [...campaigns, item], auditInspections: [...inspections, ...routes] }, `Campaign created at ${now}.`)) { setCampaignModal(false); setName(""); setSelectedAssets([]); }
  };
  const updateStage = async (item: AuditCampaign, value: AuditCampaign["workflowStage"]) => {
    await save({ ...data, auditCampaigns: campaigns.map((c) => c.id === item.id ? { ...c, workflowStage: value } : c) }, "Campaign stage updated.");
  };
  const recordInspection = async (item: AuditInspection, accessibility: AuditInspection["accessibility"]) => {
    const now = new Date().toISOString();
    const finished = accessibility === "Accessible";
    const nextInspections = inspections.map((row) => row.id === item.id ? { ...row, accessibility, status: finished ? "Completed" as const : "Planned" as const, completedAt: finished ? now : undefined } : row);
    const nextCampaigns = campaigns.map((c) => c.id === item.campaignId ? {
      ...c, completedInspectionsCount: c.completedInspectionsCount + (finished && item.status === "Planned" ? 1 : !finished && item.status === "Completed" ? -1 : 0),
      inaccessibleEquipmentIds: accessibility === "Inaccessible" ? [...new Set([...c.inaccessibleEquipmentIds, item.equipmentId])] : c.inaccessibleEquipmentIds.filter((id) => id !== item.equipmentId),
    } : c);
    await save({ ...data, auditCampaigns: nextCampaigns, auditInspections: nextInspections }, "Inspection result recorded.");
  };
  const openFinding = (inspection?: AuditInspection) => {
    setScheduleId(inspection?.id ?? ""); setCampaignId(inspection?.campaignId ?? ""); setEquipmentId(inspection?.equipmentId ?? "");
    setCheckpoint(inspection?.checkpointName ?? ""); setComponent(""); setTitle(""); setObservation(""); setRemedy(""); setContractor(""); setDiscovered(today()); setFindingModal(true);
  };
  const createFinding = async (event: React.FormEvent) => {
    event.preventDefault();
    const c = campaigns.find((item) => item.id === campaignId), asset = data.equipment.find((item) => item.EquipmentCode === equipmentId);
    const inspection = inspections.find((item) => item.id === scheduleId);
    if (!c || !asset || !c.selectedEquipmentIds.includes(asset.EquipmentCode) || (inspection && (inspection.campaignId !== c.id || inspection.equipmentId !== asset.EquipmentCode))) { setMessage("Select a campaign and an asset in its scope."); return; }
    if (![component, checkpoint, title, observation, remedy, contractor].every((v) => v.trim())) { setMessage("Complete all finding fields."); return; }
    let deadline: string;
    try { deadline = calculateDeadline(discovered, urgency, data.auditSettings); } catch (error) { setMessage(error instanceof Error ? error.message : "Invalid date."); return; }
    const now = new Date().toISOString(), id = uid();
    const finding: AuditFinding = { id, campaignId: c.id, campaignName: c.name, siteId: activeSiteId, buildingId: asset.bl_id, roomId: asset.RoomCode, systemName: auditSystem(asset.Category), equipmentId: asset.EquipmentCode, equipmentName: asset.EquipmentName, componentName: component.trim(), checkpointName: checkpoint.trim(), findingType, urgency, conditionScore: condition, operationalStatus: operational, discoveredAt: discovered, calculatedDeadline: deadline, title: title.trim(), observation: observation.trim(), recommendedRemedy: remedy.trim(), responsibleParty: responsible, contractorName: contractor.trim(), trade: asset.PrimaryTradeId ?? "MultiTechnic", inspectorName: activePerson, inspectorPhotos: [], validationStatus: "PendingValidation", aiIntelligenceFlags: [], assuranceState: "AwaitingValidation", evidence: emptyEvidence(), verification: {}, auditTrail: [{ id: uid(), timestamp: now, actor: activePerson, action: "Finding logged" }] };
    const finished = operational !== "Inaccessible";
    const nextInspections = inspections.map((item) => item.id === inspection?.id ? { ...item, status: finished ? "Completed" as const : "Planned" as const, completedAt: finished ? now : undefined, accessibility: finished ? "Accessible" as const : "Inaccessible" as const } : item);
    const nextCampaigns = campaigns.map((item) => item.id === c.id && inspection ? { ...item, completedInspectionsCount: item.completedInspectionsCount + (finished && inspection.status === "Planned" ? 1 : !finished && inspection.status === "Completed" ? -1 : 0), inaccessibleEquipmentIds: !finished ? [...new Set([...item.inaccessibleEquipmentIds, asset.EquipmentCode])] : item.inaccessibleEquipmentIds.filter((id) => id !== asset.EquipmentCode) } : item);
    if (await save({ ...data, auditFindings: [...findings, finding], auditCampaigns: nextCampaigns, auditInspections: nextInspections }, "Finding saved for technical validation.")) { setFindingModal(false); setSelected(id); setTab(3); }
  };
  const options = (values: string[]) => [...new Set(values)].sort().map((value) => <option key={value} value={value}>{value}</option>);
  const matrix = (label: string, key: (f: AuditFinding) => string) => <div className={panel}><h3 className="font-semibold">{label}</h3><table className="w-full text-sm"><thead><tr><th className={cell}>Group</th><th className={cell}>Findings</th><th className={cell}>Overdue</th></tr></thead><tbody>{[...new Set(findings.map(key))].sort().map((value) => <tr key={value}><td className={cell}>{value}</td><td className={cell}>{findings.filter((f) => key(f) === value).length}</td><td className={cell}>{findings.filter((f) => key(f) === value && isFindingOverdue(f, today())).length}</td></tr>)}</tbody></table></div>;
  return <main className="space-y-4 p-6 text-slate-800">
    <header><h1 className="text-2xl font-bold">Technical Audit &amp; Assurance</h1><p className="text-sm text-slate-500">Site-scoped external audit lifecycle · {activeSiteId} · {activePerson}</p></header>
    <div className="flex flex-wrap gap-2 rounded bg-blue-50 p-3">{stages.map((s, i) => <button key={s.label} className="rounded border border-blue-200 bg-white px-3 py-2 text-sm hover:bg-blue-100" onClick={() => { setFilters({ ...emptyFilters, state: s.state }); setTab(s.tab); }}>{i + 1}. {s.label} <strong>({s.count})</strong> {i < stages.length - 1 && "➔"}</button>)}</div>
    <nav className="flex flex-wrap gap-1">{tabs.map((label, i) => <button key={label} onClick={() => setTab(i)} className={`rounded px-3 py-2 text-sm ${tab === i ? "bg-blue-700 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>{i + 1}. {label}</button>)}</nav>
    {message && <div role="status" className="rounded border border-blue-200 bg-blue-50 p-3">{message}</div>}
    {!authorized && <p className="text-sm text-slate-600">Read-only: changes require an authorized QA Inspector. Permissions are demo controls, not server-side authentication.</p>}
    {tab === 0 && <>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        {[
          ["Overall condition", campaign ? `${campaign.overallConditionRating}/100 · ${delta(campaign.overallConditionRating, previous?.overallConditionRating)}` : "No completed campaign"],
          ["Overall operation", campaign ? `${campaign.overallOperationalRating}/100 · ${delta(campaign.overallOperationalRating, previous?.overallOperationalRating)}` : "No completed campaign"],
          ["Open by urgency", urgencyLevels.map((u) => `${u}: ${open.filter((f) => f.urgency === u).length}`).join(" · ")],
          ["Overdue corrective actions", String(open.filter((f) => ["Validated_ActionPending", "CorrectiveWorkInProgress", "WorkCompleted_AwaitingEvidence", "EvidenceAccepted_AwaitingVerification"].includes(f.assuranceState) && isFindingOverdue(f, today())).length)],
          ["Awaiting validation", String(findings.filter((f) => f.validationStatus === "PendingValidation").length)],
          ["Recurring / duplicate / disputed", `${findings.filter((f) => f.isRecurring).length} / ${findings.filter((f) => f.duplicateOfFindingId || f.aiIntelligenceFlags.includes("PotentialDuplicate")).length} / ${findings.filter((f) => f.isDisputed).length}`],
          ["Data quality / inaccessible", `${findings.filter((f) => f.findingType === "Data Quality").length} / ${new Set(campaigns.flatMap((c) => c.inaccessibleEquipmentIds)).size}`],
        ].map(([label, value]) => <div key={label} className={panel}><h3 className="text-sm text-slate-500">{label}</h3><p className="mt-2 font-semibold">{value}</p></div>)}
      </div>
      <div className="grid gap-3 md:grid-cols-2">{matrix("Site", (f) => f.siteId)}{matrix("Building", (f) => f.buildingId)}{matrix("Technical system", (f) => f.systemName)}{matrix("Contractor", (f) => f.contractorName)}</div>
      <section className={panel}><h2 className="font-semibold">Six-level drill-down explorer</h2><p className="text-sm text-slate-500">Site › Building › System › Equipment › Component › Inspection checkpoint</p>
        <div className="my-3 flex flex-wrap gap-2"><button className="text-blue-700 underline" onClick={() => setDrill([])}>All</button>{drill.map((part, i) => <button key={`${i}-${part}`} className="text-blue-700 underline" onClick={() => setDrill(drill.slice(0, i + 1))}>› {part}</button>)}</div>
        {drill.length < 6 && <div className="flex flex-wrap gap-2">{[...new Set(drilled.map((f) => path(f)[drill.length]))].sort().map((part) => <button key={part} className="rounded border px-3 py-2 hover:bg-blue-50" onClick={() => setDrill([...drill, part])}>{part} ({drilled.filter((f) => path(f)[drill.length] === part).length})</button>)}</div>}
        {drill[3] && inspections.some((item) => item.equipmentId === drill[3]) && <button className="mt-2 rounded border p-2" onClick={() => { const route = inspections.filter((item) => item.equipmentId === drill[3]).sort((a, b) => b.plannedDate.localeCompare(a.plannedDate))[0]; setSheetRouteId(route.id); setSheetTemplateId(""); setTab(2); }}>📋 Open Equipment Inspection Sheet</button>}
        <p className="mt-3 text-sm">{drilled.length} matching findings</p><ul>{drilled.map((f) => <li key={f.id}><button className="text-blue-700 underline" onClick={() => { setSelected(f.id); setTab(3); }}>{f.id}: {f.title} ({f.checkpointName})</button></li>)}</ul>
      </section>
    </>}
    {tab === 1 && <section className="space-y-4"><div className="flex justify-between"><h2 className="text-xl font-semibold">Audit campaigns</h2><button disabled={!authorized || busy} className={button} onClick={() => setCampaignModal(true)}>+ Create Audit Campaign</button></div>
      <div className={`${panel} overflow-auto`}><table className="w-full text-sm"><thead><tr>{["Campaign", "Provider", "Dates", "Stage", "Inspections", "Previous campaign"].map((heading) => <th className={cell} key={heading}>{heading}</th>)}</tr></thead><tbody>{campaigns.map((c) => <tr key={c.id}><td className={cell}>{c.name}</td><td className={cell}>{c.provider}</td><td className={cell}>{c.startDate} – {c.endDate}</td><td className={cell}>{c.workflowStage}</td><td className={cell}>{c.completedInspectionsCount} / {c.plannedInspectionsCount}</td><td className={cell}>{campaigns.find((p) => p.id === c.previousCampaignId)?.name ?? "—"}</td></tr>)}</tbody></table></div>
      {campaigns.map((c) => <div className={panel} key={c.id}><div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-bold">{c.name}</h3><p>{c.provider} · {c.startDate} – {c.endDate} · {c.inspectors.join(", ")}</p><p className="text-sm">Buildings: {c.buildingIds.join(", ")} · Systems: {c.systems.join(", ")}</p></div><div>{c.completedInspectionsCount} / {c.plannedInspectionsCount} inspections<progress className="block w-48" max={c.plannedInspectionsCount || 1} value={c.completedInspectionsCount} /></div></div>
        <p className="mt-2 text-sm">Condition {c.overallConditionRating ? `${c.overallConditionRating}/100` : "Not scored"} · Operation {c.overallOperationalRating ? `${c.overallOperationalRating}/100` : "Not scored"} · Previous: {campaigns.find((p) => p.id === c.previousCampaignId)?.name ?? "None"}{c.overallConditionRating > 0 && campaigns.find((p) => p.id === c.previousCampaignId && p.overallConditionRating > 0) && ` · Condition ${delta(c.overallConditionRating, campaigns.find((p) => p.id === c.previousCampaignId)?.overallConditionRating)} · Operation ${delta(c.overallOperationalRating, campaigns.find((p) => p.id === c.previousCampaignId)?.overallOperationalRating)}`}</p>
        <label>📋 Open Equipment Inspection Sheet<select className={input} value="" onChange={(e) => { if (e.target.value) { setSheetRouteId(e.target.value); setSheetTemplateId(""); setTab(2); } }}><option value="">Select a scheduled asset</option>{inspections.filter((r) => r.campaignId === c.id).map((r) => <option key={r.id} value={r.id}>{r.equipmentId} · {data.equipment.find((a) => a.EquipmentCode === r.equipmentId)?.EquipmentName}</option>)}</select></label>
        <div className="mt-3 flex flex-wrap gap-1">{workflowStages.map((stage, i) => <button key={stage} disabled={!authorized || busy} onClick={() => void updateStage(c, stage)} className={`rounded border px-2 py-1 text-xs disabled:cursor-not-allowed ${stage === c.workflowStage ? "bg-blue-700 text-white" : "bg-slate-50"}`}>{i + 1}. {stage}</button>)}</div>
      </div>)}
      {!campaigns.length && <p>No campaigns for this site. Create one or reset demo data to load examples.</p>}
    </section>}
    {tab === 2 && <section className={panel}><h2 className="text-xl font-semibold">Inspection schedule</h2><p className="mb-3 text-sm text-slate-500">One persisted route entry per scoped asset. Record an accessible or inaccessible result, or log a finding.</p>
      <label>Equipment inspection sheet <select className={input} value={sheetRouteId} onChange={(e) => { setSheetRouteId(e.target.value); setSheetTemplateId(""); }}><option value="">Select a scheduled asset</option>{inspections.map((r) => <option key={r.id} value={r.id}>{campaigns.find((c) => c.id === r.campaignId)?.name} · {data.equipment.find((a) => a.EquipmentCode === r.equipmentId)?.EquipmentName} ({r.equipmentId})</option>)}</select></label>
      {sheetRoute && !existingSheet && <label>Inspection template (choose the appropriate equipment category)<select className={input} value={sheetTemplateId} onChange={(e) => setSheetTemplateId(e.target.value)}><option value="">Select a template</option>{sheetTemplates.map((t) => <option key={t.id} value={t.id}>{t.equipmentCategory}</option>)}</select></label>}
      {sheetRoute && sheetAsset && sheetCampaign && sheetTemplate && <EquipmentInspectionEditor key={`${sheetRoute.id}-${sheetTemplate.id}`} asset={sheetAsset} campaign={sheetCampaign} route={sheetRoute} template={sheetTemplate} config={data.auditAssurance?.kmisConfig ?? defaultKmisConfig} inspector={activePerson} busy={busy || !authorized} existing={existingSheet} onClose={() => setSheetRouteId("")} onSubmit={async (sheet) => { if (!authorized || !profile || (profile.vpaBuildingIds.length > 0 && !profile.vpaBuildingIds.includes(sheet.buildingId)) || !profile.permissions.auditTrades.some((trade) => trade === sheetAsset.PrimaryTradeId)) throw new Error("Inspector permission for this building and trade is required."); const next = completeEquipmentInspection(data, sheet); if (!await save(next, "Inspection and findings saved.")) throw new Error("Inspection was not saved; check the message above."); setSheetRouteId(""); }} />}
      <div className="mb-3 grid gap-2 md:grid-cols-4">{([["campaign", inspections.map((item) => item.campaignId)], ["building", inspections.map((item) => item.buildingId)], ["system", inspections.map((item) => item.systemName)], ["inspector", inspections.map((item) => item.inspector)]] as [keyof typeof routeFilters, string[]][]).map(([key, values]) => <label key={key} className="text-sm capitalize">{key}<select className={input} value={routeFilters[key]} onChange={(e) => setRouteFilters({ ...routeFilters, [key]: e.target.value })}><option value="">All</option>{options(values)}</select></label>)}</div>
      <div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{["Campaign", "Route", "Date", "Building", "System", "Asset / checkpoint", "Inspector", "Accessibility", "Status", "Action"].map((x) => <th className={cell} key={x}>{x}</th>)}</tr></thead><tbody>{inspections.filter((item) => (!routeFilters.campaign || item.campaignId === routeFilters.campaign) && (!routeFilters.building || item.buildingId === routeFilters.building) && (!routeFilters.system || item.systemName === routeFilters.system) && (!routeFilters.inspector || item.inspector === routeFilters.inspector)).map((item) => <tr key={item.id}><td className={cell}>{campaigns.find((c) => c.id === item.campaignId)?.name ?? item.campaignId}</td><td className={cell}>{item.routeOrder}</td><td className={cell}>{item.plannedDate}</td><td className={cell}>{item.buildingId}</td><td className={cell}>{item.systemName}</td><td className={cell}>{item.equipmentId}<br />{item.checkpointName}</td><td className={cell}>{item.inspector}</td><td className={cell}>{item.accessibility === "Inaccessible" ? "🔒 Inaccessible" : "Accessible"}</td><td className={cell}>{item.status}</td><td className={cell}><div className="flex flex-col gap-1"><button className={button} disabled={!authorized || busy} onClick={() => openFinding(item)}>Log finding</button><button className="rounded border px-2 py-1 disabled:opacity-50" disabled={!authorized || busy} onClick={() => void recordInspection(item, "Accessible")}>Record accessible</button><button className="rounded border px-2 py-1 disabled:opacity-50" disabled={!authorized || busy} onClick={() => void recordInspection(item, "Inaccessible")}>Record inaccessible</button></div></td></tr>)}</tbody></table></div></section>}
    {tab === 3 && <section className={panel}><div className="flex justify-between"><h2 className="text-xl font-semibold">Structured finding register ({filtered.length})</h2><button className={button} disabled={!authorized || busy} onClick={() => openFinding()}>+ Log New Finding</button></div>
      <div className="my-3 grid gap-2 md:grid-cols-3 xl:grid-cols-5">{([
        ["campaign", "Campaign", campaigns.map((c) => c.id)], ["urgency", "Urgency", [...urgencyLevels]], ["type", "Finding type", [...findingTypes]], ["validation", "Validation", [...validationStatuses]], ["state", "Assurance state", [...assuranceStates]], ["building", "Building", findings.map((f) => f.buildingId)], ["system", "System", findings.map((f) => f.systemName)], ["trade", "Trade", findings.map((f) => f.trade)], ["contractor", "Contractor", findings.map((f) => f.contractorName)],
      ] as [keyof Filters, string, string[]][]).map(([key, label, values]) => <label key={key} className="text-xs">{label}<select className={input} value={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}><option value="">All</option>{key === "state" && <><option value="@validation">Validation stages</option><option value="@work">Work order stages</option><option value="@overdue">Overdue</option></>}{options(values)}</select></label>)}<button className="text-sm text-blue-700 underline" onClick={() => setFilters(emptyFilters)}>Clear filters</button></div>
      <div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{["ID / title", "Campaign", "Urgency / deadline", "Type", "Location / system", "Asset / checkpoint", "Trade / contractor", "Validation", "Assurance"].map((x) => <th className={cell} key={x}>{x}</th>)}</tr></thead><tbody>{filtered.map((f) => <tr key={f.id}><td className={cell}><button className="text-blue-700 underline" onClick={() => setSelected(f.id)}>{f.id}<br />{f.title}</button></td><td className={cell}>{f.campaignName}</td><td className={cell}>{f.urgency} · {f.calculatedDeadline}{isFindingOverdue(f, today()) && <strong className="text-red-700"> Overdue</strong>}</td><td className={cell}>{f.findingType}</td><td className={cell}>{f.buildingId} / {f.roomId}<br />{f.systemName}</td><td className={cell}>{f.equipmentName}<br />{f.componentName} / {f.checkpointName}</td><td className={cell}>{f.trade}<br />{f.contractorName}</td><td className={cell}>{f.validationStatus}</td><td className={cell}>{f.assuranceState}</td></tr>)}</tbody></table></div>
    </section>}
    {tab === 4 && <ValidationWorkbench data={data} actor={activePerson} authorized={authorized} busy={busy} save={save} />}
    {tab === 5 && <CorrectiveActions data={data} actor={activePerson} authorized={authorized} canFJ={Boolean(permissions?.canCreateFJ)} canLJ={Boolean(permissions?.canCreateLJ)} canPM={Boolean(permissions?.canDefineChecklistPM)} busy={busy} save={save} />}
    {tab === 6 && <EvidenceVerification data={data} actor={activePerson} authorized={authorized} busy={busy} save={save} />}
    {tab === 7 && <ConditionMap data={data} canManage={authorized && Boolean(permissions?.canManageEquipment)} busy={busy} save={save} />}
    {tab === 8 && <TrendsSLA data={data} />}
    {tab === 9 && <AssuranceReports data={data} actor={activePerson} authorized={authorized} busy={busy} save={save} />}
    {tab === 10 && <AssuranceTemplates data={data} actor={activePerson} authorized={authorized} busy={busy} save={save} />}
    {tab === 11 && <AssuranceSettings data={data} actor={activePerson} authorized={authorized} busy={busy} save={save} />}
    {tab === 11 && <KmisSettings data={data} actor={activePerson} authorized={canConfigureKmis} busy={busy} save={saveKmis} />}
    {currentFinding && <div className="fixed inset-0 z-40 flex justify-end bg-black/30"><aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl"><div className="flex justify-between"><h2 className="text-xl font-bold">Finding traceability</h2><button onClick={() => setSelected(null)}>✕ Close</button></div><h3 className="mt-4 font-semibold">{currentFinding.id} · {currentFinding.title}</h3><p>{currentFinding.siteId} › {currentFinding.buildingId} › {currentFinding.systemName} › {currentFinding.equipmentId} › {currentFinding.componentName} › {currentFinding.checkpointName}</p><p>Room: {currentFinding.roomId} · Inspector: {currentFinding.inspectorName}</p><p className="mt-3"><strong>Observation:</strong> {currentFinding.observation}</p><p><strong>Remedy:</strong> {currentFinding.recommendedRemedy}</p><p><strong>Urgency:</strong> {currentFinding.urgency} ({urgencyLabels[currentFinding.urgency]}) · {currentFinding.calculatedDeadline}</p><p><strong>Validation:</strong> {currentFinding.validationStatus} {currentFinding.validationJustification}</p><p><strong>Assurance:</strong> {currentFinding.assuranceState} · WR: {currentFinding.linkedWrId ?? "Not linked"}</p><p><strong>Intelligence flags:</strong> {currentFinding.aiIntelligenceFlags.join(", ") || "None"} {currentFinding.aiReasoning}</p><p><strong>Previous / duplicate:</strong> {currentFinding.previousYearFindingId ?? "—"} / {currentFinding.duplicateOfFindingId ?? "—"}</p><h4 className="mt-4 font-semibold">Evidence &amp; verification</h4><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify({ evidence: currentFinding.evidence, verification: currentFinding.verification }, null, 2)}</pre><h4 className="mt-4 font-semibold">Audit trail</h4>{currentFinding.auditTrail.map((entry) => <p key={entry.id} className="text-sm">{entry.timestamp} · {entry.actor} · {entry.action} {entry.justification}</p>)}</aside></div>}
    {campaignModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><form onSubmit={createCampaign} className="max-h-full w-full max-w-3xl space-y-3 overflow-y-auto rounded bg-white p-5"><div className="flex justify-between"><h2 className="text-xl font-bold">Create audit campaign</h2><button type="button" onClick={() => setCampaignModal(false)}>✕</button></div>
      <label className="block">Name<input required className={input} value={name} onChange={(e) => setName(e.target.value)} /></label><label className="block">Provider<input required className={input} value={provider} onChange={(e) => setProvider(e.target.value)} /></label>
      <div className="grid gap-3 md:grid-cols-2"><label>Start date<input required type="date" className={input} value={start} onChange={(e) => setStart(e.target.value)} /></label><label>End date<input required type="date" className={input} value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>
      <label className="block">Inspectors (comma separated)<input required className={input} value={inspectors} onChange={(e) => setInspectors(e.target.value)} /></label><label className="block">Methodology<input required className={input} value={methodology} onChange={(e) => setMethodology(e.target.value)} /></label><label className="block">Previous campaign<select className={input} value={previousId} onChange={(e) => setPreviousId(e.target.value)}><option value="">None</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <fieldset><legend className="font-semibold">Equipment registry scope ({selectedAssets.length})</legend><div className="max-h-48 overflow-auto border p-2">{data.equipment.map((asset) => <label key={asset.EquipmentCode} className="block text-sm"><input type="checkbox" checked={selectedAssets.includes(asset.EquipmentCode)} onChange={(e) => setSelectedAssets(e.target.checked ? [...selectedAssets, asset.EquipmentCode] : selectedAssets.filter((id) => id !== asset.EquipmentCode))} /> {asset.EquipmentCode} · {asset.EquipmentName} · {asset.bl_id} / {asset.RoomCode} · {auditSystem(asset.Category)}</label>)}</div></fieldset><p className="text-sm">Building and system scope is derived from selected assets. Routes start on the campaign start date.</p><button className={button} disabled={!authorized || busy}>Create campaign</button></form></div>}
    {findingModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><form onSubmit={createFinding} className="max-h-full w-full max-w-3xl space-y-3 overflow-y-auto rounded bg-white p-5"><div className="flex justify-between"><h2 className="text-xl font-bold">Log new finding</h2><button type="button" onClick={() => setFindingModal(false)}>✕</button></div>
      <div className="grid gap-3 md:grid-cols-2"><label>Campaign<select required disabled={!!scheduleId} className={input} value={campaignId} onChange={(e) => { setCampaignId(e.target.value); setEquipmentId(""); }}><option value="">Select</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Equipment<select required disabled={!!scheduleId} className={input} value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}><option value="">Select</option>{data.equipment.filter((asset) => campaigns.find((c) => c.id === campaignId)?.selectedEquipmentIds.includes(asset.EquipmentCode)).map((asset) => <option key={asset.EquipmentCode} value={asset.EquipmentCode}>{asset.EquipmentCode} · {asset.EquipmentName} · {asset.bl_id} / {asset.RoomCode}</option>)}</select></label>
      <label>Component<input required className={input} value={component} onChange={(e) => setComponent(e.target.value)} /></label><label>Checkpoint<input required className={input} value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)} /></label>
      <label>Finding type<select className={input} value={findingType} onChange={(e) => setFindingType(e.target.value as AuditFinding["findingType"])}>{options([...findingTypes])}</select></label><label>Urgency<select className={input} value={urgency} onChange={(e) => setUrgency(e.target.value as AuditUrgency)}>{urgencyLevels.map((u) => <option key={u} value={u}>{u} · {urgencyLabels[u]}</option>)}</select></label>
      <label>Discovery date<input required type="date" className={input} value={discovered} onChange={(e) => setDiscovered(e.target.value)} /></label><label>Condition<select className={input} value={condition} onChange={(e) => setCondition(e.target.value as AuditFinding["conditionScore"])}>{options(["A - Good", "B - Fair", "C - Poor", "D - Critical"])}</select></label>
      <label>Operational status<select className={input} value={operational} onChange={(e) => setOperational(e.target.value as AuditFinding["operationalStatus"])}>{options(["Operational", "Degraded", "Non-Operational", "Inaccessible"])}</select></label><label>Responsible party<select className={input} value={responsible} onChange={(e) => setResponsible(e.target.value as AuditFinding["responsibleParty"])}>{options(["Contractor", "Owner / ESA", "Third-Party Specialist"])}</select></label></div>
      <p className="text-sm">Deadline: {discovered && /^\d{4}-\d{2}-\d{2}$/.test(discovered) ? calculateDeadline(discovered, urgency, data.auditSettings) : "Select date"} (UTC calendar days)</p>
      <label className="block">Contractor<input required className={input} value={contractor} onChange={(e) => setContractor(e.target.value)} /></label><label className="block">Title<input required className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></label><label className="block">Observation<textarea required className={input} value={observation} onChange={(e) => setObservation(e.target.value)} /></label><label className="block">Recommended remedy<textarea required className={input} value={remedy} onChange={(e) => setRemedy(e.target.value)} /></label><button className={button} disabled={!authorized || busy}>Save finding</button></form></div>}
  </main>;
}
