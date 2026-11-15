import type { BaseWorkRequest, LocationFreeze } from "@cafm/shared-schema";
import { getCurrentLocationFreezes } from "./location-freezes";

/**
 * Section 82 — 3-zone PM early-start rule.
 *  Zone 1 (freeze-blocked): `now` is inside an active Location Freeze that disallows this work type.
 *  Zone 2 (lead-window):    start is early but within the frequency's opportunistic lead window.
 *  Zone 3 (outside-window): start is earlier than the lead window allows (cycle-spacing risk).
 */
export type EarlyStartZone =
  | { zone: "on-schedule" }
  | { zone: "freeze-blocked"; freeze: LocationFreeze }
  | { zone: "lead-window"; daysEarly: number; leadDays: number }
  | { zone: "outside-window"; daysEarly: number; leadDays: number };

/** Opportunistic lead window (days before the planned start) per PM frequency code. */
export const EARLY_START_LEAD_DAYS: Record<string, number> = {
  "01D": 3, "01W": 3, "02W": 3, "01M": 7, "03M": 14, "06M": 30, "01Y": 30, "02Y": 30, "05Y": 30, "10Y": 30,
};

export function earlyStartLeadDays(frequency: string | undefined): number {
  return (frequency && EARLY_START_LEAD_DAYS[frequency]) || 3;
}

/** 1-tap opportunistic reasons offered inside the lead window (Zone 2). */
export const EARLY_START_REASONS = [
  "Already in room / opportunistic",
  "Swapped job",
  "Team Leader instruction",
] as const;

const OVERRIDE_ROLES = ["TeamLeader", "TechnicalOfficer", "SiteAdministrator", "SuperAdmin"];

/** Zone 3 override is reserved for supervising roles; Craftperson stays blocked. */
export function canOverrideEarlyStart(primaryRole: string | undefined): boolean {
  return !!primaryRole && OVERRIDE_ROLES.includes(primaryRole);
}

const dayDiff = (fromDay: string, toDay: string) =>
  Math.round((Date.parse(`${toDay}T00:00:00`) - Date.parse(`${fromDay}T00:00:00`)) / 86400000);

/**
 * Evaluate the start attempt. `nowLocal` and `plannedStart` are local wall-clock values
 * (`YYYY-MM-DDTHH:mm` or `YYYY-MM-DD`); an absent or past planned start is on schedule.
 */
export function evaluateEarlyStart(options: {
  wr: BaseWorkRequest;
  freezes: LocationFreeze[];
  nowLocal: string;
  plannedStart?: string;
}): EarlyStartZone {
  const { wr, freezes, nowLocal, plannedStart } = options;
  const allowed = { PM: "allowPM", FJ: "allowFJ", LJ: "allowLJ" } as const;
  const key = allowed[wr.WR_Type as keyof typeof allowed] ?? "allowPM";
  const blocking = getCurrentLocationFreezes(wr, freezes, nowLocal).find((freeze) => !freeze[key]);
  if (blocking) return { zone: "freeze-blocked", freeze: blocking };
  const plannedDay = (plannedStart ?? "").slice(0, 10);
  const today = nowLocal.slice(0, 10);
  if (!plannedDay || plannedDay <= today) return { zone: "on-schedule" };
  const daysEarly = dayDiff(today, plannedDay);
  const leadDays = earlyStartLeadDays(wr.pmFrequency);
  return daysEarly <= leadDays
    ? { zone: "lead-window", daysEarly, leadDays }
    : { zone: "outside-window", daysEarly, leadDays };
}

export function cycleSpacingExplanation(wr: BaseWorkRequest, daysEarly: number, leadDays: number): string {
  const frequency = wr.pmFrequency ? `${wr.pmFrequency} ` : "";
  return `Starting ${daysEarly} day(s) before the planned date breaks the ${frequency}cycle spacing: ` +
    `consecutive maintenance visits would land too close together and the next cycle would drift. ` +
    `The opportunistic window for this frequency is ${leadDays} day(s); ask a Team Leader to reschedule or override.`;
}

export function earlyStartActivityText(reason: string, daysEarly: number, override: boolean): string {
  return override
    ? `Early start OVERRIDE outside the opportunistic lead window (${daysEarly} day(s) early). Mandatory reason: ${reason}`
    : `Opportunistic early start inside the lead window (${daysEarly} day(s) early). Reason: ${reason}`;
}

/**
 * Future calendar slot release: when a WR reaches 78% early while still holding a future
 * scheduled slot (`PlannedStart > today`), log the OriginalPlannedStart and clear the future
 * assignments so Scheduler capacity frees up immediately.
 */
export function releaseFutureSlots(wr: BaseWorkRequest, nowLocal: string, actorId: string, actorName: string, actorRole: string): BaseWorkRequest {
  if (wr.Percentage < 78) return wr;
  const today = nowLocal.slice(0, 10);
  const assignments = wr.CraftpersonAssignments ?? [];
  const future = assignments.filter((item) => item.assignedStartDateTime.slice(0, 10) > today);
  if (!future.length) return wr;
  const originalPlannedStart = [...future].map((item) => item.assignedStartDateTime).sort()[0];
  const released = future.map((item) => `${item.craftpersonId}: ${item.assignedStartDateTime} – ${item.assignedEndDateTime}`).join("; ");
  return {
    ...wr,
    CraftpersonAssignments: assignments.filter((item) => item.assignedStartDateTime.slice(0, 10) <= today),
    Activity: [...(wr.Activity ?? []), {
      id: crypto.randomUUID(), kind: "log" as const, actorId, actorName, actorRole,
      createdAt: new Date().toISOString(),
      text: `Technically completed early at 78%. OriginalPlannedStart: ${originalPlannedStart}. Released ${future.length} future calendar slot(s) (${released}) so Scheduler capacity frees up immediately.`,
    }],
  };
}
