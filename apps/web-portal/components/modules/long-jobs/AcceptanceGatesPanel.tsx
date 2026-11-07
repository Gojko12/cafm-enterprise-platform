"use client";

import React from "react";
import type { BaseWorkRequest, LJAcceptanceGate, LJRole } from "@cafm/shared-schema";
import { useSiteContext } from "@/lib/contexts/SiteContext";

interface AcceptanceGatesPanelProps {
  workRequest: BaseWorkRequest;
  onStatusChange: (percentage: number, updates: Partial<BaseWorkRequest>, description?: string) => void;
  isReadOnly?: boolean;
  role?: LJRole | null;
}

const gates = [
  { type: "SAT", field: "RequiresSAT", title: "SAT", approvers: ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
  { type: "DrawingEngineering", field: "RequiresDrawingUpdate", title: "Draftsman Drawing Update", approvers: ["ESA_DO", "ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
  { type: "CIFMInventory", field: "RequiresInventoryUpdate", title: "CIFM Inventory Update", approvers: ["ESA_IM", "ESA_TO", "ESA_TM", "ESA_LONG_JOB"] },
] as const;
const esaRoles: LJRole[] = ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"];
const tradeRoles: LJRole[] = ["TRADE_TM", "TRADE_LONG_JOB"];

export function AcceptanceGatesPanel({ workRequest: wr, onStatusChange, isReadOnly = false, role }: AcceptanceGatesPanelProps) {
  const { activeLJRole, currentUser } = useSiteContext();
  const actorRole = role ?? activeLJRole;
  const allowed = (roles: readonly string[]) => !isReadOnly && !!actorRole && roles.includes(actorRole);
  const active = wr.Percentage >= 78 && wr.Percentage < 94;

  const updateGate = (type: LJAcceptanceGate["GateType"], status: LJAcceptanceGate["Status"]) => {
    const updated: LJAcceptanceGate[] = [...wr.AcceptanceGates.filter((gate) => gate.GateType !== type), {
      GateType: type, IsRequired: true, Status: status,
      ...(status === "Approved" ? { ApprovedBy: currentUser?.DisplayName ?? "Current user", ApprovedAt: new Date().toISOString() } : {}),
    }];
    const allApproved = gates.every((gate) => !wr[gate.field] ||
      updated.some((item) => item.GateType === gate.type && item.Status === "Approved"));
    let percentage = wr.Percentage;
    if (status === "Approved" && allApproved) percentage = 94;
    else if (type === "SAT" && status === "InvitationSent") percentage = 80;
    else if (type === "SAT" && status === "Approved") percentage = 81;
    const substatus = percentage === 94 ? "All Acceptances Completed" :
      percentage === 80 ? "Work Request Ready for SAT Approval (Invite)" :
      percentage === 81 ? "SAT Approved" : wr.WorkRequestSubstatus;
    onStatusChange(percentage, { AcceptanceGates: updated, WorkRequestSubstatus: substatus },
      `${type} ${status === "Approved" ? "gave OK" : status === "ReviewRequested" ? "review requested" : "invitation sent"}`);
  };

  return <section className="border rounded p-4 space-y-3">
    <h3 className="font-semibold">78%–94% Acceptance Gates</h3>
    <div className="space-y-1">
      {gates.map((gate) => <label key={gate.type} className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={wr[gate.field]} disabled={isReadOnly || wr.Percentage >= 78}
          onChange={(event) => onStatusChange(wr.Percentage, { [gate.field]: event.target.checked }, `${gate.title} requirement ${event.target.checked ? "enabled" : "disabled"}`)} />
        {gate.field}
      </label>)}
    </div>
    {active && gates.filter((gate) => wr[gate.field]).map((gate) => {
      const state = wr.AcceptanceGates.find((item) => item.GateType === gate.type);
      return <div key={gate.type} className="border rounded p-3 space-y-2">
        <div className="font-medium">{gate.title} — {state?.Status ?? "Pending"}</div>
        {gate.type === "SAT" && wr.Percentage === 78 && !wr.PreSATApproved &&
          <button type="button" disabled={!allowed(tradeRoles)} className="bg-blue-100 px-2 py-1 rounded disabled:opacity-40"
            onClick={() => onStatusChange(79, { PreSATApproved: true, WorkRequestSubstatus: "Pre-SAT Performed" }, "Pre-SAT gave OK")}>Pre-SAT Give OK [TRADE_TM]</button>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!allowed(esaRoles) || state?.Status === "Approved"} onClick={() => updateGate(gate.type, "ReviewRequested")} className="bg-gray-100 px-2 py-1 rounded disabled:opacity-40">Request Review [ESA_TO / ESA_TM]</button>
          <button type="button" disabled={!allowed(tradeRoles) || state?.Status === "Approved" || (gate.type === "SAT" && !wr.PreSATApproved)} onClick={() => updateGate(gate.type, "InvitationSent")} className="bg-blue-100 px-2 py-1 rounded disabled:opacity-40">Send Invitation [TRADE_TM]</button>
          <button type="button" disabled={!allowed(gate.approvers) || state?.Status === "Approved" || (gate.type === "SAT" && !wr.PreSATApproved)} onClick={() => updateGate(gate.type, "Approved")} className="bg-green-100 px-2 py-1 rounded disabled:opacity-40">Give OK / Approve [{gate.approvers.join(" / ")}]</button>
        </div>
      </div>;
    })}
  </section>;
}
