import { z } from "zod";
import type { Equipment } from "@cafm/shared-schema";
import { calculateDeadline, type AuditCampaign, type AuditFinding, type AuditInspection, type AuditSettings } from "./audit-assurance-types";

export const classifications = ["N0", "N1", "N2", "N3", "N4", "NV", "ST", "NA"] as const;
export const scoredClassifications = ["N0", "N1", "N2", "N3", "N4"] as const;
const scoredNumbers = z.object({ N0: z.number().finite(), N1: z.number().finite(), N2: z.number().finite(), N3: z.number().finite(), N4: z.number().finite() });
export const KmisConfigSchema = z.object({
  multipliers: scoredNumbers.refine((value) => Object.values(value).every((n) => n >= 0), "Multipliers must be non-negative."),
  points: scoredNumbers,
  calibrationFactor: z.number().finite().positive(),
  generateN1WithComment: z.boolean(),
  generateN2: z.boolean(), generateN3: z.boolean(), generateN4: z.boolean(),
});
export type KmisConfig = z.infer<typeof KmisConfigSchema>;
export const defaultKmisConfig: KmisConfig = { multipliers: { N0: 1, N1: 0.9375, N2: 1, N3: 1, N4: 1 }, points: { N0: 100, N1: 45, N2: 0, N3: -50, N4: -100 }, calibrationFactor: 0.9231460674, generateN1WithComment: true, generateN2: true, generateN3: true, generateN4: true };
export const CheckpointTemplateSchema = z.object({ id: z.string().min(1), equipmentCategory: z.string().min(1), checkpoints: z.array(z.object({ id: z.string().min(1), code: z.string().min(1), name: z.string().min(1), defaultWeight: z.number().finite().positive(), description: z.string().optional() })).min(1) });
export type CheckpointTemplate = z.infer<typeof CheckpointTemplateSchema>;
export const CheckpointResultSchema = z.object({ checkpointId: z.string().min(1), checkpointName: z.string().min(1), weight: z.number().finite().positive(), classification: z.enum(classifications), comment: z.string(), photoUrls: z.array(z.string()), spawnedFindingId: z.string().min(1).optional() });
export type CheckpointResult = z.infer<typeof CheckpointResultSchema>;
const summarySchema = z.object({ N0: z.number().nonnegative(), N1: z.number().nonnegative(), N2: z.number().nonnegative(), N3: z.number().nonnegative(), N4: z.number().nonnegative(), NV: z.number().int().nonnegative(), ST: z.number().int().nonnegative(), NA: z.number().int().nonnegative() });
export const EquipmentInspectionSheetSchema = z.object({
  id: z.string().min(1), campaignId: z.string().min(1), siteId: z.enum(["SITE-01", "SITE-02", "SITE-03"]), buildingId: z.string().min(1), roomId: z.string().min(1), systemName: z.string().min(1),
  equipmentId: z.string().min(1), equipmentName: z.string().min(1), equipmentCategory: z.string().min(1), inspectorName: z.string().min(1), inspectedAt: z.iso.datetime(), status: z.enum(["Scheduled", "InProgress", "Completed"]), operationalStatus: z.enum(["Operational", "Degraded", "Non-Operational", "ST_NotTested", "NV_Inaccessible"]),
  routeId: z.string().optional(), checkpointResults: z.array(CheckpointResultSchema).min(1), weightedSummary: summarySchema, calculatedConditionRatingPercent: z.number().min(0).max(100), scoringConfig: KmisConfigSchema,
}).superRefine((sheet, ctx) => {
  if (new Set(sheet.checkpointResults.map((item) => item.checkpointId)).size !== sheet.checkpointResults.length) ctx.addIssue({ code: "custom", message: "Duplicate checkpoints." });
  const calculated = calculateEquipmentInspectionSummary(sheet.checkpointResults, sheet.scoringConfig);
  if (JSON.stringify(calculated.weightedSummary) !== JSON.stringify(sheet.weightedSummary) || calculated.calculatedConditionRatingPercent !== sheet.calculatedConditionRatingPercent) ctx.addIssue({ code: "custom", message: "Inspection summary does not match checkpoint results and scoring configuration." });
});
export type EquipmentInspectionSheet = z.infer<typeof EquipmentInspectionSheetSchema>;
export const AuditAssuranceSchema = z.object({ checkpointTemplates: z.array(CheckpointTemplateSchema), equipmentInspections: z.array(EquipmentInspectionSheetSchema), kmisConfig: KmisConfigSchema.optional() }).superRefine((value, ctx) => {
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(value.checkpointTemplates.map((template) => template.id)) || !unique(value.checkpointTemplates.map((template) => template.equipmentCategory))) ctx.addIssue({ code: "custom", message: "Equipment inspection templates must have unique IDs and categories." });
  if (value.checkpointTemplates.some((template) => !unique(template.checkpoints.map((checkpoint) => checkpoint.id)))) ctx.addIssue({ code: "custom", message: "Checkpoint IDs must be unique within a template." });
  if (!unique(value.equipmentInspections.map((sheet) => sheet.id)) || !unique(value.equipmentInspections.map((sheet) => JSON.stringify([sheet.siteId, sheet.campaignId, sheet.equipmentId])))) ctx.addIssue({ code: "custom", message: "Inspection sheets must be unique per campaign and equipment." });
});
export type AuditAssurance = z.infer<typeof AuditAssuranceSchema>;

export function calculateEquipmentInspectionSummary(results: CheckpointResult[], config: KmisConfig) {
  const weightedSummary = { N0: 0, N1: 0, N2: 0, N3: 0, N4: 0, NV: 0, ST: 0, NA: 0 };
  for (const result of results) {
    if (result.classification === "NV" || result.classification === "ST" || result.classification === "NA") weightedSummary[result.classification]++;
    else weightedSummary[result.classification] += result.weight * config.multipliers[result.classification];
  }
  const denominator = scoredClassifications.reduce((sum, key) => sum + weightedSummary[key], 0);
  const points = scoredClassifications.reduce((sum, key) => sum + weightedSummary[key] * config.points[key], 0);
  const calculatedConditionRatingPercent = denominator ? Math.max(0, Math.min(100, Math.round(points / denominator * config.calibrationFactor))) : 0;
  return { weightedSummary, calculatedConditionRatingPercent };
}
const names = ["Air intake", "Airduct network", "Antifreeze", "Casing", "Condensate evacuation", "Condensate tray", "Cooling coil", "Control panel", "dampers / actuators", "Exhaust fan", "Fan", "Filters", "Heat recovery", "Heating coil", "Humidifier supply", "Motor", "Motorized dampers", "Pump", "Regulating valves", "Steam humidifier", "Transmission", "Wiring"];
export const ahuTemplate: CheckpointTemplate = { id: "sophia-ahu", equipmentCategory: "Air Handling Unit (AHU)", checkpoints: names.map((name, i) => ({ id: `ahu-${i + 1}`, code: `CP-${String(i + 1).padStart(2, "0")}`, name, defaultWeight: 1 })) };

export function createInspectionFindings(sheet: EquipmentInspectionSheet, campaign: AuditCampaign, asset: Equipment, settings?: AuditSettings): { sheet: EquipmentInspectionSheet; findings: AuditFinding[] } {
  if (sheet.siteId !== campaign.siteId || sheet.siteId !== asset.SiteId || sheet.campaignId !== campaign.id || sheet.equipmentId !== asset.EquipmentCode || sheet.buildingId !== asset.bl_id || sheet.roomId !== asset.RoomCode || !campaign.selectedEquipmentIds.includes(asset.EquipmentCode)) throw new Error("Inspection asset, location or campaign scope has changed.");
  if (sheet.status !== "Completed") throw new Error("The inspection is not completed.");
  const findings: AuditFinding[] = [];
  const results = sheet.checkpointResults.map((row) => {
    if (!["N1", "N2", "N3", "N4"].includes(row.classification) || (row.classification === "N1" && (!sheet.scoringConfig.generateN1WithComment || !row.comment.trim()))) return row;
    if ((row.classification === "N2" && !sheet.scoringConfig.generateN2) || (row.classification === "N3" && !sheet.scoringConfig.generateN3) || (row.classification === "N4" && !sheet.scoringConfig.generateN4)) return row;
    if (row.spawnedFindingId) throw new Error("This checkpoint already has a linked finding.");
    const urgency = row.classification as "N1" | "N2" | "N3" | "N4", id = `FND-${sheet.id}-${row.checkpointId}`, discoveredAt = sheet.inspectedAt.slice(0, 10);
    findings.push({ id, campaignId: campaign.id, campaignName: campaign.name, siteId: sheet.siteId, buildingId: sheet.buildingId, roomId: sheet.roomId, systemName: sheet.systemName, equipmentId: asset.EquipmentCode, equipmentName: asset.EquipmentName, componentName: row.checkpointName, checkpointName: row.checkpointName, findingType: "Condition", urgency, conditionScore: urgency === "N4" ? "D - Critical" : urgency === "N3" || urgency === "N2" ? "C - Poor" : "B - Fair", operationalStatus: sheet.operationalStatus === "ST_NotTested" ? "Not tested" : sheet.operationalStatus === "NV_Inaccessible" ? "Inaccessible" : sheet.operationalStatus, discoveredAt, calculatedDeadline: calculateDeadline(discoveredAt, urgency, settings), title: `${row.checkpointName} inspection finding`, observation: row.comment.trim() || `Checkpoint classified ${urgency}; no comment provided.`, recommendedRemedy: "Technical validation and corrective action planning required.", responsibleParty: "Contractor", contractorName: "Unspecified — review required", trade: asset.PrimaryTradeId ?? "MultiTechnic", inspectorName: sheet.inspectorName, inspectorPhotos: row.photoUrls, validationStatus: "PendingValidation", aiIntelligenceFlags: [], assuranceState: "AwaitingValidation", evidence: { beforePhotos: row.photoUrls, afterPhotos: [], certificates: [], updatedDrawings: [], replacedParts: [], laborCostEUR: 0, materialCostEUR: 0 }, verification: {}, auditTrail: [{ id: `${id}-created`, timestamp: sheet.inspectedAt, actor: sheet.inspectorName, action: `Created from equipment inspection ${sheet.id}, checkpoint ${row.checkpointId}` }] });
    return { ...row, spawnedFindingId: id };
  });
  return { sheet: { ...sheet, checkpointResults: results }, findings };
}

export function completeEquipmentInspection<T extends { equipment: Equipment[]; auditCampaigns?: AuditCampaign[]; auditFindings?: AuditFinding[]; auditInspections?: AuditInspection[]; auditSettings?: AuditSettings; auditAssurance?: AuditAssurance }>(state: T, input: EquipmentInspectionSheet): T {
  const sheet = EquipmentInspectionSheetSchema.parse(input);
  const campaign = state.auditCampaigns?.find((c) => c.id === sheet.campaignId);
  const asset = state.equipment.find((e) => e.EquipmentCode === sheet.equipmentId && e.SiteId === sheet.siteId);
  if (!campaign || !asset) throw new Error("Inspection campaign or equipment no longer exists.");
  const template = (state.auditAssurance?.checkpointTemplates ?? [ahuTemplate]).find((t) => t.equipmentCategory === sheet.equipmentCategory);
  if (!template || template.checkpoints.length !== sheet.checkpointResults.length || template.checkpoints.some((checkpoint) => !sheet.checkpointResults.some((row) => row.checkpointId === checkpoint.id && row.checkpointName === checkpoint.name && row.weight === checkpoint.defaultWeight))) throw new Error("The inspection template changed or does not match the recorded checkpoints.");
  if (state.auditAssurance?.equipmentInspections.some((s) => s.id === sheet.id || (s.campaignId === sheet.campaignId && s.equipmentId === sheet.equipmentId))) throw new Error("An inspection sheet for this asset and campaign already exists. The completed record is immutable.");
  const route = state.auditInspections?.find((r) => r.id === sheet.routeId);
  if (sheet.routeId && (!route || route.campaignId !== campaign.id || route.equipmentId !== asset.EquipmentCode || route.siteId !== sheet.siteId)) throw new Error("The inspection route no longer matches the asset and campaign.");
  const result = createInspectionFindings(sheet, campaign, asset, state.auditSettings);
  if (result.findings.some((finding) => state.auditFindings?.some((existing) => existing.id === finding.id))) throw new Error("An inspection finding ID already exists.");
  const accessible = sheet.operationalStatus !== "NV_Inaccessible";
  const routes = (state.auditInspections ?? []).map((r) => r.id === sheet.routeId ? { ...r, status: accessible ? "Completed" as const : "Planned" as const, accessibility: accessible ? "Accessible" as const : "Inaccessible" as const, completedAt: accessible ? sheet.inspectedAt : undefined } : r);
  const count = routes.filter((r) => r.campaignId === campaign.id && r.status === "Completed").length;
  const campaigns = (state.auditCampaigns ?? []).map((c) => c.id === campaign.id ? { ...c, completedInspectionsCount: count, inaccessibleEquipmentIds: accessible ? c.inaccessibleEquipmentIds.filter((id) => id !== asset.EquipmentCode) : [...new Set([...c.inaccessibleEquipmentIds, asset.EquipmentCode])] } : c);
  const hasScore = scoredClassifications.some((key) => sheet.weightedSummary[key] > 0);
  return { ...state, equipment: state.equipment.map((e) => e === asset && hasScore ? { ...e, TechnicalSpecifications: { ...e.TechnicalSpecifications, AuditConditionRatingPercent: sheet.calculatedConditionRatingPercent } } : e), auditCampaigns: campaigns, auditInspections: routes, auditFindings: [...(state.auditFindings ?? []), ...result.findings], auditAssurance: { checkpointTemplates: state.auditAssurance?.checkpointTemplates ?? [ahuTemplate], kmisConfig: state.auditAssurance?.kmisConfig, equipmentInspections: [...(state.auditAssurance?.equipmentInspections ?? []), result.sheet] } };
}
