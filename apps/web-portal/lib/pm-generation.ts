import { createPMCycleKey, getInitialIssuedStatus } from "@cafm/shared-schema";
import { applyAllPmsAutoSchedules } from "./pms-auto-schedule";
import type { Craftsperson } from "./pms-auto-schedule";
import type { BaseWorkRequest, Equipment, PM_ChecklistStandard, PM_Schedule, SiteId } from "@cafm/shared-schema";
import type { SuppressedPmOccurrence } from "@cafm/shared-schema";
import { collisionWindow, compileChecklist, frequencyOf, isUnstarted, mergeSuppressionLogs, nextTickOnOrAfter, occurrenceKey, orderedFrequencies, planOccurrences, reconcileOpenPMs, sameLadder, shiftDays, suppressionLog, withCompiledScope } from "./pm-suppression";
import type { PmOccurrence } from "./pm-suppression";

type Actor = { id: string; name: string; role: string };
type GenerationInput = {
  schedules: PM_Schedule[];
  blueprints: PM_ChecklistStandard[];
  equipment: Equipment[];
  workRequests: BaseWorkRequest[];
  siteId: SiteId;
  mode: "single" | "selected" | "horizon";
  selectedIds: string[];
  horizonDays: number;
  now: Date;
  actor: Actor;
  craftspeople?: Craftsperson[];
  suppressedPmOccurrences?: SuppressedPmOccurrence[];
};

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime())) throw new Error(`Invalid schedule date: ${date}`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function nextDue(schedule: PM_Schedule, due: string): string {
  if (schedule.frequencyCode || schedule.sharedAnchorDate) {
    return nextTickOnOrAfter(schedule, shiftDays(due, 1));
  }
  if (schedule.Frequency === "Daily") return addDays(due, schedule.FrequencyInterval);
  if (schedule.Frequency === "Weekly") return addDays(due, schedule.FrequencyInterval * 7);
  if (schedule.Frequency === "Meter-based") throw new Error(`Schedule ${schedule.ScheduleId} is meter-based and requires a meter reading before generation.`);
  const date = new Date(`${due}T00:00:00.000Z`);
  const months = schedule.FrequencyInterval * (schedule.Frequency === "Quarterly" ? 3 : schedule.Frequency === "Yearly" ? 12 : 1);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

export function generatePMWorkRequests(input: GenerationInput): { workRequests: BaseWorkRequest[]; schedules: PM_Schedule[]; generated: number; skipped: number; suppressedPmOccurrences: SuppressedPmOccurrence[] } {
  if (!Number.isInteger(input.horizonDays) || input.horizonDays < 1 || input.horizonDays > 365) throw new Error("Horizon must be between 1 and 365 days.");
  if (input.mode !== "horizon" && (input.selectedIds.length === 0 || (input.mode === "single" && input.selectedIds.length !== 1))) {
    throw new Error(input.mode === "single" ? "Select one schedule." : "Select at least one schedule.");
  }
  if (input.mode !== "horizon" && input.selectedIds.some((id) =>
    !input.schedules.some((schedule) => schedule.SiteId === input.siteId && schedule.IsActive && schedule.ScheduleId === id))) {
    throw new Error("A selected schedule is no longer active at this site.");
  }
  const status = getInitialIssuedStatus("Preventive Maintenance");
  const today = input.now.toISOString().slice(0, 10);
  const horizon = addDays(today, input.horizonDays);
  const requests = [...input.workRequests];
  let generated = 0;
  let skipped = 0;
  const selected = input.schedules.filter((item) => item.SiteId === input.siteId && item.IsActive &&
    (input.mode === "horizon" || input.selectedIds.includes(item.ScheduleId)));
  const included = input.schedules.filter((item) => item.SiteId === input.siteId && item.IsActive &&
    (selected.includes(item) || selected.some((other) => other.EquipmentCodes.some((code) => sameLadder(item, other, code)))));
  const planned: PmOccurrence[] = [];
  const dueDates = new Map<string, string[]>();
  const eligible = new Set<string>();
  const maxWindow = Math.max(0, ...included.map(collisionWindow));
  const bounds = selected.map((schedule) => input.mode === "horizon" ? addDays(horizon, schedule.LeadTimeDays) :
    schedule.sharedAnchorDate ? nextTickOnOrAfter(schedule, schedule.NextDueDate) : schedule.NextDueDate);
  const end = addDays(bounds.sort().at(-1) ?? horizon, maxWindow);
  for (const schedule of included) {
    if (schedule.Frequency === "Meter-based") continue;
    let due = schedule.NextDueDate;
    if (schedule.sharedAnchorDate) due = nextTickOnOrAfter(schedule, due);
    const dates: string[] = [];
    for (let count = 0; due <= end; count++) {
      if (count > 1000) throw new Error(`Schedule ${schedule.ScheduleId} has too many overdue cycles.`);
      dates.push(due);
      if (selected.includes(schedule) && (input.mode === "horizon" ? addDays(due, -schedule.LeadTimeDays) <= horizon : dates.length === 1)) eligible.add(`${schedule.ScheduleId}:${due}`);
      for (const equipmentCode of schedule.EquipmentCodes) planned.push({ schedule, equipmentCode, dueDate: due });
      due = nextDue(schedule, due);
    }
    dueDates.set(schedule.ScheduleId, dates);
  }
  const existingByKey = new Map<string, BaseWorkRequest>();
  const earliest = shiftDays([...dueDates.values()].flat().sort()[0] ?? today, -maxWindow);
  for (const wr of requests) {
    const schedule = included.find((item) => item.ScheduleId === wr.ScheduleId && item.SiteId === wr.SiteId);
    if (wr.WR_Type !== "PM" || !schedule || !wr.DueDate || wr.EquipmentCodes.length !== 1) continue;
    const occurrence = { schedule, equipmentCode: wr.EquipmentCodes[0], dueDate: wr.DueDate.slice(0, 10) };
    existingByKey.set(occurrenceKey(occurrence), wr);
    if (sameLadder(schedule, schedule, occurrence.equipmentCode) && occurrence.dueDate >= earliest && occurrence.dueDate <= end &&
        !planned.some((item) => occurrenceKey(item) === occurrenceKey(occurrence))) planned.push(occurrence);
  }
  const canCover = (wr: BaseWorkRequest, occurrence: PmOccurrence) => wr.Percentage !== 27 && !wr.suppressedByWrId &&
    (isUnstarted(wr) || compileChecklist(occurrence.schedule, occurrence.equipmentCode, input.schedules, input.blueprints)
      .every((step) => wr.ChecklistSteps?.some((existing) => existing.StepId === step.StepId)));
  const candidatePlan = planOccurrences(planned.filter((item) => {
    const existing = existingByKey.get(occurrenceKey(item));
    return !existing || canCover(existing, item);
  }));
  const plan = { ...candidatePlan, suppressed: candidatePlan.suppressed.filter(({ occurrence }) => {
    const existing = existingByKey.get(occurrenceKey(occurrence));
    return !existing || isUnstarted(existing);
  }) };
  const needed = (item: PmOccurrence) => eligible.has(`${item.schedule.ScheduleId}:${item.dueDate}`);
  const winners = plan.winners.filter((item) => needed(item) || plan.suppressed.some((entry) => occurrenceKey(entry.coveredBy) === occurrenceKey(item) && needed(entry.occurrence)));
  const winnerKeys = new Set(winners.map(occurrenceKey));
  const coveredIds = new Map<string, string>();
  for (const winner of winners) {
    const existing = existingByKey.get(occurrenceKey(winner));
    if (!existing) continue;
    coveredIds.set(occurrenceKey(winner), existing.WR_ID);
    const absorbed = plan.suppressed.filter((entry) => occurrenceKey(entry.coveredBy) === occurrenceKey(winner)).map((entry) => frequencyOf(entry.occurrence.schedule)!);
    if (absorbed.length) {
      const scoped = isUnstarted(existing) ? withCompiledScope(existing, winner.schedule, input.schedules, input.blueprints) : existing;
      const now = input.now.toISOString();
      const additions = scoped.ChecklistInstances?.filter((step) => !existing.ChecklistInstances?.some((old) => old.StepInstanceId === step.StepInstanceId)) ?? [];
      requests[requests.indexOf(existing)] = { ...scoped, absorbedFrequencies: orderedFrequencies([...(existing.absorbedFrequencies ?? []), ...absorbed]),
        UpdatedAt: now, updatedAt: now, StepAuditLogs: [...(existing.StepAuditLogs ?? []), ...additions.map((step) => ({
          AuditLogId: crypto.randomUUID(), StepInstanceId: step.StepInstanceId, WR_ID: existing.WR_ID, ActorId: input.actor.id, Action: "created" as const, OccurredAt: now,
        }))] };
    }
  }
  const schedules = input.schedules.map((schedule) => {
    if (!included.includes(schedule)) return schedule;
    if (schedule.Frequency === "Meter-based") {
      if (input.mode === "horizon") return schedule;
      throw new Error(`Schedule ${schedule.ScheduleId} is meter-based and requires a meter reading before generation.`);
    }
    if (!Number.isInteger(schedule.FrequencyInterval) || schedule.FrequencyInterval < 1) {
      throw new Error(`Schedule ${schedule.ScheduleId} has an invalid frequency interval.`);
    }
    const blueprint = input.blueprints.find((item) => item.SiteId === input.siteId && item.ChecklistCode === schedule.ChecklistCode && item.IsActive);
    if (!blueprint) throw new Error(`Active blueprint ${schedule.ChecklistCode} was not found for schedule ${schedule.ScheduleId}.`);
    const targets = schedule.EquipmentCodes.length
      ? schedule.EquipmentCodes.map((code) => {
          const item = input.equipment.find((entry) => entry.SiteId === input.siteId && entry.EquipmentCode === code);
          if (!item) throw new Error(`Equipment ${code} for schedule ${schedule.ScheduleId} was not found at this site.`);
          return { code, bl_id: item.bl_id, LevelName: item.LevelName, RoomCode: item.RoomCode };
        })
      : [{ code: undefined, bl_id: schedule.bl_id, LevelName: schedule.LevelName, RoomCode: schedule.RoomCode }];
    if (targets.some((target) => !target.bl_id)) throw new Error(`Schedule ${schedule.ScheduleId} has no building.`);
    let cycles = 0;
    let lastProcessed: string | undefined;
    for (const due of dueDates.get(schedule.ScheduleId) ?? []) {
      const locationEligible = !schedule.EquipmentCodes.length && eligible.has(`${schedule.ScheduleId}:${due}`);
      const processed = locationEligible || schedule.EquipmentCodes.some((equipmentCode) => {
        const key = occurrenceKey({ schedule, equipmentCode, dueDate: due });
        return (eligible.has(`${schedule.ScheduleId}:${due}`) && existingByKey.has(key)) || winnerKeys.has(key) || plan.suppressed.some((entry) => occurrenceKey(entry.occurrence) === key && winnerKeys.has(occurrenceKey(entry.coveredBy)));
      });
      if (!processed) continue;
      lastProcessed = due;
      if (++cycles > 1000) throw new Error(`Schedule ${schedule.ScheduleId} has too many overdue cycles; update its next due date.`);
      const baseCycle = createPMCycleKey(schedule.ScheduleId, due);
      for (const target of targets) {
        const occurrence = target.code ? { schedule, equipmentCode: target.code, dueDate: due } : undefined;
        if (occurrence && !winnerKeys.has(occurrenceKey(occurrence))) { skipped++; continue; }
        const cycle = `${baseCycle}::${target.code ?? "location"}`;
        const existing = requests.find((wr) => wr.SiteId === input.siteId && wr.ScheduleId === schedule.ScheduleId &&
          (wr.PM_CycleKey === cycle || (wr.PM_CycleKey === baseCycle && (!target.code || wr.EquipmentCodes.includes(target.code))) ||
            (target.code && wr.EquipmentCodes.includes(target.code) && wr.DueDate?.slice(0, 10) === due)));
        if (existing) {
          if (occurrence && !existing.suppressedByWrId && existing.Percentage !== 27) coveredIds.set(occurrenceKey(occurrence), existing.WR_ID);
          skipped++;
          continue;
        }
        const timestamp = input.now.toISOString();
        const wrId = `PM-${crypto.randomUUID()}`;
        const request: BaseWorkRequest = {
          WR_ID: wrId, WR_Type: "PM",
          Description: blueprint.Title, TradeId: blueprint.TradeId, TradeName: blueprint.TradeName,
          EquipmentCodes: target.code ? [target.code] : [], PM_CycleKey: cycle, ScheduleId: schedule.ScheduleId,
          ExpectedHours: blueprint.ExpectedHours, TotalTimeMinutes: 0, CreatedDate: today,
          StartDate: addDays(due, -schedule.LeadTimeDays), StartDateTBD: false, DueDate: due,
          MarginDate: addDays(due, schedule.MarginWindowDays), ...status,
          SiteId: input.siteId, bl_id: target.bl_id!, LevelName: target.LevelName, RoomCode: target.RoomCode,
          CreatedBy: input.actor.id, AssignedCraftpersonIds: [], AssignedUserIds: [], IsFrozen: false,
          RequiresSAT: false, RequiresDrawingUpdate: false, RequiresInventoryUpdate: false, AcceptanceGates: [],
          ChecklistSteps: structuredClone(blueprint.Steps), ChecklistResults: [], UpdatedAt: timestamp,
          ChecklistInstances: blueprint.Steps.map((step) => ({
            StepInstanceId: `${wrId}:${step.StepId}`, WR_ID: wrId, ScheduleId: schedule.ScheduleId,
            ChecklistCode: blueprint.ChecklistCode, StepId: step.StepId, Title: step.Title,
            Instructions: step.Instructions, SortOrder: step.SortOrder, InputType: step.InputType,
            favourableBoolean: step.favourableBoolean, Unit: step.Unit, MinThreshold: step.MinThreshold,
            MaxThreshold: step.MaxThreshold, Options: structuredClone(step.Options),
            RequiresPhotoOnFailure: step.RequiresPhotoOnFailure, RequiresCommentOnFailure: step.RequiresCommentOnFailure,
            PhotoIds: [], IsFailed: false, IsCompleted: false,
          })),
          StepAuditLogs: blueprint.Steps.map((step) => ({ AuditLogId: crypto.randomUUID(),
            StepInstanceId: `${wrId}:${step.StepId}`, WR_ID: wrId, ActorId: input.actor.id,
            Action: "created" as const, NewValue: structuredClone(step), OccurredAt: timestamp })),
          Activity: [{ id: crypto.randomUUID(), kind: "log", actorId: input.actor.id, actorName: input.actor.name,
            actorRole: input.actor.role, createdAt: timestamp, text: `PM work request generated at 50% Issued by ${input.actor.name}` }],
        };
        const scoped = withCompiledScope(request, schedule, input.schedules, input.blueprints);
        const absorbed = occurrence ? plan.suppressed.filter((entry) => occurrenceKey(entry.coveredBy) === occurrenceKey(occurrence)).map((entry) => frequencyOf(entry.occurrence.schedule)!) : [];
        scoped.absorbedFrequencies = orderedFrequencies(absorbed);
        scoped.StepAuditLogs = scoped.ChecklistSteps?.map((step) => ({ AuditLogId: crypto.randomUUID(), StepInstanceId: `${wrId}:${step.StepId}`, WR_ID: wrId, ActorId: input.actor.id, Action: "created", NewValue: structuredClone(step), OccurredAt: timestamp }));
        requests.push(scoped);
        if (occurrence) coveredIds.set(occurrenceKey(occurrence), wrId);
        generated++;
      }
    }
    return lastProcessed ? { ...schedule, NextDueDate: nextDue(schedule, lastProcessed), UpdatedAt: input.now.toISOString() } : schedule;
  });
  const addedLogs = plan.suppressed.flatMap(({ occurrence, coveredBy }) => {
    const id = coveredIds.get(occurrenceKey(coveredBy));
    if (!winnerKeys.has(occurrenceKey(coveredBy))) return [];
    if (!id) throw new Error(`Suppression winner ${occurrenceKey(coveredBy)} has no persisted work request.`);
    return [suppressionLog(occurrence, coveredBy, id, input.now.toISOString())];
  });
  const reconciled = reconcileOpenPMs(requests, schedules, input.blueprints,
    mergeSuppressionLogs(input.suppressedPmOccurrences ?? [], addedLogs), input.now.toISOString());
  const created = new Set(requests.slice(input.workRequests.length).map((wr) => wr.WR_ID));
  const scheduled = input.craftspeople && created.size
    ? applyAllPmsAutoSchedules(reconciled.workRequests, schedules.filter((item) => item.SiteId === input.siteId), input.craftspeople, { onlyIds: created, from: today })
    : reconciled.workRequests;
  return { schedules, workRequests: scheduled, generated, skipped, suppressedPmOccurrences: reconciled.suppressedPmOccurrences };
}
