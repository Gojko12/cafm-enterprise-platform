import type { AuditFinding } from "../audit-assurance-types";
import { DAY_MS, filterWorkRequests, startOfDayMs, endOfDayMs, dayString, addDaysIso, createdMs, isCancelled, completionMs, dueMs, marginMs, isActiveAt, isOverdueAt, isOverMarginAt, parseStamp, median, average } from "./core";
import type { AnalyticsFilters } from "./core";
// ---------------------------------------------------------------------------
// D. Technical audit findings analytics
// ---------------------------------------------------------------------------

export type FindingSeverity = "Critical" | "Major" | "Minor";

export interface NormalizedFinding {
  finding: AuditFinding;
  severity: FindingSeverity;
  dueDate: string | null;
  addressedAt: string | null;
  addressed: boolean;
  overdue: boolean;
  remediationDays: number | null;
  addressedOnTime: boolean | null;
}

export function normalizeFinding(finding: AuditFinding, now: Date): NormalizedFinding {
  const severity: FindingSeverity = finding.severity
    ?? (finding.urgency === "N0" ? "Critical" : finding.urgency === "N1" ? "Major" : "Minor");
  const dueDate = finding.dueDate ?? (finding.calculatedDeadline !== "No action" ? finding.calculatedDeadline : null);
  const addressedAt = finding.addressedAt
    ?? finding.verification?.verifiedAt
    ?? (finding.assuranceState === "FindingVerified_Closed" ? finding.evidence?.submittedAt ?? null : null)
    ?? null;
  const addressed = Boolean(addressedAt) || finding.assuranceState === "FindingVerified_Closed" || finding.status === "Closed" || finding.status === "Addressed";
  const addressedMs = parseStamp(addressedAt ?? undefined);
  const discoveredMs = parseStamp(finding.discoveredAt);
  const dueEnd = dueDate ? endOfDayMs(dueDate) : null;
  return {
    finding,
    severity,
    dueDate,
    addressedAt,
    addressed,
    overdue: !addressed && dueEnd !== null && dueEnd < now.getTime(),
    remediationDays: addressed && addressedMs !== null && discoveredMs !== null ? Math.max(0, (addressedMs - discoveredMs) / DAY_MS) : null,
    addressedOnTime: addressed && addressedMs !== null && dueEnd !== null ? addressedMs <= dueEnd : null,
  };
}

export interface FindingAnalytics {
  all: NormalizedFinding[];
  totalFindings: number;
  addressedCount: number;
  addressedPct: number | null;
  addressedOnTimeCount: number;
  addressedLateCount: number;
  openInWindow: NormalizedFinding[];
  overdueFindings: NormalizedFinding[];
  avgRemediationDays: number | null;
  bySeverity: Record<FindingSeverity, { total: number; open: number; overdue: number }>;
  byBuilding: Array<{ buildingId: string; total: number; overdue: number }>;
  monthlyTrend: Array<{ month: string; label: string; opened: number; addressed: number }>;
}

export function auditFindingAnalytics(findings: AuditFinding[], siteId: string, filters: AnalyticsFilters, now: Date): FindingAnalytics {
  const all = findings
    .filter((finding) => finding.siteId === siteId &&
      (!filters.buildingId || finding.buildingId === filters.buildingId) &&
      (!filters.trade || finding.trade === filters.trade))
    .map((finding) => normalizeFinding(finding, now));
  const addressed = all.filter((entry) => entry.addressed);
  const bySeverity = Object.fromEntries((["Critical", "Major", "Minor"] as const).map((severity) => {
    const subset = all.filter((entry) => entry.severity === severity);
    return [severity, { total: subset.length, open: subset.filter((entry) => !entry.addressed).length, overdue: subset.filter((entry) => entry.overdue).length }];
  })) as FindingAnalytics["bySeverity"];
  const buildings = new Map<string, { total: number; overdue: number }>();
  for (const entry of all) {
    const bucket = buildings.get(entry.finding.buildingId) ?? { total: 0, overdue: 0 };
    bucket.total++;
    if (entry.overdue) bucket.overdue++;
    buildings.set(entry.finding.buildingId, bucket);
  }
  const monthlyTrend = Array.from({ length: Math.min(12, now.getUTCMonth() + 1) }, (_, index) => {
    const month = `2026-${String(index + 1).padStart(2, "0")}`;
    return {
      month,
      label: `${month.slice(5)}-${month.slice(0, 4)}`,
      opened: all.filter((entry) => entry.finding.discoveredAt.startsWith(month)).length,
      addressed: all.filter((entry) => entry.addressedAt?.startsWith(month)).length,
    };
  });
  return {
    all,
    totalFindings: all.length,
    addressedCount: addressed.length,
    addressedPct: all.length ? (addressed.length / all.length) * 100 : null,
    addressedOnTimeCount: addressed.filter((entry) => entry.addressedOnTime === true).length,
    addressedLateCount: addressed.filter((entry) => entry.addressedOnTime === false).length,
    openInWindow: all.filter((entry) => !entry.addressed && !entry.overdue),
    overdueFindings: all.filter((entry) => entry.overdue),
    avgRemediationDays: average(addressed.map((entry) => entry.remediationDays).filter((value): value is number => value !== null)),
    bySeverity,
    byBuilding: [...buildings.entries()].map(([buildingId, bucket]) => ({ buildingId, ...bucket })).sort((a, b) => b.total - a.total),
    monthlyTrend,
  };
}

