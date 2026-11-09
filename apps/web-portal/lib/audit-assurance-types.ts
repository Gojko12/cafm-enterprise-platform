import { z } from "zod";

export const urgencyLevels = ["N4", "N3", "N2", "N1", "N0"] as const;
export const findingTypes = ["Condition", "Operation", "Documentation", "Safety", "Data Quality"] as const;
export const validationStatuses = ["PendingValidation", "Accepted", "AcceptedWithModification", "AlreadyResolved", "Duplicate", "Outdated", "WrongAsset", "TechnicallyIncorrect", "OwnerResponsibility", "ContractorResponsibility", "ClarificationRequired"] as const;
export const assuranceStates = ["FindingLogged", "AwaitingValidation", "Validated_ActionPending", "CorrectiveWorkInProgress", "WorkCompleted_AwaitingEvidence", "EvidenceAccepted_AwaitingVerification", "FindingVerified_Closed", "Rejected_Archived"] as const;
export const workflowStages = ["Planning", "Scope confirmed", "Inspection in progress", "Findings received", "Technical validation", "Corrective actions", "Evidence", "Verification", "Closed"] as const;
export const intelligenceFlags = ["PotentialDuplicate", "ExistingOpenWR", "RecentlyCompletedWR", "AssetReplacedOrDecommissioned", "OutdatedPhoto", "InconsistentEquipmentCode", "RecurringDefect"] as const;
const nonempty = z.string().trim().min(1);
const site = z.enum(["SITE-01", "SITE-02", "SITE-03"]);
export const AuditCampaignSchema = z.object({
  id: nonempty, name: nonempty, provider: nonempty, siteId: site, buildingIds: z.array(nonempty), systems: z.array(nonempty),
  startDate: z.iso.date(), endDate: z.iso.date(), inspectors: z.array(nonempty), methodology: nonempty,
  selectedEquipmentIds: z.array(nonempty), plannedInspectionsCount: z.number().int().nonnegative(), completedInspectionsCount: z.number().int().nonnegative(),
  inaccessibleEquipmentIds: z.array(nonempty), overallConditionRating: z.number().min(0).max(100), overallOperationalRating: z.number().min(0).max(100),
  previousCampaignId: nonempty.optional(), workflowStage: z.enum(workflowStages),
  importedDocuments: z.array(z.object({ id: nonempty, fileName: nonempty, uploadedAt: nonempty, appendixBuildingId: nonempty.optional(), extractedFindingsCount: z.number().int().nonnegative(), status: z.enum(["StagedForValidation", "ValidatedIntoRegister"]) })),
}).refine((value) => value.endDate >= value.startDate && value.completedInspectionsCount <= value.plannedInspectionsCount, "Invalid campaign dates or progress.");
export const AuditFindingSchema = z.object({
  id: nonempty, campaignId: nonempty, campaignName: nonempty, siteId: site, buildingId: nonempty, roomId: nonempty,
  systemName: nonempty, equipmentId: nonempty, equipmentName: nonempty, componentName: nonempty, checkpointName: nonempty,
  findingType: z.enum(findingTypes), urgency: z.enum(urgencyLevels), conditionScore: z.enum(["A - Good", "B - Fair", "C - Poor", "D - Critical"]),
  operationalStatus: z.enum(["Operational", "Degraded", "Non-Operational", "Inaccessible", "Not tested"]),
  discoveredAt: z.iso.date(), calculatedDeadline: z.union([z.iso.date(), z.literal("No action")]), isOverdue: z.boolean().optional(),
  title: nonempty, observation: nonempty, recommendedRemedy: nonempty, measurements: z.string().optional(),
  responsibleParty: z.enum(["Contractor", "Owner / ESA", "Third-Party Specialist"]), contractorName: nonempty, trade: nonempty,
  inspectorName: nonempty, inspectorPhotos: z.array(z.string()), inspectorSignature: z.string().optional(),
  validationStatus: z.enum(validationStatuses), validationJustification: z.string().optional(), validatedBy: z.string().optional(),
  validatedAt: z.string().optional(), supportingValidationEvidence: z.array(z.string()).optional(),
  aiIntelligenceFlags: z.array(z.enum(intelligenceFlags)), aiRecommendedClassification: z.string().optional(), aiConfidenceScore: z.number().min(0).max(1).optional(), aiReasoning: z.string().optional(),
  duplicateOfFindingId: z.string().optional(), previousYearFindingId: z.string().optional(), isRecurring: z.boolean().optional(), isDisputed: z.boolean().optional(),
  correctiveActionType: z.enum(["None", "IndividualWR", "CollectiveWorkPackage", "NextPMVisit", "InvestmentProject"]).optional(),
  linkedWrId: z.string().optional(), workPackageId: z.string().optional(), linkedPmScheduleId: z.string().optional(), investmentProjectId: z.string().optional(),
  investmentProposal: z.object({ id: nonempty, estimatedCapexEUR: z.number().nonnegative(), lifecycleJustification: nonempty, createdBy: nonempty, createdAt: nonempty }).optional(),
  assuranceState: z.enum(assuranceStates),
  evidence: z.object({ beforePhotos: z.array(z.string()), afterPhotos: z.array(z.string()), measurements: z.string().optional(), certificates: z.array(z.string()), updatedDrawings: z.array(z.string()), replacedParts: z.array(z.string()), laborCostEUR: z.number().nonnegative(), materialCostEUR: z.number().nonnegative(), submittedBy: z.string().optional(), submittedAt: z.string().optional(), evidenceAccepted: z.boolean().optional(), evidenceReviewerNotes: z.string().optional() }),
  verification: z.object({ method: z.enum(["InternalReviewer", "AuditCompany_SOCOTEC", "NextInspection", "ControlledLowRiskRule"]).optional(), verifiedBy: z.string().optional(), verifiedAt: z.string().optional(), verificationOutcome: z.enum(["VerifiedClosed", "RejectedReworkRequired"]).optional(), notes: z.string().optional() }),
  auditTrail: z.array(z.object({ id: nonempty, timestamp: nonempty, actor: nonempty, action: nonempty, justification: z.string().optional() })),
});
export const AuditInspectionSchema = z.object({
  id: nonempty, siteId: site, campaignId: nonempty, equipmentId: nonempty, buildingId: nonempty, systemName: nonempty,
  checkpointName: nonempty, inspector: nonempty, plannedDate: z.iso.date(), routeOrder: z.number().int().positive(),
  accessibility: z.enum(["Accessible", "Inaccessible"]), status: z.enum(["Planned", "Completed"]), completedAt: z.string().optional(),
});
export const AuditSettingsSchema = z.object({
  deadlineDays: z.object({ N4: z.number().int().positive(), N3: z.number().int().positive(), N2: z.number().int().positive(), N1: z.number().int().positive() }),
  slaDays: z.object({ N4: z.number().int().positive(), N3: z.number().int().positive(), N2: z.number().int().positive(), N1: z.number().int().positive() }),
  bonusPerCompliantEUR: z.number().nonnegative(), malusPerNoncompliantEUR: z.number().nonnegative(),
  lowRiskEnabled: z.boolean(),
});
export const defaultAuditSettings = { deadlineDays: { N4: 1, N3: 90, N2: 365, N1: 730 }, slaDays: { N4: 1, N3: 90, N2: 365, N1: 730 }, bonusPerCompliantEUR: 0, malusPerNoncompliantEUR: 0, lowRiskEnabled: true };
export const AuditTemplateSchema = z.object({ id: nonempty, siteId: site, category: nonempty, checkpoints: z.array(z.object({ code: nonempty, name: nonempty, conditionCriteria: nonempty, operationCriteria: nonempty, unit: nonempty })) });
export const AuditImportRowSchema = z.object({ id: nonempty, approved: z.boolean(), findingId: nonempty, equipmentId: z.string(), buildingId: z.string(), component: z.string(), urgency: z.union([z.enum(urgencyLevels), z.literal("")]), findingType: z.enum(findingTypes).optional(), conditionScore: z.enum(["A - Good", "B - Fair", "C - Poor", "D - Critical", ""]).optional(), operationalStatus: z.enum(["Operational", "Degraded", "Non-Operational", "Inaccessible", ""]).optional(), discoveredAt: z.string(), observation: z.string(), remedy: z.string(), image: z.string() });
export const AuditImportSchema = z.object({ id: nonempty, siteId: site, campaignId: nonempty, fileName: nonempty, createdAt: nonempty, rows: z.array(AuditImportRowSchema) });
export type AuditSettings = z.infer<typeof AuditSettingsSchema>;
export type AuditTemplate = z.infer<typeof AuditTemplateSchema>;
export type AuditImport = z.infer<typeof AuditImportSchema>;
export type AuditCampaign = z.infer<typeof AuditCampaignSchema>;
export type AuditFinding = z.infer<typeof AuditFindingSchema>;
export type AuditInspection = z.infer<typeof AuditInspectionSchema>;
export type AuditUrgency = typeof urgencyLevels[number];
export const urgencyLabels: Record<AuditUrgency, string> = { N4: "Immediate (+24h)", N3: "Within 3 months", N2: "Within 1 year", N1: "Monitor / plan", N0: "No action" };
export function calculateDeadline(date: string, urgency: AuditUrgency, settings: AuditSettings = defaultAuditSettings): string {
  if (!z.iso.date().safeParse(date).success) throw new Error("Enter a valid discovery date.");
  if (urgency === "N0") return "No action";
  const days = settings.deadlineDays[urgency];
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function isFindingOverdue(finding: AuditFinding, today: string): boolean {
  return finding.calculatedDeadline !== "No action" &&
    (finding.urgency === "N4" ? finding.calculatedDeadline <= today : finding.calculatedDeadline < today) &&
    !["FindingVerified_Closed", "Rejected_Archived"].includes(finding.assuranceState);
}
