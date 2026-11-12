import type { BaseWorkRequest, Equipment } from "@cafm/shared-schema";
import type { NormalizedFinding } from "./audit-findings";
import { DAY_MS, filterWorkRequests, startOfDayMs, endOfDayMs, dayString, addDaysIso, createdMs, isCancelled, completionMs, dueMs, marginMs, isActiveAt, isOverdueAt, isOverMarginAt, parseStamp, median, average } from "./core";
import type { AnalyticsFilters } from "./core";
// ---------------------------------------------------------------------------
// F. Problematic equipment ("Bad Actors")
// ---------------------------------------------------------------------------

export interface BadActor {
  equipmentCode: string;
  equipment: Equipment | null;
  equipmentName: string;
  location: string;
  reactiveFJs: BaseWorkRequest[];
  unfavourablePmSteps: number;
  unfavourablePmWRs: BaseWorkRequest[];
  auditFindings: NormalizedFinding[];
  linkedLJs: BaseWorkRequest[];
  openWRs: BaseWorkRequest[];
  overdueWRs: BaseWorkRequest[];
  totalRepairHours: number;
  estimatedDowntimeHours: number;
  mtbfDays: number | null;
  mttrHours: number | null;
  issueScore: number;
  cumulativePct: number;
}

export function badActorAnalytics(
  workRequests: BaseWorkRequest[],
  findings: NormalizedFinding[],
  equipment: Equipment[],
  now: Date,
): BadActor[] {
  const nowMs = now.getTime();
  const equipmentByCode = new Map(equipment.map((asset) => [asset.EquipmentCode, asset]));
  const codes = new Set<string>();
  for (const wr of workRequests) for (const code of wr.EquipmentCodes) codes.add(code);
  for (const entry of findings) codes.add(entry.finding.equipmentId);

  const actors: BadActor[] = [];
  for (const code of codes) {
    const asset = equipmentByCode.get(code) ?? null;
    const wrs = workRequests.filter((wr) => wr.EquipmentCodes.includes(code) && !isCancelled(wr));
    const reactiveFJs = wrs.filter((wr) => wr.WR_Type === "FJ");
    const unfavourablePmWRs = wrs.filter((wr) => wr.WR_Type === "PM" && (wr.ChecklistResults ?? []).some((result) => !result.passed));
    const unfavourablePmSteps = wrs.filter((wr) => wr.WR_Type === "PM")
      .reduce((sum, wr) => sum + (wr.ChecklistResults ?? []).filter((result) => !result.passed).length, 0);
    const assetFindings = findings.filter((entry) => entry.finding.equipmentId === code);
    const linkedLJs = wrs.filter((wr) => wr.WR_Type === "LJ");
    const openWRs = wrs.filter((wr) => isActiveAt(wr, nowMs));
    const repairPool = [...reactiveFJs, ...linkedLJs];
    const totalRepairHours = repairPool.reduce((sum, wr) => sum + (wr.TotalTimeMinutes ?? 0) / 60, 0);
    const downtimeHours = wrs.reduce((sum, wr) => sum + (wr.DowntimeMinutes ?? 0) / 60, 0);
    const failureTimes = reactiveFJs.map((wr) => createdMs(wr)).sort((a, b) => a - b);
    const observationDays = Math.max(1, (nowMs - Date.parse("2026-01-01T00:00:00.000Z")) / DAY_MS);
    const issueScore = reactiveFJs.length + unfavourablePmSteps + assetFindings.length + linkedLJs.length;
    if (!issueScore) continue;
    actors.push({
      equipmentCode: code,
      equipment: asset,
      equipmentName: asset?.EquipmentName ?? code,
      location: asset ? `${asset.bl_id} > ${asset.LevelName} > ${asset.RoomCode}` : "—",
      reactiveFJs,
      unfavourablePmSteps,
      unfavourablePmWRs,
      auditFindings: assetFindings,
      linkedLJs,
      openWRs,
      overdueWRs: wrs.filter((wr) => isOverdueAt(wr, nowMs)),
      totalRepairHours,
      estimatedDowntimeHours: downtimeHours,
      mtbfDays: failureTimes.length ? observationDays / failureTimes.length : null,
      mttrHours: reactiveFJs.length && totalRepairHours ? totalRepairHours / reactiveFJs.length : null,
      issueScore,
      cumulativePct: 0,
    });
  }
  actors.sort((a, b) => b.issueScore - a.issueScore || a.equipmentCode.localeCompare(b.equipmentCode));
  const totalIssues = actors.reduce((sum, actor) => sum + actor.issueScore, 0);
  let running = 0;
  for (const actor of actors) {
    running += actor.issueScore;
    actor.cumulativePct = totalIssues ? (running / totalIssues) * 100 : 0;
  }
  return actors;
}

