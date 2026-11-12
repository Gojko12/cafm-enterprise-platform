import { z } from "zod";
import { SiteIdSchema } from "./locations.js";

export const SiteStakeholderTeamSchema = z.object({
  id: z.string().min(1),
  siteId: SiteIdSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
  contactInfo: z.string().optional(),
  defaultLeadDays: z.number().int().nonnegative(),
  requiresApproval: z.boolean(),
  active: z.boolean(),
  description: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SiteStakeholderTeam = z.infer<typeof SiteStakeholderTeamSchema>;

export const COORDINATION_CATEGORIES = ["Communication", "Permit", "Protocol"] as const;
export const SiteCoordinationRequirementSchema = z.object({
  id: z.string().min(1),
  siteId: SiteIdSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(COORDINATION_CATEGORIES),
  color: z.string().min(1),
  defaultLeadDays: z.number().int().nonnegative(),
  mandatoryBeforeStart: z.boolean(),
  templateText: z.string().optional(),
  active: z.boolean(),
  updatedAt: z.string().optional(),
});
export type SiteCoordinationRequirement = z.infer<typeof SiteCoordinationRequirementSchema>;

export const TEAM_ALIGNMENT_STATUSES = ["Pending", "In_Discussion", "Approved", "Conditional", "Postpone_Requested"] as const;
export const REQUIREMENT_STATUSES = ["Not_Started", "Drafted", "Published_Done"] as const;
export const DISCUSSION_OUTCOMES = ["Note", "Approved", "Conditional", "Postpone_Requested", "Freeze_Created", "Rescheduled", "Notice_Sent"] as const;

export const PmCoordinationRecordSchema = z.object({
  id: z.string().min(1),
  siteId: SiteIdSchema,
  pmsId: z.string().min(1).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  wrId: z.string().min(1).optional(),
  teamStatuses: z.record(z.string(), z.object({
    status: z.enum(TEAM_ALIGNMENT_STATUSES),
    contactPerson: z.string().optional(),
    agreedWindow: z.string().optional(),
    updatedAt: z.string(),
    updatedBy: z.string(),
  })),
  requirementStatuses: z.record(z.string(), z.object({
    status: z.enum(REQUIREMENT_STATUSES),
    referenceNote: z.string().optional(),
    draftBody: z.string().optional(),
    completedAt: z.string().optional(),
    updatedAt: z.string(),
    updatedBy: z.string(),
  })),
  discussionLog: z.array(z.object({
    id: z.string().min(1),
    timestamp: z.string(),
    author: z.string(),
    teamId: z.string().optional(),
    requirementId: z.string().optional(),
    outcomeTag: z.enum(DISCUSSION_OUTCOMES).optional(),
    message: z.string(),
  })),
  decisionOverride: z.enum(["Hold_Postponed", "Force_Cleared"]).nullable().optional(),
  updatedAt: z.string(),
});
export type PmCoordinationRecord = z.infer<typeof PmCoordinationRecordSchema>;

export const coordinationKey = (pmsId: string | undefined, targetDate: string) => `${pmsId ?? "WR"}@${targetDate.slice(0, 10)}`;
export const coordinationRecordId = (siteId: string, pmsId: string | undefined, targetDate: string) => `COORD-${siteId}-${coordinationKey(pmsId, targetDate)}`;

export type PmGateState = "None" | "Action" | "Discussion" | "Postpone" | "Cleared";
export interface PmGateResult {
  state: PmGateState;
  blockers: string[];
  cleared: string[];
  windows: Array<{ code: string; window: string }>;
  pendingTeams: SiteStakeholderTeam[];
  pendingRequirements: SiteCoordinationRequirement[];
  postponeTeams: SiteStakeholderTeam[];
}

export function evaluatePmGate(input: {
  teamIds?: string[]; requirementIds?: string[];
  teams: SiteStakeholderTeam[]; requirements: SiteCoordinationRequirement[];
  record?: Pick<PmCoordinationRecord, "teamStatuses" | "requirementStatuses" | "decisionOverride"> | null;
}): PmGateResult {
  const teams = (input.teamIds ?? []).map((id) => input.teams.find((team) => team.id === id)).filter((team): team is SiteStakeholderTeam => !!team && team.active);
  const reqs = (input.requirementIds ?? []).map((id) => input.requirements.find((item) => item.id === id)).filter((item): item is SiteCoordinationRequirement => !!item && item.active);
  const empty: PmGateResult = { state: "None", blockers: [], cleared: [], windows: [], pendingTeams: [], pendingRequirements: [], postponeTeams: [] };
  if (!teams.length && !reqs.length) return empty;
  const record = input.record;
  const pendingTeams: SiteStakeholderTeam[] = [];
  const postponeTeams: SiteStakeholderTeam[] = [];
  const pendingRequirements: SiteCoordinationRequirement[] = [];
  const cleared: string[] = [];
  const windows: PmGateResult["windows"] = [];
  let engaged = false;
  for (const team of teams) {
    const entry = record?.teamStatuses[team.id];
    const status = entry?.status ?? "Pending";
    if (status === "Postpone_Requested") { postponeTeams.push(team); pendingTeams.push(team); continue; }
    if (status === "Approved" || status === "Conditional" || !team.requiresApproval) {
      cleared.push(team.code);
      if (entry?.agreedWindow) windows.push({ code: team.code, window: entry.agreedWindow });
      continue;
    }
    pendingTeams.push(team);
    if (status === "In_Discussion") engaged = true;
  }
  for (const item of reqs) {
    const entry = record?.requirementStatuses[item.id];
    const status = entry?.status ?? "Not_Started";
    if (status === "Published_Done") { cleared.push(item.code); continue; }
    if (!item.mandatoryBeforeStart) continue;
    pendingRequirements.push(item);
    if (status === "Drafted") engaged = true;
  }
  const blockers = [...pendingTeams.map((team) => team.code), ...pendingRequirements.map((item) => item.code)];
  let state: PmGateState;
  if (postponeTeams.length || record?.decisionOverride === "Hold_Postponed") state = "Postpone";
  else if (record?.decisionOverride === "Force_Cleared" || !blockers.length) state = "Cleared";
  else state = engaged ? "Discussion" : "Action";
  return { state, blockers, cleared, windows, pendingTeams, pendingRequirements, postponeTeams };
}

export const PM_GATE_LABELS: Record<PmGateState, string> = {
  None: "No coordination", Action: "Action Needed", Discussion: "Pending Discussion", Postpone: "Postpone / Freeze Requested", Cleared: "Cleared",
};
