"use client";

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
    const updated = new Map(update(site).map((wr) => [wr.WR_ID, wr]));
    await commitSnapshot(data, { ...data, workRequests: data.workRequests.map((wr) => wr.SiteId === activeSiteId ? updated.get(wr.WR_ID) ?? wr : wr) });
  };
  return {
    autoSelect5PercentQAAudits: (options: QAOptions) => commit((wrs) => selectRandomAudits(wrs, options, actor)),
    swapRandomQAAuditWR: (id: string) => commit((wrs) => swapAudit(wrs, id, actor)),
    manualSelectForQAAudit: (ids: string[], mode: "ManualInspectorPick" | "QRScanOnSite") => commit((wrs) => {
      if (!ids.length || ids.some((id) => !wrs.some((wr) => wr.WR_ID === id))) throw new Error("One or more selected work requests are unavailable.");
      return wrs.map((wr) => ids.includes(wr.WR_ID) ? selectAudit(wr, mode, actor) : wr);
    }),
    submitQAVerdict: (id: string, verdict: "Pass" | "Fail" | "SubmitCorrection" | "VerifyClose", payload: Parameters<typeof qaVerdict>[3]) => commit((wrs) => {
      if (!wrs.some((wr) => wr.WR_ID === id)) throw new Error("Work request is no longer available.");
      return wrs.map((wr) => wr.WR_ID === id ? qaVerdict(wr, verdict, actor, payload) : wr);
    }),
  };
}
