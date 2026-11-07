import { createPMCycleKey, getInitialIssuedStatus } from "@cafm/shared-schema";
import type { BaseWorkRequest, Equipment, PM_ChecklistStandard, PM_Schedule, SiteId } from "@cafm/shared-schema";

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
};

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime())) throw new Error(`Invalid schedule date: ${date}`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function nextDue(schedule: PM_Schedule, due: string): string {
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

export function generatePMWorkRequests(input: GenerationInput): { workRequests: BaseWorkRequest[]; schedules: PM_Schedule[]; generated: number; skipped: number } {
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
  const schedules = input.schedules.map((schedule) => {
    if (schedule.SiteId !== input.siteId || !schedule.IsActive ||
        (input.mode !== "horizon" && !input.selectedIds.includes(schedule.ScheduleId))) return schedule;
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
    let due = schedule.NextDueDate;
    let cycles = 0;
    while (input.mode !== "horizon" ? cycles === 0 : addDays(due, -schedule.LeadTimeDays) <= horizon) {
      if (++cycles > 1000) throw new Error(`Schedule ${schedule.ScheduleId} has too many overdue cycles; update its next due date.`);
      const baseCycle = createPMCycleKey(schedule.ScheduleId, due);
      for (const target of targets) {
        const cycle = `${baseCycle}::${target.code ?? "location"}`;
        if (requests.some((wr) => wr.SiteId === input.siteId && wr.ScheduleId === schedule.ScheduleId &&
          (wr.PM_CycleKey === cycle || (wr.PM_CycleKey === baseCycle && (!target.code || wr.EquipmentCodes.includes(target.code)))))) {
          skipped++;
          continue;
        }
        const timestamp = input.now.toISOString();
        const wrId = `PM-${crypto.randomUUID()}`;
        requests.push({
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
        });
        generated++;
      }
      due = nextDue(schedule, due);
    }
    return cycles ? { ...schedule, NextDueDate: due, UpdatedAt: input.now.toISOString() } : schedule;
  });
  return { schedules, workRequests: requests, generated, skipped };
}
