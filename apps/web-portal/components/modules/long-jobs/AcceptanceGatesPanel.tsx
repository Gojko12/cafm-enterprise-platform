"use client";

import React from "react";
import type { BaseWorkRequest, LJAcceptanceGate, LJRole } from "@cafm/shared-schema";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { ACCEPTANCE_GATES as gates, updateAcceptanceGate } from "@/lib/long-job-acceptance";

interface AcceptanceGatesPanelProps {
  workRequest: BaseWorkRequest;
  onStatusChange: (percentage: number, updates: Partial<BaseWorkRequest>, description?: string) => void;
  isReadOnly?: boolean;
  role?: LJRole | null;
}

const esaRoles: LJRole[] = ["ESA_TO", "ESA_TM", "ESA_LONG_JOB"];
const tradeRoles: LJRole[] = ["TRADE_TM", "TRADE_LONG_JOB"];

export function AcceptanceGatesPanel({ workRequest: wr, onStatusChange, isReadOnly = false, role }: AcceptanceGatesPanelProps) {
  const { activeLJRole, currentUser } = useSiteContext();
  const actorRole = role ?? activeLJRole;
  const allowed = (roles: readonly string[]) => !isReadOnly && !!actorRole && roles.includes(actorRole);
  const active = wr.Percentage >= 78 && wr.Percentage < 94;

  const updateGate = (type: LJAcceptanceGate["GateType"], status: LJAcceptanceGate["Status"]) => {
    try {
      const result = updateAcceptanceGate(wr, type, status, currentUser?.DisplayName ?? "Current user", new Date().toISOString());
      onStatusChange(result.percentage, result.updates,
        `${type} ${status === "Approved" ? "gave OK" : status === "ReviewRequested" ? "review requested" : "invitation sent"}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not update the acceptance gate.");
    }
  };

  return <section className="border rounded p-4 space-y-3">
    <h3 className="font-semibold">78%–94% Acceptance Gates</h3>
    <div className="space-y-1">
      {gates.map((gate) => <label key={gate.type} className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={wr[gate.field]} disabled={isReadOnly || wr.Percentage >= 94}
          onChange={(event) => {
            const enabled = event.target.checked;
            const remainingGates = (wr.AcceptanceGates ?? []).filter((item) => item.GateType !== gate.type);
            const pending = gates.some((item) => {
              const required = item.type === gate.type ? enabled : wr[item.field];
              return required && !remainingGates.some((saved) => saved.GateType === item.type && saved.Status === "Approved");
            });
            let percentage = wr.Percentage;
            if (active && !pending) percentage = 94;
            else if (active && gate.type === "SAT") percentage = 78;
            onStatusChange(percentage, { [gate.field]: enabled, AcceptanceGates: remainingGates,
              ...(gate.type === "SAT" ? { PreSATApproved: false } : {}),
              ...(percentage !== wr.Percentage ? { WorkRequestSubstatus: percentage === 94 ? "All Acceptances Completed" : "Work Ready for Approvals Cycle" } : {}),
            }, `${gate.title} requirement ${enabled ? "enabled" : "disabled"}`);
          }} />
        {gate.field}
      </label>)}
    </div>
    {active && gates.filter((gate) => wr[gate.field]).map((gate) => {
      const state = (wr.AcceptanceGates ?? []).find((item) => item.GateType === gate.type);
      return <div key={gate.type} className="border rounded p-3 space-y-2">
        <div className="font-medium">{gate.title} — {state?.Status ?? "Pending"}</div>
        {gate.type === "SAT" && wr.Percentage === 78 && !wr.PreSATApproved &&
          <button type="button" disabled={!allowed(tradeRoles)} className="bg-blue-100 px-2 py-1 rounded disabled:opacity-40"
            onClick={() => onStatusChange(79, { PreSATApproved: true, WorkRequestSubstatus: "Pre-SAT Performed" }, "Pre-SAT gave OK")}>Approve Pre-SAT [TRADE_TM]</button>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!allowed(esaRoles) || state?.Status === "Approved" || (gate.type === "SAT" && !wr.PreSATApproved)} onClick={() => updateGate(gate.type, "ReviewRequested")} className="bg-gray-100 px-2 py-1 rounded disabled:opacity-40">Request Review [ESA_TO / ESA_TM]</button>
          <button type="button" disabled={!allowed(tradeRoles) || state?.Status === "Approved" || (gate.type === "SAT" && !wr.PreSATApproved)} onClick={() => updateGate(gate.type, "InvitationSent")} className="bg-blue-100 px-2 py-1 rounded disabled:opacity-40">Send Invitation [TRADE_TM]</button>
          <button type="button" disabled={!allowed(gate.approvers) || state?.Status === "Approved" || (gate.type === "SAT" && !wr.PreSATApproved)} onClick={() => updateGate(gate.type, "Approved")} className="bg-green-100 px-2 py-1 rounded disabled:opacity-40">Approve {gate.type === "SAT" ? "SAT" : gate.type === "DrawingEngineering" ? "Drawing" : "CIFM Inventory"} [{gate.approvers.join(" / ")}]</button>
        </div>
      </div>;
    })}
  </section>;
}
