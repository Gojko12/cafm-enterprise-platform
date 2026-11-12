import type { BaseWorkRequest, Equipment } from "@cafm/shared-schema";
import type { AuditFinding } from "./audit-assurance-types";
import type { DemoData } from "./cafm-data";
import { addDays, calendarDate } from "./dispatch";

/**
 * Idempotent 2026 historical analytics dataset for `SITE-01` (`01-01-2026` -> today).
 *
 * Seeds realistic PM/FJ history with month-by-month improving OverDue / OverMargin
 * breaches, recent 24h / 7d / 30d breach-churn stories, multi-stage Long Job
 * lifecycles with StageHistory, technical audit findings across severities and
 * remediation states, technician TimeLogs, and reopen events — all concentrated on
 * the real SITE-01 "bad actor" equipment so the Pareto story emerges naturally.
 *
 * Applied inside `scopeData`, so existing `.data` states are enriched automatically
 * and `Reset Demo Data` includes everything cleanly. Never throws.
 */

const SEED_PREFIX = "2026H";

const BAD_ACTORS = [
  "0000000001", // Chiller — worst actor
  "0000000004", // Diesel Generator
  "0000000013", // Cleanroom AHU
  "0000000007", // UPS System
  "0000000010", // Fire Damper
  "0000000016", // Roof Drain
] as const;

/** Weighted pick list: the Chiller dominates reactive work, then the Generator, etc. */
const EQUIPMENT_WEIGHTS: string[] = [
  "0000000001", "0000000001", "0000000001", "0000000001",
  "0000000004", "0000000004", "0000000004",
  "0000000013", "0000000013", "0000000013",
  "0000000007", "0000000007",
  "0000000010", "0000000010",
  "0000000016",
];

const TRADES = ["Mechanical", "Electrical", "MultiTechnic", "Civil"] as const;

function isoAt(day: string, hour: number): string {
  return `${day}T${String(Math.max(0, Math.min(23, hour))).padStart(2, "0")}:00:00.000Z`;
}

interface SeedContext {
  today: string;
  equipmentByCode: Map<string, Equipment>;
  people: { id: string; name: string }[];
}

function makeWr(
  context: SeedContext,
  sequence: number,
  type: "PM" | "FJ",
  options: {
    created: string;
    due: string;
    margin?: string;
    /** ISO timestamp when technically completed (78%). */
    completedAt?: string;
    /** ISO timestamp when fully closed (100%). */
    closedAt?: string;
    percentage: number;
    equipmentCode: string;
    description: string;
    person?: { id: string; name: string };
    unfavourableSteps?: number;
    reopened?: { reopenedAt: string; actor: string };
    timeLogs?: Array<{ person: { id: string; name: string }; hours: number; loggedAt: string }>;
    downtimeMinutes?: number;
    hours?: number;
  },
): BaseWorkRequest {
  const id = `${SEED_PREFIX}${String(sequence).padStart(4, "0")}`;
  const asset = context.equipmentByCode.get(options.equipmentCode);
  const trade = asset?.PrimaryTradeId && (TRADES as readonly string[]).includes(asset.PrimaryTradeId)
    ? asset.PrimaryTradeId
    : TRADES[sequence % TRADES.length];
  const closed = options.percentage >= 100;
  const completed = options.percentage >= 78;
  const margin = options.margin ?? addDays(options.due, 7);
  return {
    WR_ID: id,
    WR_Type: type,
    ESAWorkType: type === "PM" ? "Preventive Maintenance" : "Corrective Maintenance",
    Description: options.description,
    ProblemLocation: asset ? `${asset.bl_id} / ${asset.LevelName} / ${asset.RoomCode}` : "S01-BL-1",
    SiteId: "02-ESOC",
    bl_id: asset?.bl_id ?? "S01-BL-1",
    LevelName: asset?.LevelName ?? "Level 0",
    RoomCode: asset?.RoomCode ?? "S01-B1-L0-R1",
    TradeId: trade,
    TradeName: trade,
    EquipmentCodes: [options.equipmentCode],
    AssignedCraftpersonIds: options.person ? [options.person.id] : [],
    AssignedUserIds: [],
    CreatedBy: "Mark",
    CreatedDate: options.created,
    DueDate: options.due,
    MarginDate: margin,
    WorkRequestStatus: closed ? "Closed" : completed ? "Technically Completed" : options.percentage === 55 ? "On Hold" : "Issued",
    WorkRequestSubstatus: closed ? "Completed" : completed ? "Technically Completed" : options.percentage === 55 ? "On Hold for Parts" : "Issued",
    Percentage: options.percentage,
    IsFrozen: options.percentage === 55,
    ...(options.percentage === 55 ? { FreezeReason: "Parts", FreezeStartedAt: isoAt(options.created, 12) } : {}),
    ...(options.completedAt ? { CompletedAt: options.completedAt } : {}),
    ...(options.closedAt ? { ClosedAt: options.closedAt } : {}),
    ...(options.reopened ? {
      ReopenCount: 1,
      ReopenedHistory: [{ reopenedAt: options.reopened.reopenedAt, fromPercentage: 78, toPercentage: 50, reason: "QA rework required", actor: options.reopened.actor }],
    } : {}),
    ...(options.timeLogs?.length ? {
      TimeLogs: options.timeLogs.map((entry, index) => ({
        id: `${id}-tl-${index + 1}`, personId: entry.person.id, technicianName: entry.person.name,
        wrId: id, wrType: type, hours: entry.hours, loggedAt: entry.loggedAt,
      })),
    } : {}),
    ...(options.unfavourableSteps ? {
      ChecklistResults: Array.from({ length: options.unfavourableSteps }, (_, index) => ({
        stepId: `${id}-step-${index + 1}`, passed: false, value: "fault",
        comment: "Unfavourable condition recorded during PM execution.",
        completedAt: options.completedAt ?? isoAt(options.due, 14),
      })),
    } : {}),
    ...(options.downtimeMinutes ? { DowntimeMinutes: options.downtimeMinutes } : {}),
    TotalTimeMinutes: Math.round((options.hours ?? (completed ? 2.5 : 0)) * 60),
    ExpectedHours: 2,
    EstimatedCostEur: 150,
    ...(closed || completed ? { ActualCostEur: 150 + (sequence % 5) * 40 } : {}),
    StartDateTBD: false,
    RequiresSAT: false,
    RequiresDrawingUpdate: false,
    RequiresInventoryUpdate: false,
    AcceptanceGates: [],
    UpdatedAt: options.closedAt ?? options.completedAt ?? isoAt(options.created, 9),
    Activity: [{
      id: `${id}-log-1`, kind: "log", actorId: "Mark", actorName: "Mark", actorRole: "ESA_TM",
      createdAt: isoAt(options.created, 8), text: "Analytics history work request seeded (2026 operational baseline).",
    }],
  };
}

const LJ_STAGE_FLOW: Array<{ percentage: number; status: string }> = [
  { percentage: 10, status: "Work Request from Fast Job - On Hold" },
  { percentage: 20, status: "Quotation Preparation Offer by Contractor" },
  { percentage: 32, status: "Approved and Ordered" },
  { percentage: 50, status: "Work In Progress" },
  { percentage: 55, status: "On Hold for Access / Labor / Parts" },
  { percentage: 78, status: "Technically Completed" },
  { percentage: 100, status: "Payment Confirmed" },
];

function makeLj(
  context: SeedContext,
  sequence: number,
  options: {
    created: string;
    /** Days spent in each visited stage, aligned with LJ_STAGE_FLOW order (55 can be skipped with 0). */
    dwellDays: number[];
    currentPercentage: number;
    targetDate: string;
    equipmentCode: string;
    expectedHours: number;
    actualHours?: number;
    estimatedCost: number;
    actualCost?: number;
    person?: { id: string; name: string };
    timeLogs?: Array<{ person: { id: string; name: string }; hours: number; loggedAt: string }>;
  },
): BaseWorkRequest {
  const id = `${SEED_PREFIX}LJ${String(sequence).padStart(2, "0")}`;
  const asset = context.equipmentByCode.get(options.equipmentCode);
  const stageHistory: NonNullable<BaseWorkRequest["StageHistory"]> = [];
  let cursor = options.created;
  let closedAt: string | undefined;
  let completedAt: string | undefined;
  for (let index = 0; index < LJ_STAGE_FLOW.length; index++) {
    const stage = LJ_STAGE_FLOW[index];
    if (stage.percentage > options.currentPercentage) break;
    const dwell = options.dwellDays[index] ?? 0;
    if (dwell <= 0 && stage.percentage !== options.currentPercentage) continue;
    const enteredAt = isoAt(cursor, 9);
    const isCurrent = stage.percentage === options.currentPercentage;
    const exitDay = addDays(cursor, Math.max(dwell, 0));
    stageHistory.push({
      status: stage.status, percentage: stage.percentage, enteredAt,
      ...(isCurrent ? {} : { exitedAt: isoAt(exitDay, 9) }),
      actor: "Gregor",
    });
    if (stage.percentage === 78) completedAt = enteredAt;
    if (stage.percentage === 100) closedAt = enteredAt;
    if (!isCurrent) cursor = exitDay;
  }
  const closed = options.currentPercentage >= 100;
  const current = LJ_STAGE_FLOW.find((stage) => stage.percentage === options.currentPercentage) ?? LJ_STAGE_FLOW[0];
  const trade = asset?.PrimaryTradeId ?? "Mechanical";
  return {
    WR_ID: id,
    WR_Type: "LJ",
    ESAWorkType: "Corrective Maintenance",
    Description: `Long Job: ${asset?.EquipmentName ?? options.equipmentCode} refurbishment & upgrade (${id})`,
    ProblemLocation: asset ? `${asset.bl_id} / ${asset.LevelName} / ${asset.RoomCode}` : "S01-BL-1",
        SiteId: "02-ESOC",
    bl_id: asset?.bl_id ?? "S01-BL-1",
    LevelName: asset?.LevelName ?? "Level 0",
    RoomCode: asset?.RoomCode ?? "S01-B1-L0-R1",
    TradeId: trade,
    TradeName: trade,
    EquipmentCodes: [options.equipmentCode],
    AssignedCraftpersonIds: options.person ? [options.person.id] : [],
    AssignedUserIds: [],
    CreatedBy: "Gregor",
    CreatedDate: options.created,
    DueDate: options.targetDate,
    MarginDate: addDays(options.targetDate, 14),
    WorkRequestStatus: current.status,
    WorkRequestSubstatus: current.status,
    Percentage: options.currentPercentage,
    IsFrozen: options.currentPercentage === 55,
    ...(options.currentPercentage === 55 ? { FreezeReason: "Parts", FreezeStartedAt: stageHistory[stageHistory.length - 1]?.enteredAt } : {}),
    StageHistory: stageHistory,
    ...(completedAt ? { CompletedAt: completedAt } : {}),
    ...(closedAt ? { ClosedAt: closedAt } : {}),
    ...(options.timeLogs?.length ? {
      TimeLogs: options.timeLogs.map((entry, index) => ({
        id: `${id}-tl-${index + 1}`, personId: entry.person.id, technicianName: entry.person.name,
        wrId: id, wrType: "LJ" as const, hours: entry.hours, loggedAt: entry.loggedAt,
      })),
    } : {}),
    TotalTimeMinutes: Math.round((options.actualHours ?? 0) * 60),
    ExpectedHours: options.expectedHours,
    EstimatedCostEur: options.estimatedCost,
    ...(options.actualCost !== undefined ? { ActualCostEur: options.actualCost } : {}),
    CostType: "Fixed",
    ProcessTrack: options.currentPercentage < 30 ? "RFQ" : "RFW",
    StartDateTBD: false,
    RequiresSAT: sequence % 3 === 0,
    RequiresDrawingUpdate: sequence % 3 === 1,
    RequiresInventoryUpdate: sequence % 3 === 2,
    AcceptanceGates: [],
    UpdatedAt: closedAt ?? isoAt(options.created, 9),
    Activity: [{
      id: `${id}-log-1`, kind: "log", actorId: "Gregor", actorName: "Gregor", actorRole: "ESA_LJM",
      createdAt: isoAt(options.created, 8), text: "Analytics history Long Job seeded (2026 lifecycle baseline).",
    }],
  };
}

function makeFinding(
  campaign: { id: string; name: string },
  sequence: number,
  options: {
    severity: "Critical" | "Major" | "Minor";
    discoveredAt: string;
    dueDate: string;
    addressedAt?: string;
    equipmentCode: string;
    equipmentName: string;
    trade: string;
    title: string;
  },
): AuditFinding {
  const id = `SITE-01-HF-${String(sequence).padStart(2, "0")}`;
  const addressed = Boolean(options.addressedAt);
  return {
    id, campaignId: campaign.id, campaignName: campaign.name, siteId: "02-ESOC",
    buildingId: "S01-BL-1", roomId: "S01-B1-L0-R1",
    systemName: "HVAC & Cooling", equipmentId: options.equipmentCode, equipmentName: options.equipmentName,
    componentName: "Main assembly", checkpointName: options.title,
    findingType: options.severity === "Critical" ? "Safety" : "Condition",
    urgency: options.severity === "Critical" ? "N0" : options.severity === "Major" ? "N1" : "N2",
    conditionScore: options.severity === "Critical" ? "D - Critical" : options.severity === "Major" ? "C - Poor" : "B - Fair",
    operationalStatus: options.severity === "Critical" ? "Degraded" : "Operational",
    discoveredAt: options.discoveredAt,
    calculatedDeadline: options.dueDate,
    isOverdue: !addressed && options.dueDate < calendarDate(new Date()),
    title: options.title,
    observation: `${options.title} observed during the 2026 technical audit.`,
    recommendedRemedy: "Perform corrective maintenance and provide closure evidence.",
    responsibleParty: "Contractor",
    contractorName: "SOCOTEC",
    trade: options.trade,
    inspectorName: "Thomas",
    inspectorPhotos: [],
    validationStatus: "Accepted",
    aiIntelligenceFlags: [],
    assuranceState: addressed ? "FindingVerified_Closed" : options.severity === "Critical" ? "CorrectiveWorkInProgress" : "Validated_ActionPending",
    evidence: {
      beforePhotos: [], afterPhotos: [], certificates: [], updatedDrawings: [], replacedParts: [],
      laborCostEUR: addressed ? 240 : 0, materialCostEUR: addressed ? 120 : 0,
      ...(addressed ? { submittedBy: "SOCOTEC", submittedAt: options.addressedAt } : {}),
    },
    verification: addressed ? { method: "InternalReviewer", verifiedBy: "Thomas", verifiedAt: options.addressedAt, verificationOutcome: "VerifiedClosed" } : {},
    auditTrail: [{ id: `${id}-t1`, timestamp: isoAt(options.discoveredAt, 11), actor: "Thomas", action: "Finding logged during audit." }],
    severity: options.severity,
    dueDate: options.dueDate,
    ...(options.addressedAt ? { addressedAt: options.addressedAt } : {}),
    status: addressed ? "Closed" : "Open",
  };
}

export function ensureAnalyticsHistorySeeded(data: DemoData): DemoData {
  try {
    if (!data.sites.includes("02-ESOC")) return data;
    if (data.workRequests.some((wr) => wr.SiteId === "02-ESOC" && wr.WR_ID.startsWith(SEED_PREFIX))) return data;

    const today = calendarDate(new Date());
    const ago = (days: number) => addDays(today, -days);
    const context: SeedContext = {
      today,
      equipmentByCode: new Map(data.equipment.filter((asset) =>       asset.SiteId === "02-ESOC").map((asset) => [asset.EquipmentCode, asset])),
            people: data.craftspeople.filter((person) => person.SiteId === "02-ESOC").slice(0, 8)
        .map((person) => ({ id: person.id, name: `${person.Name} ${person.LastName}` })),
    };
    if (!context.equipmentByCode.size) return data;
    const person = (index: number) => context.people[index % Math.max(context.people.length, 1)] ?? { id: "S01-C1", name: "Gregor Gojkošek" };
    const pickEquipment = (index: number) => EQUIPMENT_WEIGHTS[index % EQUIPMENT_WEIGHTS.length];

    const workRequests: BaseWorkRequest[] = [];
    let sequence = 0;

    // --- Monthly 2026 history: breach pressure easing from Q1 towards Q4 ---
    for (let month = 1; month <= 10; month++) {
      const lateCount = month <= 3 ? 5 : month <= 6 ? 4 : month <= 9 ? 2 : 1;
      const onTimeCount = 7 - lateCount - (month >= 7 ? 1 : 0);
      const lateDays = month <= 3 ? 38 : month <= 6 ? 24 : month <= 9 ? 12 : 6;
      const mm = String(month).padStart(2, "0");
      for (let index = 0; index < lateCount; index++) {
        sequence++;
        const created = `2026-${mm}-${String(2 + index * 3).padStart(2, "0")}`;
        const due = addDays(created, 10);
        const closedDay = addDays(due, lateDays + index * 2);
        workRequests.push(makeWr(context, sequence, sequence % 2 ? "PM" : "FJ", {
          created, due, percentage: 100,
          completedAt: isoAt(addDays(closedDay, -1), 15), closedAt: isoAt(closedDay, 16),
          equipmentCode: pickEquipment(sequence),
          description: `${sequence % 2 ? "Preventive visit" : "Reactive repair"} closed late (${mm}/2026 backlog pressure).`,
          person: person(sequence), hours: 3 + (index % 3),
          unfavourableSteps: sequence % 2 && index % 2 === 0 ? 2 : 0,
          downtimeMinutes: sequence % 2 ? 0 : 90 + index * 30,
        }));
      }
      for (let index = 0; index < onTimeCount; index++) {
        sequence++;
        const created = `2026-${mm}-${String(4 + index * 4).padStart(2, "0")}`;
        const due = addDays(created, 14);
        const closedDay = addDays(due, -3);
        workRequests.push(makeWr(context, sequence, sequence % 2 ? "PM" : "FJ", {
          created, due, percentage: 100,
          completedAt: isoAt(addDays(closedDay, -1), 13), closedAt: isoAt(closedDay, 14),
          equipmentCode: pickEquipment(sequence + 5),
          description: `${sequence % 2 ? "Preventive visit" : "Reactive repair"} completed on time (${mm}/2026).`,
          person: person(sequence), hours: 1.5 + (index % 2),
        }));
      }
    }

    // --- Breach recovery stories: were OverDue/OverMargin, closed in the past 24h / 7d / 30d ---
    const recoveries: Array<{ created: number; due: number; closedDaysAgo: number; closeHour: number; text: string }> = [
      { created: 60, due: 40, closedDaysAgo: 0, closeHour: 7, text: "Chiller oil leak — overdue backlog item recovered in the past 24h." },
      { created: 50, due: 30, closedDaysAgo: 3, closeHour: 15, text: "Generator coolant hose — overdue item recovered this week." },
      { created: 90, due: 45, closedDaysAgo: 20, closeHour: 11, text: "AHU belt replacement — long overdue item recovered this month." },
      { created: 40, due: 25, closedDaysAgo: 2, closeHour: 9, text: "UPS battery string — over-margin breach recovered this week." },
    ];
    for (const story of recoveries) {
      sequence++;
      workRequests.push(makeWr(context, sequence, sequence % 2 ? "FJ" : "PM", {
        created: ago(story.created), due: ago(story.due), percentage: 100,
        completedAt: isoAt(ago(story.closedDaysAgo), story.closeHour - 1), closedAt: isoAt(ago(story.closedDaysAgo), story.closeHour),
        equipmentCode: pickEquipment(sequence), description: story.text, person: person(sequence), hours: 4,
        timeLogs: [{ person: person(sequence), hours: 3, loggedAt: isoAt(ago(story.closedDaysAgo), story.closeHour - 2) }],
      }));
    }

    // --- New breach inflow: crossed DueDate/MarginDate in the past 24h / 7d / 30d, still open ---
    const inflowOpen: Array<{ created: number; due: number; percentage: 50 | 55; text: string }> = [
      { created: 10, due: 0, percentage: 50, text: "Fire damper access hatch jammed — crossed its due date in the past 24h." },
      { created: 14, due: 4, percentage: 50, text: "Chiller condenser clean — newly overdue this week." },
      { created: 45, due: 20, percentage: 55, text: "Generator fuel polishing — overdue and over margin this month, on hold for parts." },
      { created: 20, due: 9, percentage: 50, text: "UPS inverter alarm — crossed its margin window this week." },
    ];
    for (const story of inflowOpen) {
      sequence++;
      workRequests.push(makeWr(context, sequence, sequence % 2 ? "FJ" : "PM", {
        created: ago(story.created), due: ago(story.due), percentage: story.percentage,
        equipmentCode: pickEquipment(sequence), description: story.text, person: person(sequence),
        timeLogs: [{ person: person(sequence), hours: 2, loggedAt: isoAt(ago(Math.min(story.due, 6)), 12) }],
      }));
    }

    // --- Crossed a breach during the window but already closed again (fast churn) ---
    const inflowClosed: Array<{ created: number; due: number; closedDaysAgo: number; text: string }> = [
      { created: 12, due: 5, closedDaysAgo: 1, text: "Roof drain blockage — went overdue, cleared within the week." },
      { created: 30, due: 15, closedDaysAgo: 10, text: "AHU sensor fault — went overdue, resolved within the month." },
    ];
    for (const story of inflowClosed) {
      sequence++;
      workRequests.push(makeWr(context, sequence, "FJ", {
        created: ago(story.created), due: ago(story.due), percentage: 100,
        completedAt: isoAt(ago(story.closedDaysAgo), 10), closedAt: isoAt(ago(story.closedDaysAgo), 11),
        equipmentCode: pickEquipment(sequence), description: story.text, person: person(sequence), hours: 2.5,
      }));
    }

    // --- Healthy open workload with fresh technician hours (today / 24h) ---
    for (let index = 0; index < 4; index++) {
      sequence++;
      const tech = person(index);
      workRequests.push(makeWr(context, sequence, index % 2 ? "PM" : "FJ", {
        created: ago(3 + index), due: addDays(today, 10 + index * 3), percentage: 50,
        equipmentCode: pickEquipment(sequence + 2),
        description: `Open ${index % 2 ? "preventive" : "corrective"} order in window (active demo workload).`,
        person: tech,
        timeLogs: [
          { person: tech, hours: 1.5 + index * 0.5, loggedAt: isoAt(today, 6 + index * 2) },
          { person: person(index + 1), hours: 2, loggedAt: isoAt(ago(5 + index), 13) },
          { person: tech, hours: 3, loggedAt: isoAt(ago(18 + index), 10) },
        ],
      }));
    }

    // --- Reopen events (78% -> 50%) with technician variance ---
    const reopenStories: Array<{ daysAgo: number; personIndex: number }> = [
      { daysAgo: 2, personIndex: 1 }, { daysAgo: 10, personIndex: 2 }, { daysAgo: 20, personIndex: 2 },
    ];
    for (const story of reopenStories) {
      sequence++;
      const tech = person(story.personIndex);
      workRequests.push(makeWr(context, sequence, "PM", {
        created: ago(story.daysAgo + 20), due: ago(story.daysAgo + 5), percentage: 50,
        equipmentCode: pickEquipment(sequence), person: tech,
        description: "PM visit failed QA inspection and was reopened from 78% back to 50%.",
        reopened: { reopenedAt: isoAt(ago(story.daysAgo), 9), actor: "Thomas" },
        unfavourableSteps: 1,
        timeLogs: [{ person: tech, hours: 2, loggedAt: isoAt(ago(story.daysAgo), 14) }],
      }));
    }

    // --- Long Jobs: completed lifecycles + open pipeline across every stage ---
    const longJobs: BaseWorkRequest[] = [];
    const completedLjPlans = [
      { created: "2026-01-12", dwell: [6, 14, 10, 30, 0, 12, 0], cost: [4200, 4650] },
      { created: "2026-02-03", dwell: [4, 10, 8, 24, 6, 9, 0], cost: [6800, 7420] },
      { created: "2026-02-20", dwell: [8, 18, 12, 38, 0, 15, 0], cost: [3900, 3720] },
      { created: "2026-03-15", dwell: [5, 9, 7, 20, 0, 8, 0], cost: [5200, 5150] },
      { created: "2026-04-08", dwell: [3, 12, 9, 26, 10, 11, 0], cost: [8100, 9240] },
      { created: "2026-05-11", dwell: [4, 8, 6, 18, 0, 7, 0], cost: [2950, 2890] },
      { created: "2026-06-02", dwell: [6, 11, 8, 22, 0, 9, 0], cost: [4600, 4980] },
      { created: "2026-07-07", dwell: [3, 7, 5, 16, 0, 6, 0], cost: [3300, 3240] },
    ];
    completedLjPlans.forEach((plan, index) => {
      const expected = 40 + index * 10;
      longJobs.push(makeLj(context, index + 1, {
        created: plan.created, dwellDays: plan.dwell, currentPercentage: 100,
        targetDate: addDays(plan.created, 75), equipmentCode: pickEquipment(index * 3),
        expectedHours: expected, actualHours: expected * (index % 3 === 0 ? 1.25 : 0.95),
        estimatedCost: plan.cost[0], actualCost: plan.cost[1], person: person(index),
      }));
    });
    const openLjPlans: Array<{ createdDaysAgo: number; stage: number; dwell: number[] }> = [
      { createdDaysAgo: 12, stage: 10, dwell: [12] },
      { createdDaysAgo: 70, stage: 10, dwell: [70] },
      { createdDaysAgo: 28, stage: 20, dwell: [6, 22] },
      { createdDaysAgo: 95, stage: 20, dwell: [14, 81] },
      { createdDaysAgo: 40, stage: 32, dwell: [5, 12, 23] },
      { createdDaysAgo: 120, stage: 32, dwell: [10, 35, 75] },
      { createdDaysAgo: 55, stage: 50, dwell: [4, 10, 8, 33] },
      { createdDaysAgo: 150, stage: 50, dwell: [8, 20, 15, 107] },
      { createdDaysAgo: 85, stage: 55, dwell: [5, 12, 10, 28, 30] },
      { createdDaysAgo: 35, stage: 78, dwell: [3, 8, 6, 12, 0, 6] },
    ];
    openLjPlans.forEach((plan, index) => {
      const created = ago(plan.createdDaysAgo);
      const expected = 60 + index * 8;
      longJobs.push(makeLj(context, index + 9, {
        created, dwellDays: plan.dwell, currentPercentage: plan.stage,
        targetDate: index % 2 ? addDays(today, 20 + index * 5) : ago(5 + index * 3),
        equipmentCode: pickEquipment(index * 2 + 1),
        expectedHours: expected, actualHours: plan.stage >= 50 ? expected * 0.4 : undefined,
        estimatedCost: 5000 + index * 800, person: person(index),
        timeLogs: plan.stage >= 50 ? [
          { person: person(index), hours: 4, loggedAt: isoAt(ago(1), 9) },
          { person: person(index + 2), hours: 6, loggedAt: isoAt(ago(6), 10) },
          { person: person(index), hours: 5, loggedAt: isoAt(ago(15), 11) },
        ] : undefined,
      }));
    });

    // --- Technical audit findings across severities and remediation states ---
    const campaign = (data.auditCampaigns ?? []).find((entry) => entry.siteId === "02-ESOC");
    const auditFindings = [...(data.auditFindings ?? [])];
    if (campaign && !auditFindings.some((finding) => finding.id.startsWith("SITE-01-HF-"))) {
      const equipmentName = (code: string) => context.equipmentByCode.get(code)?.EquipmentName ?? code;
      const severities: Array<"Critical" | "Major" | "Minor"> = ["Critical", "Major", "Minor"];
      const findingPlans: Array<{ discovered: string; dueIn: number; addressedOffset?: number }> = [
        // Addressed on time (5)
        { discovered: "2026-02-10", dueIn: 30, addressedOffset: 18 },
        { discovered: "2026-03-05", dueIn: 45, addressedOffset: 30 },
        { discovered: "2026-04-14", dueIn: 30, addressedOffset: 25 },
        { discovered: "2026-05-20", dueIn: 60, addressedOffset: 41 },
        { discovered: "2026-06-09", dueIn: 30, addressedOffset: 12 },
        // Addressed late (3)
        { discovered: "2026-02-25", dueIn: 30, addressedOffset: 55 },
        { discovered: "2026-04-01", dueIn: 45, addressedOffset: 80 },
        { discovered: "2026-06-18", dueIn: 30, addressedOffset: 62 },
        // Open in window (6): due in the future
        { discovered: "2026-10-02", dueIn: 70 },
        { discovered: "2026-10-12", dueIn: 60 },
        { discovered: "2026-10-20", dueIn: 55 },
        { discovered: "2026-10-28", dueIn: 45 },
        { discovered: "2026-11-03", dueIn: 40 },
        { discovered: "2026-11-06", dueIn: 30 },
        // Overdue & open (6): due before today
        { discovered: "2026-05-02", dueIn: 30 },
        { discovered: "2026-06-15", dueIn: 45 },
        { discovered: "2026-07-20", dueIn: 30 },
        { discovered: "2026-08-10", dueIn: 30 },
        { discovered: "2026-09-01", dueIn: 45 },
        { discovered: "2026-09-18", dueIn: 30 },
      ];
      findingPlans.forEach((plan, index) => {
        const code = BAD_ACTORS[index % BAD_ACTORS.length];
        auditFindings.push(makeFinding({ id: campaign.id, name: campaign.name }, index + 1, {
          severity: severities[index % severities.length],
          discoveredAt: plan.discovered,
          dueDate: addDays(plan.discovered, plan.dueIn),
          ...(plan.addressedOffset !== undefined ? { addressedAt: isoAt(addDays(plan.discovered, plan.addressedOffset), 14) } : {}),
          equipmentCode: code,
          equipmentName: equipmentName(code),
          trade: index % 3 === 0 ? "Electrical" : "Mechanical",
          title: `${equipmentName(code)} — ${severities[index % severities.length].toLowerCase()} audit finding #${index + 1}`,
        }));
      });
    }

    return {
      ...data,
      workRequests: [...data.workRequests, ...workRequests, ...longJobs],
      auditFindings,
    };
  } catch (error) {
    console.warn("Analytics history seeding was skipped", error);
    return data;
  }
}
