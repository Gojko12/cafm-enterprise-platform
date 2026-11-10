type Rec = Record<string, unknown>;

export const recordStamp = (record: Rec): number =>
  Math.max(Date.parse(String(record.updatedAt ?? "")) || 0, Date.parse(String(record.UpdatedAt ?? "")) || 0);

function mergeList(local: unknown, remote: unknown, key: string): Rec[] | undefined {
  if (!Array.isArray(local) && !Array.isArray(remote)) return undefined;
  const merged = new Map<string, Rec>();
  for (const item of (Array.isArray(remote) ? remote : []) as Rec[]) merged.set(String(item[key]), item);
  for (const item of (Array.isArray(local) ? local : []) as Rec[]) {
    const other = merged.get(String(item[key]));
    if (!other || recordStamp(item) >= recordStamp(other)) merged.set(String(item[key]), item);
  }
  return [...merged.values()];
}

// Per-record newest-wins merge so a stale tab or device never reverts newer server work.
export function mergeRemoteState<T extends object>(local: T, remote: unknown): T {
  if (!remote || typeof remote !== "object") return local;
  const source = local as Rec;
  const server = remote as Rec;
  const next: Rec = { ...source };
  for (const [field, key] of [["workRequests", "WR_ID"], ["auditFindings", "id"], ["auditInspections", "id"]] as const) {
    const merged = mergeList(source[field], server[field], key);
    if (merged) next[field] = merged;
  }
  return next as T;
}

export function stampChangedWorkRequests<T extends { WR_ID: string }>(previous: T[], next: T[]): T[] {
  const before = new Map(previous.map((wr) => [wr.WR_ID, wr]));
  const now = new Date().toISOString();
  let changed = false;
  const result = next.map((wr) => {
    const old = before.get(wr.WR_ID);
    if (old === wr) return wr;
    if (old && JSON.stringify(old) === JSON.stringify(wr)) return wr;
    changed = true;
    return { ...wr, updatedAt: now, UpdatedAt: now };
  });
  return changed ? result : next;
}
