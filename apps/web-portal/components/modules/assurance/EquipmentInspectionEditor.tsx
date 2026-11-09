"use client";
import React, { useState } from "react";
import type { Equipment } from "@cafm/shared-schema";
import type { AuditCampaign, AuditInspection } from "../../../lib/audit-assurance-types";
import { calculateEquipmentInspectionSummary, classifications, type CheckpointResult, type CheckpointTemplate, type EquipmentInspectionSheet, type KmisConfig } from "../../../lib/equipment-inspection";

type DraftRow = Omit<CheckpointResult, "classification"> & { classification: CheckpointResult["classification"] | "" };
const classificationColours: Record<CheckpointResult["classification"], string> = { N0: "#047857", N1: "#0369a1", N2: "#b45309", N3: "#c2410c", N4: "#b91c1c", NV: "#475569", ST: "#7e22ce", NA: "#6b7280" };
type Props = { asset: Equipment; campaign: AuditCampaign; route?: AuditInspection; template: CheckpointTemplate; config: KmisConfig; inspector: string; busy: boolean; existing?: EquipmentInspectionSheet; version: string; onSubmit: (sheet: EquipmentInspectionSheet, version: string) => Promise<void>; onClose: () => void };
export function EquipmentInspectionEditor({ asset, campaign, route, template, config, inspector, busy, existing, version, onSubmit, onClose }: Props) {
  const [baseline] = useState(version);
  const [rows, setRows] = useState<DraftRow[]>(() => existing?.checkpointResults ?? template.checkpoints.map((c) => ({ checkpointId: c.id, checkpointName: c.name, weight: c.defaultWeight, classification: "", comment: "", photoUrls: [] })));
  const [operational, setOperational] = useState<EquipmentInspectionSheet["operationalStatus"]>(existing?.operationalStatus ?? "Operational");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const summary = calculateEquipmentInspectionSummary(rows.filter((r): r is CheckpointResult => r.classification !== ""), config);
  const scored = (["N0", "N1", "N2", "N3", "N4"] as const).some((key) => summary.weightedSummary[key] > 0);
  const update = (index: number, patch: Partial<DraftRow>) => setRows((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));
  const photo = (index: number, file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) { setError("Select a PNG, JPEG or WebP under 2 MB."); return; }
    const reader = new FileReader();
    reader.onerror = () => setError("Photo could not be read.");
    reader.onload = () => { if (typeof reader.result === "string") update(index, { photoUrls: [...rows[index].photoUrls, reader.result] }); else setError("Photo could not be read."); };
    reader.readAsDataURL(file);
  };
  const submit = async () => {
    setError("");
    if (!inspector.trim() || rows.some((r) => !r.classification)) { setError("Select an inspector and classify every checkpoint."); return; }
    const results = rows.filter((r): r is CheckpointResult => r.classification !== "");
    if (busy || submitting) return;
    setSubmitting(true);
    try { await onSubmit({ id: existing?.id ?? crypto.randomUUID(), campaignId: campaign.id, siteId: asset.SiteId, buildingId: asset.bl_id, roomId: asset.RoomCode, systemName: existing?.systemName ?? route?.systemName ?? "Other Technical Systems", equipmentId: asset.EquipmentCode, equipmentName: asset.EquipmentName, equipmentCategory: template.equipmentCategory, inspectorName: inspector, inspectedAt: new Date().toISOString(), status: "Completed", operationalStatus: operational, routeId: existing?.routeId ?? route?.id, checkpointResults: results, scoringConfig: config, ...calculateEquipmentInspectionSummary(results, config) }, baseline); }
    catch (e) { setError(e instanceof Error ? e.message : "Inspection could not be saved."); }
    finally { setSubmitting(false); }
  };
  return <section className="space-y-3 rounded border bg-white p-4">
    <div className="flex justify-between"><h2 className="font-bold">Equipment Condition Inspection Sheet · {asset.EquipmentName}</h2><button onClick={onClose}>Close</button></div>
    <p>{campaign.name} · {asset.EquipmentCode} · {template.equipmentCategory} {existing && " · Edit / Re-Inspect Equipment Sheet"}</p>
    <div className="rounded bg-slate-100 p-3">{classifications.map((key) => <span className="mr-3" key={key}>{key}: {key === "NV" || key === "ST" || key === "NA" ? summary.weightedSummary[key] : summary.weightedSummary[key].toFixed(2)}</span>)} → Calculated Condition Rating: {scored ? `${summary.calculatedConditionRatingPercent}%` : "Not scored"}<progress className="block w-full" value={scored ? summary.calculatedConditionRatingPercent : 0} max={100} /></div>
    <p className="text-sm">Illustrative calibrated KMIS score, not a contractual rating. NV, ST and NA are excluded from the denominator.</p>
    <label>Operational status <select disabled={busy} value={operational} onChange={(e) => setOperational(e.target.value as EquipmentInspectionSheet["operationalStatus"])}>{["Operational", "Degraded", "Non-Operational", "ST_NotTested", "NV_Inaccessible"].map((x) => <option key={x}>{x}</option>)}</select></label>
    <button disabled={busy} className="rounded border px-2 py-1" onClick={() => setRows((current) => current.map((r) => r.classification ? r : { ...r, classification: "N0" }))}>Quick Set All Unrated to N0</button>
    {rows.map((row, i) => <div key={row.checkpointId} className="space-y-1 border-t py-2"><strong>{row.checkpointName}</strong> · weight {row.weight}<div className="flex flex-wrap gap-1">{classifications.map((v) => <button key={v} disabled={busy} aria-pressed={row.classification === v} style={{ backgroundColor: row.classification === v ? classificationColours[v] : "white", color: row.classification === v ? "white" : classificationColours[v], borderColor: classificationColours[v] }} className="rounded border px-2 py-1" onClick={() => update(i, { classification: v })}>{v === "NA" ? "N/A" : v}</button>)}</div><input disabled={busy} className="w-full border p-1" placeholder="Inspector comment" value={row.comment} onChange={(e) => update(i, { comment: e.target.value })} /><label>Photo <input disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => photo(i, e.target.files?.[0])} /></label> {row.photoUrls.length} attached</div>)}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button className="rounded bg-blue-700 p-2 text-white disabled:opacity-50" disabled={busy || submitting} onClick={() => void submit()}>{existing ? "✓ Save & Update Inspection + Sync Findings" : "✓ Complete Inspection & Auto-Generate Findings"}</button>
  </section>;
}
