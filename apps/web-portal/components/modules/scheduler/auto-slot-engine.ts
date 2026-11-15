import type { BaseWorkRequest, CraftpersonAbsence, LocationFreeze } from "@cafm/shared-schema";
import { formatDateTimeDDMMYYYY } from "@cafm/shared-schema";
import { addDays, assignmentAbsences, fromWallMinutes, overlaps, schedulePerson } from "@/lib/dispatch";
import { shiftSegments } from "@/lib/craftperson-shifts";
import type { ShiftPerson } from "@/lib/craftperson-shifts";
import { matchesFreezeLocation } from "@/lib/location-freezes";
import { isWrSchedulable } from "./scheduler-rules";

export interface AutoSlotPerson extends ShiftPerson {
  id: string; Name: string; LastName: string; Trade: string; HourlyRate: number;
  secondaryTradeIds?: string[]; SiteId: string;
}

export interface AutoSlotProposal {
  wrId: string;
  description: string;
  tradeName: string;
  bl_id: string;
  craftpersonId: string;
  craftpersonName: string;
  assignedStartDateTime: string;
  assignedEndDateTime: string;
  durationMinutes: number;
  /** WR already scheduled for the same building/person/day that anchors the cluster. */
  clusteredWithWrId?: string;
}

export interface AutoSlotResult {
  proposals: AutoSlotProposal[];
  unplaced: Array<{ wrId: string; description: string; reason: string }>;
  horizonDays: number;
}

const FREEZE_ALLOW = { PM: "allowPM", FJ: "allowFJ", LJ: "allowLJ" } as const;

function freezeConflicts(wr: BaseWorkRequest, freezes: LocationFreeze[], start: string, end: string) {
  const key = FREEZE_ALLOW[wr.WR_Type as keyof typeof FREEZE_ALLOW] ?? "allowPM";
  return freezes.some((freeze) => freeze.siteId === wr.SiteId && matchesFreezeLocation(wr, freeze) &&
    !freeze[key] && overlaps(start, end, freeze.startDateTime, freeze.endDateTime));
}

/**
 * Section 82 — ✨ Propose Schedule engine for unscheduled WRs: matches Trade + Shift with
 * zero Freeze / Leave / Overlap conflicts and prefers Same-Building (`bl_id`) clustering so
 * craftspeople stay in one building per day.
 */
export function buildAutoSlotProposals(options: {
  requests: BaseWorkRequest[];
  people: AutoSlotPerson[];
  absences: CraftpersonAbsence[];
  freezes: LocationFreeze[];
  siteId: string;
  startDate: string;
  horizonDays?: number;
}): AutoSlotResult {
  const { requests, people, absences, freezes, siteId, startDate } = options;
  const horizonDays = options.horizonDays ?? 14;
  const siteRequests = requests.filter((wr) => wr.SiteId === siteId && !wr.suppressedByWrId);
  const candidates = siteRequests
    .filter((wr) => isWrSchedulable(wr) && !(wr.CraftpersonAssignments ?? []).length)
    .sort((a, b) => (a.DueDate ?? "9999").localeCompare(b.DueDate ?? "9999"));
  // Existing busy intervals per person, and same-building anchors per person/day for clustering.
  const busy = new Map<string, Array<[string, string]>>();
  const anchors = new Map<string, string>(); // `${personId}|${day}|${bl_id}` -> anchor WR ID
  for (const wr of siteRequests) {
    for (const slot of wr.CraftpersonAssignments ?? []) {
      busy.set(slot.craftpersonId, [...(busy.get(slot.craftpersonId) ?? []), [slot.assignedStartDateTime, slot.assignedEndDateTime]]);
      if (wr.bl_id) anchors.set(`${slot.craftpersonId}|${slot.assignedStartDateTime.slice(0, 10)}|${wr.bl_id}`, wr.WR_ID);
    }
  }
  const isFree = (personId: string, start: string, end: string) =>
    !(busy.get(personId) ?? []).some(([otherStart, otherEnd]) => overlaps(start, end, otherStart, otherEnd));
  const proposals: AutoSlotProposal[] = [];
  const unplaced: AutoSlotResult["unplaced"] = [];
  for (const wr of candidates) {
    const duration = Math.max(30, (wr.ExpectedHours ?? 1) * 60);
    const tradePeople = people.filter((person) => person.SiteId === siteId &&
      (!wr.TradeName || person.Trade === wr.TradeName || (person.secondaryTradeIds ?? []).includes(wr.TradeName)));
    const pool = wr.AssignedCraftpersonIds.length
      ? tradePeople.filter((person) => wr.AssignedCraftpersonIds.includes(person.id))
      : tradePeople;
    const candidatesPool = pool.length ? pool : tradePeople;
    if (!candidatesPool.length) {
      unplaced.push({ wrId: wr.WR_ID, description: wr.Description, reason: `No craftsperson matches trade ${wr.TradeName ?? "—"}.` });
      continue;
    }
    let placed: AutoSlotProposal | undefined;
    for (let offset = 0; offset < horizonDays && !placed; offset += 1) {
      const day = addDays(startDate, offset);
      if ([0, 6].includes(new Date(`${day}T12:00:00`).getDay())) continue;
      // Same-building clustering: people already working in this WR's building that day go first.
      const ordered = [...candidatesPool].sort((a, b) =>
        Number(!!anchors.get(`${b.id}|${day}|${wr.bl_id}`)) - Number(!!anchors.get(`${a.id}|${day}|${wr.bl_id}`)));
      for (const person of ordered) {
        for (const segment of shiftSegments(person, day)) {
          for (let minute = segment.start; minute + duration <= segment.end && !placed; minute += 30) {
            const start = fromWallMinutes(minute);
            const end = fromWallMinutes(minute + duration);
            const assignment = { craftpersonId: person.id, assignedStartDateTime: start, assignedEndDateTime: end };
            if (!isFree(person.id, start, end)) continue;
            if (assignmentAbsences(absences, siteId, assignment).length) continue;
            if (freezeConflicts(wr, freezes, start, end)) continue;
            placed = {
              wrId: wr.WR_ID, description: wr.Description, tradeName: wr.TradeName ?? "—", bl_id: wr.bl_id,
              craftpersonId: person.id, craftpersonName: `${person.Name} ${person.LastName}`,
              assignedStartDateTime: start, assignedEndDateTime: end, durationMinutes: duration,
              clusteredWithWrId: anchors.get(`${person.id}|${day}|${wr.bl_id}`),
            };
          }
          if (placed) break;
        }
        if (placed) break;
      }
    }
    if (!placed) {
      unplaced.push({ wrId: wr.WR_ID, description: wr.Description, reason: `No conflict-free shift slot within ${horizonDays} days (freeze / leave / overlap checks).` });
      continue;
    }
    proposals.push(placed);
    busy.set(placed.craftpersonId, [...(busy.get(placed.craftpersonId) ?? []), [placed.assignedStartDateTime, placed.assignedEndDateTime]]);
    if (wr.bl_id && !placed.clusteredWithWrId) anchors.set(`${placed.craftpersonId}|${placed.assignedStartDateTime.slice(0, 10)}|${wr.bl_id}`, wr.WR_ID);
  }
  return { proposals, unplaced, horizonDays };
}

/** Batch-confirm the selected proposals: schedule, backfill labor and audit each WR. */
export function applyAutoSlotProposals(
  workRequests: BaseWorkRequest[], proposals: AutoSlotProposal[], people: AutoSlotPerson[],
  siteId: string, actorName: string, actorRole: string,
): BaseWorkRequest[] {
  const now = new Date().toISOString();
  return workRequests.map((wr) => {
    const proposal = proposals.find((item) => item.wrId === wr.WR_ID && wr.SiteId === siteId);
    if (!proposal || !isWrSchedulable(wr) || (wr.CraftpersonAssignments ?? []).length) return wr;
    const person = people.find((item) => item.id === proposal.craftpersonId);
    if (!person) return wr;
    const scheduled = schedulePerson(wr, {
      craftpersonId: proposal.craftpersonId,
      assignedStartDateTime: proposal.assignedStartDateTime,
      assignedEndDateTime: proposal.assignedEndDateTime,
    });
    if (!scheduled.CraftpersonLabor?.some((item) => item.craftpersonId === person.id)) {
      scheduled.CraftpersonLabor = [...(scheduled.CraftpersonLabor ?? []), {
        craftpersonId: person.id, name: person.Name, lastName: person.LastName, hourlyRate: person.HourlyRate, workingTimeMinutes: 0,
      }];
    }
    const cluster = proposal.clusteredWithWrId ? `; same-building cluster with ${proposal.clusteredWithWrId} in ${proposal.bl_id}` : "";
    return {
      ...scheduled, UpdatedAt: now,
      Activity: [...(scheduled.Activity ?? []), {
        id: crypto.randomUUID(), kind: "log" as const, actorId: actorName, actorName, actorRole, createdAt: now,
        text: `✨ Auto-Slot proposal confirmed: ${proposal.craftpersonName} scheduled ${proposal.assignedStartDateTime} – ${proposal.assignedEndDateTime}${cluster} by ${actorName}`,
      }],
    };
  });
}

export const autoSlotDurationLabel = (proposal: AutoSlotProposal) =>
  `${Math.floor(proposal.durationMinutes / 60)}h${proposal.durationMinutes % 60 ? ` ${proposal.durationMinutes % 60}m` : ""}`;

export const autoSlotWindowLabel = (proposal: AutoSlotProposal) =>
  `${formatDateTimeDDMMYYYY(proposal.assignedStartDateTime)} – ${proposal.assignedEndDateTime.slice(11)}`;
