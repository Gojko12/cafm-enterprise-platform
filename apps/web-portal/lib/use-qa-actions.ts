"use client";

import { WR_Statuses } from "@cafm/shared-schema";
import type { BaseWorkRequest, QAAuditReport } from "@cafm/shared-schema";
import { useActiveUserPermissions, useCafmStore } from "./cafm-store";
import { useSiteContext } from "./contexts/SiteContext";
import { useApp } from "./hooks/useApp";
import { qaVerdict, selectAudit, selectRandomAudits, swapAudit, transitionAudit } from "./qa-audits";
import type { QAOptions } from "./qa-audits";

export function useQAActions() {
  const { data, commitSnapshot } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const { currentRole } = useApp();
  const { profile, permissions, governance } = useActiveUserPermissions();
  const actor = { name: activePerson, role: permissions?.canCloseWR100 ? currentRole : "StandardEmployee" as const };
  const inScope = (wr: BaseWorkRequest) => !!profile && (wr.WR_Type === "PM" || wr.WR_Type === "FJ") &&
    permissions!.auditWRTypes.includes(wr.WR_Type) && permissions!.auditTrades.some((trade) => trade === wr.TradeName || trade === wr.TradeId) &&
    (!profile.vpaBuildingIds.length || profile.vpaBuildingIds.includes(wr.bl_id));
  const requireChoose = () => { if (!permissions?.canAuditChooseWRs) throw new Error("Permission required to choose audit work requests."); };
  const requireInspection = () => { if (!permissions?.canAuditDoInspection) throw new Error("Permission required to perform QA inspections."); };
  const requireInspector = (wr: BaseWorkRequest) => {
    if (!inScope(wr)) throw new Error(`${wr.WR_ID}: ${activePerson} is not permitted to inspect this trade and work request type.`);
  };
  const commit = async (update: (requests: BaseWorkRequest[]) => BaseWorkRequest[]) => {
    const site = data.workRequests.filter((wr) => wr.SiteId === activeSiteId);
    const updated = update(site);
    await commitSnapshot(data, { ...data, workRequests: [...data.workRequests.filter((wr) => wr.SiteId !== activeSiteId), ...updated] }, { optimistic: true });
  };
  return {
    autoSelect5PercentQAAudits: (options: QAOptions) => commit((wrs) => {
      requireChoose();
      if (options.targetCount !== undefined && !governance("canManageAuditQuotas")) throw new Error("Site governance does not permit changing audit quotas.");
      const allowed = wrs.filter(inScope);
      const assignments = [{ id: "active-profile", siteId: activeSiteId, personName: activePerson, trades: permissions!.auditTrades, wrTypes: permissions!.auditWRTypes }];
      const changed = new Map(selectRandomAudits(allowed, options, actor, assignments).map((wr) => [wr.WR_ID, wr]));
      return wrs.map((wr) => changed.get(wr.WR_ID) ?? wr);
    }),
    swapRandomQAAuditWR: (id: string) => commit((wrs) => {
      requireChoose();
      const target = wrs.find((wr) => wr.WR_ID === id);
      if (!target) throw new Error("Work request is no longer available.");
      requireInspector(target);
      const allowed = wrs.filter(inScope);
      const changed = new Map(swapAudit(allowed, id, actor).map((wr) => [wr.WR_ID, wr]));
      return wrs.map((wr) => changed.get(wr.WR_ID) ?? wr);
    }),
    manualSelectForQAAudit: (ids: string[], mode: "ManualInspectorPick" | "QRScanOnSite") => commit((wrs) => {
      requireChoose();
      if (!ids.length || ids.some((id) => !wrs.some((wr) => wr.WR_ID === id))) throw new Error("One or more selected work requests are unavailable.");
      return wrs.map((wr) => { if (!ids.includes(wr.WR_ID)) return wr; requireInspector(wr); return selectAudit(wr, mode, actor); });
    }),
    transitionAudits: (ids: string[], action: "confirm" | "unselect" | "direct") => commit((wrs) => {
      requireChoose();
      if (!ids.length || ids.some((id) => !wrs.some((wr) => wr.WR_ID === id))) throw new Error("One or more selected work requests are unavailable.");
      return wrs.map((wr) => { if (!ids.includes(wr.WR_ID)) return wr; requireInspector(wr); return transitionAudit(wr, action, actor); });
    }),
    submitQAVerdict: (id: string, verdict: "Pass" | "Fail" | "SubmitCorrection" | "VerifyClose", payload: Parameters<typeof qaVerdict>[3] & { spawnFollowUp?: boolean; failureReason?: string; additionalNotes?: string }) => commit((wrs) => {
      const parent = wrs.find((wr) => wr.WR_ID === id);
      if (!parent) throw new Error("Work request is no longer available.");
      if (verdict !== "SubmitCorrection") { requireInspection(); requireInspector(parent); }
      if (verdict === "Fail" && payload.reopen && !permissions?.canAuditReopenWR) throw new Error("Permission required to reopen work requests.");
      if (payload.spawnFollowUp && !permissions?.canOpenFollowUpFJ) throw new Error("Permission required to create a follow-up FJ.");
      if (verdict === "Pass" || verdict === "Fail") {
        if (parent.QA_AuditStatus !== "ToBeInspected" || ![78, 100].includes(parent.Percentage)) throw new Error("A completed work request confirmed for inspection is required.");
        if (verdict === "Fail" && !payload.issue?.trim()) throw new Error("An issue description is required.");
        const now = new Date().toISOString();
        const staged: BaseWorkRequest = { ...parent, QA_AuditStatus: verdict === "Pass" ? "QA_Staged_Pass" : "QA_Staged_Fail",
          qaStagedVerdict: { verdict, inspector: activePerson, stagedAt: now, failureReason: payload.failureReason, additionalNotes: payload.additionalNotes,
            issueDescription: payload.issue, reopenTo50: verdict === "Fail" && !!payload.reopen, spawnFollowUpFJ: verdict === "Fail" && !!payload.spawnFollowUp },
          UpdatedAt: now, Activity: [...(parent.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now, text: `QA ${verdict} staged by ${actor.name}; pending batch commit.` }] };
        return wrs.map((wr) => wr.WR_ID === id ? staged : wr);
      }
      const updated = qaVerdict(parent, verdict, actor, payload);
      return wrs.map((wr) => wr.WR_ID === id ? updated : wr);
    }),
    unstageVerdict: (id: string) => commit((wrs) => {
      requireInspection();
      const wr = wrs.find((item) => item.WR_ID === id);
      if (!wr || !wr.qaStagedVerdict || !["QA_Staged_Pass", "QA_Staged_Fail"].includes(wr.QA_AuditStatus ?? "")) throw new Error("Staged verdict is no longer available.");
      requireInspector(wr);
      const now = new Date().toISOString();
      return wrs.map((item) => item.WR_ID !== id ? item : { ...item, QA_AuditStatus: "ToBeInspected", qaStagedVerdict: undefined, UpdatedAt: now,
        Activity: [...(item.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now, text: `Staged QA verdict removed by ${actor.name}.` }] });
    }),
    updateStagedOptions: (id: string, options: { reopenTo50?: boolean; spawnFollowUpFJ?: boolean }) => commit((wrs) => {
      requireInspection();
      const wr = wrs.find((item) => item.WR_ID === id);
      if (!wr?.qaStagedVerdict || wr.QA_AuditStatus !== "QA_Staged_Fail") throw new Error("Staged failure is no longer available.");
      requireInspector(wr);
      if (options.reopenTo50 && !permissions?.canAuditReopenWR) throw new Error("Permission required to reopen work requests.");
      if (options.spawnFollowUpFJ && !permissions?.canOpenFollowUpFJ) throw new Error("Permission required to create a follow-up FJ.");
      const staged = { ...wr.qaStagedVerdict, ...options };
      return wrs.map((item) => item.WR_ID === id ? { ...item, qaStagedVerdict: staged } : item);
    }),
    commitStagedBatch: async (ids: string[], recipients: string[], executiveSummary: string) => {
      requireInspection();
      const unique = [...new Set(ids)];
      const addressed = [...new Set(recipients.map((item) => item.trim()).filter(Boolean))];
      if (!unique.length || unique.length !== ids.length) throw new Error("Select a valid staged batch.");
      if (!addressed.length) throw new Error("Add at least one recipient.");
      const staged = unique.map((id) => {
        const wr = data.workRequests.find((item) => item.WR_ID === id && item.SiteId === activeSiteId);
        if (!wr?.qaStagedVerdict || wr.QA_AuditStatus !== `QA_Staged_${wr.qaStagedVerdict.verdict}` || ![78, 100].includes(wr.Percentage)) throw new Error(`${id}: staged verdict or completed status is no longer available.`);
        requireInspector(wr);
        if (wr.qaStagedVerdict.reopenTo50 && !permissions?.canAuditReopenWR) throw new Error(`${id}: permission required to reopen work requests.`);
        if (wr.qaStagedVerdict.spawnFollowUpFJ && !permissions?.canOpenFollowUpFJ) throw new Error(`${id}: permission required to create a follow-up FJ.`);
        return wr;
      });
      const used = new Set(data.workRequests.map((wr) => wr.WR_ID));
      const followUps: BaseWorkRequest[] = [];
      const items: QAAuditReport["items"] = [];
      const changes = new Map<string, BaseWorkRequest>();
      const now = new Date().toISOString();
      for (const parent of staged) {
        const decision = parent.qaStagedVerdict!;
        let updated = { ...qaVerdict({ ...parent, QA_AuditStatus: "ToBeInspected", qaStagedVerdict: undefined }, decision.verdict, actor, { issue: decision.issueDescription, reopen: decision.reopenTo50, photos: parent.QA_AuditPhotos }), QA_InspectedBy: decision.inspector };
        let followId: string | undefined;
        if (decision.verdict === "Fail" && decision.spawnFollowUpFJ) {
      const issued = WR_Statuses.find((status) => status.ESAWorkType === "Corrective Maintenance" && status.Percentage === 50);
      if (!issued) throw new Error("The 50% corrective maintenance status is not configured.");
      const year = now.slice(0, 4);
      const start = activeSiteId === "SITE-01" ? 300000 : activeSiteId === "SITE-02" ? 600000 : 900000;
      const limit = start + 99999;
      let sequence = start;
      while (sequence <= limit && used.has(`${year}${String(sequence).padStart(6, "0")}`)) sequence++;
      if (sequence > limit) throw new Error(`No QA follow-up numbers remain for ${activeSiteId} in ${year}.`);
      followId = `${year}${String(sequence).padStart(6, "0")}`;
      used.add(followId);
      const entry = { id: crypto.randomUUID(), kind: "log" as const, actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now, text: `Created QA corrective follow-up ${followId}.` };
      updated = { ...updated, Activity: [...(updated.Activity ?? []), entry] };
      const followUp: BaseWorkRequest = {
        WR_ID: followId, WR_Type: "FJ",
        Description: `QA Rework Follow-Up for ${parent.WR_ID}: ${decision.issueDescription!.trim()}`,
        ProblemLocation: parent.ProblemLocation, TradeId: parent.TradeId, TradeName: parent.TradeName,
        SiteId: parent.SiteId, bl_id: parent.bl_id, LevelName: parent.LevelName, RoomCode: parent.RoomCode,
        EquipmentCodes: [...parent.EquipmentCodes], OriginatingWR_ID: parent.WR_ID,
        ...(parent.WR_Type === "PM" ? { ParentPM_WR_ID: parent.WR_ID } : {}),
        ...(parent.WR_Type === "FJ" ? { OriginatingFJ_WR_ID: parent.WR_ID } : {}),
        ...issued, CreatedDate: now.slice(0, 10), UpdatedAt: now, CreatedBy: actor.name,
        AssignedCraftpersonIds: [], AssignedUserIds: [], TotalTimeMinutes: 0, StartDateTBD: false,
        IsFrozen: false, RequiresSAT: false, RequiresDrawingUpdate: false, RequiresInventoryUpdate: false,
        AcceptanceGates: [], Activity: [{ ...entry, id: crypto.randomUUID(), text: `Created as QA corrective follow-up for ${parent.WR_ID}.` }],
      };
      followUps.push(followUp);
        }
        updated = { ...updated, Activity: [...(updated.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now,
          text: `QA Inspection ${decision.verdict.toUpperCase()} committed by ${actor.name}${decision.issueDescription ? `. Reason: ${decision.issueDescription}` : ""}. In-app report addressed to: ${addressed.join(", ")}.` }] };
        changes.set(parent.WR_ID, updated);
        if (parent.WR_Type !== "PM" && parent.WR_Type !== "FJ") throw new Error("Unsupported QA work request.");
        items.push({ wrId: parent.WR_ID, wrType: parent.WR_Type, trade: parent.TradeName ?? "", buildingId: parent.bl_id,
          craftperson: parent.AssignedCraftpersonIds.map((id) => { const p = data.craftspeople.find((person) => person.id === id); return p ? `${p.Name} ${p.LastName}`.trim() : id; }).join(", "),
          verdict: decision.verdict, issueDescription: decision.issueDescription, reopenedTo50: decision.reopenTo50, followUpWrId: followId });
      }
      const tradeStats = [...new Set(items.map((item) => item.trade))].map((trade) => {
        const group = items.filter((item) => item.trade === trade), passed = group.filter((item) => item.verdict === "Pass").length;
        return { trade, inspected: group.length, passed, failed: group.length - passed, passRate: passed * 100 / group.length };
      });
      const passedCount = items.filter((item) => item.verdict === "Pass").length;
      const report: QAAuditReport = { id: crypto.randomUUID(), siteId: activeSiteId, createdAt: now, inspector: activePerson, executiveSummary, recipients: addressed,
        totalInspected: items.length, passedCount, failedCount: items.length - passedCount, tradeStats, items };
      await commitSnapshot(data, { ...data, workRequests: [...data.workRequests.map((wr) => changes.get(wr.WR_ID) ?? wr), ...followUps], qaAuditReports: [...(data.qaAuditReports ?? []), report] }, { optimistic: true });
    },
    annotateStep: (id: string, stepId: string, finding: string) => commit((wrs) => {
      requireInspection();
      const text = finding.trim();
      const wr = wrs.find((item) => item.WR_ID === id);
      if (!wr || wr.WR_Type !== "PM" || ![...(wr.ChecklistSteps ?? []), ...(wr.ChecklistInstances ?? [])].some((step) => step.StepId === stepId)) throw new Error("Checklist step is no longer available.");
      requireInspector(wr);
      if (wr.QA_AuditStatus !== "ToBeInspected") throw new Error("Confirm the inspection before adding a finding.");
      if (!text) throw new Error("Enter an inspector finding.");
      const now = new Date().toISOString();
      const entry = { id: crypto.randomUUID(), timestamp: now, performedBy: actor.name, actionType: "QA inspector finding", stepReference: stepId, details: text };
      return wrs.map((item) => item.WR_ID !== id ? item : { ...item, UpdatedAt: now, ChecklistHistory: [...(item.ChecklistHistory ?? []), entry], Activity: [...(item.Activity ?? []), { id: crypto.randomUUID(), kind: "log" as const, actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now, text: `QA finding for step ${stepId}: ${text}` }] });
    }),
    addAuditPhoto: (id: string, photo: NonNullable<BaseWorkRequest["QA_AuditPhotos"]>[number]) => commit((wrs) => {
      requireInspection();
      const wr = wrs.find((item) => item.WR_ID === id);
      if (!wr || !wr.QA_AuditStatus || wr.QA_AuditStatus === "None") throw new Error("Select the work request for audit before attaching a photo.");
      requireInspector(wr);
      const now = new Date().toISOString();
      return wrs.map((item) => item.WR_ID !== id ? item : { ...item, UpdatedAt: now, QA_AuditPhotos: [...(item.QA_AuditPhotos ?? []), photo], Activity: [...(item.Activity ?? []), { id: crypto.randomUUID(), kind: "log" as const, actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now, text: `QA audit photo added: ${photo.name}` }] });
    }),
    removeAuditPhoto: (id: string, photoId: string) => commit((wrs) => {
      requireInspection();
      const wr = wrs.find((item) => item.WR_ID === id);
      if (!wr || !wr.QA_AuditStatus || wr.QA_AuditStatus === "None") throw new Error("The audit is no longer available.");
      requireInspector(wr);
      const photo = wr.QA_AuditPhotos?.find((item) => item.id === photoId);
      if (!photo) throw new Error("The audit photo is no longer available.");
      const now = new Date().toISOString();
      return wrs.map((item) => item.WR_ID !== id ? item : { ...item, UpdatedAt: now, QA_AuditPhotos: (item.QA_AuditPhotos ?? []).filter((entry) => entry.id !== photoId), Activity: [...(item.Activity ?? []), { id: crypto.randomUUID(), kind: "log" as const, actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now, text: `QA audit photo removed: ${photo.name}` }] });
    }),
  };
}
