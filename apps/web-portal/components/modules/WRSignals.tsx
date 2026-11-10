"use client";

import type { BaseWorkRequest } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { getFollowUpFJsForPM, getParentPM, getUnfavourableStepCount } from "@/lib/wr-signals";
import type { SignalTab } from "@/lib/wr-signals";

export function WRSignals({ wr, onOpen }: { wr: BaseWorkRequest; onOpen: (wr: BaseWorkRequest, tab?: SignalTab) => void }) {
  const { data } = useCafmStore();
  const count = getUnfavourableStepCount(wr, data);
  const followUps = wr.WR_Type === "PM" ? getFollowUpFJsForPM(wr.WR_ID, data.workRequests) : [];
  const parent = getParentPM(wr, data.workRequests);
  const badge = "rounded-lg border px-2 py-1 text-left text-xs font-semibold";
  return <div className="flex flex-wrap gap-1" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
    {count > 0 && <button type="button" className={`${badge} border-rose-300 bg-rose-100 text-rose-900`} onClick={() => onOpen(wr, "Checklist - Smart PM")}>⚠ {count} Unfavourable →</button>}
    {followUps.length > 0 && <button type="button" className={`${badge} border-indigo-300 bg-indigo-100 text-indigo-900`} onClick={() => onOpen(wr, "PM Follow-up")}>🔧 {followUps.length} Follow-Up FJ →</button>}
    {parent && <button type="button" className={`${badge} border-indigo-300 bg-indigo-50 text-indigo-900`} onClick={() => onOpen(parent)}>🔗 Follow-up of PM #{parent.WR_ID}</button>}
  </div>;
}
