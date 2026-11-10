import { PM_FREQUENCY_RANKS, compileBlueprintChecklist } from "@cafm/shared-schema";
export { compileBlueprintChecklist } from "@cafm/shared-schema";
import type { BaseWorkRequest, PMFrequencyCode, PM_ChecklistStandard, PM_Schedule, PM_ScheduleStep, SuppressedPmOccurrence } from "@cafm/shared-schema";

export const FREQUENCY_LABELS: Record<PMFrequencyCode, string> = {
  "01D": "Daily", "01W": "Weekly", "02W": "Fortnightly", "01M": "Monthly", "03M": "Quarterly",
  "06M": "Semi-Annual", "01Y": "Annual", "02Y": "Biennial", "05Y": "Five-Year",
};
export const orderedFrequencies = (codes: string[]) => [...new Set(codes)].sort((a, b) =>
  (PM_FREQUENCY_RANKS[a as PMFrequencyCode] ?? 0) - (PM_FREQUENCY_RANKS[b as PMFrequencyCode] ?? 0) || a.localeCompare(b));
const MONTHS: Partial<Record<PMFrequencyCode, number>> = { "01M": 1, "03M": 3, "06M": 6, "01Y": 12, "02Y": 24, "05Y": 60 };
const DAY_MS = 86400000;
export const shiftDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
export function shiftMonths(date: string, months: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  const day = parsed.getUTCDate();
  parsed.setUTCDate(1);
  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  const last = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)).getUTCDate();
  parsed.setUTCDate(Math.min(day, last));
  return parsed.toISOString().slice(0, 10);
}
export function frequencyOf(schedule: PM_Schedule): PMFrequencyCode | undefined {
  if (schedule.frequencyCode) return schedule.frequencyCode;
  const n = schedule.FrequencyInterval;
  return schedule.Frequency === "Daily" && n === 1 ? "01D" :
    schedule.Frequency === "Weekly" ? n === 1 ? "01W" : n === 2 ? "02W" : undefined :
    schedule.Frequency === "Monthly" ? n === 1 ? "01M" : n === 3 ? "03M" : n === 6 ? "06M" : undefined :
    schedule.Frequency === "Quarterly" && n === 1 ? "03M" :
    schedule.Frequency === "Yearly" ? n === 1 ? "01Y" : n === 2 ? "02Y" : n === 5 ? "05Y" : undefined : undefined;
}
export function collisionWindow(schedule: PM_Schedule): number {
  const code = frequencyOf(schedule);
  return code && PM_FREQUENCY_RANKS[code] >= 5 ? 14 : code === "01M" ? 5 : code === "01D" ? 0 : 2;
}
export function resolveBlueprintSchedule(schedule: PM_Schedule, blueprints: PM_ChecklistStandard[]): PM_Schedule {
  const blueprint = blueprints.find((item) => item.ChecklistCode === schedule.ChecklistCode && (!item.SiteId || item.SiteId === schedule.SiteId));
  if (!blueprint?.frequencyCode || !blueprint.blueprintMode) throw new Error(`PMS #${schedule.ScheduleId} needs a configured blueprint.`);
  const code = blueprint.frequencyCode;
  const months = MONTHS[code];
  return { ...schedule, frequencyCode: code, Frequency: months ? code === "01Y" || code === "02Y" || code === "05Y" ? "Yearly" : "Monthly" : code === "01D" ? "Daily" : "Weekly",
    FrequencyInterval: months ? months >= 12 ? months / 12 : months : code === "02W" ? 2 : 1,
    suppressionMode: blueprint.blueprintMode === "standalone" ? "independent" : "suppress_and_inherit",
    suppressionGroupKey: blueprint.blueprintMode === "family_ladder" ? blueprint.familyId : undefined,
    suppressionGroupName: blueprint.blueprintMode === "family_ladder" ? blueprint.familyName : blueprint.Title,
    sharedAnchorDate: schedule.anchorDate ?? schedule.sharedAnchorDate ?? schedule.NextDueDate, collisionWindowDays: undefined,
  };
}
export function sameLadder(a: PM_Schedule, b: PM_Schedule, equipment: string): boolean {
  return a.SiteId === b.SiteId && !!a.suppressionGroupKey && a.suppressionGroupKey === b.suppressionGroupKey &&
    a.suppressionMode !== "independent" && b.suppressionMode !== "independent" &&
    a.EquipmentCodes.includes(equipment) && b.EquipmentCodes.includes(equipment);
}
export function ladderSchedules(target: PM_Schedule, equipment: string, schedules: PM_Schedule[]): PM_Schedule[] {
  const rank = PM_FREQUENCY_RANKS[frequencyOf(target)!];
  if (!target.suppressionGroupKey || target.suppressionMode === "independent") return [target];
  return schedules.filter((item) => item.IsActive && sameLadder(item, target, equipment) &&
    !!frequencyOf(item) && (item.ScheduleId === target.ScheduleId || PM_FREQUENCY_RANKS[frequencyOf(item)!] < rank))
    .sort((a, b) => PM_FREQUENCY_RANKS[frequencyOf(a)!] - PM_FREQUENCY_RANKS[frequencyOf(b)!] || a.ScheduleId.localeCompare(b.ScheduleId));
}
export function compileChecklist(target: PM_Schedule, equipment: string, schedules: PM_Schedule[], blueprints: PM_ChecklistStandard[]): PM_ScheduleStep[] {
  const configured = blueprints.find((item) => item.ChecklistCode === target.ChecklistCode && (!item.SiteId || item.SiteId === target.SiteId));
  if (configured?.blueprintMode) return compileBlueprintChecklist(target.ChecklistCode, blueprints.filter((item) => !item.SiteId || item.SiteId === target.SiteId));
  const code = frequencyOf(target);
  if (target.suppressionGroupKey && target.suppressionMode !== "independent" && !code) throw new Error(`Schedule ${target.ScheduleId} needs a supported frequency before joining a cancelling ladder.`);
  const steps = ladderSchedules(target, equipment, schedules).flatMap((schedule) => {
    const blueprint = blueprints.find((item) => item.ChecklistCode === schedule.ChecklistCode && (!item.SiteId || item.SiteId === schedule.SiteId) && item.IsActive);
    if (!blueprint) throw new Error(`Active blueprint ${schedule.ChecklistCode} is missing for ${schedule.ScheduleId}.`);
    return [...blueprint.Steps].sort((a, b) => a.SortOrder - b.SortOrder).map((step) => ({
      ...structuredClone(step), originFrequency: frequencyOf(schedule), isInherited: frequencyOf(schedule) !== code,
    }));
  });
  const ids = new Set<string>();
  for (const step of steps) {
    if (ids.has(step.StepId)) throw new Error(`Duplicate step ID ${step.StepId} in suppression ladder. Use unique delta-step IDs.`);
    ids.add(step.StepId);
  }
  const omitted = new Set<string>();
  for (const step of steps) if (step.replacesStepId) {
    const lower = steps.find((item) => item.StepId === step.replacesStepId);
    if (!lower || !lower.originFrequency || !step.originFrequency ||
        PM_FREQUENCY_RANKS[lower.originFrequency] >= PM_FREQUENCY_RANKS[step.originFrequency]) {
      throw new Error(`Step ${step.Title} must replace a step from a lower frequency in the same ladder.`);
    }
    omitted.add(lower.StepId);
    step.replacesStepLabel = `Replaces ${lower.originFrequency}: ${lower.Title}`;
  }
  return steps.filter((step) => !omitted.has(step.StepId)).map((step, index) => ({ ...step, SortOrder: index + 1 }));
}

/** Anchor is cycle zero; first maintenance is one full interval after it. */
export function tickDates(schedule: PM_Schedule, from: string, to: string): string[] {
  const code = frequencyOf(schedule);
  if (!code) throw new Error(`Schedule ${schedule.ScheduleId} needs a supported frequency code.`);
  const anchor = schedule.sharedAnchorDate ?? schedule.NextDueDate;
  const anchored = !!schedule.sharedAnchorDate;
  const result: string[] = [];
  const months = MONTHS[code];
  let n = anchored ? 1 : 0;
  if (months) {
    const diff = (Number(from.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 + Number(from.slice(5, 7)) - Number(anchor.slice(5, 7));
    n = Math.max(n, Math.floor(diff / months) - 1);
  } else {
    const interval = code === "01D" ? 1 : code === "01W" ? 7 : 14;
    n = Math.max(n, Math.floor((Date.parse(from) - Date.parse(anchor)) / DAY_MS / interval) - 1);
  }
  for (let count = 0; count < 10000; count++, n++) {
    const date = months ? shiftMonths(anchor, n * months) : shiftDays(anchor, n * (code === "01D" ? 1 : code === "01W" ? 7 : 14));
    if (date > to) return result;
    if (date >= from) result.push(date);
  }
  throw new Error("PM preview exceeded 10,000 occurrences. Narrow the date range.");
}
export function nextTickOnOrAfter(schedule: PM_Schedule, date: string): string {
  const months = MONTHS[frequencyOf(schedule)!];
  const end = months ? shiftMonths(date, months + 1) : shiftDays(date, 15);
  const next = tickDates(schedule, date, end)[0];
  if (!next) throw new Error(`No next cycle found for ${schedule.ScheduleId}.`);
  return next;
}
export type PmOccurrence = { schedule: PM_Schedule; equipmentCode: string; dueDate: string };
const distance = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS;
export function planOccurrences(occurrences: PmOccurrence[]) {
  const ordered = [...occurrences].sort((a, b) =>
    (PM_FREQUENCY_RANKS[frequencyOf(b.schedule)!] ?? 0) - (PM_FREQUENCY_RANKS[frequencyOf(a.schedule)!] ?? 0) ||
    a.dueDate.localeCompare(b.dueDate) || a.schedule.ScheduleId.localeCompare(b.schedule.ScheduleId));
  const winners: PmOccurrence[] = [];
  const suppressed: Array<{ occurrence: PmOccurrence; coveredBy: PmOccurrence }> = [];
  for (const item of ordered) {
    const rank = PM_FREQUENCY_RANKS[frequencyOf(item.schedule)!];
    const winner = winners.filter((higher) => higher.equipmentCode === item.equipmentCode &&
      sameLadder(item.schedule, higher.schedule, item.equipmentCode) &&
      PM_FREQUENCY_RANKS[frequencyOf(higher.schedule)!] > rank &&
      distance(item.dueDate, higher.dueDate) <= Math.min(collisionWindow(item.schedule), collisionWindow(higher.schedule)))
      .sort((a, b) => distance(a.dueDate, item.dueDate) - distance(b.dueDate, item.dueDate) || a.dueDate.localeCompare(b.dueDate))[0];
    if (winner) suppressed.push({ occurrence: item, coveredBy: winner });
    else winners.push(item);
  }
  return { winners: winners.sort((a, b) => a.dueDate.localeCompare(b.dueDate)), suppressed };
}
export const occurrenceKey = (item: PmOccurrence) => `${item.schedule.SiteId}:${item.schedule.ScheduleId}:${item.equipmentCode}:${item.dueDate}`;
export function previewCycles(schedules: PM_Schedule[], equipmentCode: string, from: string, months: number) {
  const to = shiftMonths(from, months);
  const active = schedules.filter((item) => item.IsActive && item.EquipmentCodes.includes(equipmentCode));
  const padding = Math.max(0, ...active.map(collisionWindow));
  const occurrences = active.flatMap((schedule) => tickDates(schedule, shiftDays(from, 1 - padding), shiftDays(to, padding))
    .map((dueDate) => ({ schedule, equipmentCode, dueDate })));
  const plan = planOccurrences(occurrences);
  const inRange = (item: PmOccurrence) => item.dueDate > from && item.dueDate <= to;
  const winners = plan.winners.filter((item) => inRange(item) || plan.suppressed.some((entry) => inRange(entry.occurrence) && occurrenceKey(entry.coveredBy) === occurrenceKey(item)));
  const keys = new Set(winners.map(occurrenceKey));
  return { winners, suppressed: plan.suppressed.filter((entry) => keys.has(occurrenceKey(entry.coveredBy)) && inRange(entry.occurrence)) };
}
export function suppressionLog(lower: PmOccurrence, higher: PmOccurrence, wrId: string, now: string): SuppressedPmOccurrence {
  return { id: `suppressed:${occurrenceKey(lower)}`, siteId: lower.schedule.SiteId, equipmentCode: lower.equipmentCode,
    suppressionGroupName: lower.schedule.suppressionGroupName ?? lower.schedule.suppressionGroupKey ?? "Maintenance",
    suppressedFrequency: frequencyOf(lower.schedule)!, dueDate: lower.dueDate, coveredByFrequency: frequencyOf(higher.schedule)!,
    coveredByWrId: wrId, createdAt: now, suppressedPmsId: lower.schedule.ScheduleId, coveredByPmsId: higher.schedule.ScheduleId };
}
export function mergeSuppressionLogs(existing: SuppressedPmOccurrence[], added: SuppressedPmOccurrence[]) {
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of added) if (!map.has(item.id)) map.set(item.id, item);
  return [...map.values()];
}
export function isUnstarted(wr: BaseWorkRequest) {
  return wr.Percentage === 50 && !wr.TotalTimeMinutes && !wr.timeSessions?.length && !wr.MobileWorkSessions?.length &&
    !wr.ChecklistResults?.length && !wr.ChecklistInstances?.some((item) => item.IsCompleted) &&
    !wr.laborEntries?.some((item) => (item.effectiveMinutes ?? 0) > 0) &&
    !wr.CraftpersonLabor?.some((item) => item.workingTimeMinutes > 0);
}
export function withCompiledScope(wr: BaseWorkRequest, schedule: PM_Schedule, schedules: PM_Schedule[], blueprints: PM_ChecklistStandard[]): BaseWorkRequest {
  if (blueprints.some((item) => item.ChecklistCode === schedule.ChecklistCode && item.blueprintMode)) schedule = resolveBlueprintSchedule(schedule, blueprints);
  const equipment = wr.EquipmentCodes[0];
  const steps = compileChecklist(schedule, equipment, schedules, blueprints);
  const code = frequencyOf(schedule);
  const absorbed = schedules.filter((item) => item.IsActive && sameLadder(schedule, item, equipment) &&
    frequencyOf(item) && PM_FREQUENCY_RANKS[frequencyOf(item)!] < PM_FREQUENCY_RANKS[code!]).map((item) => frequencyOf(item)!);
  return { ...wr, pmFrequency: code, pmsId: /^\d{5}$/.test(schedule.ScheduleId) ? schedule.ScheduleId : undefined, suppressionGroupName: schedule.suppressionGroupName,
    absorbedFrequencies: orderedFrequencies(absorbed),
    ChecklistSteps: steps, ChecklistInstances: steps.map((step) => ({
      ...step, StepInstanceId: `${wr.WR_ID}:${step.StepId}`, WR_ID: wr.WR_ID, ScheduleId: schedule.ScheduleId,
      ChecklistCode: schedule.ChecklistCode, PhotoIds: [], IsFailed: false, IsCompleted: false,
    })),
  };
}
export function reconcileOpenPMs(workRequests: BaseWorkRequest[], schedules: PM_Schedule[], blueprints: PM_ChecklistStandard[], logs: SuppressedPmOccurrence[], now: string) {
  schedules = schedules.map((item) => resolveBlueprintSchedule(item, blueprints));
  const candidates = workRequests.flatMap((wr) => {
    const schedule = schedules.find((item) => item.ScheduleId === wr.ScheduleId && item.SiteId === wr.SiteId && item.IsActive);
    return wr.WR_Type === "PM" && wr.Percentage !== 27 && !wr.suppressedByWrId && wr.DueDate && wr.EquipmentCodes.length === 1 &&
      schedule && frequencyOf(schedule) && schedule.suppressionMode !== "independent" && schedule.suppressionGroupKey
      ? [{ wr, schedule, equipmentCode: wr.EquipmentCodes[0], dueDate: wr.DueDate.slice(0, 10) }] : [];
  });
  const ordered = [...candidates].sort((a, b) => PM_FREQUENCY_RANKS[frequencyOf(b.schedule)!] - PM_FREQUENCY_RANKS[frequencyOf(a.schedule)!] || a.wr.WR_ID.localeCompare(b.wr.WR_ID));
  const updates = new Map<string, BaseWorkRequest>();
  const added: SuppressedPmOccurrence[] = [];
  for (const lower of ordered) {
    if (!isUnstarted(lower.wr)) continue;
    const higher = ordered.filter((item) => item.wr !== lower.wr && !updates.get(item.wr.WR_ID)?.suppressedByWrId &&
      sameLadder(lower.schedule, item.schedule, lower.equipmentCode) && item.equipmentCode === lower.equipmentCode &&
      PM_FREQUENCY_RANKS[frequencyOf(item.schedule)!] > PM_FREQUENCY_RANKS[frequencyOf(lower.schedule)!] &&
      distance(item.dueDate, lower.dueDate) <= Math.min(collisionWindow(item.schedule), collisionWindow(lower.schedule)))
      .sort((a, b) => PM_FREQUENCY_RANKS[frequencyOf(b.schedule)!] - PM_FREQUENCY_RANKS[frequencyOf(a.schedule)!] ||
        distance(a.dueDate, lower.dueDate) - distance(b.dueDate, lower.dueDate) || a.wr.WR_ID.localeCompare(b.wr.WR_ID))[0];
    if (!higher) continue;
    // Never claim coverage by an already executed scope that omitted the lower checks.
    const originalWinner = updates.get(higher.wr.WR_ID) ?? higher.wr;
    const required = compileChecklist(higher.schedule, higher.equipmentCode, schedules, blueprints);
    if (!isUnstarted(originalWinner) && required.some((step) => !originalWinner.ChecklistSteps?.some((item) => item.StepId === step.StepId))) continue;
    const winner = isUnstarted(originalWinner) ? withCompiledScope(originalWinner, higher.schedule, schedules, blueprints) : originalWinner;
    const absorbed = orderedFrequencies([...(winner.absorbedFrequencies ?? []), frequencyOf(lower.schedule)!, ...(lower.wr.absorbedFrequencies ?? [])]);
    const text = `Suppressed — covered by ${frequencyOf(higher.schedule)} WR #${higher.wr.WR_ID}`;
    const newSteps = winner.ChecklistInstances?.filter((step) => !originalWinner.ChecklistInstances?.some((old) => old.StepInstanceId === step.StepInstanceId)) ?? [];
    updates.set(higher.wr.WR_ID, { ...winner, absorbedFrequencies: absorbed, UpdatedAt: now, updatedAt: now,
      StepAuditLogs: [...(originalWinner.StepAuditLogs ?? []), ...newSteps.map((step) => ({
        AuditLogId: `suppression:${step.StepInstanceId}`, StepInstanceId: step.StepInstanceId, WR_ID: winner.WR_ID,
        ActorId: "smart-pm", Action: "created" as const, OccurredAt: now,
      }))] });
    updates.set(lower.wr.WR_ID, { ...lower.wr, Percentage: 27, WorkRequestStatus: "Cancelled", WorkRequestSubstatus: text,
      suppressedByWrId: higher.wr.WR_ID, pmFrequency: frequencyOf(lower.schedule), UpdatedAt: now, updatedAt: now,
      Activity: [...(lower.wr.Activity ?? []), { id: `suppression:${lower.wr.WR_ID}`, kind: "log", actorId: "smart-pm", actorName: "SmartPM", actorRole: "System", createdAt: now, text }] });
    added.push(suppressionLog(lower, higher, higher.wr.WR_ID, now));
  }
  return { workRequests: workRequests.map((wr) => updates.get(wr.WR_ID) ?? wr), suppressedPmOccurrences: mergeSuppressionLogs(logs, added), suppressed: added.length };
}
