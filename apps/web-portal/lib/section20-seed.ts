import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { BaseWorkRequest, Building, Equipment, Floor, PM_ChecklistStandard, PM_Schedule, Room, SiteId } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";

const systems = [
  ["Chiller", "Mechanical", "bar", 3, 8], ["Diesel Generator", "Electrical", "V", 380, 420],
  ["UPS System", "Electrical", "V", 220, 240], ["Fire Damper", "MultiTechnic", "s", 0, 30],
  ["Cleanroom AHU", "Mechanical", "Pa", 150, 500], ["Roof Drain", "Civil", "mm", 0, 5],
  ["Heavy Crane", "HeavyGang", "kN", 1, 50], ["Kitchen Extraction", "Catering", "Pa", 100, 400],
  ["Lift Controller", "MultiTechnic", "s", 1, 15], ["Domestic Water Pump", "Mechanical", "bar", 2, 6],
  ["Cleaning Equipment", "Cleaning", "hours", 0, 100], ["Emergency Lighting", "Electrical", "minutes", 90, 180],
] as const;
const stages: Array<[number, string]> = [
  [0, "New Request for Quotation"], [10, "Work Request from Fast Job - On Hold"], [20, "Quotation Preparation Offer by Contractor"],
  [21, "Quotation Preparation Offer by Trade"], [23, "Quotation Not Accepted by ESA-TM. Review by Contractor"],
  [25, "Submitted for Acceptance"], [26, "Submitted to User for Acceptance"], [27, "Cancelled"], [28, "Quotation Accepted"],
  [29, "Quotation Rejected"], [30, "Request for Work"], [31, "On Hold for Budget"], [32, "Approved and Ordered"],
  [40, "Committed"], [50, "Work In Progress"], [55, "On Hold for Access / Labor / Parts"], [78, "Technically Completed"],
  [79, "Pre-SAT Approved"], [80, "Acceptance Invitation Sent"], [81, "SAT Approved"], [94, "All Acceptances Completed"],
  [95, "Completed"], [96, "Yellow Page Signed"], [97, "Costs Approved"], [98, "Final Approval"],
  [99, "Invoice Information Confirmed"], [100, "Payment Confirmed"],
];
const people = ["Mark", "Claudia", "Thomas", "Yvonne", "Bastian", "Marko", "Lidija"];

function activity(id: string, type: string, stage: number): NonNullable<BaseWorkRequest["Activity"]> {
  const date = "2026-10-12T08:00:00.000Z";
  const logs = [
    `${type} work request created and assigned for site review.`,
    `Marko inspected the equipment and recorded initial observations.`,
    stage === 0 ? "Quotation request recorded for initial review." : stage === 50 ? "Work request issued for execution at 50%." : `Work request advanced to ${stage}% after review.`,
  ].map((text, index) => ({ id: `${id}-log-${index}`, kind: "log" as const, actorId: people[index], actorName: people[index], actorRole: index === 2 ? "ESA_TO" : "MobileTechnician", createdAt: date, text }));
  const comments = [0, 1, 2].map((index) => ({
    id: `${id}-comment-${index}`, kind: "comment" as const, actorId: people[(stage + index) % people.length],
    actorName: people[(stage + index) % people.length], actorRole: index === 0 ? "TRADE_TM" : "ESA_TO",
    createdAt: "2026-10-13T10:00:00.000Z",
    text: ["Please coordinate site access before the next visit.", "Inspection notes reviewed; follow-up has been scheduled.", "Confirm the equipment is safe before returning it to service."][index],
    ...(index === 0 ? { editedAt: "2026-10-14T09:00:00.000Z", editHistory: [{ text: "Please confirm site access.", timestamp: "2026-10-13T10:00:00.000Z" }] } : {}),
  }));
  return [...logs, ...comments];
}

export function section20Seed(sites: SiteId[]): Pick<DemoData, "buildings" | "floors" | "rooms" | "equipment" | "blueprints" | "schedules" | "craftspeople" | "workRequests"> {
  const buildings: Building[] = [], floors: Floor[] = [], rooms: Room[] = [], equipment: Equipment[] = [];
  const blueprints: PM_ChecklistStandard[] = [], schedules: PM_Schedule[] = [], craftspeople: DemoData["craftspeople"] = [], workRequests: BaseWorkRequest[] = [];
  for (const site of sites) {
    const tag = site.slice(-2);
    for (let b = 1; b <= 4; b++) {
      const bl_id = `S${tag}-BL-${b}`;
      buildings.push({ SiteId: site, bl_id, Name: ["Operations Centre", "Engineering Block", "Technical Services", "Logistics Building"][b - 1], Address: `${b} Campus Way, ${site}`, IsActive: true });
      for (let f = 0; f < 3; f++) {
        const LevelName = `Level ${f}`;
        floors.push({ SiteId: site, bl_id, LevelName, FloorNumber: f, GrossAreaM2: 1250 + f * 100, IsActive: true });
        for (let r = 1; r <= 2; r++) rooms.push({ SiteId: site, bl_id, LevelName, RoomCode: `S${tag}-B${b}-L${f}-R${r}`,
          Name: r === 1 ? "Plant and services room" : "Operations workspace", NetAreaM2: 48 + b * 4 + f * 3, IsDeskReservable: r === 2, IsActive: true });
      }
    }
    const siteRooms = rooms.filter((item) => item.SiteId === site);
    for (let i = 0; i < 10; i++) {
      const trade = CLASSICAL_TRADES[i % CLASSICAL_TRADES.length];
      craftspeople.push({ id: `S${tag}-C${i + 1}`, SiteId: site, Name: ["Marko", "Anna", "Pieter", "Sofia", "Lukas", "Sara", "Marco", "Elena", "Klaus", "Ines"][i],
        LastName: ["Novak", "Meyer", "Visser", "Rossi", "Weber", "Costa", "Bianchi", "Schmidt", "Fischer", "Silva"][i], Trade: trade, HourlyRate: 38 + i * 3, ShiftHours: i % 3 === 0 ? 7.5 : 8, SkillLevel: 2 + i % 3 });
    }
    for (let i = 0; i < systems.length; i++) {
      const room = siteRooms[i];
      const system = systems[i % systems.length];
      const root = `S${tag}-EQ-${i + 1}-I`, child = `S${tag}-EQ-${i + 1}-S`;
      for (const [level, code, parent] of [["Installation", root, undefined], ["Subequipment", child, root], ["SubSubequipment", `S${tag}-EQ-${i + 1}-P`, child]] as const) {
        equipment.push({ SiteId: site, bl_id: room.bl_id, LevelName: room.LevelName, RoomCode: room.RoomCode, EquipmentCode: code,
          EquipmentName: `${system[0]} ${level}`, IsInstallation: level === "Installation", Status: "Active",
          ParentEquipmentCode: parent, PrimaryTradeId: system[1], Manufacturer: "Campus Systems", Model: `CS-${100 + i}`,
          TechnicalSpecifications: { service: system[0], location: room.RoomCode }, Criticality: i % 3 === 0 ? "High" : "Medium" });
      }
    }
    for (let i = 0; i < systems.length; i++) {
      const [name, trade, unit, min, max] = systems[i];
      const code = `S${tag}-BP-${i + 1}`;
      const options = [{ OptionId: "ok", Label: "Normal", Value: "normal", SortOrder: 1, TriggersFailure: false },
        { OptionId: "fault", Label: "Requires attention", Value: "fault", SortOrder: 2, TriggersFailure: true }];
      const base = { RequiresPhotoOnFailure: true, RequiresCommentOnFailure: true, IsRequired: true };
      blueprints.push({ SiteId: site, ChecklistCode: code, Title: `${name} preventive inspection`, MaintenanceReason: "Scheduled preventive maintenance",
        TradeId: trade, TradeName: trade, ExpectedHours: 1.5 + (i % 3) * 0.5, IsActive: true, Version: 1, Steps: [
          { ...base, StepId: `${code}-1`, Title: "Is the equipment safe and accessible?", SortOrder: 1, InputType: "Boolean", favourableBoolean: true, Options: [] },
          { ...base, StepId: `${code}-2`, Title: "Is there visible damage or leakage?", SortOrder: 2, InputType: "Boolean", favourableBoolean: false, Options: [] },
          { ...base, StepId: `${code}-3`, Title: `Measure operating ${unit}`, SortOrder: 3, InputType: "Numeric", Unit: unit, MinThreshold: min, MaxThreshold: max, Options: [] },
          { ...base, StepId: `${code}-4`, Title: "Select operating condition", SortOrder: 4, InputType: "SingleSelect", Options: options },
          { ...base, StepId: `${code}-5`, Title: "Check components", SortOrder: 5, InputType: "MultiSelect", Options: options },
          { ...base, StepId: `${code}-6`, Title: "Record technician observations", SortOrder: 6, InputType: "FreeText", Options: [], IsRequired: false },
        ] });
    }
    const siteEquipment = equipment.filter((item) => item.SiteId === site && item.IsInstallation);
    for (let i = 0; i < 18; i++) {
      const eq = siteEquipment[i % siteEquipment.length], blueprint = blueprints.filter((item) => item.SiteId === site)[i % siteEquipment.length];
      schedules.push({ ScheduleId: `S${tag}-PMS-${i + 1}`, ChecklistCode: blueprint.ChecklistCode, SiteId: site,
        EquipmentCodes: [eq.EquipmentCode], bl_id: eq.bl_id, LevelName: eq.LevelName, RoomCode: eq.RoomCode,
        Frequency: (["Monthly", "Quarterly", "Yearly"] as const)[i % 3], FrequencyInterval: 1, LeadTimeDays: 14, MarginWindowDays: 7,
        NextDueDate: `2026-12-${String(1 + i).padStart(2, "0")}`, IsActive: true, CreatedBy: "Mark" });
    }
    const siteSchedules = schedules.filter((item) => item.SiteId === site);
    const siteCraft = craftspeople.filter((item) => item.SiteId === site);
    const make = (type: "PM" | "FJ" | "LJ", i: number, percentage: number, description: string): BaseWorkRequest => {
      const eq = siteEquipment[i % siteEquipment.length], trade = eq.PrimaryTradeId ?? "MultiTechnic";
      const id = `S${tag}-${type}-${String(i + 1).padStart(3, "0")}`;
      return { WR_ID: id, WR_Type: type, ESAWorkType: type === "PM" ? "Preventive Maintenance" : "Corrective Maintenance",
        Description: `${type === "PM" ? "Scheduled inspection" : type === "FJ" ? "Repair and make safe" : "Upgrade and refurbishment"}: ${eq.EquipmentName}`,
        ProblemLocation: `${eq.bl_id} / ${eq.LevelName} / ${eq.RoomCode}`, SiteId: site, bl_id: eq.bl_id, LevelName: eq.LevelName, RoomCode: eq.RoomCode,
        TradeId: trade, TradeName: trade, EquipmentCodes: [eq.EquipmentCode], AssignedCraftpersonIds: [siteCraft.find((person) => person.Trade === trade)!.id],
        AssignedUserIds: [], CreatedBy: "Mark", CreatedDate: "2026-10-10", UpdatedAt: "2026-10-14T09:00:00.000Z", DueDate: "2026-12-15", MarginDate: "2026-12-22",
        WorkRequestStatus: percentage === 27 || percentage === 29 ? "Cancelled" : percentage === 100 ? "Closed" : percentage >= 78 ? "Technically Completed" : percentage === 55 ? "On Hold" : type === "LJ" && percentage < 20 ? "Requested" : "Issued",
        WorkRequestSubstatus: description, Percentage: percentage, IsFrozen: percentage === 55, ...(percentage === 55 ? { FreezeReason: ["Access", "Labor", "Parts"][i % 3], FreezeStartedAt: "2026-10-13T10:00:00.000Z" } : {}),
        TotalTimeMinutes: percentage >= 78 ? 90 : 0, StartDateTBD: false, EstimatedCostEur: type === "LJ" ? 1200 + i * 275 : type === "FJ" ? 120 + i * 20 : 80 + i * 5,
        ...(type === "LJ" ? { CostType: i % 2 ? "Ceiling" as const : "Fixed" as const, ProcessTrack: percentage < 30 ? "RFQ" as const : "RFW" as const } : {}),
        RequiresSAT: type === "LJ" && i % 3 === 0, RequiresDrawingUpdate: type === "LJ" && i % 3 === 1, RequiresInventoryUpdate: type === "LJ" && i % 3 === 2,
        AcceptanceGates: [], Activity: activity(id, type, percentage) };
    };
    for (let i = 0; i < 30; i++) {
      const queue = i % 7, pct = [50, 55, 78, 78, 78, 100, 27][queue];
      const schedule = siteSchedules[i % siteSchedules.length], blueprint = blueprints.find((item) => item.ChecklistCode === schedule.ChecklistCode)!;
      const wr = make("PM", i, pct, ["Issued", `On Hold for ${["Access", "Labor", "Parts"][i % 3]}`, "Technically Completed", "Technically Completed", "Technically Completed", "Approved", "Cancelled"][queue]);
      const eq = siteEquipment[(i % siteSchedules.length) % siteEquipment.length];
      workRequests.push({ ...wr, bl_id: eq.bl_id, LevelName: eq.LevelName, RoomCode: eq.RoomCode,
        ProblemLocation: `${eq.bl_id} / ${eq.LevelName} / ${eq.RoomCode}`, EquipmentCodes: [eq.EquipmentCode],
        TradeId: blueprint.TradeId, TradeName: blueprint.TradeName,
        AssignedCraftpersonIds: [siteCraft.find((person) => person.Trade === blueprint.TradeName)!.id],
        ScheduleId: schedule.ScheduleId, ChecklistStandardCode: blueprint.ChecklistCode, ChecklistSteps: blueprint.Steps,
        ...(pct >= 78 ? { ChecklistCompleted: true, ChecklistResults: blueprint.Steps.map((step) => ({
          stepId: step.StepId, passed: true, value: step.InputType === "Numeric" ? (step.MinThreshold ?? 0) : step.InputType === "Boolean" ? String(step.favourableBoolean ?? true) : step.InputType === "MultiSelect" ? ["ok"] : step.InputType === "SingleSelect" ? "ok" : "No additional defects observed.",
          completedAt: "2026-10-12T10:00:00.000Z",
        })) } : {}),
        ...(queue === 2 ? { QA_InspectionStatus: "Pending" as const, AuditInspectionStatus: "To Be Inspected" as const } : {}),
        ...(queue === 3 ? { QA_InspectionStatus: "Passed" as const, AuditInspectionStatus: "Passed Inspected" as const } : {}),
        ...(queue === 4 ? { QA_InspectionStatus: "ToBeCorrected" as const, AuditInspectionStatus: "PM WRs to be corrected" as const, QA_IssueDescription: "Leak observed at isolation valve.", QA_CorrectionComment: "Replace seal and repeat pressure test." } : {}) });
    }
    for (let i = 0; i < 20; i++) {
      const pct = [50, 55, 78, 100, 27][i % 5];
      workRequests.push({ ...make("FJ", i, pct, ["Issued", "On Hold", "Technically Completed", "Approved", "Cancelled"][i % 5]),
        ParentPM_WR_ID: `S${tag}-PM-${String(i + 1).padStart(3, "0")}`, ...(i === 0 ? { EscalatedToLJ_WR_ID: `S${tag}-LJ-002` } : {}) });
    }
    stages.forEach(([pct, description], i) => {
      const wr = make("LJ", i, pct, description);
      const requiresSAT = wr.RequiresSAT || [79, 80, 81].includes(pct);
      const requiresDrawing = wr.RequiresDrawingUpdate || pct === 81;
      const gates: BaseWorkRequest["AcceptanceGates"] = [];
      for (const [type, required] of [["SAT", requiresSAT], ["DrawingEngineering", requiresDrawing], ["CIFMInventory", wr.RequiresInventoryUpdate]] as const) {
        if (!required) continue;
        const approved = pct >= 94 || (type === "SAT" && pct === 81);
        gates.push({ GateType: type, IsRequired: true, Status: approved ? "Approved" : pct === 80 ? "InvitationSent" : "Pending",
          ...(approved ? { ApprovedBy: "Thomas", ApprovedAt: "2026-10-14T09:00:00.000Z" } : {}) });
      }
      workRequests.push({ ...wr, RequiresSAT: requiresSAT, RequiresDrawingUpdate: requiresDrawing, AcceptanceGates: gates,
        ...(requiresSAT && pct >= 79 ? { PreSATApproved: true } : {}),
        ...(pct === 10 ? { OriginatingFJ_WR_ID: `S${tag}-FJ-001` } : {}) });
    });
  }
  return { buildings, floors, rooms, equipment, blueprints, schedules, craftspeople, workRequests };
}
