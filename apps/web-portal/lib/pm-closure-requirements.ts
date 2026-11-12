import { coordinationRecordId } from "@cafm/shared-schema";
import type { BaseWorkRequest, PmCoordinationRecord } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { appendLog, findRecord, isoToday, newLogId } from "./pm-coordination";

export interface ClosureDraft {
  teamIds: string[];
  requirementIds: string[];
  note: string;
  updateLinkedPms: boolean;
}

export const emptyClosureDraft = (): ClosureDraft => ({ teamIds: [], requirementIds: [], note: "", updateLinkedPms: true });
export const hasClosureSelection = (draft: ClosureDraft) => draft.teamIds.length > 0 || draft.requirementIds.length > 0;

// Records approvals/notices found necessary during execution on the WR coordination record and, when permitted, merges them into the parent PMS.
export function applyClosureRequirements(data: DemoData, wr: BaseWorkRequest, draft: ClosureDraft, actor: string, canUpdatePms: boolean): DemoData {
  if (!hasClosureSelection(draft) || wr.WR_Type !== "PM") return data;
  const now = new Date().toISOString();
  const targetDate = (wr.DueDate ?? isoToday()).slice(0, 10);
  const note = draft.note.trim();
  const existing = findRecord(data.pmCoordination, wr.ScheduleId, targetDate, wr.WR_ID);
  let record: PmCoordinationRecord = existing ?? {
    id: coordinationRecordId(wr.SiteId, wr.ScheduleId ?? wr.WR_ID, targetDate), siteId: wr.SiteId, pmsId: wr.ScheduleId, targetDate,
    wrId: wr.WR_ID, teamStatuses: {}, requirementStatuses: {}, discussionLog: [], decisionOverride: null, updatedAt: now,
  };
  record = { ...record, wrId: record.wrId ?? wr.WR_ID };

  for (const teamId of draft.teamIds) {
    const team = data.stakeholderTeams?.find((item) => item.id === teamId);
    if (!team) continue;
    record = { ...record, teamStatuses: { ...record.teamStatuses, [teamId]: { ...record.teamStatuses[teamId], status: "Approved", updatedAt: now, updatedBy: actor } } };
    record = appendLog(record, actor, `${team.code}: Approved — Recorded at Closure${note ? `. ${note}` : ""}`, { teamId, outcomeTag: "Approved" });
  }
  for (const requirementId of draft.requirementIds) {
    const requirement = data.coordinationRequirements?.find((item) => item.id === requirementId);
    if (!requirement) continue;
    record = { ...record, requirementStatuses: { ...record.requirementStatuses, [requirementId]: { ...record.requirementStatuses[requirementId], status: "Published_Done", referenceNote: note ? `Recorded at Closure: ${note}` : "Recorded at Closure", completedAt: now, updatedAt: now, updatedBy: actor } } };
    record = appendLog(record, actor, `${requirement.code}: Recorded at Closure${note ? `. ${note}` : ""}`, { requirementId, outcomeTag: "Notice_Sent" });
  }
  record = { ...record, updatedAt: now };

  const list = data.pmCoordination ?? [];
  let next: DemoData = { ...data, pmCoordination: existing ? list.map((item) => item.id === existing.id ? record : item) : [...list, record] };

  const schedule = canUpdatePms && draft.updateLinkedPms && wr.ScheduleId ? data.schedules.find((item) => item.ScheduleId === wr.ScheduleId && item.SiteId === wr.SiteId) : undefined;
  if (schedule) {
    const before = { affectedTeamIds: schedule.affectedTeamIds ?? [], requirementIds: schedule.requirementIds ?? [] };
    const after = {
      affectedTeamIds: [...new Set([...before.affectedTeamIds, ...draft.teamIds])],
      requirementIds: [...new Set([...before.requirementIds, ...draft.requirementIds])],
    };
    if (after.affectedTeamIds.length !== before.affectedTeamIds.length || after.requirementIds.length !== before.requirementIds.length) {
      const addedTeams = after.affectedTeamIds.length - before.affectedTeamIds.length;
      const addedNotices = after.requirementIds.length - before.requirementIds.length;
      next = {
        ...next,
        schedules: next.schedules.map((item) => item === schedule ? { ...item, ...after } : item),
        blueprintAuditLog: [...(next.blueprintAuditLog ?? []), {
          id: newLogId(), siteId: schedule.SiteId, blueprintCode: schedule.ChecklistCode, action: "PMS requirements updated from WR closure",
          summary: `${actor} added ${addedTeams} team(s) and ${addedNotices} notice(s) to PMS ${schedule.ScheduleId} from ${wr.WR_ID}${note ? `: ${note}` : ""}`,
          before, after, actor, timestamp: now,
        }],
      };
    }
  }
  return next;
}
