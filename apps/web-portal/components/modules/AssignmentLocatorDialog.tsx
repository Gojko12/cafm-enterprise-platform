"use client";

import React from "react";
import type { BaseWorkRequest } from "@cafm/shared-schema";
import type { DemoData } from "../../lib/cafm-data";
import { intervalFor } from "../../lib/dispatch";
import { tradeColor } from "../../lib/trade-colors";

export function AssignmentLocatorDialog({ request, people, onSelect, onClose }: {
  request: BaseWorkRequest; people: DemoData["craftspeople"]; onSelect: (id: string) => void; onClose: () => void;
}) {
  return <div role="dialog" aria-modal="true" aria-label="Which assignment do you want to see?" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="space-y-2 rounded bg-white p-5"><h2 className="font-bold">Which assignment do you want to see?</h2>
    {request.AssignedCraftpersonIds.map((id) => {
      const interval = intervalFor(request, id);
      if (!interval) return null;
      const person = people.find((item) => item.id === id);
      return <button key={id} className="block w-full rounded border p-2 text-left" onClick={() => onSelect(id)}>{person ? `${person.Name} ${person.LastName}` : id} · <span className={`rounded border px-1 ${tradeColor(person?.Trade)}`}>{person?.Trade ?? "Unknown trade"}</span> · {interval.assignedStartDateTime.replace("T", " ")} – {interval.assignedEndDateTime.replace("T", " ")}</button>;
    })}
    <button className="rounded border bg-white px-2 py-1 text-xs hover:bg-slate-100" onClick={onClose}>Cancel</button>
  </div></div>;
}
