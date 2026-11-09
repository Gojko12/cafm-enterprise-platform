import type { BaseWorkRequest, TechnicianFieldUpdate } from "@cafm/shared-schema";

export const fieldReasonLabels: Record<TechnicianFieldUpdate["reasonCategory"], string> = {
  NeedAccess: "🔑 Need Access (Locked room, roof, or security permit)",
  NeedTools: "🧰 Missing Tool / Special Equipment",
  WaitingForParts: "📦 Waiting for Spare Part / Material",
  PreviousJobRanLate: "⏳ Behind Schedule / Previous WR Took Longer",
  TechnicalIssue: "❓ Technical Issue / Need Team Leader Guidance",
  FinishedEarlyOrLate: "⚡ Finished Early / Schedule Adjustment Info",
  Other: "Other",
};
export const urgencyLabels: Record<TechnicianFieldUpdate["urgency"], string> = {
  InfoOnly: "🟢 Info Only (Just letting Team Leader know)",
  ActionToday: "🟡 Action Needed Today",
  UrgentBlocked: "🔴 URGENT — Blocked Now (Call TL!)",
};
export const urgencyOrder: Record<TechnicianFieldUpdate["urgency"], number> = { UrgentBlocked: 0, ActionToday: 1, InfoOnly: 2 };

export function scheduledSlot(wr: BaseWorkRequest, person: string) {
  return wr.CraftpersonAssignments?.filter((item) => item.craftpersonId === person).sort((a, b) => a.assignedStartDateTime.localeCompare(b.assignedStartDateTime))[0];
}

export function localDateTime(now: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function isOverdue(wr: BaseWorkRequest, now: Date, person?: string) {
  if (wr.Percentage >= 78 || wr.Percentage === 27) return false;
  const assignments = (wr.CraftpersonAssignments ?? []).filter((item) => !person || item.craftpersonId === person);
  if (assignments.length) return assignments.some((item) => item.assignedEndDateTime < localDateTime(now));
  return !!wr.StartDate_DateToPerform && wr.StartDate_DateToPerform < localDateTime(now).slice(0, 10);
}
