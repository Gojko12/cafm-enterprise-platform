import type { BaseWorkRequest, Equipment } from "@cafm/shared-schema";

export type SuggestedStep = { title: string; instruction?: string };

export function technicianBuilderSnapshot(wr: BaseWorkRequest): string {
  return JSON.stringify([wr.WR_Type, wr.WR_ID, wr.Description, wr.TradeId, wr.TradeName, wr.EquipmentCodes, wr.bl_id, wr.LevelName, wr.RoomCode, wr.EstimatedCostEur, wr.ActualCostEur, wr.roughScopeNotes, wr.todoSteps ?? []]);
}

export function composeTechnicianPrompt(wr: BaseWorkRequest, equipment: Equipment[], scope: string, count: number): string {
  const assets = wr.EquipmentCodes.map((code) => {
    const asset = equipment.find((item) => item.EquipmentCode === code);
    return asset ? `${code} (${asset.EquipmentName}${asset.Category ? ` / ${asset.Category}` : ""})` : code;
  }).join(", ") || "Not specified";
  return [
    `WR Type & ID: ${wr.WR_Type} #${wr.WR_ID}`,
    `Equipment: ${assets}`,
    `Location: ${wr.bl_id} / ${wr.LevelName ?? "Not specified"} / ${wr.RoomCode ?? "Not specified"}`,
    `Trade: ${wr.TradeName ?? wr.TradeId ?? "Not specified"}`,
    `Estimated Value / Cost: ${wr.EstimatedCostEur ?? wr.ActualCostEur ?? "N/A"} EUR`,
    `Problem Description & Scope: ${wr.Description}${scope.trim() ? ` — ${scope.trim()}` : ""}`,
    `Instruction: Generate ${count} clear, sequential field technician steps for a ${wr.TradeName ?? wr.TradeId ?? "qualified"} technician working on ${assets}, including safety isolation, technical execution for '${wr.Description}', testing, and site handover.`,
  ].join("\n");
}

export function generateTechnicianSteps(prompt: string, count: number): SuggestedStep[] {
  if (!Number.isInteger(count) || count < 2 || count > 12) throw new Error("Choose a whole number between 2 and 12.");
  if (!prompt.trim()) throw new Error("Enter a prompt before generating.");
  const field = (name: string) => prompt.split(/\r?\n/).find((line) => line.toLowerCase().startsWith(`${name.toLowerCase()}:`))?.slice(name.length + 1).trim();
  const asset = field("Equipment") || "the equipment";
  const trade = field("Trade") || "assigned";
  const location = field("Location") || "the work area";
  const scope = field("Problem Description & Scope") || "the work described in the prompt";
  const phases = [
    `Review the work brief, ${trade} requirements and permits at ${location}.`,
    `Identify hazards and select appropriate PPE for ${asset}.`,
    `Coordinate access and notify affected occupants before work.`,
    `Identify energy sources and arrange authorized isolation for ${asset}.`,
    `Verify isolation and inspect the condition of ${asset}.`,
    `Assess the reported problem and plan the work: ${scope}.`,
    `Prepare required tools and materials for ${asset}.`,
    `Carry out the approved ${trade} work in accordance with site procedures.`,
    `Inspect the work and check fastenings, connections and guards as applicable.`,
    `Restore service safely with the required authorization.`,
    `Perform an appropriate functional test and record any outstanding issues.`,
    `Record results and photographs, clean the area and hand over to the site.`,
  ];
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * phases.length / count);
    const end = Math.floor((index + 1) * phases.length / count);
    return { title: phases.slice(start, end).join(" "), ...(index === 0 ? { instruction: `Review the edited work brief before execution:\n${prompt.trim()}` } : {}) };
  });
}
