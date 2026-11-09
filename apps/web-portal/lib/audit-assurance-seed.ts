import type { Equipment, BaseWorkRequest, SiteId } from "@cafm/shared-schema";
import { calculateDeadline, type AuditCampaign, type AuditFinding, type AuditInspection, urgencyLevels, findingTypes, assuranceStates } from "./audit-assurance-types";

export function auditSystem(category?: string): string {
  if (["A", "B", "C", "H"].includes(category ?? "")) return "HVAC & Cooling";
  if (category === "E") return "Electrical Distribution";
  if (category === "F") return "Life Safety & Fire";
  if (category === "L" || category === "M") return "Lifts & Hoists";
  if (category === "D") return "Plumbing & Water";
  return "Other Technical Systems";
}

export function seedAssurance(siteId: SiteId, equipment: Equipment[], requests: BaseWorkRequest[]) {
  const siteAssets = equipment.filter((item) => item.SiteId === siteId);
  const installations = siteAssets.filter((item) => item.IsInstallation);
  const assets = installations.length ? installations : siteAssets;
  if (!assets.length) return { auditCampaigns: [], auditFindings: [], auditInspections: [] };
  const campaigns: AuditCampaign[] = [2025, 2026, 2027].map((year, index) => {
    const selected = assets.slice(0, Math.min(12, assets.length));
    return { id: `${siteId}-audit-${year}`, name: year === 2025 ? "SOCOTEC Baseline Audit 2025" : `Sophia Technical Audit ${year}`,
      provider: year === 2025 ? "SOCOTEC" : "Sophia / SOCOTEC", siteId,
      buildingIds: [...new Set(selected.map((item) => item.bl_id))], systems: [...new Set(selected.map((item) => auditSystem(item.Category)))],
      startDate: `${year}-03-01`, endDate: `${year}-05-31`, inspectors: ["Thomas", "Yvonne"],
      methodology: "N0-N4 Dual Condition & Operational Assessment", selectedEquipmentIds: selected.map((item) => item.EquipmentCode),
      plannedInspectionsCount: selected.length, completedInspectionsCount: index === 2 ? 0 : selected.length - (index === 1 && selected.length > 1 ? 1 : 0),
      inaccessibleEquipmentIds: selected.length > 1 && index === 1 ? [selected[selected.length - 1].EquipmentCode] : [],
      overallConditionRating: [62, 70, 0][index], overallOperationalRating: [71, 77, 0][index],
      ...(index ? { previousCampaignId: `${siteId}-audit-${year - 1}` } : {}), workflowStage: index === 2 ? "Planning" : index === 1 ? "Technical validation" : "Closed", importedDocuments: [] };
  });
  const inspections: AuditInspection[] = campaigns.flatMap((campaign) => campaign.selectedEquipmentIds.map((id, index) => {
    const asset = assets.find((item) => item.EquipmentCode === id)!;
    return { id: `${campaign.id}-inspection-${index + 1}`, siteId, campaignId: campaign.id, equipmentId: id, buildingId: asset.bl_id,
      systemName: auditSystem(asset.Category), checkpointName: `CP-${String(index + 1).padStart(2, "0")} Condition and operation`, inspector: campaign.inspectors[index % campaign.inspectors.length],
      plannedDate: `${campaign.startDate.slice(0, 7)}-${String(index + 1).padStart(2, "0")}`, routeOrder: index + 1,
      accessibility: campaign.inaccessibleEquipmentIds.includes(id) ? "Inaccessible" : "Accessible", status: campaign.completedInspectionsCount && !campaign.inaccessibleEquipmentIds.includes(id) ? "Completed" : "Planned",
      ...(campaign.completedInspectionsCount && !campaign.inaccessibleEquipmentIds.includes(id) ? { completedAt: `${campaign.startDate}T12:00:00Z` } : {}) };
  }));
  const findings: AuditFinding[] = Array.from({ length: 18 }, (_, index) => {
    const asset = assets[(index === 7 ? 1 : index % 12) % assets.length], campaign = campaigns[index < 6 ? 0 : 1], urgency = urgencyLevels[index % urgencyLevels.length];
    const state = index < 6 ? "FindingVerified_Closed" : assuranceStates[index % assuranceStates.length], discoveredAt = `${campaign.startDate.slice(0, 7)}-${String(index % 25 + 1).padStart(2, "0")}`;
    const wr = requests.find((item) => item.SiteId === siteId && item.EquipmentCodes.includes(asset.EquipmentCode) && (index % 2 ? item.Percentage >= 78 : item.Percentage < 78));
    return { id: `${siteId}-FND-${String(index + 1).padStart(3, "0")}`, campaignId: campaign.id, campaignName: campaign.name, siteId,
      buildingId: asset.bl_id, roomId: asset.RoomCode, systemName: auditSystem(asset.Category), equipmentId: asset.EquipmentCode, equipmentName: asset.EquipmentName,
      componentName: ["Bearing", "Transfer switch", "Actuator", "Safety isolation", "Technical record", "Housing"][index % 6],
      checkpointName: `CP-${String(index % 6 + 1).padStart(2, "0")} Condition and operation`, findingType: findingTypes[index % findingTypes.length],
      urgency, conditionScore: ["D - Critical", "C - Poor", "B - Fair", "B - Fair", "A - Good"][index % 5] as AuditFinding["conditionScore"],
      operationalStatus: index === 11 ? "Inaccessible" : index % 5 === 0 ? "Degraded" : "Operational",
      discoveredAt, calculatedDeadline: calculateDeadline(discoveredAt, urgency),
      title: `${asset.EquipmentName} — ${findingTypes[index % findingTypes.length]} observation`,
      observation: ["Wear observed during visual inspection.", "Operational readings deviate from baseline.", "Maintenance documentation requires review.", "Protective enclosure requires attention.", "Equipment identification differs from register."][index % 5],
      recommendedRemedy: index % 5 === 4 ? "Confirm equipment identification and update the register." : "Review the defect, plan corrective work and verify the result.",
      responsibleParty: index % 3 === 0 ? "Owner / ESA" : index % 3 === 1 ? "Contractor" : "Third-Party Specialist",
      contractorName: ["WISAG Facility Management", "SPIE", "Apleona"][index % 3], trade: asset.PrimaryTradeId ?? "MultiTechnic", inspectorName: "Thomas", inspectorPhotos: [],
      validationStatus: state === "FindingLogged" || state === "AwaitingValidation" ? "PendingValidation" : state === "Rejected_Archived" ? "TechnicallyIncorrect" : "Accepted",
      ...(state === "Rejected_Archived" ? { validationJustification: "Demo: inspection observation did not match the technical record." } : {}),
      aiIntelligenceFlags: [...(wr ? [wr.Percentage >= 78 ? "RecentlyCompletedWR" as const : "ExistingOpenWR" as const] : []), ...(index >= 12 ? ["RecurringDefect" as const] : []), ...(index === 13 ? ["PotentialDuplicate" as const] : [])],
      ...(wr ? { linkedWrId: wr.WR_ID, aiRecommendedClassification: "Review related work request", aiConfidenceScore: 0.6, aiReasoning: "Demo match based on equipment and work-request status; inspector confirmation required." } : {}),
      ...(index >= 12 ? { previousYearFindingId: `${siteId}-FND-${String(index - 11).padStart(3, "0")}`, isRecurring: true } : {}),
      ...(index === 13 ? { duplicateOfFindingId: `${siteId}-FND-008` } : {}),
      isDisputed: index === 9, correctiveActionType: wr ? "IndividualWR" : "None", assuranceState: state,
      evidence: { beforePhotos: [], afterPhotos: [], certificates: [], updatedDrawings: [], replacedParts: [], laborCostEUR: state === "FindingVerified_Closed" ? 120 : 0, materialCostEUR: state === "FindingVerified_Closed" ? 45 : 0, ...(state === "FindingVerified_Closed" ? { measurements: "Demo: final readings within operational range", submittedBy: "Thomas", submittedAt: `${discoveredAt}T11:00:00Z`, evidenceAccepted: true, evidenceReviewerNotes: "Demo: documentation reviewed." } : {}) },
      verification: state === "FindingVerified_Closed" ? { method: "InternalReviewer", verifiedBy: "Thomas", verifiedAt: `${discoveredAt}T12:00:00Z`, verificationOutcome: "VerifiedClosed" } : {},
      auditTrail: [{ id: `${siteId}-trail-${index}`, timestamp: `${discoveredAt}T12:00:00Z`, actor: "Thomas", action: "Demo finding recorded" }] };
  });
  return { auditCampaigns: campaigns, auditFindings: findings, auditInspections: inspections };
}
