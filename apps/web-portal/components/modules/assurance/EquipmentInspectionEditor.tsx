"use client";
import React, { useState } from "react";
import type { Equipment } from "@cafm/shared-schema";
import type { AuditCampaign, AuditInspection } from "../../../lib/audit-assurance-types";
import { calculateEquipmentInspectionSummary, classifications, type CheckpointResult, type CheckpointTemplate, type EquipmentInspectionSheet, type KmisConfig } from "../../../lib/equipment-inspection";

type DraftRow = Omit<CheckpointResult, "classification"> & { classification: CheckpointResult["classification"] | "" };
const classificationColours: Record<CheckpointResult["classification"], string> = { N0: "#047857", N1: "#0369a1", N2: "#b45309", N3: "#c2410c", N4: "#b91c1c", NV: "#475569", ST: "#7e22ce", NA: "#6b7280" };
type Props = { asset: Equipment; campaign: AuditCampaign; route?: AuditInspection; template: CheckpointTemplate; config: KmisConfig; inspector: string; busy: boolean; existing?: EquipmentInspectionSheet; version: string; submitLabel?: string; onSubmit: (sheet: EquipmentInspectionSheet, version: string) => Promise<void>; onClose: () => void };
export function EquipmentInspectionEditor({ asset, campaign, route, template, config, inspector, busy, existing, version, submitLabel, onSubmit, onClose }: Props) {
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
  const pill = (v: string) => v === "NA" ? "N/A" : v;
  return <section className="space-y-3 rounded-2xl border bg-white p-3 pb-4">
    <div className="flex items-start justify-between gap-2"><h2 className="text-sm font-bold">{asset.EquipmentName}</h2><button className="rounded border px-2 py-0.5 text-xs" onClick={onClose}>Close</button></div>
    <p className="text-xs text-slate-600">{campaign.name} · {asset.EquipmentCode} · {template.equipmentCategory} {existing && " · Edit / Re-Inspect Equipment Sheet"}</p>
    <div className="sticky top-0 z-10 rounded-xl bg-slate-900 p-2.5 text-xs text-white">
      <div className="flex items-center justify-between"><span className="text-xl font-bold">{scored ? `${summary.calculatedConditionRatingPercent}%` : "Not scored"}</span><span className="text-[10px] text-slate-300">Calculated Condition Rating</span></div>
      <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-[11px]">{classifications.map((key) => <span key={key}>{key}: {key === "NV" || key === "ST" || key === "NA" ? summary.weightedSummary[key] : summary.weightedSummary[key].toFixed(2)}</span>)}</div>
      <progress className="mt-1 block h-1.5 w-full" value={scored ? summary.calculatedConditionRatingPercent : 0} max={100} />
    </div>
    <p className="text-[11px] text-slate-500">Illustrative calibrated KMIS score, not a contractual rating. NV, ST and NA are excluded from the denominator.</p>
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs">Operational status <select className="rounded border p-1" disabled={busy} value={operational} onChange={(e) => setOperational(e.target.value as EquipmentInspectionSheet["operationalStatus"])}>{["Operational", "Degraded", "Non-Operational", "ST_NotTested", "NV_Inaccessible"].map((x) => <option key={x}>{x}</option>)}</select></label>
      <button disabled={busy} className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium" onClick={() => setRows((current) => current.map((r) => r.classification ? r : { ...r, classification: "N0" }))}>Set unrated → N0</button>
    </div>
    {rows.map((row, i) => <div key={row.checkpointId} className="space-y-1.5 rounded-xl border border-slate-200 p-2"><div className="flex justify-between gap-2 text-sm"><strong>{row.checkpointName}</strong><span className="text-[11px] text-slate-400">w {row.weight}</span></div><div className="flex flex-wrap gap-1">{classifications.map((v) => <button key={v} disabled={busy} aria-pressed={row.classification === v} style={{ backgroundColor: row.classification === v ? classificationColours[v] : "white", color: row.classification === v ? "white" : classificationColours[v], borderColor: classificationColours[v] }} className="min-h-[44px] min-w-[44px] rounded-full border px-3 text-sm font-semibold" onClick={() => update(i, { classification: v })}>{pill(v)}</button>)}</div><details className="text-xs" open={Boolean(row.comment || row.photoUrls.length)}><summary className="cursor-pointer text-slate-500">Comment / photo{row.photoUrls.length ? ` ? ${row.photoUrls.length} attached` : ""}</summary><div className="mt-1 flex items-center gap-2"><input disabled={busy} className="min-w-0 flex-1 rounded border p-1.5" placeholder="Inspector comment" value={row.comment} onChange={(e) => update(i, { comment: e.target.value })} /><label className="cursor-pointer rounded-full border px-3 py-1.5"><svg viewBox="0 0 24 24" className="mr-1 inline h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>Photo<input className="hidden" disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={(e) => photo(i, e.target.files?.[0])} /></label></div></details></div>)}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <button className="sticky bottom-20 min-h-[44px] w-full rounded-xl bg-blue-700 p-2 font-semibold text-white shadow-lg disabled:opacity-50 sm:static" disabled={busy || submitting} onClick={() => void submit()}>{submitLabel ?? (existing ? "\u2713 Save & Update Inspection + Sync Findings" : "\u2713 Complete Inspection & Auto-Generate Findings")}</button>
  </section>;
}
