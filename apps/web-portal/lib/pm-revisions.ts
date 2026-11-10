import type { BlueprintAuditEntry, PM_ChecklistStandard } from "@cafm/shared-schema";

type BlueprintState = { blueprints: PM_ChecklistStandard[]; blueprintAuditLog?: BlueprintAuditEntry[] };
export function recordBlueprintRevisions<T extends BlueprintState>(previous: BlueprintState | undefined, next: T, actor: string): T {
  const timestamp = new Date().toISOString();
  const additions: BlueprintAuditEntry[] = [];
  for (const blueprint of next.blueprints) {
    const before = previous?.blueprints.find((item) => item.SiteId === blueprint.SiteId && item.ChecklistCode === blueprint.ChecklistCode);
    if (!before || JSON.stringify(before) === JSON.stringify(blueprint)) continue;
    const fields = (["Title", "ExpectedHours", "MaintenanceReason", "TradeId", "Steps", "IsActive", "familyName", "familyId", "blueprintMode"] as const)
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(blueprint[key]));
    if (!fields.length) continue;
    if (!blueprint.SiteId) throw new Error("Blueprint revisions require a site.");
    additions.push({ id: crypto.randomUUID(), siteId: blueprint.SiteId, blueprintCode: blueprint.ChecklistCode, action: "Blueprint corrected",
      summary: `${blueprint.Title}: changed ${fields.join(", ")} (${before.Steps.length} → ${blueprint.Steps.length} delta steps)`,
      before: structuredClone(before), after: structuredClone(blueprint), actor, timestamp });
  }
  return { ...next, blueprintAuditLog: [...(previous?.blueprintAuditLog ?? next.blueprintAuditLog ?? []), ...additions] };
}
