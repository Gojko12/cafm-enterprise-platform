import { createPMCycleKey } from "@cafm/shared-schema";
import type { BaseWorkRequest, PM_ChecklistStandard, PM_Schedule, PM_ScheduleStep, SiteId, SuppressedPmOccurrence } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { frequencyOf, occurrenceKey, orderedFrequencies, previewCycles, shiftDays, shiftMonths, suppressionLog, withCompiledScope } from "./pm-suppression";
import { calendarDate } from "./dispatch";

type Seeded = Pick<DemoData, "buildings" | "floors" | "rooms" | "equipment" | "blueprints" | "schedules" | "craftspeople" | "workRequests">;
export function seedNestedPM(source: Seeded, sites: SiteId[]): Seeded & { suppressedPmOccurrences: SuppressedPmOccurrence[] } {
  const data = structuredClone(source);
  const logs: SuppressedPmOccurrence[] = [];
  const today = calendarDate(new Date());
  const year = Number(today.slice(0, 4));
  const anchor = `${year}-01-15`;
  const timestamp = `${today}T08:00:00.000Z`;
  for (const site of sites) {
    const assets = data.equipment.filter((asset) => asset.SiteId === site && asset.IsInstallation &&
      ["Cleanroom AHU", "Heating Boiler", "Chiller", "Diesel Generator"].some((name) => asset.EquipmentName.startsWith(name)));
    const available = data.workRequests.filter((wr) => wr.SiteId === site && wr.WR_Type === "PM" && wr.Percentage === 50);
    const people = data.craftspeople.filter((person) => person.SiteId === site);
    let index = 0;
    for (const asset of assets) {
      const base = `${site}-NEST-${asset.EquipmentCode}`;
      const group = "routine-mech";
      const isAir = asset.EquipmentName.startsWith("Cleanroom AHU");
      const titles: Record<"03M" | "06M" | "01Y", string[]> = {
        "03M": [isAir ? "Inspect air filter condition & pressure drop" : "Inspect service filter condition & operating pressure", "Inspect guards, isolators and service access", "Inspect pipework, seals and connections for leaks", "Verify operating temperatures and control indications"],
        "06M": ["Inspect and lubricate bearings to manufacturer specification", isAir ? "Inspect and clean heat exchanger coils" : "Inspect heat exchanger surfaces and auxiliary cooling circuit"],
        "01Y": [isAir ? "Replace bag & panel filters with new set" : "Replace service filters with manufacturer-approved set", "Inspect drive train and verify alignment", "Perform annual control and safety interlock verification"],
      };
      const rules: PM_Schedule[] = [];
      for (const code of ["03M", "06M", "01Y"] as const) {
        const checklist = `${base}-${code}`;
        const steps: PM_ScheduleStep[] = titles[code].map((Title, i) => ({
          StepId: `${checklist}-${i + 1}`, Title, SortOrder: i + 1, InputType: "Boolean", favourableBoolean: true,
          Options: [], IsRequired: true, RequiresPhotoOnFailure: true, RequiresCommentOnFailure: true,
          Instructions: "Follow the approved equipment procedure and applicable isolation requirements. Record any defects with evidence.",
          originFrequency: code, isInherited: false,
          ...(code === "01Y" && i === 0 ? { replacesStepId: `${base}-03M-1`, replacesStepLabel: `Replaces 03M: ${titles["03M"][0]}` } : {}),
        }));
        const metadata = { frequencyCode: code, suppressionMode: "suppress_and_inherit" as const, suppressionGroupKey: group, suppressionGroupName: "Routine Mechanical Servicing", sharedAnchorDate: anchor, collisionWindowDays: 14 };
        data.blueprints.push({
          SiteId: site, ChecklistCode: checklist, Title: `${asset.EquipmentName} · ${code} delta procedure`,
          MaintenanceReason: "Nested preventive servicing", TradeId: asset.PrimaryTradeId ?? "Mechanical",
          TradeName: asset.PrimaryTradeId ?? "Mechanical", ExpectedHours: code === "03M" ? 1 : code === "06M" ? 2 : 3,
          Steps: steps, IsActive: true, Version: 1, ...metadata,
        });
        const months = code === "03M" ? 3 : code === "06M" ? 6 : 12;
        rules.push({
          ScheduleId: `${base}-PMS-${code}`, SiteId: site, ChecklistCode: checklist, Title: `${asset.EquipmentName} ${code}`,
          EquipmentCodes: [asset.EquipmentCode], bl_id: asset.bl_id, LevelName: asset.LevelName, RoomCode: asset.RoomCode,
          Frequency: code === "03M" ? "Quarterly" : code === "06M" ? "Monthly" : "Yearly", FrequencyInterval: code === "06M" ? 6 : 1,
          LeadTimeDays: 14, MarginWindowDays: 7, NextDueDate: shiftMonths(anchor, 12 + months), IsActive: true, CreatedBy: "SmartPM",
          ...metadata,
        });
      }
      data.schedules.push(...rules);
      const plan = previewCycles(rules, asset.EquipmentCode, anchor, 12);
      const ids = new Map<string, string>();
      const ordered = [...plan.winners].sort((a, b) => ["03M", "06M", "01Y"].indexOf(frequencyOf(a.schedule)!) - ["03M", "06M", "01Y"].indexOf(frequencyOf(b.schedule)!));
      for (const occurrence of ordered) {
        const template = available[index++];
        if (!template) throw new Error(`Not enough open PM seed slots at ${site}.`);
        const absorbed = plan.suppressed.filter((entry) => occurrenceKey(entry.coveredBy) === occurrenceKey(occurrence)).map((entry) => frequencyOf(entry.occurrence.schedule)!);
        const person = people[0];
        const wr = seededRequest(template, occurrence.schedule, occurrence.dueDate, orderedFrequencies(absorbed), person, timestamp, today, index, data);
        data.workRequests[data.workRequests.findIndex((item) => item.WR_ID === wr.WR_ID && item.SiteId === site)] = wr;
        ids.set(occurrenceKey(occurrence), wr.WR_ID);
      }
      for (const { occurrence, coveredBy } of plan.suppressed) {
        const id = ids.get(occurrenceKey(coveredBy));
        if (!id) throw new Error("Suppression seed winner is missing.");
        logs.push(suppressionLog(occurrence, coveredBy, id, timestamp));
      }
      if (asset.EquipmentName.startsWith("Heating Boiler") || asset.EquipmentName.startsWith("Chiller")) {
        const checklist = `${base}-STATUTORY`;
        const blueprint: PM_ChecklistStandard = {
          SiteId: site, ChecklistCode: checklist, Title: "Statutory Pressure/Safety Inspection", MaintenanceReason: "Independent statutory compliance",
          TradeId: asset.PrimaryTradeId ?? "Mechanical", TradeName: asset.PrimaryTradeId ?? "Mechanical", ExpectedHours: 2,
          Steps: ["Verify valid statutory examination documentation", "Record qualified inspector safety findings"].map((Title, i) => ({
            StepId: `${checklist}-${i}`, Title, SortOrder: i + 1, InputType: "Boolean", favourableBoolean: true, IsRequired: true,
            Options: [], RequiresPhotoOnFailure: true, RequiresCommentOnFailure: true,
          })), IsActive: true, Version: 1, frequencyCode: "01Y", suppressionMode: "independent", suppressionGroupKey: "statutory-safety", suppressionGroupName: "Statutory Pressure/Safety Inspection",
        };
        data.blueprints.push(blueprint);
        const rule: PM_Schedule = {
          ...rules[2], ScheduleId: `${base}-PMS-STATUTORY`, ChecklistCode: checklist, Title: blueprint.Title,
          suppressionMode: "independent", suppressionGroupKey: "statutory-safety", suppressionGroupName: blueprint.Title,
        };
        data.schedules.push(rule);
        const template = available[index++];
        if (!template) throw new Error(`Not enough independent PM seed slots at ${site}.`);
        const wr = seededRequest(template, rule, shiftMonths(anchor, 12), [], people[1] ?? people[0], timestamp, today, index, data);
        data.workRequests[data.workRequests.findIndex((item) => item.WR_ID === wr.WR_ID && item.SiteId === site)] = wr;
      }
    }
  }
  return { ...data, suppressedPmOccurrences: logs };
}

function seededRequest(template: BaseWorkRequest, schedule: PM_Schedule, due: string, absorbed: string[], person: DemoData["craftspeople"][number], now: string, today: string, index: number, data: Seeded): BaseWorkRequest {
  const asset = data.equipment.find((item) => item.SiteId === schedule.SiteId && item.EquipmentCode === schedule.EquipmentCodes[0])!;
  const blueprint = data.blueprints.find((item) => item.ChecklistCode === schedule.ChecklistCode && item.SiteId === schedule.SiteId)!;
  const day = shiftDays(today, Math.floor((index - 1) / 4));
  const start = `${day}T${String(7 + ((index - 1) % 4) * 2).padStart(2, "0")}:00`;
  const end = `${day}T${String(9 + ((index - 1) % 4) * 2).padStart(2, "0")}:00`;
  const wr = withCompiledScope({
    ...template, ScheduleId: schedule.ScheduleId, ChecklistStandardCode: schedule.ChecklistCode, Description: `${schedule.Title} maintenance`,
    EquipmentCodes: [asset.EquipmentCode], bl_id: asset.bl_id, LevelName: asset.LevelName, RoomCode: asset.RoomCode,
    ProblemLocation: `${asset.bl_id} / ${asset.LevelName} / ${asset.RoomCode}`, TradeId: blueprint.TradeId, TradeName: blueprint.TradeName,
    PM_CycleKey: `${createPMCycleKey(schedule.ScheduleId, due)}::${asset.EquipmentCode}`,
    DueDate: due, MarginDate: shiftDays(due, 7), StartDate_DateToPerform: due, StartDate: due,
    WorkRequestStatus: "Issued", WorkRequestSubstatus: "Issued", Percentage: 50, TotalTimeMinutes: 0,
    AssignedCraftpersonIds: [person.id], AssignedUserIds: [person.id],
    CraftpersonAssignments: [{ craftpersonId: person.id, assignedStartDateTime: start, assignedEndDateTime: end }],
    ChecklistResults: [], ChecklistCompleted: false, ChecklistInstances: [], StepAuditLogs: [], timeSessions: [], MobileWorkSessions: [], laborEntries: [],
    absorbedFrequencies: absorbed, UpdatedAt: now, updatedAt: now,
    Activity: [{ id: `${template.WR_ID}:nested-seed`, kind: "log", actorId: "smart-pm", actorName: "SmartPM", actorRole: "System", createdAt: now, text: `Compiled ${frequencyOf(schedule)} scope${absorbed.length ? `; absorbed ${absorbed.join(" + ")}` : ""}.` }],
  }, schedule, data.schedules, data.blueprints);
  wr.StepAuditLogs = wr.ChecklistSteps?.map((step) => ({ AuditLogId: `${wr.WR_ID}:created:${step.StepId}`, StepInstanceId: `${wr.WR_ID}:${step.StepId}`, WR_ID: wr.WR_ID, ActorId: "smart-pm", Action: "created", OccurredAt: now }));
  return wr;
}
