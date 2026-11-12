import { coordinationRecordId } from "@cafm/shared-schema";
import type { PmCoordinationRecord, SiteCoordinationRequirement, SiteStakeholderTeam } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";

const SEED_STAMP = "2026-01-05T08:00:00.000Z";
const SEED_AUTHOR = "Demo Seed";
const SITE = "02-ESOC" as const;

export const SEED_TEAMS: SiteStakeholderTeam[] = [
  { id: "TEAM-S01-ESAIT", siteId: SITE, code: "ESA IT", name: "ESA IT", color: "#2563eb", contactInfo: "IT Service Desk · it-desk@esa.example", defaultLeadDays: 7, requiresApproval: true, active: true, description: "Network, server room and IT-dependent systems", updatedAt: SEED_STAMP },
  { id: "TEAM-S01-OCC", siteId: SITE, code: "OCC", name: "Operations Control Centre", color: "#7c3aed", contactInfo: "OCC Duty Manager · occ@esa.example", defaultLeadDays: 14, requiresApproval: true, active: true, description: "Mission operations and satellite pass windows", updatedAt: SEED_STAMP },
  { id: "TEAM-S01-SEC", siteId: SITE, code: "Security", name: "Security", color: "#dc2626", contactInfo: "Security Control · security@esa.example", defaultLeadDays: 5, requiresApproval: true, active: true, description: "Access control and escorted contractor entry", updatedAt: SEED_STAMP },
  { id: "TEAM-S01-KITCHEN", siteId: SITE, code: "Kitchen", name: "Catering & Canteen", color: "#d97706", contactInfo: "Canteen Manager · catering@esa.example", defaultLeadDays: 5, requiresApproval: true, active: true, description: "Kitchen, canteen and food-service areas", updatedAt: SEED_STAMP },
];

export const SEED_REQUIREMENTS: SiteCoordinationRequirement[] = [
  { id: "REQ-S01-NEWSFLASH", siteId: SITE, code: "Newsflash", name: "Newsflash Announcement", category: "Communication", color: "#0891b2", defaultLeadDays: 5, mandatoryBeforeStart: true, active: true, updatedAt: SEED_STAMP,
    templateText: "NEWSFLASH — Planned maintenance\nDate: {date}\nLocation: {location}\nAsset: {asset}\nImpact: {impact}\nAffected teams: {teams}\nPlease plan accordingly. Contact the CIFM helpdesk for questions." },
];

const T = { it: "TEAM-S01-ESAIT", occ: "TEAM-S01-OCC", sec: "TEAM-S01-SEC", kit: "TEAM-S01-KITCHEN" };
const NF = "REQ-S01-NEWSFLASH";
const TAGS: Array<{ match: RegExp; teams: string[]; impact: string; lead: number }> = [
  { match: /chiller/i, teams: [T.it, T.occ], impact: "Cooling to the data hall reduced during the maintenance window.", lead: 14 },
  { match: /ups/i, teams: [T.it, T.occ, T.sec], impact: "UPS placed on bypass; critical loads on mains only.", lead: 14 },
  { match: /generator/i, teams: [T.it, T.sec], impact: "Load test with brief changeover; contractor access required.", lead: 7 },
  { match: /cleanroom/i, teams: [T.occ, T.sec], impact: "Cleanroom airflow interrupted; entry restricted.", lead: 14 },
  { match: /fire damper/i, teams: [T.sec, T.occ], impact: "Fire compartment testing; alarm zone isolation.", lead: 14 },
  { match: /kitchen/i, teams: [T.kit], impact: "Kitchen extraction offline; cooking operations paused.", lead: 5 },
];

const entry = (status: PmCoordinationRecord["teamStatuses"][string]["status"], extra: Partial<PmCoordinationRecord["teamStatuses"][string]> = {}) => ({ status, updatedAt: SEED_STAMP, updatedBy: SEED_AUTHOR, ...extra });
const note = (id: string, message: string, teamId?: string, outcomeTag?: PmCoordinationRecord["discussionLog"][number]["outcomeTag"], requirementId?: string) =>
  ({ id, timestamp: SEED_STAMP, author: SEED_AUTHOR, message, teamId, outcomeTag, requirementId });

export function withCoordinationShowcase(data: DemoData): DemoData {
  if (data.stakeholderTeams !== undefined && data.coordinationRequirements !== undefined && data.pmCoordination !== undefined) return data;
  const next: DemoData = { ...data };
  if (!next.stakeholderTeams) next.stakeholderTeams = [...SEED_TEAMS];
  if (!next.coordinationRequirements) next.coordinationRequirements = [...SEED_REQUIREMENTS];
  if (next.pmCoordination !== undefined) return next;
  const site01 = next.schedules.filter((item) => item.SiteId === SITE && item.IsActive);
  if (!site01.length) { next.pmCoordination = []; return next; }
  const nameOf = (code?: string) => next.equipment.find((item) => item.EquipmentCode === code)?.EquipmentName ?? "";
  const used = new Set<string>();
  const tagged: Array<{ id: string; teams: string[]; schedule: typeof site01[number] }> = [];
  const schedules = next.schedules.map((schedule) => {
    if (schedule.SiteId !== SITE || !schedule.IsActive || schedule.affectedTeamIds) return schedule;
    const tag = TAGS.find((item) => !used.has(item.match.source) && item.match.test(`${nameOf(schedule.EquipmentCodes[0])} ${schedule.Title ?? ""}`));
    if (!tag) return schedule;
    used.add(tag.match.source);
    const updated = { ...schedule, affectedTeamIds: tag.teams, requirementIds: [NF], coordinationLeadDays: tag.lead, impactSummary: tag.impact, UpdatedAt: SEED_STAMP };
    tagged.push({ id: schedule.ScheduleId, teams: tag.teams, schedule: updated });
    return updated;
  });
  next.schedules = schedules;
  const targetFor = (id: string, fallback: string) => {
    const open = next.workRequests.filter((wr) => wr.WR_Type === "PM" && wr.ScheduleId === id && [50, 55].includes(wr.Percentage) && wr.DueDate).sort((a, b) => String(a.DueDate).localeCompare(String(b.DueDate)))[0];
    return { date: (open?.DueDate ?? fallback).slice(0, 10), wrId: open?.WR_ID };
  };
  const records: PmCoordinationRecord[] = tagged.map(({ id, teams, schedule }, index) => {
    const target = targetFor(id, schedule.NextDueDate);
    const record: PmCoordinationRecord = {
      id: coordinationRecordId(SITE, id, target.date), siteId: SITE, pmsId: id, targetDate: target.date, wrId: target.wrId,
      teamStatuses: {}, requirementStatuses: {}, discussionLog: [], decisionOverride: null, updatedAt: SEED_STAMP,
    };
    const name = nameOf(schedule.EquipmentCodes[0]);
    if (/generator/i.test(name)) {
      for (const team of teams) record.teamStatuses[team] = entry("Approved", { contactPerson: "Duty Officer" });
      record.requirementStatuses[NF] = { status: "Published_Done", referenceNote: "Newsflash NF-2026-014 sent to all staff", completedAt: SEED_STAMP, updatedAt: SEED_STAMP, updatedBy: SEED_AUTHOR };
      record.discussionLog.push(note(`${record.id}-n1`, "ESA IT and Security approved the load test.", T.it, "Approved"), note(`${record.id}-n2`, "Newsflash published to staff.", undefined, "Notice_Sent", NF));
    } else if (/kitchen/i.test(name)) {
      record.teamStatuses[T.kit] = entry("Conditional", { contactPerson: "Canteen Manager", agreedWindow: "14:30–17:00" });
      record.requirementStatuses[NF] = { status: "Not_Started", updatedAt: SEED_STAMP, updatedBy: SEED_AUTHOR };
      record.discussionLog.push(note(`${record.id}-n1`, "Execute between 14:30 and 17:00 after lunch service.", T.kit, "Conditional"));
    } else if (index % 2 === 1 || /cleanroom|fire damper/i.test(name)) {
      record.teamStatuses[T.occ] = entry("Postpone_Requested", { contactPerson: "OCC Duty Manager" });
      for (const team of teams.filter((item) => item !== T.occ)) record.teamStatuses[team] = entry("Pending");
      record.requirementStatuses[NF] = { status: "Not_Started", updatedAt: SEED_STAMP, updatedBy: SEED_AUTHOR };
      record.discussionLog.push(note(`${record.id}-n1`, "LEOP launch support freeze — please postpone after 22-11-2026", T.occ, "Postpone_Requested"));
    } else {
      record.teamStatuses[T.it] = entry("Approved", { contactPerson: "IT Service Desk" });
      for (const team of teams.filter((item) => item !== T.it)) record.teamStatuses[team] = entry(team === T.occ ? "In_Discussion" : "Pending", team === T.occ ? { contactPerson: "OCC Duty Manager" } : {});
      record.requirementStatuses[NF] = { status: "Drafted", draftBody: "NEWSFLASH — Planned maintenance (draft)", updatedAt: SEED_STAMP, updatedBy: SEED_AUTHOR };
      record.discussionLog.push(note(`${record.id}-n1`, "ESA IT approved.", T.it, "Approved"), note(`${record.id}-n2`, "Avoid the satellite pass window; OCC to confirm timings.", T.occ, "Note"));
    }
    return record;
  });
  next.pmCoordination = records;
  return next;
}
