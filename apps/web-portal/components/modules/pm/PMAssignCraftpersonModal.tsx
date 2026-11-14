"use client";

import React, { useState } from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import type { DemoData } from "@/lib/cafm-data";

interface Props {
  workRequest: BaseWorkRequest;
  craftspeople: DemoData["craftspeople"];
  users: DemoData["users"];
  activeSiteId: string;
  terminalReadOnly: boolean;
  onAssign: (userId: string) => void;
  onClose: () => void;
}

export function PMAssignCraftpersonModal({ workRequest, craftspeople, users, activeSiteId, terminalReadOnly, onAssign, onClose }: Props) {
  const [craftFilter, setCraftFilter] = useState("");
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
    <section role="dialog" aria-modal="true" aria-label="Assign Craftperson" className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-lg bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Assign Craftperson</h3>
        <button type="button" aria-label="Close assignment dialog" onClick={onClose} className="px-2 text-xl">×</button>
      </div>
      <input aria-label="Filter craftspeople" value={craftFilter} onChange={(event) => setCraftFilter(event.target.value)}
        placeholder="Filter craftspeople..." className="my-3 w-full rounded border px-3 py-2" />
      <div className="min-h-0 flex-1 overflow-auto">
        {craftspeople.filter((person) =>
          person.SiteId === activeSiteId &&
          (!workRequest.TradeId || person.Trade === workRequest.TradeId) &&
          !workRequest.AssignedCraftpersonIds?.includes(person.id) &&
          `${person.Name} ${person.LastName}`.toLowerCase().includes(craftFilter.toLowerCase()),
        ).map((person) => <div key={person.id} className="flex items-center justify-between border-t py-3">
          <span>{person.Name} {person.LastName} · {person.Trade} · {person.HourlyRate.toFixed(2)} EUR/hour</span>
          <button type="button" disabled={terminalReadOnly} onClick={() => onAssign(person.id)} className="rounded bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-40">Assign</button>
        </div>)}
        {users.filter((user) =>
          user.AssignedSiteIds.includes(activeSiteId as DemoData["sites"][number]) &&
          (!workRequest.TradeId || user.Trades.includes(workRequest.TradeId)) &&
          !workRequest.AssignedCraftpersonIds?.includes(user.UserId) &&
          user.DisplayName.toLowerCase().includes(craftFilter.toLowerCase()),
        ).map((user) => <div key={user.UserId} className="flex items-center justify-between border-t py-3">
          <span>{user.DisplayName}</span>
          <button type="button" disabled={terminalReadOnly} onClick={() => onAssign(user.UserId)} className="rounded bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-40">Assign</button>
        </div>)}
      </div>
      <p className="mt-3 shrink-0 text-xs text-slate-500">Assignments are recorded in the craftperson labor table; enter hourly rate and working time there.</p>
    </section>
  </div>;
}
