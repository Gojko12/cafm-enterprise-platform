import { isDeepStrictEqual } from "node:util";
import { actorCanPmAction, resolveGovernanceActor, type GovernanceActor, type GovernanceRegistry } from "./governance-actor";
import { HARD_LOCKED_FEATURES } from "./rbac-matrix";
import { isNormalLjShortcut, isNormalLjStageDetails, isNormalLjTransition, LJ_OVERRIDE_STAGES, ljStatus } from "./lj-governance";
import type { GovernanceProof } from "./wr-governance-types";

type Wr = Record<string, unknown> & { WR_ID: string };
interface State extends GovernanceRegistry {
  workRequests: Wr[];
}
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function appended(old: unknown, next: unknown, predicate: (entry: Record<string, unknown>) => boolean): boolean {
  const before = array(old);
  const after = array(next);
  return after.length > before.length && before.every((entry, index) => isDeepStrictEqual(entry, after[index])) &&
    after.slice(before.length).some((entry) => predicate(object(entry)));
}

function validProof(proof: GovernanceProof | undefined, id: string, kind: GovernanceProof["kind"]): proof is GovernanceProof {
  if (!proof || proof.wrId !== id || proof.kind !== kind || proof.reason.trim().length < 5) return false;
  const first = Date.parse(proof.confirmed1At);
  const second = Date.parse(proof.confirmed2At);
  return Number.isFinite(first) && Number.isFinite(second) && first < second && second <= Date.now() + 5000;
}

export function hasInvalidLockedOverrides(value: unknown): boolean {
  const overrides = object(value);
  return Object.entries(overrides).some(([key, value]) => {
    const [role, permission] = key.split("|");
    return (HARD_LOCKED_FEATURES as readonly string[]).includes(permission) && (role === "SiteAdministrator" ? value === false : value === true);
  });
}

function matchingLogs(old: Wr, next: Wr, actorId: string, message: string): boolean {
  return appended(old.Activity, next.Activity, (entry) => entry.kind === "log" && entry.actorId === actorId && entry.text === message) &&
    appended(old.ChecklistHistory, next.ChecklistHistory, (entry) => entry.details === message);
}

function allowedReactivationFields(old: Wr, next: Wr): boolean {
  const allowed = new Set(["Percentage", "WorkRequestStatus", "WorkRequestSubstatus", "ClosedAt", "CompletedAt", "IsFrozen", "FreezeReason",
    "ActiveFreezeName", "PlannedFreezeText", "FreezeStartedAt", "FreezeEndedAt", "ReopenCount", "ReopenedHistory",
    "Activity", "ChecklistHistory", "UpdatedAt", "updatedAt"]);
  return [...new Set([...Object.keys(old), ...Object.keys(next)])]
    .every((key) => allowed.has(key) || isDeepStrictEqual(old[key], next[key]));
}

// V45: closing a PM at 50/55 -> 78 (sometimes with an explicit incomplete-checklist
// override) and then to 100 within one sync window reaches the server collapsed as a
// single 50/55 -> 100 jump. The two honest intermediate steps are proven by the WR's
// own appended audit-log entries, in chronological order.
function hasCollapsedPmClosure(old: Wr, next: Wr): boolean {
  if (old.Percentage !== 50 && old.Percentage !== 55) return false;
  const logs = array(next.Activity).map(object).filter((entry) => entry.kind === "log");
  const fromBefore = `WR status changed from ${old.Percentage}% to 78%`;
  let passed78 = false;
  for (const entry of logs) {
    if (typeof entry.text !== "string") continue;
    if (entry.text.startsWith(fromBefore)) passed78 = true;
    else if (passed78 && entry.text.startsWith("WR status changed from 78% to 100%")) return true;
  }
  return false;
}

// V46: a closed PM (100%) stays auditable. The QA audit workflow writes only QA metadata
// (selection, verdicts, corrections, follow-up FJ links) while every stage field is frozen,
// and a failed inspection performs exactly one controlled reopen to 50% with its own log
// entry. Both paths are accepted without an administrator reactivation proof.
const QA_METADATA_KEYS = new Set(["QA_CompletionDate", "QA_AuditStatus", "QA_SelectionMode", "QA_InspectedBy",
  "QA_InspectedDate", "QA_InspectionStatus", "AuditInspectionStatus", "QA_IssueDescription", "QA_CorrectionComment",
  "QA_CorrectedDate", "QA_AuditPhotos", "qaStagedVerdict", "qaReinspectionCount", "qaTeamLeaderChallenges",
  "FollowUpFJIds", "Activity", "UpdatedAt", "updatedAt"]);

const keysEqualOutside = (old: Wr, next: Wr, allowed: ReadonlySet<string>): boolean =>
  [...new Set([...Object.keys(old), ...Object.keys(next)])]
    .every((key) => allowed.has(key) || isDeepStrictEqual(old[key], next[key]));

const isPmQaMetadataChange = (old: Wr, next: Wr): boolean =>
  ["Percentage", "WorkRequestStatus", "WorkRequestSubstatus", "ClosedAt", "IsFrozen", "FreezeReason"]
    .every((key) => isDeepStrictEqual(old[key], next[key])) &&
  keysEqualOutside(old, next, QA_METADATA_KEYS);

const isPmQaFailedReopen = (old: Wr, next: Wr): boolean =>
  next.Percentage === 50 && next.WorkRequestStatus === "Issued" && next.WorkRequestSubstatus === "Re-opened (50% - QA Failed)" &&
  next.QA_AuditStatus === "QA_Failed_ActionRequired" &&
  appended(old.Activity, next.Activity, (entry) => entry.kind === "log" && typeof entry.text === "string" &&
    entry.text.startsWith("QA Inspection FAILED by") && entry.text.endsWith(" WR automatically Re-opened and set to 50%.")) &&
  keysEqualOutside(old, next, new Set([...QA_METADATA_KEYS, "Percentage", "WorkRequestStatus", "WorkRequestSubstatus", "ClosedAt"]));

// V53: renaming a building / floor / room rewrites the location keys on every work
// request in one atomic save (lib/location-rename.ts). Terminal PMs are otherwise
// frozen (deep-equal or a full administrator reactivation proof); a pure
// location-key rewrite is a structural edit, not a stage change, so terminal
// closed (100) and cancelled (27) PMs accept it exactly like the QA metadata path
// above. Every other field - stage, status, activity log, labor - must stay
// deep-equal, so this exception cannot smuggle a stage or status change through.
const isPmLocationKeyChange = (old: Wr, next: Wr): boolean =>
  ["Percentage", "WorkRequestStatus", "WorkRequestSubstatus", "ClosedAt", "IsFrozen", "FreezeReason"]
    .every((key) => isDeepStrictEqual(old[key], next[key])) &&
  keysEqualOutside(old, next, new Set(["bl_id", "LevelName", "RoomCode"]));

export function validateGovernance(existing: State, incoming: State, site: string, actorId: string, proof?: GovernanceProof, globalActor?: GovernanceActor): string | null {
  const actor = globalActor ?? resolveGovernanceActor(existing, site, actorId);
  const overrides = incoming.featurePermissionOverrides ?? {};
  if (hasInvalidLockedOverrides(overrides)) return "Admin-only feature permissions are locked.";
  if (!isDeepStrictEqual(existing.featurePermissionOverrides ?? {}, overrides) && !actor?.isAdmin)
    return "Only site administrators may change feature permissions.";
  const nextById = new Map(incoming.workRequests.map((wr) => [wr.WR_ID, wr]));
  for (const wr of incoming.workRequests) {
    if ((wr.WR_Type === "PM" || wr.WR_Type === "LJ") &&
      (typeof wr.Percentage !== "number" || !Number.isInteger(wr.Percentage) || wr.Percentage < 0 || wr.Percentage > 100))
      return `Work request ${wr.WR_ID} has an invalid stage.`;
  }
  for (const old of existing.workRequests) {
    const next = nextById.get(old.WR_ID);
    if (old.WR_Type === "PM" && old.Percentage === 78 && next &&
      ["laborEntries", "CraftpersonLabor", "CraftpersonAssignments", "timeSessions", "MobileWorkSessions",
        "ChecklistResults", "ChecklistInstances", "ChecklistSteps"].some((key) => !isDeepStrictEqual(old[key], next[key])))
      return `PM ${old.WR_ID} labor and checklist answers are read-only at 78%.`;
    if (old.WR_Type === "PM" && (old.Percentage === 100 || old.Percentage === 27) && !isDeepStrictEqual(old, next) &&
      !(next && isPmLocationKeyChange(old, next)) &&
      !(next && old.Percentage === 100 && (isPmQaMetadataChange(old, next) || isPmQaFailedReopen(old, next)))) {
      if (!next || next.WR_Type !== "PM" || !actor?.isAdmin || ![50, 55, 78].includes(Number(next.Percentage)) ||
        !validProof(proof, old.WR_ID, "pm-reactivation") || !allowedReactivationFields(old, next))
        return `PM ${old.WR_ID} is terminal and may only be reactivated by an administrator.`;
      const role = actor.roles.includes("SuperAdmin") ? "SuperAdmin" : "SiteAdministrator";
      const message = `[Admin Reactivation] PM reactivated from ${old.Percentage}% to ${next.Percentage}% by ${actor.name} (${role}). Reason: ${proof.reason.trim()}`;
      if (!matchingLogs(old, next, actorId, message) || next.ClosedAt ||
        next.ReopenCount !== Number(old.ReopenCount ?? 0) + 1 ||
        !appended(old.ReopenedHistory, next.ReopenedHistory, (entry) => entry.fromPercentage === old.Percentage &&
          entry.toPercentage === next.Percentage && entry.reason === proof.reason.trim() && entry.actor === actor.name) ||
        (next.Percentage === 55 ? next.IsFrozen !== true || next.FreezeReason !== "Access" : next.IsFrozen === true) ||
        (next.Percentage === 50 && (next.WorkRequestStatus !== "Issued" || next.WorkRequestSubstatus !== "Issued")) ||
        (next.Percentage === 55 && (next.WorkRequestStatus !== "On Hold" || next.WorkRequestSubstatus !== "On Hold for Access")) ||
        (next.Percentage === 78 && next.WorkRequestStatus !== "Technically Completed"))
        return `PM ${old.WR_ID} reactivation proof or audit log is invalid.`;
    } else if (old.WR_Type === "PM" && next && (next.Percentage === 100 || next.Percentage === 27) && old.Percentage !== next.Percentage) {
      const permission = next.Percentage === 100 ? "pmWorkRequests.complete" : "pmWorkRequests.cancel";
      if (!actorCanPmAction(actor, permission, existing.featurePermissionOverrides))
        return `Not permitted to ${next.Percentage === 100 ? "complete" : "cancel"} PM ${old.WR_ID}.`;
      if (next.Percentage === 100 && (old.Percentage !== 78 || next.WorkRequestStatus !== "Closed") &&
        !(next.WorkRequestStatus === "Closed" && hasCollapsedPmClosure(old, next)))
        return `PM ${old.WR_ID} must be technically completed before closure.`;
      if (next.Percentage === 27 && (next.WorkRequestStatus !== "Cancelled" || next.WorkRequestSubstatus !== "Cancelled" || !appended(old.Activity, next.Activity, (entry) =>
        entry.kind === "log" && entry.actorId === actorId && typeof entry.text === "string" && /Cancellation reason:\s*\S/i.test(entry.text)))
        ) return `PM ${old.WR_ID} cancellation requires an audit reason.`;
    }
    if (next && (old.WR_Type === "PM" || old.WR_Type === "LJ" || next.WR_Type === "PM" || next.WR_Type === "LJ") && old.WR_Type !== next.WR_Type)
      return `Work request ${old.WR_ID} cannot change type.`;
    if (old.WR_Type !== "LJ" || !next || (old.Percentage === next.Percentage &&
      old.WorkRequestStatus === next.WorkRequestStatus && old.WorkRequestSubstatus === next.WorkRequestSubstatus &&
      old.ProcessTrack === next.ProcessTrack && isDeepStrictEqual(old.AcceptanceGates, next.AcceptanceGates) &&
      isDeepStrictEqual(old.PreSATApproved, next.PreSATApproved))) continue;
    const from = Number(old.Percentage);
    const to = Number(next.Percentage);
    const trade = typeof old.TradeName === "string" ? old.TradeName : typeof old.TradeId === "string" ? old.TradeId : "";
    const tradeActor = globalActor ?? resolveGovernanceActor(existing, site, actorId, trade);
    const track = typeof old.ProcessTrack === "string" ? old.ProcessTrack : from >= 30 ? "RFW" : "RFQ";
    const targetTrack = typeof next.ProcessTrack === "string" ? next.ProcessTrack : to >= 30 ? "RFW" : "RFQ";
    const gateAction = track === "RFW" && from >= 78 && from <= 81 && (String(next.WorkRequestSubstatus).includes(": ") ||
      String(next.WorkRequestSubstatus).endsWith(" approved") || next.WorkRequestSubstatus === "All Acceptances Completed" ||
      next.WorkRequestSubstatus === "Pre-SAT Approved");
    if (!(proof?.kind === "lj-override" && proof.wrId === old.WR_ID) && tradeActor &&
      (targetTrack === track || track === "RFQ" && to === 30 && targetTrack === "RFW") &&
      (gateAction || from === 100 && to === 100 && next.WorkRequestSubstatus === "100% archived" ||
        isNormalLjTransition(from, to, track, tradeActor.roles, tradeActor.isAdmin) ||
        isNormalLjShortcut(from, to, track, String(next.WorkRequestSubstatus), tradeActor.roles, tradeActor.isAdmin)) &&
      isNormalLjStageDetails(old, next, tradeActor.roles, tradeActor.isAdmin)) continue;
    if (from === to || !actor?.isAdmin || !validProof(proof, old.WR_ID, "lj-override") ||
      !LJ_OVERRIDE_STAGES.some(([percentage, description]) => percentage === to && description === next.WorkRequestSubstatus) ||
      next.WorkRequestStatus !== ljStatus(to))
      return `LJ ${old.WR_ID} stage transition requires an administrator override.`;
    const role = actor.roles.includes("SuperAdmin") ? "SuperAdmin" : "SiteAdministrator";
    const message = `[Site Admin Override] Stage pushed from ${from}% to ${to}% by ${actor.name} (${role}). Reason: ${proof.reason.trim()}`;
    if (!matchingLogs(old, next, actorId, message)) return `LJ ${old.WR_ID} override audit log is invalid.`;
  }
  for (const wr of incoming.workRequests) {
    if (!existing.workRequests.some((old) => old.WR_ID === wr.WR_ID) && wr.WR_Type === "PM" && (wr.Percentage === 27 || wr.Percentage === 100))
      return `New PM ${wr.WR_ID} cannot be created in a terminal state.`;
  }
  return null;
}
