import type { BaseWorkRequest } from "@cafm/shared-schema";
import type { GovernanceActor } from "./governance-actor";

export function appendGovernanceLog(wr: BaseWorkRequest, actor: GovernanceActor, text: string, now: string): BaseWorkRequest {
  const role = actor.roles.includes("SuperAdmin") ? "SuperAdmin" : "SiteAdministrator";
  return {
    ...wr,
    UpdatedAt: now,
    updatedAt: now,
    Activity: [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: actor.id, actorName: actor.name, actorRole: role, createdAt: now, text }],
    ChecklistHistory: [...(wr.ChecklistHistory ?? []), { id: crypto.randomUUID(), timestamp: now, performedBy: actor.name, actionType: role, details: text }],
  };
}
