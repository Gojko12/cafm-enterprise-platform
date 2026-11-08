"use client";

import { WR_Statuses } from "@cafm/shared-schema";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useCafmStore } from "./cafm-store";
import { useSiteContext } from "./contexts/SiteContext";
import { useApp } from "./hooks/useApp";
import { qaVerdict, selectAudit, selectRandomAudits, swapAudit } from "./qa-audits";
import type { QAOptions } from "./qa-audits";

export function useQAActions() {
  const { data, commitSnapshot } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const { currentRole } = useApp();
  const actor = { name: activePerson, role: currentRole };
  const commit = async (update: (requests: BaseWorkRequest[]) => BaseWorkRequest[]) => {
    const site = data.workRequests.filter((wr) => wr.SiteId === activeSiteId);
    const updated = update(site);
    await commitSnapshot(data, { ...data, workRequests: [...data.workRequests.filter((wr) => wr.SiteId !== activeSiteId), ...updated] });
  };
  return {
    autoSelect5PercentQAAudits: (options: QAOptions) => commit((wrs) => selectRandomAudits(wrs, options, actor)),
    swapRandomQAAuditWR: (id: string) => commit((wrs) => swapAudit(wrs, id, actor)),
    manualSelectForQAAudit: (ids: string[], mode: "ManualInspectorPick" | "QRScanOnSite") => commit((wrs) => {
      if (!ids.length || ids.some((id) => !wrs.some((wr) => wr.WR_ID === id))) throw new Error("One or more selected work requests are unavailable.");
      return wrs.map((wr) => ids.includes(wr.WR_ID) ? selectAudit(wr, mode, actor) : wr);
    }),
    submitQAVerdict: (id: string, verdict: "Pass" | "Fail" | "SubmitCorrection" | "VerifyClose", payload: Parameters<typeof qaVerdict>[3] & { followUpType?: "FJ" | "LJ" }) => commit((wrs) => {
      const parent = wrs.find((wr) => wr.WR_ID === id);
      if (!parent) throw new Error("Work request is no longer available.");
      let updated = qaVerdict(parent, verdict, actor, payload);
      if (verdict !== "Fail" || !payload.followUpType) return wrs.map((wr) => wr.WR_ID === id ? updated : wr);
      const issued = WR_Statuses.find((status) => status.ESAWorkType === "Corrective Maintenance" && status.Percentage === 50);
      if (!issued) throw new Error("The 50% corrective maintenance status is not configured.");
      const now = new Date().toISOString();
      const year = now.slice(0, 4);
      const used = new Set(data.workRequests.map((wr) => wr.WR_ID));
      const start = activeSiteId === "SITE-01" ? 300000 : activeSiteId === "SITE-02" ? 600000 : 900000;
      const limit = start + 99999;
      let sequence = start;
      while (sequence <= limit && used.has(`${year}${String(sequence).padStart(6, "0")}`)) sequence++;
      if (sequence > limit) throw new Error(`No QA follow-up numbers remain for ${activeSiteId} in ${year}.`);
      const followId = `${year}${String(sequence).padStart(6, "0")}`;
      const entry = { id: crypto.randomUUID(), kind: "log" as const, actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now, text: `Created QA corrective follow-up ${followId}.` };
      updated = { ...updated, Activity: [...(updated.Activity ?? []), entry] };
      const followUp: BaseWorkRequest = {
        WR_ID: followId, WR_Type: payload.followUpType,
        Description: `QA Rework Follow-Up for ${id}: ${payload.issue!.trim()}`,
        ProblemLocation: parent.ProblemLocation, TradeId: parent.TradeId, TradeName: parent.TradeName,
        SiteId: parent.SiteId, bl_id: parent.bl_id, LevelName: parent.LevelName, RoomCode: parent.RoomCode,
        EquipmentCodes: [...parent.EquipmentCodes], OriginatingWR_ID: parent.WR_ID,
        ...(parent.WR_Type === "PM" ? { ParentPM_WR_ID: parent.WR_ID } : {}),
        ...(parent.WR_Type === "FJ" ? { OriginatingFJ_WR_ID: parent.WR_ID } : {}),
        ...issued, CreatedDate: now.slice(0, 10), UpdatedAt: now, CreatedBy: actor.name,
        AssignedCraftpersonIds: [], AssignedUserIds: [], TotalTimeMinutes: 0, StartDateTBD: false,
        IsFrozen: false, RequiresSAT: false, RequiresDrawingUpdate: false, RequiresInventoryUpdate: false,
        AcceptanceGates: [], Activity: [{ ...entry, id: crypto.randomUUID(), text: `Created as QA corrective follow-up for ${id}.` }],
      };
      return [...wrs.map((wr) => wr.WR_ID === id ? updated : wr), followUp];
    }),
    annotateStep: (id: string, stepId: string, finding: string) => commit((wrs) => {
      const text = finding.trim();
      const wr = wrs.find((item) => item.WR_ID === id);
      if (!wr || wr.WR_Type !== "PM" || ![...(wr.ChecklistSteps ?? []), ...(wr.ChecklistInstances ?? [])].some((step) => step.StepId === stepId)) throw new Error("Checklist step is no longer available.");
      if (!text) throw new Error("Enter an inspector finding.");
      const now = new Date().toISOString();
      const entry = { id: crypto.randomUUID(), timestamp: now, performedBy: actor.name, actionType: "QA inspector finding", stepReference: stepId, details: text };
      return wrs.map((item) => item.WR_ID !== id ? item : { ...item, UpdatedAt: now, ChecklistHistory: [...(item.ChecklistHistory ?? []), entry], Activity: [...(item.Activity ?? []), { id: crypto.randomUUID(), kind: "log" as const, actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now, text: `QA finding for step ${stepId}: ${text}` }] });
    }),
    addAuditPhoto: (id: string, photo: NonNullable<BaseWorkRequest["QA_AuditPhotos"]>[number]) => commit((wrs) => {
      const wr = wrs.find((item) => item.WR_ID === id);
      if (!wr || !wr.QA_AuditStatus || wr.QA_AuditStatus === "None") throw new Error("Select the work request for audit before attaching a photo.");
      const now = new Date().toISOString();
      return wrs.map((item) => item.WR_ID !== id ? item : { ...item, UpdatedAt: now, QA_AuditPhotos: [...(item.QA_AuditPhotos ?? []), photo], Activity: [...(item.Activity ?? []), { id: crypto.randomUUID(), kind: "log" as const, actorId: actor.name, actorName: actor.name, actorRole: actor.role, createdAt: now, text: `QA audit photo added: ${photo.name}` }] });
    }),
  };
}
