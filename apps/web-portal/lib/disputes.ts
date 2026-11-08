import type { BaseWorkRequest, CraftpersonAbsence, LocationFreeze } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { getCraftpersonDisputes } from "./craftperson-disputes";
import { describeLocationFreeze, getActiveFreezeConflictsForWR } from "./location-freezes";
import { addDays, intervalFor, wallMinutes } from "./dispatch";

type Person = DemoData["craftspeople"][number];
export type DisputeViewMode = "all" | "highlight" | "only";
export type WRDispute = { type: "Freeze" | "Leave" | "ShiftHours" | "Capacity"; label: string; detail: string };

export function getWRDisputes(wr: BaseWorkRequest, people: Person[], absences: CraftpersonAbsence[], freezes: LocationFreeze[], workRequests: BaseWorkRequest[] = [wr]): WRDispute[] {
  const result: WRDispute[] = getActiveFreezeConflictsForWR(wr, freezes).map((freeze) => ({ type: "Freeze", label: "❄ Freeze Dispute", detail: describeLocationFreeze(freeze) }));
  for (const id of wr.AssignedCraftpersonIds) {
    const person = people.find((item) => item.SiteId === wr.SiteId && item.id === id);
    const slot = intervalFor(wr, id);
    if (!person || !slot) continue;
    const start = slot.assignedStartDateTime.slice(0, 10);
    const end = addDays(slot.assignedEndDateTime.slice(0, 10), slot.assignedEndDateTime.slice(11, 16) === "00:00" ? -1 : 0);
    if (!Number.isFinite(wallMinutes(slot.assignedStartDateTime)) || !Number.isFinite(wallMinutes(slot.assignedEndDateTime)) || end < start) continue;
    const found = getCraftpersonDisputes(person, workRequests, absences, { start, end });
    for (const issue of found) {
      if (issue.wr.WR_ID !== wr.WR_ID || issue.type === "Overlap" || issue.type === "Freeze") continue;
      const type = issue.type === "Shift Hours" ? "ShiftHours" : issue.type;
      result.push({ type, label: type === "Leave" ? "🏖 Leave Dispute" : type === "ShiftHours" ? "⏰ Off-Shift Dispute" : "⚠ Capacity Dispute", detail: `${person.Name} ${person.LastName} · ${issue.date}: ${issue.message}` });
    }
  }
  return result;
}

export function mapWRDisputes(requests: BaseWorkRequest[], people: Person[], absences: CraftpersonAbsence[], freezes: LocationFreeze[]) {
  return new Map(requests.map((wr) => [wr.WR_ID, getWRDisputes(wr, people, absences, freezes, requests)]));
}
