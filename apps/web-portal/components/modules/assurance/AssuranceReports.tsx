"use client";
import React, { useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { z } from "zod";
import type { DemoData } from "@/lib/cafm-store";
import { auditSystem } from "@/lib/audit-assurance-seed";
import { calculateDeadline as strictDeadline, urgencyLevels, findingTypes, type AuditFinding, type AuditImport, type AuditSettings, type AuditUrgency } from "@/lib/audit-assurance-types";
import { defaultAuditSettings } from "@/lib/audit-assurance-types";
import { metrics, validatedContractor } from "@/lib/assurance-analytics";

type Props = { data: DemoData; actor: string; authorized: boolean; busy: boolean; save: (next: DemoData, message: string) => Promise<boolean> };
const field = "w-full border p-1";
const calculateDeadline = (date: string, urgency: AuditUrgency, settings?: AuditSettings) => z.iso.date().safeParse(date).success ? strictDeadline(date, urgency, settings) : "invalid date";
export function AssuranceReports({ data, actor, authorized, busy, save }: Props) {
  const [building, setBuilding] = useState(""), [campaignId, setCampaignId] = useState(""), [summary, setSummary] = useState(""), [stage, setStage] = useState<AuditImport | null>(null), [error, setError] = useState("");
  const [rejectId, setRejectId] = useState("");
  const all = data.auditFindings ?? [], filtered = all.filter((f) => !building || f.buildingId === building);
  const report = () => {
    try {
      const doc = new jsPDF(); let y = 18;
      const add = (text: string) => { const lines = doc.splitTextToSize(text, 180) as string[]; for (const line of lines) { if (y > 275) { doc.addPage(); y = 18; } doc.text(line, 15, y); y += 6; } };
      add(building ? `Technical Appendix: ${building}` : "Executive Audit Assurance Report"); add(`Site ${data.sites[0]} | Generated ${new Date().toISOString()} | ${actor}`); add(`Executive summary: ${summary || "No executive note provided."}`);
      add(`Urgency distribution: ${urgencyLevels.map((u) => `${u}: ${filtered.filter((f) => f.urgency === u).length}`).join(" | ")}`);
      const m = metrics(filtered, data.auditSettings ?? defaultAuditSettings, new Date().toISOString().slice(0, 10));
      add(`Validated contractor SLA: ${m.score === null ? "N/A" : `${m.score.toFixed(1)}%`} | evaluated ${m.evaluated.length} | illustrative EUR ${m.financial.toFixed(2)}`);
      for (const f of filtered.filter((item) => item.validationStatus !== "PendingValidation")) {
        add(`${f.id} | ${f.urgency} | ${f.validationStatus} | ${f.buildingId}/${f.roomId} | ${f.equipmentId}`);
        add(`${f.observation} | Remedy: ${f.recommendedRemedy} | State: ${f.assuranceState}`);
        for (const [label, images] of [["Before", f.evidence.beforePhotos], ["After", f.evidence.afterPhotos]] as const) {
          for (const img of images) { if (/^data:image\/(?:jpeg|png);base64,/i.test(img)) { if (y > 220) { doc.addPage(); y = 18; } add(label); doc.addImage(img, img.startsWith("data:image/png") ? "PNG" : "JPEG", 15, y, 55, 38); y += 42; } else add(img.startsWith("data:") ? `${label}: image format not embedded; see register.` : `${label} evidence reference: ${img}`); }
        }
      }
      doc.save(`audit-assurance-${building || data.sites[0]}.pdf`);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Report export failed."); }
  };
  const upload = async (file: File) => {
    setError("");
    try {
      if (!campaignId) throw new Error("Select the target campaign first.");
      if (file.size > 10 * 1024 * 1024) throw new Error("Import exceeds 10 MB.");
      if (!/\.(xlsx|xls|csv|pdf)$/i.test(file.name)) throw new Error("Select an XLSX, XLS, CSV or PDF report.");
      const pdf = /\.pdf$/i.test(file.name);
      const book = pdf ? null : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const rows = book ? XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: "", raw: false }) : [{}];
      if (!rows.length || rows.length > 2000) throw new Error("Import must contain 1–2000 rows with column headers.");
      const value = (row: Record<string, unknown>, ...keys: string[]) => String(keys.map((key) => row[key]).find((item) => item !== undefined && String(item).trim()) ?? "").trim();
      const draft: AuditImport = { id: crypto.randomUUID(), siteId: data.sites[0], campaignId, fileName: file.name, createdAt: new Date().toISOString(), rows: rows.map((row) => {
        const candidate = value(row, "Urgency", "urgency").toUpperCase();
        return { id: crypto.randomUUID(), approved: false, findingId: value(row, "Finding ID", "FindingId", "id") || `FND-${crypto.randomUUID()}`, buildingId: value(row, "Building", "buildingId"), equipmentId: value(row, "Equipment", "Asset Code", "equipmentId"), component: value(row, "Component", "component"), urgency: urgencyLevels.find((u) => u === candidate) ?? "", discoveredAt: value(row, "Discovery Date", "discoveredAt"), observation: value(row, "Observation", "observation"), remedy: value(row, "Remedy", "remedy"), image: value(row, "Image", "image") };
      }) };
      if (await save({ ...data, auditImports: [...(data.auditImports ?? []), draft] }, pdf ? "PDF registered for manual transcription; file content was not extracted or stored." : "Import staged; check every row before approval.")) setStage(draft);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Could not read import."); }
  };
  const persist = async () => { if (!stage) return; if (await save({ ...data, auditImports: (data.auditImports ?? []).map((s) => s.id === stage.id ? stage : s) }, "Staging edits saved.")) setError(""); };
  const commit = async () => {
    if (!stage) return;
    try {
      const campaign = (data.auditCampaigns ?? []).find((c) => c.id === stage.campaignId); if (!campaign) throw new Error("Campaign no longer exists.");
      const rows = stage.rows.filter((r) => r.approved); if (!rows.length) throw new Error("Approve at least one row.");
      const ids = new Set(all.map((f) => f.id));
      const additions: AuditFinding[] = rows.map((r) => {
        const asset = data.equipment.find((e) => e.EquipmentCode === r.equipmentId);
        if (!asset || asset.bl_id !== r.buildingId || !campaign.selectedEquipmentIds.includes(asset.EquipmentCode)) throw new Error(`${r.findingId}: asset must match the building and campaign scope.`);
        if (ids.has(r.findingId)) throw new Error(`${r.findingId}: duplicate ID.`); ids.add(r.findingId);
        if (!r.findingId.trim() || !r.component.trim() || !r.observation.trim() || !r.remedy.trim() || !r.urgency || !r.findingType || !r.conditionScore || !r.operationalStatus) throw new Error(`${r.findingId}: component, type, urgency, condition, operation, observation and remedy are required.`);
        const deadline = strictDeadline(r.discoveredAt, r.urgency, data.auditSettings), now = new Date().toISOString();
        return { id: r.findingId.trim(), campaignId: campaign.id, campaignName: campaign.name, siteId: campaign.siteId, buildingId: asset.bl_id, roomId: asset.RoomCode, systemName: auditSystem(asset.Category), equipmentId: asset.EquipmentCode, equipmentName: asset.EquipmentName, componentName: r.component.trim(), checkpointName: "Imported inspection", findingType: r.findingType, urgency: r.urgency, conditionScore: r.conditionScore, operationalStatus: r.operationalStatus, discoveredAt: r.discoveredAt, calculatedDeadline: deadline, title: r.observation.trim(), observation: r.observation.trim(), recommendedRemedy: r.remedy.trim(), responsibleParty: "Contractor", contractorName: "Unspecified — review required", trade: asset.PrimaryTradeId ?? "MultiTechnic", inspectorName: actor, inspectorPhotos: r.image ? [r.image] : [], validationStatus: "PendingValidation", aiIntelligenceFlags: [], assuranceState: "AwaitingValidation", evidence: { beforePhotos: [], afterPhotos: [], certificates: [], updatedDrawings: [], replacedParts: [], laborCostEUR: 0, materialCostEUR: 0 }, verification: {}, auditTrail: [{ id: crypto.randomUUID(), timestamp: now, actor, action: `Imported from ${stage.fileName}; technical validation required` }] };
      });
      const next = { ...stage, rows: stage.rows.filter((r) => !r.approved) };
      if (await save({ ...data, auditFindings: [...all, ...additions], auditImports: (data.auditImports ?? []).map((s) => s.id === stage.id ? next : s) }, `Imported ${additions.length} findings for technical validation.`)) { setStage(next); setError(""); }
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Import failed."); }
  };
  const edit = (id: string, patch: Partial<AuditImport["rows"][number]>) => setStage((current) => current && { ...current, rows: current.rows.map((r) => r.id === id ? { ...r, ...patch } : r) });
  return <section className="space-y-4 rounded border bg-white p-4"><h2 className="text-xl font-bold">Reports &amp; Legacy Import</h2><p>The PDF is an output; the finding register remains the system of record. Imported rows remain unvalidated until a technical reviewer classifies them.</p>{error && <p role="alert" className="rounded bg-red-50 p-2 text-red-800">{error}</p>}
    <div className="rounded border p-3"><h3 className="font-bold">Executive report / building appendix</h3><select className={field} value={building} onChange={(e) => setBuilding(e.target.value)}><option value="">Entire site</option>{data.buildings.map((b) => <option key={b.bl_id} value={b.bl_id}>{b.bl_id} · {b.Name}</option>)}</select><textarea className={field} placeholder="Executive summary" value={summary} onChange={(e) => setSummary(e.target.value)} /><p>{filtered.length} findings · {filtered.filter(validatedContractor).length} validated contractor findings</p><button className="rounded bg-blue-700 p-2 text-white" onClick={report}>Download PDF</button></div>
    <div className="rounded border p-3"><h3 className="font-bold">Import legacy report</h3><p className="text-sm">XLSX/XLS/CSV: use columns Finding ID, Building, Equipment, Component, Urgency, Discovery Date (YYYY-MM-DD), Observation, Remedy and Image. PDFs start a blank manual transcription; content is not stored or extracted. No AI extraction is configured.</p><select className={field} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">Select campaign</option>{(data.auditCampaigns ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input disabled={!authorized || busy} type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} /><select className={field} value={stage?.id ?? ""} onChange={(e) => setStage((data.auditImports ?? []).find((s) => s.id === e.target.value) ?? null)}><option value="">Select staged import</option>{(data.auditImports ?? []).map((s) => <option key={s.id} value={s.id}>{s.fileName} · {s.rows.length} rows</option>)}</select></div>
    {stage && <button disabled={!authorized || busy} className="rounded border p-2 disabled:opacity-50" onClick={() => setStage({ ...stage, rows: [...stage.rows, { id: crypto.randomUUID(), approved: false, findingId: `FND-${crypto.randomUUID()}`, buildingId: "", equipmentId: "", component: "", urgency: "", discoveredAt: "", observation: "", remedy: "", image: "" }] })}>Add manual staging row</button>}
    {stage && <div className="grid gap-2 md:grid-cols-3">{stage.rows.map((r) => <label key={r.id} className="text-sm">{r.findingId} · finding type<select className={field} value={r.findingType ?? ""} onChange={(e) => edit(r.id, { findingType: e.target.value ? e.target.value as AuditFinding["findingType"] : undefined })}><option value="">Select type</option>{findingTypes.map((type) => <option key={type}>{type}</option>)}</select></label>)}</div>}
    {stage && <div><label>Reject staged row<select className={field} value={rejectId} onChange={(e) => setRejectId(e.target.value)}><option value="">Select row</option>{stage.rows.map((r) => <option key={r.id} value={r.id}>{r.findingId} · {r.component || "unidentified component"}</option>)}</select></label><button disabled={!authorized || busy || !rejectId} className="rounded border p-2 disabled:opacity-50" onClick={() => { if (!window.confirm("Remove this staged row? Save staging to persist the rejection.")) return; setStage({ ...stage, rows: stage.rows.filter((r) => r.id !== rejectId) }); setRejectId(""); }}>Reject selected row</button></div>}
    {stage && <><p>Editing {stage.fileName}; changes must be saved or committed. Asset codes are exact matches; unknown/mismatched assets cannot be committed.</p><div className="max-h-[60vh] overflow-auto">{stage.rows.map((r) => { const asset = data.equipment.find((e) => e.EquipmentCode === r.equipmentId); return <div key={r.id} className="grid gap-1 border p-2 md:grid-cols-4"><label><input type="checkbox" checked={r.approved} onChange={(e) => edit(r.id, { approved: e.target.checked })} /> Approve</label>{(["findingId", "buildingId", "equipmentId", "component", "discoveredAt", "observation", "remedy", "image"] as const).map((key) => <label key={key} className="text-xs">{key}<input className={field} value={r[key]} onChange={(e) => edit(r.id, { [key]: e.target.value })} /></label>)}<label>Urgency<select className={field} value={r.urgency} onChange={(e) => edit(r.id, { urgency: e.target.value as typeof r.urgency })}><option value="">Select</option>{urgencyLevels.map((u) => <option key={u}>{u}</option>)}</select></label><label>Condition<select className={field} value={r.conditionScore ?? ""} onChange={(e) => edit(r.id, { conditionScore: e.target.value as typeof r.conditionScore })}><option value="">Select</option>{["A - Good", "B - Fair", "C - Poor", "D - Critical"].map((s) => <option key={s}>{s}</option>)}</select></label><label>Operation<select className={field} value={r.operationalStatus ?? ""} onChange={(e) => edit(r.id, { operationalStatus: e.target.value as typeof r.operationalStatus })}><option value="">Select</option>{["Operational", "Degraded", "Non-Operational", "Inaccessible"].map((s) => <option key={s}>{s}</option>)}</select></label><p className="text-sm">{asset && asset.bl_id === r.buildingId ? `Matched: ${asset.EquipmentName}` : "⚠ Unmatched / incorrect building"}</p><p className="text-sm">Deadline: {r.urgency && r.discoveredAt && /^\d{4}-\d{2}-\d{2}$/.test(r.discoveredAt) && !Number.isNaN(Date.parse(`${r.discoveredAt}T00:00:00Z`)) ? calculateDeadline(r.discoveredAt, r.urgency, data.auditSettings) : "select urgency and valid date"}</p></div>; })}</div><div className="flex gap-2"><button disabled={!authorized || busy} className="rounded border p-2 disabled:opacity-50" onClick={() => void persist()}>Save staging</button><button disabled={!authorized || busy} className="rounded bg-blue-700 p-2 text-white disabled:opacity-50" onClick={() => void commit()}>Commit approved rows</button></div></>}
  </section>;
}
