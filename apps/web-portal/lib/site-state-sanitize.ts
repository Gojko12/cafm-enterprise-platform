/**
 * Strict per-site state scoping (Section 80), shared by `scopeData` on the client
 * and `POST /api/cafm-state` on the server, so a synced payload can never carry
 * records from another site and never trips the generic
 * "State contains records from another site." rejection.
 */

type AnyRecord = Record<string, unknown>;

/** Every site-scoped array whose records carry `SiteId` / `siteId` / `stationedSiteId`. */
const SITE_SCOPED_ARRAYS = [
  "buildings", "floors", "rooms", "desks", "equipment", "schedules", "craftspeople",
  "siteRoleAssignments", "workRequests", "deletedWorkRequests", "tradeRoleMappings",
  "siteRoleMappings", "userAccessProfiles", "craftpersonAbsences", "locationFreezes",
  "stakeholderTeams", "coordinationRequirements", "pmCoordination", "qaInspectorAssignments",
  "qaAuditReports", "onboardingRequests", "auditCampaigns", "auditFindings", "auditInspections",
  "auditTemplates", "auditImports", "blueprintAuditLog", "suppressedPmOccurrences",
] as const;

function recordSiteId(item: unknown): string | undefined {
  if (!item || typeof item !== "object") return undefined;
  const record = item as AnyRecord;
  for (const key of ["SiteId", "siteId", "stationedSiteId"] as const) {
    if (typeof record[key] === "string") return record[key];
  }
  return undefined;
}

function asRecords(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.filter((item): item is AnyRecord => !!item && typeof item === "object") : [];
}

function workRequestIds(value: unknown): string[] {
  return asRecords(value).map((wr) => String(wr.WR_ID));
}

/** Keeps only BIM element links that belong to this site's buildings; the linked
 *  equipment may legitimately not exist yet (created later or still unsynced). */
function scopeBimElementLinks(links: unknown, buildings: unknown): unknown {
  if (!links || typeof links !== "object" || Array.isArray(links)) return links;
  const buildingIds = new Set(asRecords(buildings).map((building) => String(building.bl_id)));
  return Object.fromEntries(Object.entries(links as Record<string, unknown>).filter(([key, link]) => {
    if (!link || typeof link !== "object") return false;
    const buildingId = (link as AnyRecord).buildingId;
    return typeof buildingId === "string" && buildingIds.has(buildingId) && key.startsWith(`${buildingId}:`);
  }));
}

/** Prunes PM suppressions whose covering WR, schedule target or equipment no longer
 *  exists at this site (e.g. after a WR ID migration or a BIM floor/room resync). */
function pruneOrphanedSuppressions(state: AnyRecord): unknown {
  const suppressions = state.suppressedPmOccurrences;
  if (!Array.isArray(suppressions)) return suppressions;
  const requestIds = new Set([...workRequestIds(state.workRequests), ...workRequestIds(state.deletedWorkRequests)]);
  const equipmentCodes = new Set(asRecords(state.equipment).map((asset) => String(asset.EquipmentCode)));
  const targetKeys = new Set(asRecords(state.schedules).map((order) => String(order.targetKey)));
  return suppressions.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as AnyRecord;
    if (!requestIds.has(String(record.coveredByWrId))) return false;
    return record.targetType && record.targetType !== "equipment"
      ? targetKeys.has(String(record.targetKey))
      : equipmentCodes.has(String(record.equipmentCode));
  });
}

/**
 * Forces `sites: [site]`, filters every site-scoped array strictly to `site`,
 * normalizes `users` to `AssignedSiteIds: [site]`, scopes `bimElementLinks` to the
 * site's buildings and prunes orphaned `suppressedPmOccurrences`.
 */
export function sanitizeStateForSite<T extends object>(state: T, site: string): T {
  const next: AnyRecord = { ...(state as AnyRecord), sites: [site] };
  for (const field of SITE_SCOPED_ARRAYS) {
    if (Array.isArray(next[field])) {
      next[field] = (next[field] as unknown[]).filter((item) => recordSiteId(item) === site);
    }
  }
  if (Array.isArray(next.users)) {
    next.users = next.users.map((user) =>
      user && typeof user === "object" ? { ...(user as AnyRecord), AssignedSiteIds: [site] } : user);
  }
  if ("bimElementLinks" in next) next.bimElementLinks = scopeBimElementLinks(next.bimElementLinks, next.buildings);
  if ("suppressedPmOccurrences" in next) next.suppressedPmOccurrences = pruneOrphanedSuppressions(next);
  return next as T;
}
