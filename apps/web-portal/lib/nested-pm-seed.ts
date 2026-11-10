import { createPMCycleKey, pmTargetLabel } from "@cafm/shared-schema";
import type { BaseWorkRequest, PM_ChecklistStandard, PMFrequencyCode, PM_Schedule, PM_ScheduleStep, SiteId, SuppressedPmOccurrence } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { createPmOrder, createTargetPmOrder, nextBlueprintCode } from "./pm-orders";
import { frequencyOf, occurrenceKey, orderedFrequencies, previewCycles, shiftDays, shiftMonths, suppressionLog, withCompiledScope } from "./pm-suppression";
import { calendarDate } from "./dispatch";

type Seeded = Pick<DemoData, "buildings" | "floors" | "rooms" | "equipment" | "blueprints" | "schedules" | "craftspeople" | "workRequests">;
export function seedNestedPM(source: Seeded, sites: SiteId[]): Seeded & { suppressedPmOccurrences: SuppressedPmOccurrence[] } {
  const data = structuredClone(source);
  data.schedules = [];
  data.blueprints = [];
  const logs: SuppressedPmOccurrence[] = [];
  const today = calendarDate(new Date());
  const year = Number(today.slice(0, 4));
  const timestamp = `${today}T08:00:00.000Z`;
  const changed = new Set<string>();
  const families: Array<{ key: string; name: string; equipment: string; codes: PMFrequencyCode[]; trade: string; copies: number }> = [
    { key: "CHILLER-MECH", name: "Chiller Routine Mechanical", equipment: "Chiller", codes: ["01M", "03M", "06M", "01Y"], trade: "Mechanical", copies: 2 },
    { key: "BOILER-MECH", name: "Heating Boiler Servicing", equipment: "Heating Boiler", codes: ["03M", "06M", "01Y"], trade: "Mechanical", copies: 2 },
    { key: "AHU", name: "Cleanroom AHU Servicing", equipment: "Cleanroom AHU", codes: ["03M", "06M", "01Y"], trade: "Mechanical", copies: 2 },
    { key: "GENERATOR-ELEC", name: "Diesel Generator Servicing", equipment: "Diesel Generator", codes: ["01M", "06M", "01Y"], trade: "Electrical", copies: 2 },
  ];
  for (const site of sites) {
    const people = data.craftspeople.filter((item) => item.SiteId === site);
    const available = data.workRequests.filter((wr) => wr.SiteId === site && wr.WR_Type === "PM" && wr.Percentage === 50);
    let index = 0;
    const makeBlueprint = (id: string, title: string, code: PMFrequencyCode, trade: string, titles: string[], family?: { id: string; name: string }, replacement?: string) => {
      const steps: PM_ScheduleStep[] = titles.map((Title, i) => ({
        StepId: `${id}-${i + 1}`, Title, SortOrder: i + 1, InputType: "Boolean", favourableBoolean: true, Options: [], IsRequired: true,
        RequiresPhotoOnFailure: true, RequiresCommentOnFailure: true, originFrequency: code, isInherited: false,
        Instructions: "Follow the approved equipment procedure and applicable isolation requirements. Record defects and supporting evidence.",
        ...(replacement && i === 0 ? { replacesStepId: replacement } : {}),
      }));
      const blueprint: PM_ChecklistStandard = { ChecklistCode: nextBlueprintCode(data.blueprints, code), SiteId: site, Title: title, MaintenanceReason: "Approved preventive maintenance",
        frequencyCode: code, blueprintMode: family ? "family_ladder" : "standalone", familyId: family?.id, familyName: family?.name,
        TradeId: trade, TradeName: trade, Steps: steps, ExpectedHours: code === "01Y" ? 3 : 1.5, IsActive: true, Version: 1 };
      data.blueprints.push(blueprint);
      return blueprint;
    };
    const statutory = makeBlueprint(`${site}-BP-STATUTORY`, "Statutory Pressure/Safety Inspection", "01Y", "Mechanical", ["Verify statutory examination documentation", "Record qualified inspector pressure and safety findings"]);
    const tour = makeBlueprint(`${site}-BP-TOUR`, "Daily Technical Plant Tour", "01D", "MultiTechnic", ["Inspect plant access and housekeeping", "Record alarms, leaks and abnormal operating conditions"]);
    for (const family of families) {
      const original = data.equipment.find((item) => item.SiteId === site && item.IsInstallation && item.EquipmentName.startsWith(family.equipment));
      if (!original) throw new Error(`Missing ${family.equipment} seed equipment at ${site}.`);
      const assets = [original];
      original.EquipmentName = `${family.equipment} #1`;
      if (family.copies === 2) {
        const second = { ...structuredClone(original), EquipmentCode: `${site}-${family.key}-02`, EquipmentName: `${family.equipment} #2` };
        data.equipment.push(second); assets.push(second);
      }
      const base = `${site}-BP-${family.key}`;
      const blueprintFamily = { id: `FAM-${String(families.indexOf(family) + 1).padStart(3, "0")}`, name: family.name };
      const procedures = family.codes.map((code) => makeBlueprint(`${base}-${code}`, `${family.name} · ${code}`, code, family.trade,
        code === "01M" ? ["Check operating indications and alarms"] :
          code === "03M" ? [family.key === "AHU" ? "Inspect air filter condition & pressure drop" : "Inspect service filter condition & pressure", "Inspect guards and access", "Inspect connections for leakage", "Verify operating temperatures"] :
            code === "06M" ? ["Inspect and lubricate bearings", "Inspect and clean heat exchanger surfaces"] :
              ["Replace bag, panel or service filters with new set", "Inspect drive train and verify alignment", "Verify annual control and safety interlocks"],
        blueprintFamily, code === "01Y" && family.codes.includes("03M") ? `${base}-03M-1` : undefined));
      for (const [assetIndex, asset] of assets.entries()) {
        const anchor = `${year}-${assetIndex ? "02-01" : "01-15"}`;
        const rules = procedures.map((blueprint) => {
          const rule = createPmOrder(data.schedules, data.blueprints, blueprint, asset, anchor, "SmartPM");
          data.schedules.push(rule);
          return rule;
        });
        const plan = previewCycles(rules, asset.EquipmentCode, anchor, 12);
        const ids = new Map<string, string>();
        const ordered = [...plan.winners].sort((a, b) => ["03M", "06M", "01Y", "01M"].indexOf(frequencyOf(a.schedule)!) - ["03M", "06M", "01Y", "01M"].indexOf(frequencyOf(b.schedule)!));
        const seeded = family.key === "GENERATOR-ELEC" && assetIndex === 1 ? ordered.slice(0, 2) : ordered;
        for (const occurrence of seeded) {
          const template = available[index++];
          if (!template) throw new Error(`Not enough open PM seed slots at ${site}.`);
          const person = people[0];
          const wr = seededRequest(template, occurrence.schedule, occurrence.dueDate, person, timestamp, today, index, data);
          data.workRequests[data.workRequests.findIndex((item) => item.WR_ID === wr.WR_ID && item.SiteId === site)] = wr;
          changed.add(wr.WR_ID);
          ids.set(occurrenceKey(occurrence), wr.WR_ID);
        }
        for (const { occurrence, coveredBy } of plan.suppressed) {
          const id = ids.get(occurrenceKey(coveredBy));
          if (!id) continue;
          logs.push(suppressionLog(occurrence, coveredBy, id, timestamp));
        }
        if (seeded.length === ordered.length) for (const rule of rules) rule.NextDueDate = shiftMonths(rule.NextDueDate, 12);
        if (family.key === "BOILER-MECH" || family.key === "CHILLER-MECH") data.schedules.push(createPmOrder(data.schedules, data.blueprints, statutory, asset, anchor, "SmartPM"));
      }
    }
    const installations = data.equipment.filter((item) => item.SiteId === site && item.IsInstallation);
    // Keep five visible default-auto-assignment examples without duplicating family orders.
    for (let i = 0; i < 5; i++) {
      const rule = createPmOrder(data.schedules, data.blueprints, tour, installations[i], today, "SmartPM");
      Object.assign(rule, { autoScheduleEnabled: true, defaultTechnicianIds: [people[i % 3].id],
        defaultTechnicianNames: [`${people[i % 3].Name} ${people[i % 3].LastName}`], defaultRecurrencePattern: "Daily",
        defaultWeekdays: [1, 2, 3, 4, 5], defaultStartTime: i === 0 ? "07:30" : "08:00", defaultDurationHours: 1.5, defaultAnchorDate: today });
      data.schedules.push(rule);
    }
    for (const asset of installations.filter((item) => !data.schedules.some((order) => order.EquipmentCodes.includes(item.EquipmentCode)))) {
      const legacy = source.blueprints.find((item) => item.SiteId === site && item.TradeId === asset.PrimaryTradeId) ?? source.blueprints.find((item) => item.SiteId === site)!;
      const bp = makeBlueprint(`${site}-BP-EQ-${asset.EquipmentCode}`, `${asset.EquipmentName} monthly inspection`, "01M", legacy.TradeId, legacy.Steps.map((item) => item.Title));
      data.schedules.push(createPmOrder(data.schedules, data.blueprints, bp, asset, `${year}-01-15`, "SmartPM"));
    }
    const safety = { id: "FAM-005", name: "Building & Room Safety Inspections" };
    const safetyMonthly = makeBlueprint(`${site}-SAFETY-01M`, "Monthly Location Safety Inspection", "01M", "Civil", ["Inspect access and housekeeping", "Record structural, hygiene and fire escape defects"], safety);
    const safetyQuarterly = makeBlueprint(`${site}-SAFETY-03M`, "Quarterly Location Safety Review", "03M", "Civil", ["Verify roof, drainage and fire safety compliance"], safety);
    const building = data.buildings.find((item) => item.SiteId === site)!;
    const floor = data.floors.find((item) => item.SiteId === site && item.bl_id === building.bl_id)!;
    const room = data.rooms.find((item) => item.SiteId === site && item.bl_id === floor.bl_id && item.LevelName === floor.LevelName)!;
    for (const target of [
      { SiteId: site, targetType: "building" as const, bl_id: building.bl_id, title: "Building Roof & Gutter Inspection" },
      { SiteId: site, targetType: "floor" as const, bl_id: floor.bl_id, LevelName: floor.LevelName, title: "Floor Fire Escape Route Check" },
      { SiteId: site, targetType: "room" as const, bl_id: room.bl_id, LevelName: room.LevelName, RoomCode: room.RoomCode, title: "Room Cleanroom Hygiene Inspection" },
    ]) for (const bp of [safetyMonthly, safetyQuarterly]) {
      const order = createTargetPmOrder(data.schedules, data.blueprints, bp, target, `${year}-10-15`, "SmartPM");
      order.Title = target.title;
      data.schedules.push(order);
      const template = available[index++];
      if (!template) throw new Error(`Not enough open PM slots for location seed at ${site}.`);
      const wr = seededRequest(template, order, order.NextDueDate, people[0], timestamp, today, index, data);
      data.workRequests[data.workRequests.findIndex((item) => item.WR_ID === wr.WR_ID && item.SiteId === site)] = { ...wr, Description: `${target.title} · ${bp.frequencyCode}` };
      changed.add(wr.WR_ID);
      order.NextDueDate = shiftMonths(order.NextDueDate, bp.frequencyCode === "01M" ? 1 : 3);
    }
    let n = 0;
    for (const [i, wr] of data.workRequests.entries()) {
      if (wr.SiteId !== site || wr.WR_Type !== "PM" || changed.has(wr.WR_ID)) continue;
      const order = data.schedules.find((item) => item.SiteId === site && item.EquipmentCodes.includes(wr.EquipmentCodes[0]) && item.suppressionMode === "independent") ??
        data.schedules.find((item) => item.SiteId === site && item.EquipmentCodes.includes(wr.EquipmentCodes[0]));
      if (!order) throw new Error(`No PM order for seed WR ${wr.WR_ID}.`);
      const due = shiftDays(`${year + 1}-03-01`, n++ * 35);
      const mapped = { ...wr, ScheduleId: order.ScheduleId, pmsId: order.ScheduleId, pmFrequency: order.frequencyCode,
        ChecklistStandardCode: order.ChecklistCode, DueDate: due, PM_CycleKey: `${createPMCycleKey(order.ScheduleId, due)}::${wr.EquipmentCodes[0]}` };
      data.workRequests[i] = wr.Percentage < 78 ? withCompiledScope(mapped, order, data.schedules, data.blueprints) : mapped;
    }
  }
  return { ...data, suppressedPmOccurrences: logs };
}

function seededRequest(template: BaseWorkRequest, schedule: PM_Schedule, due: string, person: DemoData["craftspeople"][number], now: string, today: string, index: number, data: Seeded): BaseWorkRequest {
  const asset = data.equipment.find((item) => item.SiteId === schedule.SiteId && item.EquipmentCode === schedule.EquipmentCodes[0]);
  const blueprint = data.blueprints.find((item) => item.ChecklistCode === schedule.ChecklistCode && item.SiteId === schedule.SiteId)!;
  const day = shiftDays(today, Math.floor((index - 1) / 4));
  const start = `${day}T${String(7 + ((index - 1) % 4) * 2).padStart(2, "0")}:00`;
  const end = `${day}T${String(9 + ((index - 1) % 4) * 2).padStart(2, "0")}:00`;
  const wr = withCompiledScope({
    ...template, ScheduleId: schedule.ScheduleId, ChecklistStandardCode: schedule.ChecklistCode, Description: `${blueprint.Title} · ${asset?.EquipmentName ?? pmTargetLabel(schedule)}`,
    EquipmentCodes: asset ? [asset.EquipmentCode] : [], bl_id: asset?.bl_id ?? schedule.bl_id!, LevelName: asset?.LevelName ?? schedule.LevelName, RoomCode: asset?.RoomCode ?? schedule.RoomCode,
    ProblemLocation: pmTargetLabel(schedule), TradeId: blueprint.TradeId, TradeName: blueprint.TradeName,
    PM_CycleKey: `${createPMCycleKey(schedule.ScheduleId, due)}::${asset?.EquipmentCode ?? "location"}`,
    DueDate: due, MarginDate: shiftDays(due, 7), StartDate_DateToPerform: due, StartDate: due,
    WorkRequestStatus: "Issued", WorkRequestSubstatus: "Issued", Percentage: 50, TotalTimeMinutes: 0,
    AssignedCraftpersonIds: [person.id], AssignedUserIds: [person.id],
    CraftpersonAssignments: [{ craftpersonId: person.id, assignedStartDateTime: start, assignedEndDateTime: end }],
    ChecklistResults: [], ChecklistCompleted: false, ChecklistInstances: [], StepAuditLogs: [], timeSessions: [], MobileWorkSessions: [], laborEntries: [],
    UpdatedAt: now, updatedAt: now,
    Activity: [{ id: `${template.WR_ID}:family-seed`, kind: "log", actorId: "smart-pm", actorName: "SmartPM", actorRole: "System", createdAt: now, text: `Compiled blueprint ${blueprint.ChecklistCode} for PMS #${schedule.ScheduleId}.` }],
  }, schedule, data.schedules, data.blueprints);
  wr.absorbedFrequencies = orderedFrequencies(wr.absorbedFrequencies ?? []);
  wr.StepAuditLogs = wr.ChecklistSteps?.map((step) => ({ AuditLogId: `${wr.WR_ID}:created:${step.StepId}`, StepInstanceId: `${wr.WR_ID}:${step.StepId}`, WR_ID: wr.WR_ID, ActorId: "smart-pm", Action: "created", OccurredAt: now }));
  return wr;
}
