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
  const requireLeader = (wr: BaseWorkRequest) => {
    if (!profile || !(profile.isTeamLeader || profile.isSiteAdmin || profile.isSuperAdmin || permissions?.canOverwriteLaborTime)) throw new Error("Only a team leader or administrator may challenge a reopening.");
    if (profile.vpaBuildingIds.length && !profile.vpaBuildingIds.includes(wr.bl_id)) throw new Error("This work request is outside your building scope.");
    if (profile.vpaTrades.length && !profile.vpaTrades.some((trade) => trade === wr.TradeName || trade === wr.TradeId)) throw new Error("This work request is outside your trade scope.");
  };
  const log = (wr: BaseWorkRequest, text: string): BaseWorkRequest => {
    const now = new Date().toISOString();
    return { ...wr, UpdatedAt: now, Activity: [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now, text }] };
  };
  const updateOne = (id: string, update: (wr: BaseWorkRequest) => BaseWorkRequest) => commit((wrs) => {
    const wr = wrs.find((item) => item.WR_ID === id);
    if (!wr) throw new Error("Work request is no longer available.");
    const changed = update(wr);
    return wrs.map((item) => item.WR_ID === id ? changed : item);
  });
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
    submitChallenge: (id: string, reason: string) => updateOne(id, (wr) => {
      requireLeader(wr);
      if (!["QA_Failed_ActionRequired", "QA_Corrected"].includes(wr.QA_AuditStatus ?? "") || wr.Percentage !== 50) throw new Error("Only a work request currently reopened for QA rework can be challenged.");
      if (!reason.trim()) throw new Error("Enter a reason for the challenge.");
      if (wr.qaTeamLeaderChallenges?.some((challenge) => challenge.resolutionStatus === "Pending")) throw new Error("There is already a pending challenge.");
      return log({ ...wr, qaTeamLeaderChallenges: [...(wr.qaTeamLeaderChallenges ?? []), { id: crypto.randomUUID(), wrId: id, teamLeaderName: activePerson, createdAt: new Date().toISOString(), challengeReason: reason.trim(), isReadByInspector: false, resolutionStatus: "Pending" }] }, `Team Leader ${activePerson} challenged the QA reopening: ${reason.trim()}`);
    }),
    markChallengeRead: (id: string, challengeId: string) => updateOne(id, (wr) => {
      requireInspection(); requireInspector(wr);
      const challenge = wr.qaTeamLeaderChallenges?.find((item) => item.id === challengeId);
      if (!challenge || challenge.isReadByInspector) throw new Error("Unread challenge is no longer available.");
      return log({ ...wr, qaTeamLeaderChallenges: wr.qaTeamLeaderChallenges?.map((item) => item.id === challengeId ? { ...item, isReadByInspector: true, readByInspectorAt: new Date().toISOString(), readByInspectorName: activePerson } : item) }, `QA challenge marked as read by ${activePerson}.`);
    }),
    resolveChallenge: (id: string, challengeId: string, accept: boolean, response: string) => updateOne(id, (wr) => {
      requireInspection(); requireInspector(wr);
      const challenge = wr.qaTeamLeaderChallenges?.find((item) => item.id === challengeId);
      if (!challenge || challenge.resolutionStatus !== "Pending") throw new Error("Pending challenge is no longer available.");
      if (!challenge.isReadByInspector) throw new Error("Explicitly mark the challenge as read before resolving it.");
      if (!response.trim()) throw new Error("Enter an inspector response.");
      if (wr.qaStagedVerdict) throw new Error("Remove the staged verdict before resolving this challenge.");
      if (wr.qaTeamLeaderChallenges?.some((item) => item.id !== challengeId && item.resolutionStatus === "Pending")) throw new Error("Another challenge is pending; review it before changing the work request.");
      if (!["QA_Failed_ActionRequired", "QA_Corrected"].includes(wr.QA_AuditStatus ?? "")) throw new Error("The QA rework status changed; review the request again.");
      if (wr.IsFrozen || wr.Percentage === 55) throw new Error("Resolve the existing hold before changing the work request.");
      const configured = WR_Statuses.find((status) => status.ESAWorkType === wr.ESAWorkType && status.Percentage === (accept ? 100 : 50));
      if (!configured) throw new Error("The required work request status is not configured.");
      if (!accept && !permissions?.canAuditReopenWR) throw new Error("Permission required to reopen work requests.");
      const resolved = wr.qaTeamLeaderChallenges!.map((item) => item.id === challengeId ? { ...item, resolutionStatus: accept ? "Accepted_ReopenCancelled" as const : "Rejected_ReworkRequired" as const, inspectorResponse: response.trim(), resolvedAt: new Date().toISOString() } : item);
      return log({ ...wr, ...configured, WorkRequestSubstatus: accept ? configured.WorkRequestSubstatus : "Re-opened (50% - QA Failed)",
        QA_AuditStatus: accept ? "QA_Passed" : "QA_Failed_ActionRequired",
        QA_InspectionStatus: accept ? "Passed" : "ToBeCorrected", AuditInspectionStatus: accept ? "Passed Inspected" : "PM WRs to be corrected",
        QA_InspectedBy: activePerson, QA_InspectedDate: new Date().toISOString(), qaTeamLeaderChallenges: resolved }, `QA challenge ${accept ? "accepted; reopening cancelled and request closed" : "rejected; rework required"} by ${activePerson}: ${response.trim()}`);
    }),
    recheck: (id: string, pass: boolean, note: string) => updateOne(id, (wr) => {
      requireInspection(); requireInspector(wr);
      if (!["QA_Failed_ActionRequired", "QA_Corrected"].includes(wr.QA_AuditStatus ?? "") || wr.Percentage !== 78) throw new Error("The team must complete rework to 78% before re-inspection.");
      if (wr.qaStagedVerdict) throw new Error("Remove the staged verdict before re-inspection.");
      if (wr.qaTeamLeaderChallenges?.some((item) => item.resolutionStatus === "Pending")) throw new Error("Resolve pending Team Leader challenges before re-inspection.");
      if (wr.IsFrozen) throw new Error("Resolve the existing hold before re-inspection.");
      if (!pass && !permissions?.canAuditReopenWR) throw new Error("Permission required to reopen work requests.");
      if (!pass && !note.trim()) throw new Error("Enter a re-inspection failure note.");
      const status = WR_Statuses.find((item) => item.ESAWorkType === wr.ESAWorkType && item.Percentage === (pass ? 100 : 50));
      if (!status) throw new Error("The required work request status is not configured.");
      const count = (wr.qaReinspectionCount ?? 0) + 1;
      return log({ ...wr, ...status, WorkRequestSubstatus: pass ? status.WorkRequestSubstatus : `Re-opened (QA Failed Re-check #${count})`,
        QA_AuditStatus: pass ? "QA_Verified" : "QA_Failed_ActionRequired", QA_InspectionStatus: pass ? "Passed" : "ToBeCorrected",
        AuditInspectionStatus: pass ? "Passed Inspected" : "PM WRs to be corrected", QA_InspectedBy: activePerson, QA_InspectedDate: new Date().toISOString(),
        QA_IssueDescription: pass ? wr.QA_IssueDescription : [wr.QA_IssueDescription, `Re-check #${count}: ${note.trim()}`].filter(Boolean).join(" — "),
        qaReinspectionCount: count }, `QA re-check #${count} ${pass ? "passed and closed" : "failed and reopened"} by ${activePerson}${note.trim() ? `: ${note.trim()}` : "."}`);
    }),
    submitQAVerdict: (id: string, verdict: "Pass" | "Fail" | "SubmitCorrection" | "VerifyClose", payload: Parameters<typeof qaVerdict>[3] & { spawnFollowUp?: boolean; failureReason?: string; additionalNotes?: string }) => commit((wrs) => {
      const parent = wrs.find((wr) => wr.WR_ID === id);
      if (!parent) throw new Error("Work request is no longer available.");
      if (verdict !== "SubmitCorrection") { requireInspection(); requireInspector(parent); }
      if (verdict === "Fail" && payload.reopen && !permissions?.canAuditReopenWR) throw new Error("Permission required to reopen work requests.");
      if (payload.spawnFollowUp && !permissions?.canOpenFollowUpFJ) throw new Error("Permission required to create a follow-up FJ.");
      if (verdict === "Pass" || verdict === "Fail") {
        if (!parent.QA_AuditStatus || !["ToBeInspected", "QA_Staged_Pass", "QA_Staged_Fail", "QA_Passed", "QA_Failed_ActionRequired", "QA_Corrected", "QA_Verified"].includes(parent.QA_AuditStatus)) throw new Error("Confirm the inspection before editing its verdict.");
        if (parent.qaTeamLeaderChallenges?.some((item) => item.resolutionStatus === "Pending")) throw new Error("Resolve the pending Team Leader challenge before editing the verdict.");
        if (verdict === "Fail" && !payload.issue?.trim()) throw new Error("An issue description is required.");
        const now = new Date().toISOString();
        const keepReworkStatus = parent.Percentage === 50 && ["QA_Failed_ActionRequired", "QA_Corrected"].includes(parent.QA_AuditStatus);
        const staged: BaseWorkRequest = { ...parent, QA_AuditStatus: keepReworkStatus ? parent.QA_AuditStatus : verdict === "Pass" ? "QA_Staged_Pass" : "QA_Staged_Fail",
          qaStagedVerdict: { verdict, inspector: activePerson, stagedAt: now, failureReason: payload.failureReason, additionalNotes: payload.additionalNotes,
            issueDescription: payload.issue, reopenTo50: verdict === "Fail" && !!payload.reopen, spawnFollowUpFJ: verdict === "Fail" && !!payload.spawnFollowUp,
            previousStatus: parent.qaStagedVerdict ? parent.qaStagedVerdict.previousStatus : parent.QA_AuditStatus === "ToBeInspected" ? undefined : parent.QA_AuditStatus },
          UpdatedAt: now, Activity: [...(parent.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now, text: `QA inspection edited: ${verdict} staged by ${actor.name}; pending batch commit.` }] };
        return wrs.map((wr) => wr.WR_ID === id ? staged : wr);
      }
      const updated = qaVerdict(parent, verdict, actor, payload);
      return wrs.map((wr) => wr.WR_ID === id ? updated : wr);
    }),
    unstageVerdict: (id: string) => commit((wrs) => {
      requireInspection();
      const wr = wrs.find((item) => item.WR_ID === id);
      if (!wr || !wr.qaStagedVerdict) throw new Error("Staged verdict is no longer available.");
      requireInspector(wr);
      const now = new Date().toISOString();
      return wrs.map((item) => item.WR_ID !== id ? item : { ...item, QA_AuditStatus: ["QA_Staged_Pass", "QA_Staged_Fail"].includes(item.QA_AuditStatus ?? "") ? item.qaStagedVerdict?.previousStatus ?? "ToBeInspected" : item.QA_AuditStatus, qaStagedVerdict: undefined, UpdatedAt: now,
        Activity: [...(item.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now, text: `Staged QA verdict removed by ${actor.name}.` }] });
    }),
    updateStagedOptions: (id: string, options: { reopenTo50?: boolean; spawnFollowUpFJ?: boolean }) => commit((wrs) => {
      requireInspection();
      const wr = wrs.find((item) => item.WR_ID === id);
      if (!wr?.qaStagedVerdict || wr.qaStagedVerdict.verdict !== "Fail") throw new Error("Staged failure is no longer available.");
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
        if (!wr?.qaStagedVerdict || ![78, 100].includes(wr.Percentage) ||
          (wr.QA_AuditStatus !== `QA_Staged_${wr.qaStagedVerdict.verdict}` && wr.QA_AuditStatus !== wr.qaStagedVerdict.previousStatus))
          throw new Error(`${id}: staged verdict or completed status is no longer available.`);
        if (wr.qaTeamLeaderChallenges?.some((item) => item.resolutionStatus === "Pending")) throw new Error(`${id}: resolve pending Team Leader challenges first.`);
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
