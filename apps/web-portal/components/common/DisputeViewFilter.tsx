"use client";

import type { DisputeViewMode } from "../../lib/disputes";

export function DisputeViewFilter({ value, onChange, count }: { value: DisputeViewMode; onChange: (value: DisputeViewMode) => void; count?: number }) {
  return <label>Disputes{count === undefined ? "" : ` (${count})`}: <select className="rounded border bg-white p-1" value={value} onChange={(event) => onChange(event.target.value as DisputeViewMode)}><option value="all">Show all</option><option value="highlight">Highlight disputes</option><option value="only">Only show disputes</option></select></label>;
}
