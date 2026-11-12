import { addCycleInterval, coordinationRecordId, evaluatePmGate, formatDateDDMMYYYY, getNextUnsuppressedOccurrence } from "@cafm/shared-schema";
import type { BaseWorkRequest, LocationFreeze, PM_Schedule, PmCoordinationRecord, PmGateResult, SiteCoordinationRequirement, SiteStakeholderTeam } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { shiftPmSchedule } from "./pm-schedule-shift";

export type DiscussionEntry = PmCoordinationRecord["discussionLog"][number];
export interface CoordinationItem {
  key: string;
  source: "WR" | "Forecast";
  wrId?: string;
  pmsId: string;
  targetDate: string;
  daysUntil: number;
  schedule: PM_Schedule;
  wr?: BaseWorkRequest;
  teamIds: string[];
  requirementIds: string[];
  impact: string;
  location: string;
  equipment: string;
  record?: PmCoordinationRecord;
  gate: PmGateResult;
}

export const isTagged = (schedule: Pick<PM_Schedule, "affectedTeamIds" | "requirementIds">) => !!(schedule.affectedTeamIds?.length || schedule.requirementIds?.length);
const dayMs = 86400000;
export const isoToday = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const diffDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);
const addDaysIso = (iso: string, days: number) => addCycleInterval(iso, days, "days");

export function findRecord(records: PmCoordinationRecord[] | undefined, pmsId: string | undefined, targetDate: string, wrId?: string) {
  return (records ?? []).find((item) => (wrId && item.wrId === wrId) || (pmsId && item.pmsId === pmsId && item.targetDate === targetDate.slice(0, 10)));
}

function describe(data: DemoData, schedule: PM_Schedule, wr?: BaseWorkRequest) {
  const codes = wr?.EquipmentCodes?.length ? wr.EquipmentCodes : schedule.EquipmentCodes;
  const equipment = codes.map((code) => data.equipment.find((item) => item.EquipmentCode === code)?.EquipmentName ?? code).join(", ") || schedule.Title || `PMS ${schedule.ScheduleId}`;
  const source = wr ?? schedule;
  const location = [source.bl_id, source.LevelName, source.RoomCode].filter(Boolean).join(" / ") || "—";
  return { equipment, location };
}

export function buildCoordinationItems(data: DemoData, horizonDays: number, today = isoToday()): CoordinationItem[] {
  const teams = data.stakeholderTeams ?? [];
  const requirements = data.coordinationRequirements ?? [];
  const records = data.pmCoordination ?? [];
  const items: CoordinationItem[] = [];
  const openDates = new Set<string>();
  const make = (schedule: PM_Schedule, targetDate: string, wr?: BaseWorkRequest): CoordinationItem => {
    const record = findRecord(records, schedule.ScheduleId, targetDate, wr?.WR_ID);
    const teamIds = schedule.affectedTeamIds ?? [];
    const requirementIds = schedule.requirementIds ?? [];
    return {
      key: wr ? `WR:${wr.WR_ID}` : `PMS:${schedule.ScheduleId}@${targetDate}`, source: wr ? "WR" : "Forecast", wrId: wr?.WR_ID, pmsId: schedule.ScheduleId,
      targetDate, daysUntil: diffDays(today, targetDate), schedule, wr, teamIds, requirementIds, impact: schedule.impactSummary ?? "",
      ...describe(data, schedule, wr), record, gate: evaluatePmGate({ teamIds, requirementIds, teams, requirements, record }),
    };
  };
  for (const wr of data.workRequests) {
    if (wr.WR_Type !== "PM" || ![50, 55].includes(wr.Percentage) || !wr.ScheduleId || !wr.DueDate) continue;
    const schedule = data.schedules.find((item) => item.ScheduleId === wr.ScheduleId && item.SiteId === wr.SiteId);
    if (!schedule || !isTagged(schedule)) continue;
    const date = wr.DueDate.slice(0, 10);
    openDates.add(`${schedule.ScheduleId}@${date}`);
    items.push(make(schedule, date, wr));
  }
  const end = addDaysIso(today, horizonDays);
  for (const schedule of data.schedules) {
    if (!schedule.IsActive || !isTagged(schedule)) continue;
    let reference = today;
    for (let guard = 0; guard < 24; guard++) {
      let next: { date: string } | null = null;
      try { next = getNextUnsuppressedOccurrence(schedule, data.schedules, reference); } catch { next = null; }
      if (!next || next.date > end) break;
      if (!openDates.has(`${schedule.ScheduleId}@${next.date}`)) items.push(make(schedule, next.date));
      reference = addDaysIso(next.date, 1);
    }
  }
  return items.sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.pmsId.localeCompare(b.pmsId));
}

export const needsAction = (item: CoordinationItem) => item.gate.state === "Action" || item.gate.state === "Postpone" || item.gate.state === "Discussion";

export function gateForWorkRequest(data: Pick<DemoData, "schedules" | "stakeholderTeams" | "coordinationRequirements" | "pmCoordination">, wr: Pick<BaseWorkRequest, "WR_ID" | "ScheduleId" | "DueDate" | "SiteId" | "WR_Type">) {
  if (wr.WR_Type !== "PM" || !wr.ScheduleId) return undefined;
  const schedule = data.schedules.find((item) => item.ScheduleId === wr.ScheduleId && item.SiteId === wr.SiteId);
  if (!schedule || !isTagged(schedule)) return undefined;
  const record = findRecord(data.pmCoordination, schedule.ScheduleId, wr.DueDate ?? "", wr.WR_ID);
  return evaluatePmGate({ teamIds: schedule.affectedTeamIds, requirementIds: schedule.requirementIds, teams: data.stakeholderTeams ?? [], requirements: data.coordinationRequirements ?? [], record });
}

export const newLogId = () => `LOG-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function upsertRecord(data: DemoData, item: CoordinationItem, mutate: (record: PmCoordinationRecord) => PmCoordinationRecord, actor: string): DemoData {
  const now = new Date().toISOString();
  const existing = findRecord(data.pmCoordination, item.pmsId, item.targetDate, item.wrId);
  const base: PmCoordinationRecord = existing ?? {
    id: coordinationRecordId(item.schedule.SiteId, item.pmsId, item.targetDate), siteId: item.schedule.SiteId, pmsId: item.pmsId,
    targetDate: item.targetDate, wrId: item.wrId, teamStatuses: {}, requirementStatuses: {}, discussionLog: [], decisionOverride: null, updatedAt: now,
  };
  const updated = { ...mutate({ ...base, wrId: base.wrId ?? item.wrId }), updatedAt: now };
  void actor;
  const list = data.pmCoordination ?? [];
  return { ...data, pmCoordination: existing ? list.map((entry) => entry.id === existing.id ? updated : entry) : [...list, updated] };
}

export function appendLog(record: PmCoordinationRecord, actor: string, message: string, extra: Partial<DiscussionEntry> = {}): PmCoordinationRecord {
  return { ...record, discussionLog: [...record.discussionLog, { id: newLogId(), timestamp: new Date().toISOString(), author: actor, message, ...extra }] };
}

export function setTeamStatus(record: PmCoordinationRecord, team: SiteStakeholderTeam, patch: Partial<PmCoordinationRecord["teamStatuses"][string]>, actor: string, auto = true): PmCoordinationRecord {
  const now = new Date().toISOString();
  const previous = record.teamStatuses[team.id] ?? { status: "Pending" as const, updatedAt: now, updatedBy: actor };
  const entry = { ...previous, ...patch, updatedAt: now, updatedBy: actor };
  let next: PmCoordinationRecord = { ...record, teamStatuses: { ...record.teamStatuses, [team.id]: entry } };
  if (auto && patch.status && patch.status !== previous.status) {
    const tag = patch.status === "Approved" || patch.status === "Conditional" || patch.status === "Postpone_Requested" ? patch.status : "Note";
    next = appendLog(next, actor, `${team.code}: ${previous.status.replace(/_/g, " ")} → ${patch.status.replace(/_/g, " ")}${entry.agreedWindow ? ` (window ${entry.agreedWindow})` : ""}`, { teamId: team.id, outcomeTag: tag });
  }
  return next;
}

export function generateNewsflash(item: CoordinationItem, teams: SiteStakeholderTeam[], requirement?: SiteCoordinationRequirement): string {
  const names = item.teamIds.map((id) => teams.find((team) => team.id === id)?.name).filter(Boolean).join(", ") || "All staff";
  const template = requirement?.templateText ?? "NEWSFLASH — Planned maintenance\nDate: {date}\nLocation: {location}\nAsset: {asset}\nImpact: {impact}\nAffected teams: {teams}";
  const windows = Object.values(item.record?.teamStatuses ?? {}).map((entry) => entry.agreedWindow).filter(Boolean);
  const fill = (value: string, key: string, replacement: string) => value.split(key).join(replacement);
  let text = fill(template, "{date}", formatDateDDMMYYYY(item.targetDate));
  text = fill(fill(fill(fill(text, "{location}", item.location), "{asset}", item.equipment), "{impact}", item.impact || "Minor disruption expected."), "{teams}", names);
  return windows.length ? `${text}\nAgreed time window: ${[...new Set(windows)].join(", ")}` : text;
}

export function postponeItem(data: DemoData, item: CoordinationItem, newDate: string, reason: string, actor: string, teamLabel: string): { data: DemoData; error?: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return { data, error: "Choose a valid new date." };
  if (newDate === item.targetDate) return { data, error: "The new date equals the current date." };
  if (!reason.trim()) return { data, error: "Enter a reason for the reschedule." };
  const now = new Date().toISOString();
  const offset = diffDays(item.targetDate, newDate);
  let next = data;
  if (item.wr) {
    const wrId = item.wr.WR_ID;
    const shift = (date: string | undefined) => date ? addDaysIso(date.slice(0, 10), offset) : date;
    next = { ...next, workRequests: next.workRequests.map((wr) => wr.WR_ID !== wrId ? wr : {
      ...wr, DueDate: newDate, StartDate: shift(wr.StartDate), StartDate_DateToPerform: shift(wr.StartDate_DateToPerform), MarginDate: shift(wr.MarginDate),
      UpdatedAt: now, updatedAt: now,
      Activity: [...(wr.Activity ?? []), { id: newLogId(), kind: "log" as const, actorId: actor, actorName: actor, actorRole: "Coordination", createdAt: now,
        text: `Rescheduled per ${teamLabel} alignment: ${formatDateDDMMYYYY(item.targetDate)} → ${formatDateDDMMYYYY(newDate)}. ${reason.trim()}` }],
    }) };
  } else {
    try {
      const cycleDate = item.schedule.cycleDate ?? item.schedule.anchorDate ?? item.schedule.NextDueDate.slice(0, 10);
      const result = shiftPmSchedule(next.schedules, next.blueprints, next.workRequests, item.schedule, item.targetDate, addDaysIso(cycleDate, offset), "move", actor, now);
      next = { ...next, schedules: result.schedules, workRequests: result.workRequests };
    } catch (problem) { return { data, error: problem instanceof Error ? problem.message : "Could not reschedule the PMS." }; }
  }
  const existing = findRecord(next.pmCoordination, item.pmsId, item.targetDate, item.wrId);
  if (existing) {
    let record: PmCoordinationRecord = { ...existing, targetDate: newDate, decisionOverride: existing.decisionOverride === "Hold_Postponed" ? null : existing.decisionOverride };
    const statuses = { ...record.teamStatuses };
    for (const [id, entry] of Object.entries(statuses)) if (entry.status === "Postpone_Requested") statuses[id] = { ...entry, status: "In_Discussion", updatedAt: now, updatedBy: actor };
    record = appendLog({ ...record, teamStatuses: statuses, updatedAt: now }, actor, `Rescheduled per ${teamLabel} alignment: ${formatDateDDMMYYYY(item.targetDate)} → ${formatDateDDMMYYYY(newDate)}. ${reason.trim()}`, { outcomeTag: "Rescheduled" });
    next = { ...next, pmCoordination: (next.pmCoordination ?? []).map((entry) => entry.id === existing.id ? record : entry) };
  }
  return { data: next };
}

export function createFreezeFromItem(data: DemoData, item: CoordinationItem, start: string, end: string, reason: string, actor: string): { data: DemoData; error?: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { data, error: "Enter valid freeze dates." };
  if (end < start) return { data, error: "The freeze end must not be before the start." };
  const equipment = data.equipment.find((entry) => (item.wr?.EquipmentCodes ?? item.schedule.EquipmentCodes)[0] === entry.EquipmentCode);
  const source = { bl_id: item.wr?.bl_id ?? item.schedule.bl_id ?? equipment?.bl_id, LevelName: item.wr?.LevelName ?? item.schedule.LevelName ?? equipment?.LevelName, RoomCode: item.wr?.RoomCode ?? item.schedule.RoomCode ?? equipment?.RoomCode };
  if (!source.bl_id) return { data, error: "No building could be resolved for this PM." };
  const freeze: LocationFreeze = {
    id: `FRZ-${Date.now().toString(36)}`, siteId: item.schedule.SiteId, buildingId: String(source.bl_id),
    floorId: source.LevelName ? String(source.LevelName) : undefined, roomId: source.LevelName && source.RoomCode ? String(source.RoomCode) : undefined,
    title: `PM coordination freeze · ${item.equipment}`.slice(0, 80), description: reason.trim() || "Created from PM coordination request.",
    responsiblePerson: actor, startDateTime: `${start}T00:00`, endDateTime: `${end}T23:59`, allowPM: false, allowFJ: true, allowLJ: true,
  };
  let next: DemoData = { ...data, locationFreezes: [...data.locationFreezes, freeze] };
  next = upsertRecord(next, item, (record) => appendLog(record, actor, `Location Freeze created ${formatDateDDMMYYYY(start)} – ${formatDateDDMMYYYY(end)}. ${reason.trim()}`, { outcomeTag: "Freeze_Created" }), actor);
  return { data: next };
}
