const STRICT_WR_ID = /^2026\d{6}$/;

export function isStrictWorkRequestId(value: unknown): value is string {
  return typeof value === "string" && STRICT_WR_ID.test(value);
}

export function allocateWorkRequestId(existing: Iterable<unknown>): string {
  const used = new Set<string>();
  for (const item of existing) {
    const id = typeof item === "string" ? item
      : item !== null && typeof item === "object" && "WR_ID" in item ? item.WR_ID
        : undefined;
    if (isStrictWorkRequestId(id)) used.add(id);
  }
  for (let sequence = 1; sequence <= 999999; sequence++) {
    const candidate = `2026${String(sequence).padStart(6, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("No unused 2026 work request IDs remain.");
}
