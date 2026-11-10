import { PM_FREQUENCY_RANKS } from "./smart-pm.js";
import type { PM_ChecklistStandard, PM_Schedule, PM_ScheduleStep } from "./smart-pm.js";

export function nextPmsOrderNumber(schedules: Pick<PM_Schedule, "ScheduleId">[], highWatermark = 0): string {
  const max = Math.max(highWatermark, 0, ...schedules.map((item) => /^\d{5}$/.test(item.ScheduleId) ? Number(item.ScheduleId) : 0));
  if (max >= 99999) throw new Error("All PMS order numbers 00001–99999 have been allocated.");
  return String(max + 1).padStart(5, "0");
}

export function blueprintLayers(target: PM_ChecklistStandard, all: PM_ChecklistStandard[]): PM_ChecklistStandard[] {
  if (!target.frequencyCode || !target.blueprintMode) throw new Error(`Blueprint ${target.ChecklistCode} requires a locked frequency and mode.`);
  const layers = target.blueprintMode === "standalone" ? [target] : all.filter((item) =>
    item.IsActive && item.SiteId === target.SiteId && item.blueprintMode === "family_ladder" && item.familyId === target.familyId &&
    item.frequencyCode && PM_FREQUENCY_RANKS[item.frequencyCode] <= PM_FREQUENCY_RANKS[target.frequencyCode!]);
  const frequencies = new Set<string>();
  for (const layer of layers) {
    if (!layer.frequencyCode || frequencies.has(layer.frequencyCode)) throw new Error(`Family ${target.familyName} has more than one blueprint at ${layer.frequencyCode}.`);
    if (layer.TradeId !== target.TradeId) throw new Error(`All blueprints in family ${target.familyName} must use the same trade.`);
    frequencies.add(layer.frequencyCode);
  }
  return layers.sort((a, b) => PM_FREQUENCY_RANKS[a.frequencyCode!] - PM_FREQUENCY_RANKS[b.frequencyCode!] || a.ChecklistCode.localeCompare(b.ChecklistCode));
}

export function compileBlueprintChecklist(blueprintId: string, allBlueprints: PM_ChecklistStandard[]): PM_ScheduleStep[] {
  const matches = allBlueprints.filter((item) => item.ChecklistCode === blueprintId && item.IsActive);
  if (matches.length !== 1) throw new Error(`Expected one active blueprint for ${blueprintId}; found ${matches.length}.`);
  const target = matches[0];
  const layers = blueprintLayers(target, allBlueprints);
  const steps = layers.flatMap((layer) => [...layer.Steps].sort((a, b) => a.SortOrder - b.SortOrder).map((step) => ({
    ...structuredClone(step), originFrequency: layer.frequencyCode, isInherited: layer.frequencyCode !== target.frequencyCode,
  })));
  const ids = new Set<string>();
  for (const step of steps) {
    if (ids.has(step.StepId)) throw new Error(`Duplicate checklist step ID ${step.StepId} in ${target.familyName ?? target.Title}.`);
    ids.add(step.StepId);
  }
  const replaced = new Set<string>();
  for (const step of steps) if (step.replacesStepId) {
    const lower = steps.find((item) => item.StepId === step.replacesStepId);
    if (!lower?.originFrequency || !step.originFrequency || PM_FREQUENCY_RANKS[lower.originFrequency] >= PM_FREQUENCY_RANKS[step.originFrequency])
      throw new Error(`${step.Title} must replace a lower-frequency step in the same blueprint family.`);
    replaced.add(lower.StepId);
    step.replacesStepLabel = `Replaces ${lower.originFrequency}: ${lower.Title}`;
  }
  return steps.filter((step) => !replaced.has(step.StepId)).map((step, index) => ({ ...step, SortOrder: index + 1 }));
}
