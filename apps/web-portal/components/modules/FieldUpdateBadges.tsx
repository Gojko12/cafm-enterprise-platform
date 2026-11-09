"use client";

import React from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import { fieldReasonLabels, isOverdue, urgencyOrder } from "../../lib/field-updates";

export function FieldUpdateBadges({ wr }: { wr: BaseWorkRequest }) {
  const updates = (wr.technicianFieldUpdates ?? []).filter((item) => item.status === "Open").sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
  const overdue = isOverdue(wr, new Date());
  if (!updates.length && !overdue) return null;
  return <div className="flex flex-wrap gap-1 px-4 py-2 text-xs">{updates.map((update) => <span key={update.id} className="rounded bg-rose-100 px-2 py-1 font-semibold text-rose-900">{update.urgency === "UrgentBlocked" ? "🔴 BLOCKER" : "🚩 FIELD UPDATE"}: {fieldReasonLabels[update.reasonCategory]}</span>)}{overdue && <span className="rounded bg-amber-100 px-2 py-1 font-semibold text-amber-900">⏰ Overdue / Behind Planned Schedule</span>}</div>;
}
