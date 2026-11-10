import { compileBlueprintChecklist, nextPmsOrderNumber, PM_ChecklistStandardSchema, PM_ScheduleSchema } from "@cafm/shared-schema";
import type { Equipment, PM_ChecklistStandard, PM_Schedule, SuppressedPmOccurrence } from "@cafm/shared-schema";
import { frequencyOf, nextTickOnOrAfter, resolveBlueprintSchedule, shiftDays } from "./pm-suppression";

export { nextPmsOrderNumber };
export function validateBlueprintFamilies(blueprints: PM_ChecklistStandard[]) {
  for (const blueprint of blueprints.filter((item) => item.IsActive)) compileBlueprintChecklist(blueprint.ChecklistCode, blueprints.filter((item) => item.SiteId === blueprint.SiteId));
}
export function sharedFamilyAnchor(schedules: PM_Schedule[], blueprints: PM_ChecklistStandard[], equipment: string, blueprint: PM_ChecklistStandard): string | undefined {
  if (blueprint.blueprintMode !== "family_ladder") return undefined;
  return schedules.find((item) => item.IsActive && item.SiteId === blueprint.SiteId && item.EquipmentCodes.includes(equipment) &&
    blueprints.some((bp) => bp.ChecklistCode === item.ChecklistCode && bp.SiteId === blueprint.SiteId && bp.blueprintMode === "family_ladder" && bp.familyId === blueprint.familyId))?.anchorDate;
}
export function createPmOrder(schedules: PM_Schedule[], blueprints: PM_ChecklistStandard[], blueprint: PM_ChecklistStandard, equipment: Equipment, anchor: string, actor: string, highWatermark = 0): PM_Schedule {
  if (schedules.some((item) => item.IsActive && item.SiteId === equipment.SiteId && item.ChecklistCode === blueprint.ChecklistCode && item.EquipmentCodes.includes(equipment.EquipmentCode)))
    throw new Error(`${equipment.EquipmentCode} already has an active order for ${blueprint.Title}.`);
  const date = sharedFamilyAnchor(schedules, blueprints, equipment.EquipmentCode, blueprint) ?? anchor;
  const base = resolveBlueprintSchedule({
    ScheduleId: nextPmsOrderNumber(schedules, highWatermark), ChecklistCode: blueprint.ChecklistCode, SiteId: equipment.SiteId,
    EquipmentCodes: [equipment.EquipmentCode], bl_id: equipment.bl_id, LevelName: equipment.LevelName, RoomCode: equipment.RoomCode,
    Frequency: "Monthly", FrequencyInterval: 1, anchorDate: date, NextDueDate: date, LeadTimeDays: 14, MarginWindowDays: 7,
    Title: blueprint.Title, CreatedBy: actor, CreatedAt: new Date().toISOString(), IsActive: true,
  }, blueprints);
  return { ...base, NextDueDate: nextTickOnOrAfter(base, shiftDays(date, 1)) };
}
export function changeFamilyAnchor(schedules: PM_Schedule[], blueprints: PM_ChecklistStandard[], schedule: PM_Schedule, anchor: string): PM_Schedule[] {
  const blueprint = blueprints.find((item) => item.ChecklistCode === schedule.ChecklistCode && (!item.SiteId || item.SiteId === schedule.SiteId));
  if (!blueprint) throw new Error("Blueprint not found.");
  return schedules.map((item) => {
    const sibling = blueprints.find((bp) => bp.ChecklistCode === item.ChecklistCode && (!bp.SiteId || bp.SiteId === item.SiteId));
    if (item.SiteId !== schedule.SiteId || item.EquipmentCodes[0] !== schedule.EquipmentCodes[0] ||
      (blueprint.blueprintMode === "standalone" ? item.ScheduleId !== schedule.ScheduleId : sibling?.blueprintMode !== "family_ladder" || sibling.familyId !== blueprint.familyId)) return item;
    const updated = resolveBlueprintSchedule({ ...item, anchorDate: anchor }, blueprints);
    return { ...updated, NextDueDate: nextTickOnOrAfter(updated, shiftDays(anchor, 1)), UpdatedAt: new Date().toISOString() };
  });
}

type ReferencedWr = { WR_ID: string; SiteId?: unknown; ScheduleId?: unknown; PM_CycleKey?: unknown; ChecklistInstances?: unknown; CraftpersonAssignments?: unknown; EquipmentCodes?: unknown };
type PmState = { pmModelVersion?: 60; pmMigrationNotes?: string[]; blueprints: PM_ChecklistStandard[]; schedules: PM_Schedule[]; workRequests: ReferencedWr[]; suppressedPmOccurrences?: SuppressedPmOccurrence[]; deletedWorkRequests?: ReferencedWr[] };

// Legacy fields are accepted at the boundary, then deterministically converted without rewriting executed checklist snapshots.
export function migratePmState<T extends PmState>(state: T): T {
  if (state.pmModelVersion === 60) {
    const blueprints = state.blueprints.map((item) => PM_ChecklistStandardSchema.parse(item));
    validateBlueprintFamilies(blueprints);
    const ids = new Set<string>(), assignments = new Set<string>(), anchors = new Map<string, string>();
    const schedules = state.schedules.map((item) => {
      PM_ScheduleSchema.parse(item);
      const id = `${item.SiteId}:${item.ScheduleId}`;
      if (ids.has(id)) throw new Error(`Duplicate PMS order #${item.ScheduleId}.`);
      ids.add(id);
      const order = resolveBlueprintSchedule(item, blueprints);
      if (order.IsActive) {
        const assignment = `${order.SiteId}:${order.EquipmentCodes[0]}:${order.ChecklistCode}`;
        if (assignments.has(assignment)) throw new Error(`Duplicate blueprint assignment for equipment ${order.EquipmentCodes[0]}.`);
        assignments.add(assignment);
        if (order.suppressionMode !== "independent") {
          const family = `${order.SiteId}:${order.EquipmentCodes[0]}:${order.suppressionGroupKey}`;
          if (anchors.has(family) && anchors.get(family) !== order.anchorDate) throw new Error(`Family orders on ${order.EquipmentCodes[0]} must share one anchor date.`);
          anchors.set(family, order.anchorDate!);
        }
      }
      return order;
    });
    return { ...state, blueprints, schedules };
  }
  const blueprints: PM_ChecklistStandard[] = [];
  const blueprintMap = new Map<string, string>();
  const key = (site: unknown, id: unknown) => `${site}:${id}`;
  for (const blueprint of state.blueprints) {
    const linked = state.schedules.filter((item) => item.ChecklistCode === blueprint.ChecklistCode && (!blueprint.SiteId || item.SiteId === blueprint.SiteId));
    const codes = blueprint.blueprintMode && blueprint.frequencyCode ? [blueprint.frequencyCode] : [...new Set(linked.map((item) => frequencyOf(item) ?? blueprint.frequencyCode ?? "01M"))];
    if (!codes.length) codes.push(blueprint.frequencyCode ?? "01M");
    for (const code of codes) {
      const sample = linked.find((item) => frequencyOf(item) === code) ?? linked[0];
      const id = codes.length === 1 ? blueprint.ChecklistCode : `${blueprint.ChecklistCode}-${code}`;
      const mode = blueprint.blueprintMode ?? (sample?.suppressionGroupKey && sample.suppressionMode !== "independent" ? "family_ladder" : "standalone");
      const familyId = blueprint.familyId ?? (mode === "family_ladder" ? `${blueprint.SiteId ?? sample?.SiteId}-${sample?.suppressionGroupKey}-${blueprint.TradeId}` : undefined);
      blueprints.push({ ...blueprint, ChecklistCode: id, frequencyCode: code, blueprintMode: mode,
        familyId, familyName: mode === "family_ladder" ? blueprint.familyName ?? sample?.suppressionGroupName ?? blueprint.Title : undefined,
        Steps: blueprint.Steps.map((step) => ({ ...step, originFrequency: code, isInherited: false })) });
      for (const order of linked.filter((item) => frequencyOf(item) === code || codes.length === 1))
        blueprintMap.set(key(order.SiteId, order.ScheduleId), id);
    }
  }
  // Old ladders were equipment-scoped and could reuse the same group key across unrelated procedures.
  const familySlots = new Map<string, PM_ChecklistStandard>();
  for (const blueprint of blueprints.filter((item) => item.blueprintMode === "family_ladder")) {
    const slot = key(blueprint.SiteId, `${blueprint.familyId}:${blueprint.frequencyCode}`);
    const previous = familySlots.get(slot);
    if (previous && !state.blueprints.find((item) => item.ChecklistCode === blueprint.ChecklistCode)?.blueprintMode) {
      const order = state.schedules.find((item) => blueprintMap.get(key(item.SiteId, item.ScheduleId)) === blueprint.ChecklistCode);
      blueprint.familyId = `${blueprint.familyId}:${order?.EquipmentCodes[0] ?? blueprint.ChecklistCode}`;
    } else familySlots.set(slot, blueprint);
  }
  // Match legacy family layers by their common procedure prefix when duplicate frequencies existed.
  for (const blueprint of blueprints.filter((item) => !state.blueprints.find((old) => old.ChecklistCode === item.ChecklistCode)?.blueprintMode && item.blueprintMode === "family_ladder")) {
    const prefix = blueprint.ChecklistCode.replace(/-(03M|06M|01Y|01M)$/, "");
    const peers = blueprints.filter((item) => item.ChecklistCode.replace(/-(03M|06M|01Y|01M)$/, "") === prefix);
    if (peers.length > 1) {
      const family = peers.find((item) => item.familyId?.includes(":"))?.familyId ?? blueprint.familyId;
      peers.forEach((item) => { item.familyId = family; });
    }
  }
  const used = new Set(state.schedules.filter((item) => /^(?!00000)\d{5}$/.test(item.ScheduleId)).map((item) => item.ScheduleId));
  const idMap = new Map<string, string[]>();
  let number = Math.max(0, ...[...used].map(Number));
  const schedules: PM_Schedule[] = [];
  const notes = [...(state.pmMigrationNotes ?? [])];
  for (const old of state.schedules) {
    if (!old.EquipmentCodes.length) throw new Error(`Legacy PMS ${old.ScheduleId} has no equipment. Assign equipment before migrating this order.`);
    const ids: string[] = [];
    for (const equipment of old.EquipmentCodes) {
      const retain = ids.length === 0 && /^(?!00000)\d{5}$/.test(old.ScheduleId);
      if (!retain && ++number > 99999) throw new Error("PMS order number range exhausted during migration.");
      const id = retain ? old.ScheduleId : String(number).padStart(5, "0");
      const blueprintId = blueprintMap.get(key(old.SiteId, old.ScheduleId)) ?? old.ChecklistCode;
      const blueprint = blueprints.find((item) => item.ChecklistCode === blueprintId && (!item.SiteId || item.SiteId === old.SiteId));
      if (!blueprint) throw new Error(`Missing blueprint for PMS ${old.ScheduleId}.`);
      const anchor = sharedFamilyAnchor(schedules, blueprints, equipment, blueprint) ?? old.anchorDate ?? old.sharedAnchorDate ?? old.NextDueDate.slice(0, 10);
      const duplicate = old.IsActive && schedules.some((item) => item.IsActive && item.SiteId === old.SiteId && item.ChecklistCode === blueprintId && item.EquipmentCodes.includes(equipment));
      if (duplicate) notes.push(`Legacy duplicate PMS ${old.ScheduleId} retained as inactive PMS #${id}; existing WR history is preserved.`);
      schedules.push(resolveBlueprintSchedule({ ...old, ScheduleId: id, ChecklistCode: blueprintId, EquipmentCodes: [equipment], anchorDate: anchor, IsActive: duplicate ? false : old.IsActive }, blueprints));
      ids.push(id);
    }
    idMap.set(key(old.SiteId, old.ScheduleId), ids);
  }
  const mapId = (site: unknown, id: unknown, equipment?: unknown) => {
    const ids = idMap.get(key(site, id));
    if (Array.isArray(equipment)) return schedules.find((item) => item.SiteId === site && ids?.includes(item.ScheduleId) && item.EquipmentCodes.some((code) => equipment.includes(code)))?.ScheduleId ?? ids?.[0] ?? id;
    return ids?.[0] ?? id;
  };
  const logs = state.suppressedPmOccurrences?.map((log) => {
    const lower = log.suppressedPmsId ?? state.schedules.find((item) => item.SiteId === log.siteId && item.EquipmentCodes.includes(log.equipmentCode) && frequencyOf(item) === log.suppressedFrequency)?.ScheduleId;
    const winner = state.workRequests.find((wr) => wr.SiteId === log.siteId && wr.WR_ID === log.coveredByWrId)?.ScheduleId;
    return { ...log, suppressedPmsId: lower ? String(mapId(log.siteId, lower, [log.equipmentCode])) : undefined,
      coveredByPmsId: winner ? String(mapId(log.siteId, winner, [log.equipmentCode])) : log.coveredByPmsId };
  });
  validateBlueprintFamilies(blueprints);
  return migratePmState(remapPmsReferences({ ...state, pmModelVersion: 60, pmMigrationNotes: notes, blueprints, schedules, suppressedPmOccurrences: logs ?? [] }, mapId));
}

function remapPmsReferences<T extends PmState>(state: T, mapId: (site: unknown, id: unknown, equipment?: unknown) => unknown): T {
  const remapWr = <W extends ReferencedWr>(wr: W): W => {
    if (!wr.ScheduleId) return wr;
    const id = mapId(wr.SiteId, wr.ScheduleId, wr.EquipmentCodes);
    if (typeof id !== "string" || !/^(?!00000)\d{5}$/.test(id)) return wr;
    const order = state.schedules.find((item) => item.ScheduleId === id && item.SiteId === wr.SiteId);
    return { ...wr, ScheduleId: id, pmsId: id,
      PM_CycleKey: typeof wr.PM_CycleKey === "string" ? wr.PM_CycleKey.replace(String(wr.ScheduleId), id) : wr.PM_CycleKey,
      ChecklistStandardCode: order?.ChecklistCode,
      ChecklistInstances: Array.isArray(wr.ChecklistInstances) ? wr.ChecklistInstances.map((step: Record<string, unknown>) => ({ ...step, ScheduleId: id })) : wr.ChecklistInstances,
      CraftpersonAssignments: Array.isArray(wr.CraftpersonAssignments) ? wr.CraftpersonAssignments.map((slot: Record<string, unknown>) => ({ ...slot, ...(slot.autoScheduledFromPmsId ? { autoScheduledFromPmsId: mapId(wr.SiteId, slot.autoScheduledFromPmsId, wr.EquipmentCodes) } : {}) })) : wr.CraftpersonAssignments,
    };
  };
  return { ...state, workRequests: state.workRequests.map(remapWr), deletedWorkRequests: state.deletedWorkRequests?.map(remapWr),
    suppressedPmOccurrences: state.suppressedPmOccurrences?.map((log) => {
      const lower = log.suppressedPmsId ? String(mapId(log.siteId, log.suppressedPmsId, [log.equipmentCode])) : undefined;
      return { ...log, id: lower ? `suppressed:${log.siteId}:${lower}:${log.equipmentCode}:${log.dueDate}` : log.id,
        suppressedPmsId: lower,
        coveredByPmsId: log.coveredByPmsId ? String(mapId(log.siteId, log.coveredByPmsId, [log.equipmentCode])) : undefined };
    }) };
}

export function uniquePmsOrdersAcrossSites<T extends PmState>(states: T[]): T[] {
  const used = new Set<string>();
  let high = Math.max(0, ...states.flatMap((state) => state.schedules.map((order) => Number(order.ScheduleId))));
  return states.map((state) => {
    const map = new Map<string, string>();
    const schedules = state.schedules.map((order) => {
      let id = order.ScheduleId;
      if (used.has(id)) {
        if (++high > 99999) throw new Error("Cannot migrate cross-site PMS identifiers: order number range exhausted.");
        id = String(high).padStart(5, "0");
      }
      used.add(id); map.set(`${order.SiteId}:${order.ScheduleId}`, id);
      return id === order.ScheduleId ? order : { ...order, ScheduleId: id };
    });
    if (schedules.every((order, index) => order === state.schedules[index])) return state;
    return remapPmsReferences({ ...state, schedules, pmMigrationNotes: [...(state.pmMigrationNotes ?? []), "PMS order IDs were reallocated to avoid collisions with another site; all WR and compliance references were migrated."] },
      (site, id) => map.get(`${site}:${id}`) ?? id);
  });
}
