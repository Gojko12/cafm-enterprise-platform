import type { AuditFinding, AuditSettings } from "./audit-assurance-types";
export const validatedContractor = (f: AuditFinding) => ["Accepted", "AcceptedWithModification", "ContractorResponsibility"].includes(f.validationStatus) && f.responsibleParty === "Contractor" && f.contractorName !== "Unspecified — review required" && !f.duplicateOfFindingId && f.assuranceState !== "Rejected_Archived";
export function closureDays(f: AuditFinding): number | null {
  if (f.assuranceState !== "FindingVerified_Closed" || !f.verification.verifiedAt) return null;
  const duration = Date.parse(`${f.verification.verifiedAt.slice(0, 10)}T00:00:00Z`) - Date.parse(`${f.discoveredAt}T00:00:00Z`);
  return Number.isFinite(duration) && duration >= 0 ? duration / 86400000 : null;
}
export function metrics(findings: AuditFinding[], settings: AuditSettings, asOf: string) {
  const net = findings.filter(validatedContractor);
  const pastTarget = (f: AuditFinding) => {
    if (f.urgency === "N0") return false;
    const elapsed = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${f.discoveredAt}T00:00:00Z`)) / 86400000;
    return f.urgency === "N4" ? elapsed >= settings.slaDays[f.urgency] : elapsed > settings.slaDays[f.urgency];
  };
  const evaluated = net.filter((f) => f.urgency !== "N0" && (closureDays(f) !== null || pastTarget(f)));
  const onTime = evaluated.filter((f) => {
    const days = closureDays(f);
    return days !== null && f.urgency !== "N0" && (f.urgency === "N4" ? days < settings.slaDays[f.urgency] : days <= settings.slaDays[f.urgency]);
  });
  const overdue = net.filter((f) => f.urgency !== "N0" && closureDays(f) === null && pastTarget(f));
  const reviewed = net.filter((f) => f.auditTrail.some((entry) => entry.action.startsWith("Evidence accepted") || entry.action.startsWith("Evidence rejected")));
  const firstAccepted = reviewed.filter((f) => f.auditTrail.find((entry) => entry.action.startsWith("Evidence accepted") || entry.action.startsWith("Evidence rejected"))?.action.startsWith("Evidence accepted"));
  return { net, evaluated, onTime, overdue, reviewed, firstAccepted, score: evaluated.length ? 100 * onTime.length / evaluated.length : null, financial: onTime.length * settings.bonusPerCompliantEUR - (evaluated.length - onTime.length) * settings.malusPerNoncompliantEUR };
}
