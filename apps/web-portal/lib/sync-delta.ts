// Stage B delta sync (MASTER_SPEC Section 96 companion): the client sends only what
// changed since the acknowledged server state instead of the whole site state, so a
// POST body stays small no matter how large the demo state grows. Pure functions with
// no dependencies, shared by the browser store (buildSyncDelta) and the sync API route
// (applySyncDelta); the wire protocol stays backward compatible because full-state
// POSTs (imports, forceReset, first upload) are still accepted unchanged.
export type SyncDelta = { workRequests: Record<string, unknown>[]; deletedWrIds: string[]; collections: Record<string, unknown> };

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const records = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];

// Diff of the acknowledged server state (base) against the outgoing local state (next):
// changed or new work-request records by WR_ID, deleted WR IDs, and every other changed
// top-level key (array, object or scalar) sent as a whole value.
export function buildSyncDelta(base: unknown, next: unknown): SyncDelta {
  const delta: SyncDelta = { workRequests: [], deletedWrIds: [], collections: {} };
  const baseState = base && typeof base === "object" ? base as Record<string, unknown> : null;
  const nextState = next && typeof next === "object" ? next as Record<string, unknown> : {};
  const baseWr = records(baseState?.workRequests);
  const nextWr = records(nextState.workRequests);
  const baseById = new Map(baseWr.map((wr) => [String(wr.WR_ID), wr]));
  const nextIds = new Set(nextWr.map((wr) => String(wr.WR_ID)));
  for (const wr of baseWr) if (!nextIds.has(String(wr.WR_ID))) delta.deletedWrIds.push(String(wr.WR_ID));
  for (const wr of nextWr) {
    const old = baseById.get(String(wr.WR_ID));
    if (!old || !same(old, wr)) delta.workRequests.push(wr);
  }
  for (const [key, value] of Object.entries(nextState)) {
    if (key === "workRequests" || value === undefined) continue;
    if (!baseState || !same(baseState[key], value)) delta.collections[key] = value;
  }
  return delta;
}

// Server-side application of a delta onto the stored site state: work-request records
// merge by WR_ID (deleted IDs removed first, then upserts; untouched records keep their
// stored form and order), and every collections key replaces the stored value wholesale.
export function applySyncDelta(base: unknown, delta: SyncDelta): Record<string, unknown> {
  const state = base && typeof base === "object" ? { ...(base as Record<string, unknown>) } : {};
  const deleted = new Set(delta.deletedWrIds.map(String));
  const workRequests = records(state.workRequests).filter((wr) => !deleted.has(String(wr.WR_ID)));
  const byId = new Map(workRequests.map((wr) => [String(wr.WR_ID), wr]));
  for (const wr of delta.workRequests ?? []) byId.set(String(wr.WR_ID), wr);
  state.workRequests = [...byId.values()];
  for (const [key, value] of Object.entries(delta.collections ?? {})) state[key] = value;
  return state;
}
