import { CLASSICAL_TRADES, EQUIPMENT_STATUSES } from "@cafm/shared-schema";
import type { BaseWorkRequest, Building, Equipment, Floor, PM_ChecklistStandard, PM_Schedule, Room, SiteId } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { DEFAULT_SHIFTS } from "./craftperson-shifts";
import { addDays, calendarDate } from "./dispatch";

const systems = [
  ["Chiller", "Mechanical", "bar", 3, 8], ["Diesel Generator", "Electrical", "V", 380, 420],
  ["UPS System", "Electrical", "V", 220, 240], ["Fire Damper", "MultiTechnic", "s", 0, 30],
  ["Cleanroom AHU", "Mechanical", "Pa", 150, 500], ["Roof Drain", "Civil", "mm", 0, 5],
  ["Heavy Crane", "HeavyGang", "kN", 1, 50], ["Kitchen Extraction", "Catering", "Pa", 100, 400],
  ["Lift Controller", "MultiTechnic", "s", 1, 15], ["Domestic Water Pump", "Mechanical", "bar", 2, 6],
  ["Cleaning Equipment", "Cleaning", "hours", 0, 100], ["Emergency Lighting", "Electrical", "minutes", 90, 180],
  ["Compressed Air Compressor", "Mechanical", "bar", 5, 9], ["Site Installation", "MultiTechnic", "V", 220, 240],
  ["Heating Boiler", "Mechanical", "°C", 50, 80], ["Fuel Oil System", "Mechanical", "bar", 1, 5],
] as const;
const categories = ["A", "E", "E", "F", "B", "D", "M", "K", "L", "C", "G", "E", "P", "Q", "H", "O"] as const;
const localNames = [
  ["Kältemaschine", "Dieselgenerator", "USV-Anlage", "Brandschutzklappe", "Reinraum-Lüftungsanlage", "Dachablauf", "Kran", "Küchenabzug", "Aufzugssteuerung", "Wasserpumpe", "Reinigungsgerät", "Notbeleuchtung", "Druckluftkompressor", "Standortanlage", "Heizkessel", "Heizölanlage"],
  ["Koelmachine", "Dieselgenerator", "UPS-systeem", "Brandklep", "Cleanroom luchtbehandeling", "Dakafvoer", "Kraan", "Keukenafzuiging", "Liftbesturing", "Waterpomp", "Reinigingsapparaat", "Noodverlichting", "Persluchtcompressor", "Terreininstallatie", "Verwarmingsketel", "Stookoliesysteem"],
  ["Refrigeratore", "Generatore diesel", "Sistema UPS", "Serranda tagliafuoco", "Unità trattamento aria", "Scarico tetto", "Gru", "Aspirazione cucina", "Controllo ascensore", "Pompa acqua", "Attrezzatura pulizia", "Illuminazione emergenza", "Compressore aria", "Impianto sito", "Caldaia", "Impianto gasolio"],
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
        for (let r = 1; r <= 2; r++) {
          const area = 48 + b * 4 + f * 3;
          const x = (r - 1) * 20;
          rooms.push({ SiteId: site, bl_id, LevelName, RoomCode: `S${tag}-B${b}-L${f}-R${r}`,
            Name: r === 1 ? "Plant and services room" : "Operations workspace", NetAreaM2: area,
            Polygon: { type: "Polygon", coordinates: [[[x, 0], [x + area / 6, 0], [x + area / 6, 6], [x, 6], [x, 0]]] },
            PolygonSource: "Demo",
            IsDeskReservable: r === 2, IsActive: true });
        }
      }
    }
    const siteRooms = rooms.filter((item) => item.SiteId === site);
    for (let i = 0; i < 12; i++) {
      const trade = CLASSICAL_TRADES[i % CLASSICAL_TRADES.length];
      const shift = DEFAULT_SHIFTS[(["Early", "Standard", "Late", "Night"] as const)[i % 4]];
      const today = calendarDate(new Date());
      const tomorrow = addDays(today, 1);
      craftspeople.push({ id: `S${tag}-C${i + 1}`, SiteId: site, Name: ["Gregor", "Tomaž", "Blaž", "Eva", "Lukas", "Sara", "Marco", "Elena", "Klaus", "Ines", "Lidija", "Paolo"][i],
        LastName: ["GOJKOŠEK", "Gojkošek", "Gojkošek", "Veselič", "Weber", "Costa", "Bianchi", "Schmidt", "Fischer", "Silva", "Kovac", "Moretti"][i],
        username: ["gregor123", "321zamot", "Blaz123", "eva1234"][i], Trade: trade, HourlyRate: 38 + i * 3, ShiftHours: i % 3 === 0 ? 7.5 : 8, baseShiftType: shift.shiftType, shiftStart: shift.shiftStart, shiftEnd: shift.shiftEnd, shiftOverrides: { [tomorrow]: DEFAULT_SHIFTS[(["Late", "Late", "Night", "Early"] as const)[i % 4]], [addDays(today, 3)]: DEFAULT_SHIFTS[i % 2 ? "Early" : "Late"], [addDays(today, 8)]: DEFAULT_SHIFTS[i % 2 ? "Late" : "Early"] }, secondaryTradeIds: [], SkillLevel: 2 + i % 3 });
    }
    for (const [index, person] of [
      { Name: "Marko", LastName: "Novak", Trade: "Mechanical" },
      { Name: "Pieter", LastName: "Visser", Trade: "Electrical" },
      { Name: "Anna", LastName: "Meyer", Trade: "Civil" },
      { Name: "Sofia", LastName: "Rossi", Trade: "MultiTechnic" },
    ].entries()) {
      craftspeople.push({ id: `S${tag}-C${index + 13}`, SiteId: site, ...person, HourlyRate: 45, ShiftHours: 8, SkillLevel: 3 });
    }
    for (let i = 0; i < systems.length; i++) {
      const room = siteRooms[i];
      const system = systems[i % systems.length];
      const base = (Number(tag) - 1) * systems.length * 3 + i * 3;
      const codeFor = (number: number) => String(number).padStart(10, "0");
      const root = codeFor(base + 1), child = codeFor(base + 2);
      for (const [level, code, parent] of [["Installation", root, undefined], ["SubEquipment", child, root], ["Component", codeFor(base + 3), child]] as const) {
        equipment.push({ SiteId: site, bl_id: room.bl_id, LevelName: room.LevelName, RoomCode: room.RoomCode, EquipmentCode: code,
          EquipmentName: `${system[0]} ${level}`, EquipmentNameLocal: `${localNames[Number(tag) - 1][i]} · ${level}`, Category: categories[i], HierarchyLevel: level, IsInstallation: level === "Installation",
          Status: level === "Installation" || i >= 7 ? "In Service" : EQUIPMENT_STATUSES[i + 1],
          Activity: [{ id: `${code}-log`, kind: "log", actorId: "Mark", actorName: "Mark", actorRole: "ESA_TM", createdAt: "2026-10-10T09:00:00Z", text: "Equipment registered for maintenance." },
            { id: `${code}-comment`, kind: "comment", actorId: "Thomas", actorName: "Thomas", actorRole: "ESA_TO", createdAt: "2026-10-11T09:00:00Z", text: "Inspection access confirmed.", editedAt: "2026-10-12T09:00:00Z", editHistory: [{ text: "Confirm inspection access.", timestamp: "2026-10-11T09:00:00Z" }] }],
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
      const id = `2026${String((Number(tag) - 1) * 77 + (type === "PM" ? i + 1 : type === "FJ" ? i + 31 : i + 51)).padStart(6, "0")}`;
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
        ParentPM_WR_ID: `2026${String((Number(tag) - 1) * 77 + i + 1).padStart(6, "0")}`, ...(i === 0 ? { EscalatedToLJ_WR_ID: `2026${String((Number(tag) - 1) * 77 + 52).padStart(6, "0")}` } : {}) });
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
        ...(pct === 10 ? { OriginatingFJ_WR_ID: `2026${String((Number(tag) - 1) * 77 + 31).padStart(6, "0")}` } : {}) });
    });
    workRequests.filter((wr) => wr.SiteId === site).forEach((wr, index) => {
      wr.ExpectedHours = [2, 4, 6, 8, 2.5][index % 5];
      wr.Helper_SortUrgency = index % 4 + 1;
      if (index % 5 === 0) wr.AssignedCraftpersonIds = [];
      else {
        wr.StartDate_DateToPerform = `2026-11-${String(2 + index % 7).padStart(2, "0")}`;
        const second = siteCraft.find((person) => person.Trade === wr.TradeName && !wr.AssignedCraftpersonIds.includes(person.id));
        if (index % 9 === 0 && second) wr.AssignedCraftpersonIds.push(second.id);
        if (index % 11 === 0) { wr.DueDate = "2026-11-03"; wr.MarginDate = "2026-11-04"; }
      }
      if (wr.AssignedCraftpersonIds.length && wr.StartDate_DateToPerform && index % 2 === 0) {
        const day = `2026-11-${String(7 + index % 7).padStart(2, "0")}`;
        const [startTime, endTime] = [["07:00", "10:00"], ["10:30", "14:00"], ["08:00", "12:00"]][index % 3];
        wr.StartDate_DateToPerform = day;
        wr.CraftpersonAssignments = wr.AssignedCraftpersonIds.map((craftpersonId) => ({ craftpersonId, assignedStartDateTime: `${day}T${startTime}`, assignedEndDateTime: `${day}T${endTime}` }));
      }
      if (wr.IsFrozen) {
        wr.ActiveFreezeName = "Waiting for Spare Parts";
        wr.FreezeStartDate = "2026-11-02";
        wr.FreezeEndDate = "2026-11-08";
      } else if (index % 13 === 0) {
        wr.PlannedFreezeText = "Plant shutdown required";
        wr.FreezeStartDate = "2026-11-05";
        wr.FreezeEndDate = "2026-11-07";
      }
    });
    const examples = workRequests.filter((wr) => wr.SiteId === site && (wr.WR_ID === `2026${String((Number(tag) - 1) * 77 + 1).padStart(6, "0")}` || wr.WR_ID === `2026${String((Number(tag) - 1) * 77 + 2).padStart(6, "0")}` || (wr.WR_Type === "LJ" && wr.Percentage === 50)));
    examples.forEach((wr, index) => {
      const selected = [siteCraft[index], siteCraft[index + 4], ...(index === 2 ? [siteCraft[index + 8]] : [])];
      wr.AssignedCraftpersonIds = selected.map((person) => person.id);
      wr.StartDate_DateToPerform = "2026-11-09";
      wr.CraftpersonAssignments = selected.map((person, i) => ({
        craftpersonId: person.id,
        assignedStartDateTime: `2026-11-${String(9 + i).padStart(2, "0")}T${i === 0 ? "08:00" : "09:00"}`,
        assignedEndDateTime: `2026-11-${String(9 + i).padStart(2, "0")}T${i === 0 ? "11:00" : "12:00"}`,
      }));
    });
    const example = examples.find((wr) => wr.WR_Type === "PM" && wr.Percentage === 50);
    if (example) {
      const day = addDays(calendarDate(new Date()), 1);
      example.CraftpersonAssignments = [{ craftpersonId: siteCraft[0].id, assignedStartDateTime: `${day}T08:00`, assignedEndDateTime: `${day}T11:00` }];
      example.AssignedCraftpersonIds = [siteCraft[0].id];
      example.StartDate_DateToPerform = day;
    }
    const disputeDay = addDays(calendarDate(new Date()), 1);
    for (const type of ["PM", "FJ", "LJ"] as const) {
      workRequests.filter((wr) => wr.SiteId === site && wr.WR_Type === type && ![27, 78, 100].includes(wr.Percentage)).slice(0, 2).forEach((wr, index) => {
        const person = siteCraft[index];
        wr.AssignedCraftpersonIds = [person.id];
        wr.StartDate_DateToPerform = disputeDay;
        wr.CraftpersonAssignments = [{ craftpersonId: person.id, assignedStartDateTime: `${disputeDay}T08:00`, assignedEndDateTime: `${disputeDay}T10:00` }];
      });
    }
    const fieldExamples = workRequests.filter((wr) => wr.SiteId === site && wr.Percentage < 78 && wr.Percentage !== 27 && wr.CraftpersonAssignments?.length).slice(0, 2);
    fieldExamples.forEach((wr, index) => {
      const person = siteCraft.find((item) => item.id === wr.CraftpersonAssignments?.[0].craftpersonId);
      if (!person) return;
      wr.technicianFieldUpdates = [{
        id: `field-example-${site}-${index}`, wrId: wr.WR_ID, craftpersonId: person.id,
        craftpersonName: `${person.Name} ${person.LastName}`, createdAt: new Date().toISOString(),
        reasonCategory: index === 0 ? "NeedAccess" : "PreviousJobRanLate",
        urgency: index === 0 ? "UrgentBlocked" : "InfoOnly", status: "Open",
        message: index === 0 ? "Plant room is locked. Please arrange the key at security; I am blocked until access is available." : "My previous work request took longer than expected. I expect to arrive about one hour late.",
      }];
    });
    workRequests.filter((wr) => wr.SiteId === site && wr.WR_Type === "LJ").forEach((wr) => { wr.QA_AuditStatus = "None"; });
    const qaCandidates = (["PM", "FJ"] as const).map((type) =>
      workRequests.filter((wr) => wr.SiteId === site && wr.WR_Type === type && (wr.Percentage === 78 || wr.Percentage === 100)));
    const qaExamples = [qaCandidates[0][0], qaCandidates[1][0], qaCandidates[0][1], qaCandidates[1][1], qaCandidates[0][2]]
      .filter((wr): wr is BaseWorkRequest => !!wr);
    const statuses = ["SelectedForAudit", "QA_Passed", "QA_Failed_ActionRequired", "QA_Corrected", "QA_Verified"] as const;
    qaExamples.forEach((wr, index) => {
      wr.QA_AuditStatus = statuses[index];
      wr.QA_SelectionMode = "ComputerRandom5Percent";
      wr.QA_CompletionDate = (wr.UpdatedAt ?? wr.CreatedDate).slice(0, 10);
      if (index > 0) { wr.QA_InspectedBy = "Thomas"; wr.QA_InspectedDate = "2026-10-14T09:00:00Z"; }
      if (index >= 2) wr.QA_IssueDescription = "Filter on VRF unit was marked cleaned, but inspection found heavy dust buildup and a loose housing cover.";
      if (index >= 3) { wr.QA_CorrectionComment = "Cleaned the filter and secured the housing cover."; wr.QA_CorrectedDate = "2026-10-15T10:00:00Z"; }
      if (index === 2) { wr.QA_InspectionStatus = "ToBeCorrected"; wr.AuditInspectionStatus = "PM WRs to be corrected"; }
      if (index === 1 || index === 4) { wr.QA_InspectionStatus = "Passed"; wr.AuditInspectionStatus = "Passed Inspected"; }
    });
    for (const type of ["PM", "FJ", "LJ"] as const) {
      for (let i = 0; i < 2; i++) {
        const id = `DEMO-${site}-${type}-UNASSIGNED-${i + 1}`;
        const request = make(type, i, 50, "Issued");
        const schedule = siteSchedules[i];
        const blueprint = blueprints.find((item) => item.SiteId === site && item.ChecklistCode === schedule.ChecklistCode);
        if (!blueprint) throw new Error(`Missing demo checklist for ${schedule.ScheduleId}.`);
        workRequests.push({ ...request, WR_ID: id, AssignedCraftpersonIds: [], AssignedUserIds: [],
          Activity: activity(id, type, 50),
          ...(type === "PM" ? { ScheduleId: schedule.ScheduleId, ChecklistStandardCode: blueprint.ChecklistCode, ChecklistSteps: blueprint.Steps } : {}) });
      }
    }
    workRequests.filter((wr) => wr.SiteId === site && wr.WR_Type !== "PM").forEach((wr) => {
      wr.roughScopeNotes = `Inspect and repair ${wr.Description}; test operation and document the completed work.`;
      wr.todoSteps = [
        "Review hazards, permits and required isolation before starting.",
        `Inspect ${wr.Description} and identify the repair scope.`,
        "Carry out the approved repair or installation.",
        "Restore service and perform a functional test.",
        "Record findings and photos; clean and secure the work area.",
      ].map((title, index) => ({ id: `${wr.WR_ID}-todo-${index + 1}`, order: index + 1, title, completed: false }));
      if (wr.Percentage < 50 || [55, 27, 29].includes(wr.Percentage)) return;
      const person = siteCraft.find((item) => item.id === wr.AssignedCraftpersonIds[0]);
      if (!person) return;
      const name = `${person.Name} ${person.LastName}`;
      wr.timeSessions = [
        { id: `${wr.WR_ID}-session-1`, craftpersonId: person.id, craftpersonName: name, startedAt: "2026-10-12T08:00:00.000Z", endedAt: "2026-10-12T08:45:00.000Z", durationMinutes: 45 },
        { id: `${wr.WR_ID}-session-2`, craftpersonId: person.id, craftpersonName: name, startedAt: "2026-10-12T09:00:00.000Z", endedAt: "2026-10-12T09:45:00.000Z", durationMinutes: 45 },
      ];
      wr.laborEntries = [{ craftpersonId: person.id, name: person.Name, lastName: person.LastName, trade: person.Trade, hourlyRate: person.HourlyRate, recordedTimerMinutes: 90, effectiveMinutes: 90 }];
      wr.TotalTimeMinutes = 90;
    });
  }
  return { buildings, floors, rooms, equipment, blueprints, schedules, craftspeople, workRequests };
}
