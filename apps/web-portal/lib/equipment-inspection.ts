import { z } from "zod";
import { SiteIdSchema } from "@cafm/shared-schema";
import type { Equipment } from "@cafm/shared-schema";
import { calculateDeadline, type AuditCampaign, type AuditFinding, type AuditInspection, type AuditSettings } from "./audit-assurance-types";

export const classifications = ["N0", "N1", "N2", "N3", "N4", "NV", "ST", "NA"] as const;
export const scoredClassifications = ["N0", "N1", "N2", "N3", "N4"] as const;
const scoredNumbers = z.object({ N0: z.number().finite(), N1: z.number().finite(), N2: z.number().finite(), N3: z.number().finite(), N4: z.number().finite() });
export const KmisConfigSchema = z.object({
  multipliers: scoredNumbers.refine((value) => Object.values(value).every((n) => n >= 0), "Multipliers must be non-negative."),
  points: scoredNumbers,
  calibrationFactor: z.number().finite().positive(),
  generateN1WithComment: z.boolean().default(true),
  generateN2: z.boolean().default(true), generateN3: z.boolean().default(true), generateN4: z.boolean().default(true),
});
export type KmisConfig = z.infer<typeof KmisConfigSchema>;
export const defaultKmisConfig: KmisConfig = { multipliers: { N0: 1, N1: 0.9375, N2: 1, N3: 1, N4: 1 }, points: { N0: 100, N1: 45, N2: 0, N3: -50, N4: -100 }, calibrationFactor: 0.9231460674, generateN1WithComment: true, generateN2: true, generateN3: true, generateN4: true };
export const CheckpointTemplateSchema = z.object({ id: z.string().min(1), equipmentCategory: z.string().min(1), checkpoints: z.array(z.object({ id: z.string().min(1), code: z.string().min(1), name: z.string().min(1), defaultWeight: z.number().finite().positive(), description: z.string().optional() })).min(1) });
export type CheckpointTemplate = z.infer<typeof CheckpointTemplateSchema>;
export const CheckpointResultSchema = z.object({ checkpointId: z.string().min(1), checkpointName: z.string().min(1), weight: z.number().finite().positive(), classification: z.enum(classifications), comment: z.string(), photoUrls: z.array(z.string()), spawnedFindingId: z.string().min(1).optional() });
export type CheckpointResult = z.infer<typeof CheckpointResultSchema>;
const summarySchema = z.object({ N0: z.number().nonnegative(), N1: z.number().nonnegative(), N2: z.number().nonnegative(), N3: z.number().nonnegative(), N4: z.number().nonnegative(), NV: z.number().int().nonnegative(), ST: z.number().int().nonnegative(), NA: z.number().int().nonnegative() });
export const EquipmentInspectionSheetSchema = z.object({
  id: z.string().min(1), campaignId: z.string().min(1), siteId: SiteIdSchema, buildingId: z.string().min(1), roomId: z.string().min(1), systemName: z.string().min(1),
  equipmentId: z.string().min(1), equipmentName: z.string().min(1), equipmentCategory: z.string().min(1), inspectorName: z.string().min(1), inspectedAt: z.iso.datetime(), status: z.enum(["Scheduled", "InProgress", "Completed"]), operationalStatus: z.enum(["Operational", "Degraded", "Non-Operational", "ST_NotTested", "NV_Inaccessible"]),
  routeId: z.string().optional(), checkpointResults: z.array(CheckpointResultSchema).min(1), weightedSummary: summarySchema, calculatedConditionRatingPercent: z.number().min(0).max(100), scoringConfig: KmisConfigSchema,
  previousInspections: z.array(z.object({ inspectorName: z.string(), inspectedAt: z.string(), operationalStatus: z.string(), checkpointResults: z.array(CheckpointResultSchema), weightedSummary: summarySchema, calculatedConditionRatingPercent: z.number(), scoringConfig: KmisConfigSchema })).optional(),
}).superRefine((sheet, ctx) => {
  if (new Set(sheet.checkpointResults.map((item) => item.checkpointId)).size !== sheet.checkpointResults.length) ctx.addIssue({ code: "custom", message: "Duplicate checkpoints." });
  const calculated = calculateEquipmentInspectionSummary(sheet.checkpointResults, sheet.scoringConfig);
  if (JSON.stringify(calculated.weightedSummary) !== JSON.stringify(sheet.weightedSummary) || calculated.calculatedConditionRatingPercent !== sheet.calculatedConditionRatingPercent) ctx.addIssue({ code: "custom", message: "Inspection summary does not match checkpoint results and scoring configuration." });
});
export type EquipmentInspectionSheet = z.infer<typeof EquipmentInspectionSheetSchema>;
export const AuditAssuranceSchema = z.object({ checkpointTemplates: z.array(CheckpointTemplateSchema).default([]), equipmentInspections: z.array(EquipmentInspectionSheetSchema).default([]), kmisConfig: KmisConfigSchema.optional() }).superRefine((value, ctx) => {
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
const template = (id: string, equipmentCategory: string, components: string[]): CheckpointTemplate => ({ id: `sophia-${id}`, equipmentCategory, checkpoints: components.map((name, index) => ({ id: `${id}-${index + 1}`, code: `CP-${String(index + 1).padStart(2, "0")}`, name, defaultWeight: 1 })) });
export const standardCheckpointTemplates: CheckpointTemplate[] = [
  ahuTemplate,
  template("chiller", "Chiller Installation", ["Compressor", "Condenser coils", "Evaporator", "Expansion valve", "Refrigerant circuit", "Chilled water pump", "Control panel", "Insulation", "Vibration mounts", "Safety switches"]),
  template("boiler", "Heating Boiler Installation", ["Burner assembly", "Heat exchanger", "Flue gas exhaust", "Circulation pump", "Expansion vessel", "Safety relief valve", "Gas/fuel train", "Control & ignition panel", "Thermal insulation", "Water treatment"]),
  template("ups", "UPS System Installation", ["Rectifier/charger", "Inverter module", "Battery bank strings", "Static bypass switch", "Cooling fans", "AC/DC capacitors", "Control display & alarms", "Cabling & terminations"]),
  template("generator", "Diesel Generator Installation", ["Engine block & cooling", "Fuel day tank & lines", "Alternator", "Starter batteries & charger", "Exhaust silencer", "Automatic Transfer Switch (ATS)", "Control panel", "Vibration isolators"]),
  template("lift", "Lift Controller Installation", ["Main drive / traction machine", "Controller cabinet", "Braking system", "Door operator mechanism", "Landing doors & locks", "Suspension ropes/belts", "Pit safety gear", "Emergency intercom"]),
  template("damper", "Fire Damper Installation", ["Damper blades", "Fusible link / thermal release", "Spring return actuator", "Casing & frame sealing", "Access door", "Limit switches", "Control wiring", "Identification label"]),
  template("general", "General Technical Equipment", ["Identification and labels", "Casing and enclosure", "Mountings and supports", "Power and cabling", "Controls and alarms", "Safety devices", "Connections and seals", "Operational condition", "Cleanliness and corrosion", "Maintenance access"]),
];
export function withStandardCheckpointTemplates(templates: CheckpointTemplate[] = []): CheckpointTemplate[] {
  return [...templates, ...standardCheckpointTemplates.filter((item) => !templates.some((existing) => existing.id === item.id || existing.equipmentCategory === item.equipmentCategory))];
}
export function defaultInspectionTemplate(asset: Equipment, templates: CheckpointTemplate[]): CheckpointTemplate {
  const text = `${asset.EquipmentName} ${asset.EquipmentNameLocal ?? ""} ${asset.EquipmentStandardDescription ?? ""}`.toLowerCase();
  const category = /fire.{0,15}damper|brandschutzklappe/.test(text) ? "Fire Damper Installation" : /chiller|kältemaschine|kaeltemaschine/.test(text) ? "Chiller Installation" : /boiler|kessel/.test(text) ? "Heating Boiler Installation" : /\bups\b|\busv\b/.test(text) ? "UPS System Installation" : /generator|diesel/.test(text) ? "Diesel Generator Installation" : /lift|elevator|aufzug/.test(text) ? "Lift Controller Installation" : /\bahu\b|air handling|zuluft|lüftungsgerät/.test(text) ? "Air Handling Unit (AHU)" : "General Technical Equipment";
  return templates.find((item) => item.equipmentCategory === category) ?? standardCheckpointTemplates.find((item) => item.equipmentCategory === category)!;
}
export function inspectionTemplateForSheet(sheet: EquipmentInspectionSheet): CheckpointTemplate {
  return { id: `recorded-${sheet.id}`, equipmentCategory: sheet.equipmentCategory, checkpoints: sheet.checkpointResults.map((row, index) => ({ id: row.checkpointId, code: `CP-${String(index + 1).padStart(2, "0")}`, name: row.checkpointName, defaultWeight: row.weight })) };
}

export function createInspectionFindings(sheet: EquipmentInspectionSheet, campaign: AuditCampaign, asset: Equipment, settings?: AuditSettings, existingFindings: AuditFinding[] = [], previous?: EquipmentInspectionSheet): { sheet: EquipmentInspectionSheet; findings: AuditFinding[] } {
  if (sheet.siteId !== campaign.siteId || sheet.siteId !== asset.SiteId || sheet.campaignId !== campaign.id || sheet.equipmentId !== asset.EquipmentCode || sheet.buildingId !== asset.bl_id || sheet.roomId !== asset.RoomCode || !campaign.selectedEquipmentIds.includes(asset.EquipmentCode)) throw new Error("Inspection asset, location or campaign scope has changed.");
  if (sheet.status !== "Completed") throw new Error("The inspection is not completed.");
  const findings = [...existingFindings];
  const results = sheet.checkpointResults.map((row) => {
    const previousRow = previous?.checkpointResults.find((item) => item.checkpointId === row.checkpointId);
    if (row.spawnedFindingId && row.spawnedFindingId !== previousRow?.spawnedFindingId) throw new Error("The checkpoint finding link changed; reload the inspection.");
    const candidates = previousRow?.spawnedFindingId ? findings.filter((f) => f.id === previousRow.spawnedFindingId) : findings.filter((f) => f.siteId === sheet.siteId && f.campaignId === sheet.campaignId && f.equipmentId === sheet.equipmentId && f.componentName.trim().toLowerCase() === row.checkpointName.trim().toLowerCase());
    if (candidates.length > 1 || (previousRow?.spawnedFindingId && candidates.length !== 1)) throw new Error(`Finding link for ${row.checkpointName} is missing or ambiguous; review the register.`);
    const found = candidates[0];
    if (found && (found.siteId !== sheet.siteId || found.campaignId !== sheet.campaignId || found.equipmentId !== sheet.equipmentId)) throw new Error("Linked finding does not match the inspection.");
    const changed = !previousRow || previousRow.classification !== row.classification || previousRow.comment !== row.comment || JSON.stringify(previousRow.photoUrls) !== JSON.stringify(row.photoUrls) || previous?.operationalStatus !== sheet.operationalStatus;
    const entry = (action: string) => ({ id: `${sheet.id}-${row.checkpointId}-${sheet.inspectedAt}`, timestamp: sheet.inspectedAt, actor: sheet.inspectorName, action, justification: found ? JSON.stringify({ urgency: found.urgency, observation: found.observation, deadline: found.calculatedDeadline, validationStatus: found.validationStatus, validationJustification: found.validationJustification, validatedBy: found.validatedBy, validatedAt: found.validatedAt, assuranceState: found.assuranceState, verification: found.verification, evidenceAccepted: found.evidence.evidenceAccepted }) : undefined });
    if (found && changed && row.classification === "N0" && !row.comment.trim()) {
      findings[findings.indexOf(found)] = { ...found, assuranceState: "Rejected_Archived", auditTrail: [...found.auditTrail, entry("Archived after checkpoint reinspection classified N0; independent closure was not asserted.")] };
      return { ...row, spawnedFindingId: found.id };
    }
    const eligible = row.classification === "N1" ? sheet.scoringConfig.generateN1WithComment && !!row.comment.trim() : row.classification === "N2" ? sheet.scoringConfig.generateN2 : row.classification === "N3" ? sheet.scoringConfig.generateN3 : row.classification === "N4" ? sheet.scoringConfig.generateN4 : false;
    if (!eligible && !(found && ["N1", "N2", "N3", "N4"].includes(row.classification))) return found ? { ...row, spawnedFindingId: found.id } : row;
    const urgency = row.classification as "N1" | "N2" | "N3" | "N4", id = found?.id ?? `FND-${sheet.id}-${row.checkpointId}`, discoveredAt = sheet.inspectedAt.slice(0, 10);
    if (found) {
      if (changed) findings[findings.indexOf(found)] = { ...found, urgency, conditionScore: urgency === "N4" ? "D - Critical" : urgency === "N3" || urgency === "N2" ? "C - Poor" : "B - Fair", operationalStatus: sheet.operationalStatus === "ST_NotTested" ? "Not tested" : sheet.operationalStatus === "NV_Inaccessible" ? "Inaccessible" : sheet.operationalStatus, observation: row.comment.trim() || `Checkpoint classified ${urgency}; no comment provided.`, inspectorName: sheet.inspectorName, inspectorPhotos: row.photoUrls, calculatedDeadline: calculateDeadline(found.discoveredAt, urgency, settings), validationStatus: "PendingValidation", validationJustification: undefined, validatedBy: undefined, validatedAt: undefined, assuranceState: "AwaitingValidation", evidence: { ...found.evidence, evidenceAccepted: false }, verification: {}, auditTrail: [...found.auditTrail, entry("Checkpoint reinspection changed the finding; technical validation is required again.")] };
      return { ...row, spawnedFindingId: found.id };
    }
    if (findings.some((f) => f.id === id)) throw new Error(`Finding ID ${id} already exists.`);
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
  const templates = withStandardCheckpointTemplates(state.auditAssurance?.checkpointTemplates);
  const previous = (state.auditAssurance?.equipmentInspections ?? []).find((s) => s.campaignId === sheet.campaignId && s.equipmentId === sheet.equipmentId);
  if (previous && (previous.id !== sheet.id || previous.equipmentCategory !== sheet.equipmentCategory || (previous.routeId && previous.routeId !== sheet.routeId))) throw new Error("Inspection identity has changed; reload the sheet.");
  if (!previous && (state.auditAssurance?.equipmentInspections ?? []).some((s) => s.id === sheet.id)) throw new Error("Inspection ID already exists.");
  const template = templates.find((t) => t.equipmentCategory === sheet.equipmentCategory);
  const expectedCheckpoints = previous ? previous.checkpointResults.map((row) => ({ id: row.checkpointId, name: row.checkpointName, weight: row.weight })) : template?.checkpoints.map((row) => ({ id: row.id, name: row.name, weight: row.defaultWeight }));
  if (!expectedCheckpoints || expectedCheckpoints.length !== sheet.checkpointResults.length || expectedCheckpoints.some((checkpoint) => !sheet.checkpointResults.some((row) => row.checkpointId === checkpoint.id && row.checkpointName === checkpoint.name && row.weight === checkpoint.weight))) throw new Error("The inspection checkpoints changed or do not match the template.");
  const route = state.auditInspections?.find((r) => r.id === sheet.routeId);
  if (sheet.routeId && (!route || route.campaignId !== campaign.id || route.equipmentId !== asset.EquipmentCode || route.siteId !== sheet.siteId)) throw new Error("The inspection route no longer matches the asset and campaign.");
  const result = createInspectionFindings(sheet, campaign, asset, state.auditSettings, state.auditFindings ?? [], previous);
  if (previous) result.sheet.previousInspections = [...(previous.previousInspections ?? []), { inspectorName: previous.inspectorName, inspectedAt: previous.inspectedAt, operationalStatus: previous.operationalStatus, checkpointResults: previous.checkpointResults, weightedSummary: previous.weightedSummary, calculatedConditionRatingPercent: previous.calculatedConditionRatingPercent, scoringConfig: previous.scoringConfig }];
  const accessible = sheet.operationalStatus !== "NV_Inaccessible";
  const routes = (state.auditInspections ?? []).map((r) => r.id === sheet.routeId ? { ...r, status: accessible ? "Completed" as const : "Planned" as const, accessibility: accessible ? "Accessible" as const : "Inaccessible" as const, completedAt: accessible ? sheet.inspectedAt : undefined } : r);
  const count = routes.filter((r) => r.campaignId === campaign.id && r.status === "Completed").length;
  const campaigns = (state.auditCampaigns ?? []).map((c) => c.id === campaign.id ? { ...c, completedInspectionsCount: count, inaccessibleEquipmentIds: accessible ? c.inaccessibleEquipmentIds.filter((id) => id !== asset.EquipmentCode) : [...new Set([...c.inaccessibleEquipmentIds, asset.EquipmentCode])] } : c);
  const hasScore = scoredClassifications.some((key) => sheet.weightedSummary[key] > 0);
  return { ...state, equipment: state.equipment.map((e) => e === asset && hasScore ? { ...e, TechnicalSpecifications: { ...e.TechnicalSpecifications, AuditConditionRatingPercent: sheet.calculatedConditionRatingPercent } } : e), auditCampaigns: campaigns, auditInspections: routes, auditFindings: result.findings, auditAssurance: { checkpointTemplates: templates, kmisConfig: state.auditAssurance?.kmisConfig ?? defaultKmisConfig, equipmentInspections: [...(state.auditAssurance?.equipmentInspections ?? []).filter((s) => s.id !== sheet.id), result.sheet] } };
}
