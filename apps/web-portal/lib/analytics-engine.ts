/**
 * Facade for the Executive BI analytics engine. Domain calculators live in `./analytics/*`;
 * every public function and type is re-exported here so callers never change.
 */
export { DAY_MS, filterWorkRequests, startOfDayMs, endOfDayMs, dayString, addDaysIso, createdMs, isCancelled, completionMs, dueMs, marginMs, isActiveAt, isOverdueAt, isOverMarginAt } from "./analytics/core";
export type { AnalyticsFilters } from "./analytics/core";
export * from "./analytics/breach";
export * from "./analytics/long-jobs";
export * from "./analytics/audit-findings";
export * from "./analytics/technician";
export * from "./analytics/bad-actors";
export * from "./analytics/sla-format";
