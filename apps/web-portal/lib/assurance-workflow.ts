import { getInitialIssuedStatus } from "@cafm/shared-schema";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import type { AuditFinding } from "./audit-assurance-types";
import { allocateWorkRequestId } from "./wr-id-migration";

export const actionable = (f: AuditFinding) => ["Accepted", "AcceptedWithModification", "ContractorResponsibility", "OwnerResponsibility"].includes(f.validationStatus) && f.assuranceState === "Validated_ActionPending" && f.urgency !== "N0" && !f.linkedWrId && !f.investmentProjectId;
export const trail = (f: AuditFinding, actor: string, action: string, justification?: string): AuditFinding["auditTrail"] => [...f.auditTrail, { id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor, action, ...(justification ? { justification } : {}) }];

export function intelligence(f: AuditFinding, data: DemoData) {
  const asset = data.equipment.find((e) => e.EquipmentCode === f.equipmentId);
  const related = data.workRequests.filter((w) => w.EquipmentCodes.includes(f.equipmentId));
  const duplicates = (data.auditFindings ?? []).filter((other) => other.id !== f.id && other.equipmentId === f.equipmentId && other.componentName.trim().toLowerCase() === f.componentName.trim().toLowerCase());
  const open = related.filter((w) => w.Percentage < 78 && w.Percentage !== 27);
  const recent = related.filter((w) => [78, 100].includes(w.Percentage) && w.UpdatedAt && Math.abs(Date.parse(w.UpdatedAt) - Date.parse(`${f.discoveredAt}T00:00:00Z`)) <= 30 * 86400000);
  const alerts = [
    ...(duplicates.length ? [`Potential duplicate: ${duplicates.map((x) => x.id).join(", ")}`] : []),
    ...(open.length ? [`Existing open WR: ${open.map((x) => x.WR_ID).join(", ")}`] : []),
    ...(recent.length ? [`Recently completed WR: ${recent.map((x) => x.WR_ID).join(", ")}`] : []),
    ...(!asset || ["Disposed Of", "Sold", "Salvaged", "Out Of Service"].includes(asset.Status) || asset.bl_id !== f.buildingId || asset.RoomCode !== f.roomId ? ["Asset missing, moved or out of service: review registry"] : []),
    ...(duplicates.some((x) => x.discoveredAt < f.discoveredAt) ? ["Repeated observation in an earlier finding"] : []),
    ...f.aiIntelligenceFlags.filter((flag) => ["OutdatedPhoto", "InconsistentEquipmentCode", "AssetReplacedOrDecommissioned"].includes(flag)).map((flag) => `Recorded alert: ${flag} (unverified)`),
  ];
  return { asset, related, duplicates, alerts, recommendation: duplicates.length ? { classification: "Duplicate" as const, reason: `Same equipment and component as ${duplicates[0].id}; review before approval.` } : null };
}

export function correctiveWR(data: DemoData, findings: AuditFinding[], type: "FJ" | "LJ", actor: string): BaseWorkRequest {
  if (!findings.length || findings.some((f) => !actionable(f))) throw new Error("Every finding must be validated, actionable and unlinked.");
  const first = findings[0], asset = data.equipment.find((e) => e.EquipmentCode === first.equipmentId);
  if (!asset || asset.bl_id !== first.buildingId || asset.RoomCode !== first.roomId) throw new Error("The finding's equipment location has changed; validate it before creating work.");
  if (findings.some((f) => f.buildingId !== first.buildingId || f.roomId !== first.roomId || f.trade !== first.trade || !data.equipment.some((e) => e.EquipmentCode === f.equipmentId && e.bl_id === f.buildingId && e.RoomCode === f.roomId && e.LevelName === asset.LevelName))) throw new Error("A collective work request requires the same building, floor, room and trade.");
  const now = new Date().toISOString(), id = allocateWorkRequestId(data.workRequests, { site: first.siteId, deleted: data.deletedWorkRequests ?? [] });
  const details = findings.map((f) => `${f.id} | ${f.equipmentId} | ${f.componentName} | ${f.urgency} due ${f.calculatedDeadline}\n${f.observation}\nRemedy: ${f.recommendedRemedy}`).join("\n\n");
  return {
    WR_ID: id, WR_Type: type, ...getInitialIssuedStatus("Corrective Maintenance"), Description: `Audit corrective work: ${details}`,
    SiteId: first.siteId, bl_id: asset.bl_id, LevelName: asset.LevelName, RoomCode: asset.RoomCode, ProblemLocation: `${asset.bl_id} / ${asset.LevelName} / ${asset.RoomCode}`,
    TradeId: first.trade, TradeName: first.trade, EquipmentCodes: [...new Set(findings.map((f) => f.equipmentId))],
    Urgency: findings.map((f) => f.urgency).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))[0], DueDate: findings.map((f) => f.calculatedDeadline).sort()[0],
    CreatedDate: now.slice(0, 10), UpdatedAt: now, CreatedBy: actor, TotalTimeMinutes: 0, StartDateTBD: false, AssignedCraftpersonIds: [], AssignedUserIds: [], IsFrozen: false, RequiresSAT: false, RequiresDrawingUpdate: false, RequiresInventoryUpdate: false, AcceptanceGates: [],
    todoSteps: findings.map((f, index) => ({ id: crypto.randomUUID(), order: index + 1, title: `${f.id}: ${f.componentName}`, instruction: `${f.observation}\nRemedy: ${f.recommendedRemedy}\n${f.urgency} due ${f.calculatedDeadline}`, completed: false })),
    Attachments: findings.flatMap((f) => f.inspectorPhotos.map((url, i) => ({ id: crypto.randomUUID(), name: `${f.id} inspector photo ${i + 1}`, type: "image", dataUrl: url }))),
    Activity: [{ id: crypto.randomUUID(), kind: "log", actorId: actor, actorName: actor, actorRole: "QA Inspector", createdAt: now, text: `Corrective work created for ${findings.map((f) => f.id).join(", ")}.` }],
  };
}

export function reconcileAssurance<T extends { auditFindings?: AuditFinding[]; workRequests: { WR_ID: string; Percentage?: number }[] }>(state: T): T {
  if (!state.auditFindings) return state;
  let changed = false;
  const findings = state.auditFindings.map((f) => {
    const wr = state.workRequests.find((w) => w.WR_ID === f.linkedWrId);
    if (!wr) return f;
    if (f.assuranceState === "CorrectiveWorkInProgress" && (wr.Percentage ?? -1) >= 78) {
      changed = true;
      return { ...f, assuranceState: "WorkCompleted_AwaitingEvidence" as const, auditTrail: trail(f, "System", `Linked WR ${wr.WR_ID} reached ${wr.Percentage}%; evidence required.`) };
    }
    if (["WorkCompleted_AwaitingEvidence", "EvidenceAccepted_AwaitingVerification"].includes(f.assuranceState) && (wr.Percentage ?? -1) < 78) {
      changed = true;
      return { ...f, assuranceState: "CorrectiveWorkInProgress" as const, evidence: { ...f.evidence, evidenceAccepted: false }, auditTrail: trail(f, "System", `Linked WR ${wr.WR_ID} is no longer complete; evidence acceptance invalidated.`) };
    }
    return f;
  });
  return changed ? { ...state, auditFindings: findings } : state;
}
