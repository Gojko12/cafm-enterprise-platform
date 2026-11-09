"use client";
import React, { useState } from "react";
import type { DemoData } from "@/lib/cafm-store";
import { actionable, correctiveWR, trail } from "@/lib/assurance-workflow";
import type { AuditFinding } from "@/lib/audit-assurance-types";

type Props = { data: DemoData; actor: string; authorized: boolean; canFJ: boolean; canLJ: boolean; canPM: boolean; busy: boolean; save: (next: DemoData, message: string) => Promise<boolean> };
export function CorrectiveActions({ data, actor, authorized, canFJ, canLJ, canPM, busy, save }: Props) {
  const findings = data.auditFindings ?? [], candidates = findings.filter(actionable);
  const [ids, setIds] = useState<string[]>([]), [type, setType] = useState<"FJ" | "LJ">("FJ"), [pmId, setPmId] = useState(""), [budget, setBudget] = useState(""), [justification, setJustification] = useState("");
  const selected = candidates.filter((f) => ids.includes(f.id));
  const permitted = authorized && (type === "FJ" ? canFJ : canLJ);
  const pmCandidates = selected.length === 1 ? data.workRequests.filter((w) => w.WR_Type === "PM" && w.Percentage < 78 && w.Percentage !== 27 && w.ScheduleId && w.EquipmentCodes.includes(selected[0].equipmentId)).sort((a, b) => (a.DueDate ?? "9999").localeCompare(b.DueDate ?? "9999")) : [];
  const updateFindings = (fn: (f: AuditFinding) => AuditFinding) => findings.map((f) => ids.includes(f.id) ? fn(f) : f);
  const create = async () => {
    try {
      if (!permitted || selected.length !== ids.length || !selected.length) throw new Error("Select actionable findings and ensure work-request creation permission.");
      const wr = correctiveWR(data, selected, type, actor);
      const next = updateFindings((f) => ({ ...f, linkedWrId: wr.WR_ID, ...(selected.length > 1 ? { workPackageId: wr.WR_ID } : {}), correctiveActionType: selected.length > 1 ? "CollectiveWorkPackage" : "IndividualWR", assuranceState: "CorrectiveWorkInProgress", auditTrail: trail(f, actor, `Created ${type} ${wr.WR_ID}.`) }));
      if (await save({ ...data, workRequests: [...data.workRequests, wr], auditFindings: next }, `Created ${wr.WR_ID}.`)) setIds([]);
    } catch (error) { alert(error instanceof Error ? error.message : "Could not create work."); }
  };
  const linkPM = async () => {
    try {
      if (!authorized || !canPM || selected.length !== 1 || ids.length !== 1 || !["N1", "N2"].includes(selected[0].urgency)) throw new Error("Select one N1/N2 finding and ensure PM checklist permission.");
      const wr = pmCandidates.find((w) => w.WR_ID === pmId);
      if (!wr || wr.IsFrozen || !wr.ScheduleId || !wr.ChecklistStandardCode && !data.schedules.some((s) => s.ScheduleId === wr.ScheduleId)) throw new Error("Select an unfrozen open scheduled PM for this equipment.");
      if (!wr.ChecklistSteps?.length && wr.ChecklistInstances?.length) throw new Error("This PM has instance-only checklist data; restore its checklist definition before adding audit work.");
      const f = selected[0], blueprint = data.schedules.find((s) => s.ScheduleId === wr.ScheduleId)?.ChecklistCode ?? wr.ChecklistStandardCode;
      const asset = data.equipment.find((item) => item.EquipmentCode === f.equipmentId);
      if (!asset || asset.bl_id !== f.buildingId || asset.RoomCode !== f.roomId || wr.bl_id !== asset.bl_id || wr.LevelName !== asset.LevelName || wr.RoomCode !== asset.RoomCode) throw new Error("Equipment or PM location differs from the finding; resolve the location before linking.");
      if (!blueprint) throw new Error("PM checklist reference is missing.");
      const stepId = crypto.randomUUID(), title = `${f.id}: ${f.componentName}`, instructions = `${f.observation}\nRemedy: ${f.recommendedRemedy}\n${f.urgency} due ${f.calculatedDeadline}`;
      const step = { StepId: stepId, Title: title, Instructions: instructions, SortOrder: Math.max(0, ...(wr.ChecklistSteps ?? []).map((s) => s.SortOrder)) + 1, InputType: "Boolean" as const, favourableBoolean: true, Options: [], RequiresPhotoOnFailure: true, RequiresCommentOnFailure: true, IsRequired: true };
      const instance = { StepInstanceId: `${wr.WR_ID}:${stepId}`, WR_ID: wr.WR_ID, ScheduleId: wr.ScheduleId, ChecklistCode: blueprint, ...step, PhotoIds: [], IsFailed: false, IsCompleted: false };
      const now = new Date().toISOString();
      const nextWr = { ...wr, ChecklistSteps: [...(wr.ChecklistSteps ?? []), step], ChecklistInstances: [...(wr.ChecklistInstances ?? []), instance], Attachments: [...(wr.Attachments ?? []), ...f.inspectorPhotos.map((url, i) => ({ id: crypto.randomUUID(), name: `${f.id} inspector photo ${i + 1}`, type: "image", dataUrl: url }))], StepAuditLogs: [...(wr.StepAuditLogs ?? []), { AuditLogId: crypto.randomUUID(), StepInstanceId: instance.StepInstanceId, WR_ID: wr.WR_ID, ActorId: actor, Action: "created" as const, NewValue: step, OccurredAt: now }], Activity: [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log" as const, actorId: actor, actorName: actor, actorRole: "QA Inspector", createdAt: now, text: `Added audit finding ${f.id} to this PM.` }] };
      const updated = updateFindings((item) => ({ ...item, linkedWrId: wr.WR_ID, linkedPmScheduleId: wr.ScheduleId, correctiveActionType: "NextPMVisit", assuranceState: "CorrectiveWorkInProgress", auditTrail: trail(item, actor, `Added to PM ${wr.WR_ID}.`) }));
      if (await save({ ...data, workRequests: data.workRequests.map((item) => item.WR_ID === wr.WR_ID ? nextWr : item), auditFindings: updated }, `Finding added to ${wr.WR_ID}.`)) { setIds([]); setPmId(""); }
    } catch (error) { alert(error instanceof Error ? error.message : "Could not link PM."); }
  };
  const proposal = async () => {
    const amount = Number(budget);
    if (!authorized || selected.length !== 1 || ids.length !== 1 || !budget.trim() || !Number.isFinite(amount) || amount < 0 || !justification.trim()) { alert("Select one finding and provide a non-negative CAPEX estimate and lifecycle justification."); return; }
    const id = `INV-${crypto.randomUUID()}`, now = new Date().toISOString();
    const next = updateFindings((f) => ({ ...f, investmentProjectId: id, investmentProposal: { id, estimatedCapexEUR: amount, lifecycleJustification: justification.trim(), createdBy: actor, createdAt: now }, correctiveActionType: "InvestmentProject", assuranceState: "CorrectiveWorkInProgress", auditTrail: trail(f, actor, `Investment proposal ${id} created.`, justification.trim()) }));
    if (await save({ ...data, auditFindings: next }, `Proposal ${id} saved; it is not an approved project.`)) { setIds([]); setBudget(""); setJustification(""); }
  };
  return <section className="space-y-3 rounded border bg-white p-4"><h2 className="text-xl font-bold">Corrective Actions</h2><p className="text-sm">Select validated, unlinked N1–N4 findings. Collective jobs must share a room and trade so their location remains accurate. Technician steps are generated from the finding, not AI.</p>
    <div className="max-h-72 overflow-auto border">{candidates.map((f) => <label key={f.id} className="block border-b p-2"><input type="checkbox" checked={ids.includes(f.id)} onChange={(e) => setIds(e.target.checked ? [...ids, f.id] : ids.filter((id) => id !== f.id))} /> {f.id} · {f.urgency} · {f.buildingId}/{f.roomId} · {f.trade} · {f.title}</label>)}</div>
    <div className="grid gap-4 lg:grid-cols-3"><div className="rounded border p-3"><h3 className="font-semibold">Individual / collective WR</h3><select value={type} onChange={(e) => setType(e.target.value as "FJ" | "LJ")} className="my-2 w-full border p-2"><option>FJ</option><option>LJ</option></select><button disabled={!permitted || busy || !selected.length} onClick={() => void create()} className="rounded bg-blue-700 p-2 text-white disabled:opacity-50">Create {selected.length > 1 ? "collective package" : "individual WR"}</button></div>
      <div className="rounded border p-3"><h3 className="font-semibold">Add to next open PM (N1/N2)</h3><select className="my-2 w-full border p-2" value={pmId} onChange={(e) => setPmId(e.target.value)}><option value="">Select scheduled PM</option>{pmCandidates.map((w) => <option key={w.WR_ID} value={w.WR_ID}>{w.WR_ID} · due {w.DueDate ?? "unknown"}</option>)}</select><button disabled={!authorized || !canPM || busy || !pmId} onClick={() => void linkPM()} className="rounded bg-blue-700 p-2 text-white disabled:opacity-50">Add checklist item</button></div>
      <div className="rounded border p-3"><h3 className="font-semibold">Investment proposal</h3><input className="my-2 w-full border p-2" type="number" min="0" step="0.01" placeholder="Estimated CAPEX EUR" value={budget} onChange={(e) => setBudget(e.target.value)} /><textarea className="w-full border p-2" placeholder="Lifecycle justification" value={justification} onChange={(e) => setJustification(e.target.value)} /><button disabled={!authorized || busy || selected.length !== 1} onClick={() => void proposal()} className="rounded bg-blue-700 p-2 text-white disabled:opacity-50">Save proposal</button></div></div>
    <h3 className="font-semibold">Linked work and proposals</h3>{findings.filter((f) => f.linkedWrId || f.investmentProposal).map((f) => <p key={f.id}>{f.id} · {f.assuranceState} · {f.linkedWrId ?? f.investmentProposal?.id}{f.investmentProposal && ` · EUR ${f.investmentProposal.estimatedCapexEUR} · ${f.investmentProposal.lifecycleJustification}`}</p>)}
  </section>;
}
