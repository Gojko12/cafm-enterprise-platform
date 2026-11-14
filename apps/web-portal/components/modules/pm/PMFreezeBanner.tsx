"use client";

import React from "react";
import type { BaseWorkRequest, LocationFreeze } from "@cafm/shared-schema";
import { formatFreezePeriodWindow, freezeLocationLabel, getActiveFreezeConflictsForWR } from "@/lib/location-freezes";

/**
 * Single unified Freeze banner for the WR Details Popup: merges the former
 * `❄ Freeze Period` and `❄ Planned in Freeze Period` boxes into one concise
 * banner showing name, window, responsible person and planned-slot collisions.
 */
export function PMFreezeBanner({ workRequest, activeFreezes, allFreezes }: {
  workRequest: BaseWorkRequest;
  activeFreezes: LocationFreeze[];
  allFreezes: LocationFreeze[];
}) {
  const conflicts = getActiveFreezeConflictsForWR(workRequest, allFreezes);
  const conflictIds = new Set(conflicts.map((item) => item.id));
  const freezes = [...activeFreezes, ...conflicts.filter((item) => !activeFreezes.some((freeze) => freeze.id === item.id))];
  if (!freezes.length) return null;
  return <div role="status" className="mb-3 rounded-lg border border-sky-400 bg-sky-50 p-3 text-sm text-sky-950">
    <p className="font-semibold">❄ Freeze Period{freezes.length > 1 ? "s" : ""}</p>
    {freezes.map((freeze) => <p key={freeze.id} className="mt-1">
      <strong>{freeze.title}</strong> · {freezeLocationLabel(freeze)} · {formatFreezePeriodWindow(freeze.startDateTime, freeze.endDateTime)} · Responsible: {freeze.responsiblePerson}
      {conflictIds.has(freeze.id)
        ? <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-900">⚠ Planned slot collides with this freeze</span>
        : <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900">No planned-slot collision</span>}
    </p>)}
  </div>;
}
