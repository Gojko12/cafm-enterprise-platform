import type { BaseWorkRequest, Equipment, PM_ChecklistStandard, SiteId } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { addDays, calendarDate } from "./dispatch";

type Seeded = Pick<DemoData, "buildings" | "floors" | "rooms" | "equipment" | "blueprints" | "schedules" | "craftspeople" | "workRequests">;
type Slot = "freeze" | "overdue" | "today" | "upcoming" | "other" | "unassigned";
type Plan = { type: "PM" | "FJ" | "LJ"; pct: number; slot: Slot };

export const SEEDED_WRS_PER_SITE = 90;

const TODAY_SLOTS = [["07:00", "09:00"], ["09:30", "11:30"], ["12:00", "14:00"], ["14:30", "16:30"], ["17:00", "18:00"]] as const;
const FREEZE_SLOTS = [["09:00", "12:00"], ["12:30", "15:00"], ["15:30", "17:30"]] as const;
const FUTURE_SLOTS = [["07:00", "10:00"], ["10:30", "14:00"], ["08:00", "12:00"]] as const;

// 90 WRs per site: 81 PM / 6 FJ / 3 LJ with 72 x 50%, 3 x 55%, 3 x 78%, 10 x 100%, 2 early-stage (27% / 29%).
function buildPlan(): Plan[] {
  const plan: Plan[] = [];
  const slots: Array<[Slot, number]> = [["freeze", 6], ["overdue", 8], ["today", 14], ["upcoming", 14]];
  for (const [slot, count] of slots) for (let i = 0; i < count; i++) plan.push({ type: "PM", pct: 50, slot });
  const others: Array<Plan["type"]> = ["FJ", "FJ", "FJ", "LJ", ...Array<Plan["type"]>(11).fill("PM")];
  others.forEach((type) => plan.push({ type, pct: 50, slot: "other" }));
  for (let i = 0; i < 15; i++) plan.push({ type: "PM", pct: 50, slot: "unassigned" });
  plan.push({ type: "PM", pct: 55, slot: "other" }, { type: "PM", pct: 55, slot: "other" }, { type: "FJ", pct: 55, slot: "other" });
  for (let i = 0; i < 3; i++) plan.push({ type: "PM", pct: 78, slot: "other" });
  for (let i = 0; i < 8; i++) plan.push({ type: "PM", pct: 100, slot: "other" });
  plan.push({ type: "FJ", pct: 100, slot: "other" }, { type: "LJ", pct: 100, slot: "other" });
  plan.push({ type: "FJ", pct: 27, slot: "other" }, { type: "LJ", pct: 29, slot: "other" });
  return plan;
}

function checklistResults(blueprint: PM_ChecklistStandard) {
  return blueprint.Steps.map((step) => ({
    stepId: step.StepId, passed: true,
    value: step.InputType === "Numeric" ? (step.MinThreshold ?? 0) : step.InputType === "Boolean" ? String(step.favourableBoolean ?? true) : step.InputType === "MultiSelect" ? ["ok"] : step.InputType === "SingleSelect" ? "ok" : "No additional defects observed.",
    completedAt: "2026-10-12T10:00:00.000Z",
  }));
}

const RESET_KEYS = ["qaTeamLeaderChallenges", "technicianFieldUpdates", "QA_AuditStatus", "QA_InspectionStatus", "AuditInspectionStatus", "QA_IssueDescription", "QA_InspectedBy", "QA_InspectedDate", "QA_SelectionMode", "QA_CompletionDate", "qaReinspectionCount", "EscalatedToLJ_WR_ID", "OriginatingFJ_WR_ID", "CraftpersonAssignments", "StartDate_DateToPerform", "PlannedFreezeText", "ChecklistResults", "ChecklistCompleted", "timeSessions", "laborEntries", "ScheduleId", "ChecklistStandardCode", "ChecklistSteps"];

export function expandSeededWorkRequests(seeded: Seeded, sites: SiteId[]): Seeded {
  const today = calendarDate(new Date());
  const plan = buildPlan();
  const workRequests: BaseWorkRequest[] = [];
  sites.forEach((site, siteIndex) => {
    const tag = site.slice(-2);
    const pool = seeded.workRequests.filter((wr) => wr.SiteId === site);
    const installs = seeded.equipment.filter((item) => item.SiteId === site && item.IsInstallation && item.EquipmentCode !== "AHU-ROSETTA");
    const frozenInstalls = installs.filter((item) => item.bl_id === `S${tag}-BL-1`);
    const blueprints = seeded.blueprints.filter((item) => item.SiteId === site);
    const schedules = seeded.schedules.filter((item) => item.SiteId === site);
    const crafts = seeded.craftspeople.filter((item) => item.SiteId === site);
    const gregor = crafts[0];
    const colleagues = crafts.slice(1);
    const counters: Record<string, number> = {};
    const firstPm = `2026${String(siteIndex * 100 + 1).padStart(6, "0")}`;
    const template = (type: Plan["type"], pct: number) => {
      const matches = pool.filter((wr) => wr.WR_Type === type && wr.Percentage === pct);
      const found = matches.find((wr) => !wr.qaTeamLeaderChallenges?.length && !wr.technicianFieldUpdates?.length) ?? matches[0];
      if (!found) throw new Error(`Missing ${type} ${pct}% seed template for ${site}.`);
      return found;
    };
    const order: Record<Plan["type"], number> = { PM: 0, FJ: 81, LJ: 87 };
    plan.forEach((entry) => {
      const key = entry.type;
      const n = counters[key] = (counters[key] ?? 0) + 1;
      const id = `2026${String(siteIndex * 100 + order[entry.type] + n).padStart(6, "0")}`;
      const base = template(entry.type, entry.pct);
      const seq = n - 1 + (entry.type === "PM" ? 0 : 3);
      const eqList: Equipment[] = entry.slot === "freeze" && frozenInstalls.length ? frozenInstalls : installs;
      const eq = eqList[seq % eqList.length];
      const eqIndex = installs.indexOf(eq);
      const blueprint = blueprints[eqIndex % blueprints.length];
      const description = `${entry.type === "PM" ? "Scheduled inspection" : entry.type === "FJ" ? "Repair and make safe" : "Upgrade and refurbishment"}: ${eq.EquipmentName}`;
      const wr = JSON.parse(JSON.stringify(base).split(base.WR_ID).join(id).split(base.Description).join(description)) as BaseWorkRequest & Record<string, unknown>;
      for (const resetKey of RESET_KEYS) delete wr[resetKey];
      const trade = entry.type === "PM" ? blueprint.TradeName : (eq.PrimaryTradeId ?? "MultiTechnic");
      Object.assign(wr, {
        WR_ID: id, Description: description, SiteId: site, bl_id: eq.bl_id, LevelName: eq.LevelName, RoomCode: eq.RoomCode,
        ProblemLocation: `${eq.bl_id} / ${eq.LevelName} / ${eq.RoomCode}`, EquipmentCodes: [eq.EquipmentCode],
        TradeId: entry.type === "PM" ? blueprint.TradeId : trade, TradeName: trade, ExpectedHours: [2, 4, 3, 2.5][seq % 4],
        Helper_SortUrgency: (seq % 4) + 1, DueDate: addDays(today, 14), MarginDate: addDays(today, 21), AssignedUserIds: [],
      });
      if (entry.type === "FJ") wr.ParentPM_WR_ID = firstPm;
      if (entry.type === "PM") {
        const schedule = schedules.find((item) => item.ChecklistCode === blueprint.ChecklistCode) ?? schedules[0];
        Object.assign(wr, { ScheduleId: schedule.ScheduleId, ChecklistStandardCode: blueprint.ChecklistCode, ChecklistSteps: blueprint.Steps });
        if (entry.pct >= 78) Object.assign(wr, { ChecklistCompleted: true, ChecklistResults: checklistResults(blueprint) });
        if (entry.pct === 78) wr.QA_AuditStatus = n === 1 ? "ToBeInspected" : "None";
        if (entry.pct === 100) {
          wr.QA_AuditStatus = (["QA_Passed", "QA_Verified", "None"] as const)[n % 3];
          if (wr.QA_AuditStatus !== "None") Object.assign(wr, { QA_InspectedBy: "Thomas", QA_InspectedDate: "2026-10-14T09:00:00Z", QA_SelectionMode: "ComputerRandom5Percent" });
        }
      }
      const colleague = colleagues.find((item) => item.Trade === trade && !(wr.AssignedCraftpersonIds ?? []).includes(item.id)) ?? colleagues[seq % colleagues.length];
      const assignee = entry.slot === "freeze" || entry.slot === "overdue" || entry.slot === "today" || entry.slot === "upcoming" ? gregor
        : entry.slot === "unassigned" ? undefined
          : entry.pct === 55 && entry.type === "PM" ? gregor : entry.pct === 78 && n % 3 === 1 ? gregor : colleague;
      wr.AssignedCraftpersonIds = assignee ? [assignee.id] : [];
      if (assignee && entry.pct < 100 && entry.pct !== 27 && entry.pct !== 29) {
        const k = n - 1;
        const [day, [start, end]] = entry.slot === "overdue" ? [addDays(today, -(1 + (k % 3))), FUTURE_SLOTS[k % 3]]
          : entry.slot === "today" ? [today, TODAY_SLOTS[k % TODAY_SLOTS.length]]
            : entry.slot === "freeze" ? [today, FREEZE_SLOTS[k % FREEZE_SLOTS.length]]
              : [addDays(today, 1 + (k % 6)), FUTURE_SLOTS[k % 3]];
        wr.StartDate_DateToPerform = day;
        if (entry.slot === "overdue") wr.DueDate = day;
        if (entry.pct === 50 || entry.pct === 55) wr.CraftpersonAssignments = [{ craftpersonId: assignee.id, assignedStartDateTime: `${day}T${start}`, assignedEndDateTime: `${day}T${end}` }];
      }
      if (assignee && entry.pct >= 78) {
        const name = `${assignee.Name} ${assignee.LastName}`;
        wr.timeSessions = [
          { id: `${id}-session-1`, craftpersonId: assignee.id, craftpersonName: name, startedAt: "2026-10-12T08:00:00.000Z", endedAt: "2026-10-12T08:45:00.000Z", durationMinutes: 45 },
          { id: `${id}-session-2`, craftpersonId: assignee.id, craftpersonName: name, startedAt: "2026-10-12T09:00:00.000Z", endedAt: "2026-10-12T09:45:00.000Z", durationMinutes: 45 },
        ];
        wr.laborEntries = [{ craftpersonId: assignee.id, name: assignee.Name, lastName: assignee.LastName, trade: assignee.Trade, hourlyRate: assignee.HourlyRate, recordedTimerMinutes: 90, effectiveMinutes: 90 }];
        wr.TotalTimeMinutes = 90;
      }
      workRequests.push(wr);
    });
  });
  const schedules = seeded.schedules.map((item) => ({ ...item }));
  sites.forEach((site) => {
    const crafts = seeded.craftspeople.filter((item) => item.SiteId === site);
    const siteSchedules = schedules.filter((item) => item.SiteId === site);
    const rules: Array<Partial<(typeof schedules)[number]> & { techs: number[] }> = [
      { Title: "Daily Morning Plant Tour", defaultRecurrencePattern: "Daily", defaultWeekdays: [1, 2, 3, 4, 5], defaultStartTime: "07:30", defaultDurationHours: 1.5, techs: [0] },
      { Title: "Weekly Mechanical/Electrical Maintenance", defaultRecurrencePattern: "Weekly", defaultWeekdays: [1, 3], defaultStartTime: "08:00", defaultDurationHours: 2, techs: [0, 1] },
      { Title: "Weekly Chiller & AHU Inspection", defaultRecurrencePattern: "Weekly", defaultWeekdays: [4], defaultStartTime: "13:00", defaultDurationHours: 2, techs: [2] },
      { Title: "Biweekly Backup Generator Check", defaultRecurrencePattern: "Biweekly", defaultWeekdays: [2], defaultStartTime: "09:00", defaultDurationHours: 1.5, techs: [0] },
      { Title: "Monthly Boiler Safety Check", defaultRecurrencePattern: "Monthly", defaultDayOfMonth: 5, defaultStartTime: "10:00", defaultDurationHours: 2, techs: [3] },
    ];
    rules.forEach(({ techs, ...rule }, index) => {
      const target = siteSchedules[index];
      if (!target) return;
      const people = techs.map((i) => crafts[i % Math.max(crafts.length, 1)]).filter(Boolean);
      Object.assign(target, rule, {
        autoScheduleEnabled: true, defaultAnchorDate: today,
        defaultTechnicianIds: people.map((item) => item.id), defaultTechnicianNames: people.map((item) => `${item.Name} ${item.LastName}`),
      });
    });
  });
  const ruleById = new Map(schedules.filter((item) => item.autoScheduleEnabled).map((item) => [item.ScheduleId, item]));
  const tagged = workRequests.map((wr) => {
    const rule = (wr as { ScheduleId?: string }).ScheduleId ? ruleById.get((wr as { ScheduleId?: string }).ScheduleId!) : undefined;
    if (!rule || wr.WR_Type !== "PM" || wr.Percentage !== 50 || !wr.CraftpersonAssignments?.length) return wr;
    return { ...wr, CraftpersonAssignments: wr.CraftpersonAssignments.map((entry) => rule.defaultTechnicianIds?.includes(entry.craftpersonId) ? { ...entry, autoScheduledFromPmsId: rule.ScheduleId } : entry) };
  });
  return { ...seeded, schedules, workRequests: tagged };
}
