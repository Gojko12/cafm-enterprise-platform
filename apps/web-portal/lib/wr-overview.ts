import type { BaseWorkRequest } from "@cafm/shared-schema";

export function groupLongJobs(requests: BaseWorkRequest[]) {
  const groups = new Map<number, BaseWorkRequest[]>();
  for (const request of requests) groups.set(request.Percentage, [...(groups.get(request.Percentage) ?? []), request]);
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([percentage, items]) => ({
    key: String(percentage), percentage, requests: items,
    description: [...new Set(items.map((item) => item.WorkRequestSubstatus))].join(" / "),
    track: [...new Set(items.map((item) => item.ProcessTrack ?? (item.Percentage >= 30 ? "RFW" : "RFQ")))].join(" / "),
    cost: items.reduce((sum, item) => sum + (item.EstimatedCostEur ?? 0), 0),
  }));
}
