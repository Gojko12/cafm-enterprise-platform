import { allocateWorkRequestId, isStrictWorkRequestId } from "@cafm/shared-schema";

type WrRecord = Record<string, unknown>;

export { allocateWorkRequestId, isStrictWorkRequestId };

function isRecord(value: unknown): value is WrRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recordSite(record: WrRecord, fallback = "") {
  return typeof record.SiteId === "string" ? record.SiteId
    : typeof record.siteId === "string" ? record.siteId
      : fallback;
}

function workRequestRecords(state: WrRecord) {
  return [
    ...(Array.isArray(state.workRequests) ? state.workRequests : []),
    ...(Array.isArray(state.deletedWorkRequests) ? state.deletedWorkRequests : []),
  ].filter(isRecord);
}

function isWorkRequestReferenceKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return normalized.endsWith("wrid") || normalized.endsWith("wrids") ||
    normalized.endsWith("ljid") || normalized.endsWith("ljids") ||
    normalized === "followupfjids" || normalized === "followupwrids";
}

function remapReference(value: string, site: string, mappings: Map<string, string>, unscoped: Map<string, string | null>) {
  return mappings.get(`${site}\u0000${value}`) ?? unscoped.get(value) ?? value;
}

function remapComposite(value: string, site: string, mappings: Map<string, string>, unscoped: Map<string, string | null>) {
  const candidates = [...mappings.entries()]
    .filter(([key]) => key.startsWith(`${site}\u0000`))
    .map(([key, replacement]) => [key.slice(site.length + 1), replacement] as const);
  for (const [oldId, replacement] of candidates) {
    if (value.startsWith(oldId) && /^[-:]/.test(value.slice(oldId.length))) return `${replacement}${value.slice(oldId.length)}`;
  }
  for (const [oldId, replacement] of unscoped) {
    if (replacement && value.startsWith(oldId) && /^[-:]/.test(value.slice(oldId.length))) return `${replacement}${value.slice(oldId.length)}`;
  }
  return value;
}

function rewriteReferences(value: unknown, inheritedSite: string, mappings: Map<string, string>, unscoped: Map<string, string | null>, key = ""): unknown {
  if (typeof value === "string") {
    const site = inheritedSite;
    if (isWorkRequestReferenceKey(key)) return remapReference(value, site, mappings, unscoped);
    if (["id", "stepinstanceid", "auditlogid", "stepid"].includes(key.replace(/[^a-z0-9]/gi, "").toLowerCase())) {
      return remapComposite(value, site, mappings, unscoped);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (isWorkRequestReferenceKey(key)) return value.map((item) => typeof item === "string" ? remapReference(item, inheritedSite, mappings, unscoped) : item);
    return value.map((item) => rewriteReferences(item, inheritedSite, mappings, unscoped));
  }
  if (!isRecord(value)) return value;
  const site = recordSite(value, inheritedSite);
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) =>
    [childKey, rewriteReferences(child, site, mappings, unscoped, childKey)]));
}

export function migrateWorkRequestIdsTo10Digits<T>(input: T): T {
  if (!isRecord(input)) return input;
  const requests = workRequestRecords(input);
  const invalid = requests.filter((request) => !isStrictWorkRequestId(request.WR_ID));
  if (!invalid.length) return input;

  const used = new Set(requests.map((request) => request.WR_ID).filter(isStrictWorkRequestId));
  const mappings = new Map<string, string>();
  const requestReplacements = new Map<WrRecord, string>();
  const byOldId = new Map<string, Set<string>>();
  for (const request of invalid) {
    const oldId = typeof request.WR_ID === "string" ? request.WR_ID : "";
    const site = recordSite(request);
    const key = `${site}\u0000${oldId}`;
    let sequence = 1;
    let next = `2026${String(sequence).padStart(6, "0")}`;
    while (used.has(next)) {
      sequence++;
      if (sequence > 999999) throw new Error("No unused 2026 work request IDs remain.");
      next = `2026${String(sequence).padStart(6, "0")}`;
    }
    used.add(next);
    if (!mappings.has(key)) mappings.set(key, next);
    requestReplacements.set(request, next);
    byOldId.set(oldId, new Set([...(byOldId.get(oldId) ?? []), next]));
  }
  const unscoped = new Map<string, string | null>();
  for (const [oldId, replacements] of byOldId) unscoped.set(oldId, replacements.size === 1 ? [...replacements][0] : null);
  const rewritten = rewriteReferences(input, "", mappings, unscoped) as WrRecord;
  const remapRequestIds = (value: unknown, original: unknown) => Array.isArray(value) && Array.isArray(original)
    ? value.map((request, index) => {
      const source = original[index];
      return isRecord(request) && isRecord(source) && requestReplacements.has(source)
        ? { ...request, WR_ID: requestReplacements.get(source) }
        : request;
    })
    : value;
  if ("workRequests" in rewritten) rewritten.workRequests = remapRequestIds(rewritten.workRequests, input.workRequests);
  if ("deletedWorkRequests" in rewritten) rewritten.deletedWorkRequests = remapRequestIds(rewritten.deletedWorkRequests, input.deletedWorkRequests);
  return rewritten as T;
}
