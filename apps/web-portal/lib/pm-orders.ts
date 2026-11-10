import { compileBlueprintChecklist, nextPmsOrderNumber, PM_ChecklistStandardSchema, PM_ScheduleSchema, pmTargetKey, pmTargetType, getPmCycle, addCycleInterval } from "@cafm/shared-schema";
import type { Equipment, PMTarget, PM_ChecklistStandard, PM_Schedule, SuppressedPmOccurrence, BlueprintAuditEntry } from "@cafm/shared-schema";
import { frequencyOf, nextTickOnOrAfter, resolveBlueprintSchedule, shiftDays } from "./pm-suppression";

export { nextPmsOrderNumber };
export function rephasePmAssignments(previous: PM_Schedule[], next: PM_Schedule[]): PM_Schedule[] {
  return next.map((order) => {
    if (!order.IsActive) return order;
    const before = previous.find((item) => item.IsActive && item.SiteId === order.SiteId && pmTargetKey(item) === pmTargetKey(order) &&
      (order.suppressionMode === "independent" ? item.ScheduleId === order.ScheduleId : item.suppressionGroupKey === order.suppressionGroupKey));
    if (!before?.peakSlotIndex) return order;
    const oldCycle = getPmCycle(before, previous);
    const draft = next.map((item) => ({ ...item, peakSlotIndex: undefined, annualSlotIndex: undefined, peakYearIndex: undefined }));
    const newCycle = getPmCycle(draft.find((item) => item.ScheduleId === order.ScheduleId && item.SiteId === order.SiteId)!, draft);
    if (oldCycle.unit !== newCycle.unit) throw new Error("Changing a family between calendar and fixed-day frequencies requires a separate family.");
    if (oldCycle.interval === newCycle.interval && oldCycle.length === newCycle.length) return order;
    const projected = Math.round((oldCycle.peakSlotIndex - 1) * oldCycle.interval / newCycle.interval);
    const peakSlotIndex = projected % newCycle.visits + 1;
    return { ...order, peakSlotIndex, annualSlotIndex: undefined, peakYearIndex: undefined };
  });
}
export function validateBlueprintFamilies(blueprints: PM_ChecklistStandard[]) {
  for (const blueprint of blueprints.filter((item) => item.IsActive)) compileBlueprintChecklist(blueprint.ChecklistCode, blueprints.filter((item) => item.SiteId === blueprint.SiteId));
}
export function sharedFamilyAnchor(schedules: PM_Schedule[], blueprints: PM_ChecklistStandard[], equipment: string, blueprint: PM_ChecklistStandard): string | undefined {
  if (blueprint.blueprintMode !== "family_ladder") return undefined;
  return schedules.find((item) => item.IsActive && item.SiteId === blueprint.SiteId && (pmTargetKey(item) === equipment || item.EquipmentCodes.includes(equipment)) &&
    blueprints.some((bp) => bp.ChecklistCode === item.ChecklistCode && bp.SiteId === blueprint.SiteId && bp.blueprintMode === "family_ladder" && bp.familyId === blueprint.familyId))?.anchorDate;
}
export function createPmOrder(schedules: PM_Schedule[], blueprints: PM_ChecklistStandard[], blueprint: PM_ChecklistStandard, equipment: Equipment, anchor: string, actor: string, highWatermark = 0): PM_Schedule {
  return createTargetPmOrder(schedules, blueprints, blueprint, { ...equipment, targetType: "equipment", equipmentCode: equipment.EquipmentCode }, anchor, actor, highWatermark);
}
export function createTargetPmOrder(schedules: PM_Schedule[], blueprints: PM_ChecklistStandard[], blueprint: PM_ChecklistStandard, target: PMTarget & { SiteId: PM_Schedule["SiteId"] }, anchor: string, actor: string, highWatermark = 0): PM_Schedule {
  const key = pmTargetKey(target), type = pmTargetType(target);
  if (blueprint.SiteId && blueprint.SiteId !== target.SiteId) throw new Error("Blueprint and target must belong to the same site.");
  if (schedules.some((item) => item.IsActive && item.SiteId === target.SiteId && item.ChecklistCode === blueprint.ChecklistCode && pmTargetKey(item) === key))
    throw new Error(`${key} already has an active order for ${blueprint.Title}.`);
  const date = sharedFamilyAnchor(schedules, blueprints, key, blueprint) ?? anchor;
  const base = resolveBlueprintSchedule({
    ScheduleId: nextPmsOrderNumber(schedules, highWatermark), ChecklistCode: blueprint.ChecklistCode, SiteId: target.SiteId,
    targetType: type, targetKey: key, equipmentCode: type === "equipment" ? target.equipmentCode ?? target.EquipmentCode : undefined,
    EquipmentCodes: type === "equipment" ? [target.equipmentCode ?? target.EquipmentCode!] : [],
    bl_id: target.bl_id, LevelName: target.levelName ?? target.LevelName, RoomCode: target.roomCode ?? target.RoomCode,
    levelName: target.levelName ?? target.LevelName, roomCode: target.roomCode ?? target.RoomCode,
    Frequency: "Monthly", FrequencyInterval: 1, anchorDate: date, cycleDate: date, NextDueDate: date, LeadTimeDays: 14, MarginWindowDays: 7,
    Title: blueprint.Title, CreatedBy: actor, CreatedAt: new Date().toISOString(), IsActive: true,
  }, blueprints);
  const peer = schedules.find((item) => item.IsActive && item.SiteId === base.SiteId && pmTargetKey(item) === key && base.suppressionGroupKey && item.suppressionGroupKey === base.suppressionGroupKey);
  const configured = { ...base, peakSlotIndex: peer?.peakSlotIndex };
  return { ...configured, NextDueDate: nextTickOnOrAfter(configured, date, [...schedules, configured]) };
}
export function nextBlueprintCode(blueprints: PM_ChecklistStandard[], frequency: string, high = 0): string {
  const next = Math.max(high, 0, ...blueprints.map((bp) => Number(/^CB-(\d{4})-/.exec(bp.ChecklistCode)?.[1] ?? 0))) + 1;
  if (next > 9999) throw new Error("Blueprint number range exhausted.");
  return `CB-${String(next).padStart(4, "0")}-${frequency}`;
}
export function nextFamilyId(blueprints: PM_ChecklistStandard[]): string {
  const next = Math.max(0, ...blueprints.map((bp) => Number(/^FAM-(\d+)$/.exec(bp.familyId ?? "")?.[1] ?? 0))) + 1;
  return `FAM-${String(next).padStart(3, "0")}`;
}
export function changeFamilyAnchor(schedules: PM_Schedule[], blueprints: PM_ChecklistStandard[], schedule: PM_Schedule, anchor: string): PM_Schedule[] {
  const blueprint = blueprints.find((item) => item.ChecklistCode === schedule.ChecklistCode && (!item.SiteId || item.SiteId === schedule.SiteId));
  if (!blueprint) throw new Error("Blueprint not found.");
  return schedules.map((item) => {
    const sibling = blueprints.find((bp) => bp.ChecklistCode === item.ChecklistCode && (!bp.SiteId || bp.SiteId === item.SiteId));
    if (item.SiteId !== schedule.SiteId || pmTargetKey(item) !== pmTargetKey(schedule) ||
      (blueprint.blueprintMode === "standalone" ? item.ScheduleId !== schedule.ScheduleId : sibling?.blueprintMode !== "family_ladder" || sibling.familyId !== blueprint.familyId)) return item;
    const updated = resolveBlueprintSchedule({ ...item, anchorDate: anchor, cycleDate: anchor }, blueprints);
    return { ...updated, NextDueDate: nextTickOnOrAfter(updated, anchor), UpdatedAt: new Date().toISOString() };
  });
}

type ReferencedWr = { WR_ID: string; SiteId?: unknown; ScheduleId?: unknown; PM_CycleKey?: unknown; ChecklistInstances?: unknown; CraftpersonAssignments?: unknown; EquipmentCodes?: unknown };
type PmState = { pmModelVersion?: 60; pmMigrationNotes?: string[]; blueprintAuditLog?: BlueprintAuditEntry[]; blueprints: PM_ChecklistStandard[]; schedules: PM_Schedule[]; workRequests: ReferencedWr[]; suppressedPmOccurrences?: SuppressedPmOccurrence[]; deletedWorkRequests?: ReferencedWr[] };

function renameBlueprints<T extends PmState>(state: T, occupied = new Set<string>(), floor = 0): T {
  let high = Math.max(floor, 0, ...[...occupied].map((code) => Number(code.slice(3))), ...state.blueprints.map((bp) => Number(/^CB-(\d{4})-/.exec(bp.ChecklistCode)?.[1] ?? 0)));
  const map = new Map<string, string>(), families = new Map<string, string>();
  const familyHigh = Math.max(0, ...state.blueprints.map((bp) => Number(/^FAM-(\d+)$/.exec(bp.familyId ?? "")?.[1] ?? 0)));
  let familyNumber = familyHigh;
  const blueprints = state.blueprints.map((bp) => {
    let code = bp.ChecklistCode;
    if (/^CB-\d{4}-/.test(code) && !code.endsWith(`-${bp.frequencyCode}`)) throw new Error(`Blueprint ${code} does not match its locked frequency.`);
    if (!/^CB-(?!0000)\d{4}-(01D|01W|02W|01M|03M|06M|01Y|02Y|05Y|10Y)$/.test(code) || occupied.has(code.slice(0, 7))) {
      if (++high > 9999) throw new Error("Blueprint number range exhausted during migration.");
      code = `CB-${String(high).padStart(4, "0")}-${bp.frequencyCode}`;
    }
    occupied.add(code.slice(0, 7)); map.set(`${bp.SiteId}:${bp.ChecklistCode}`, code);
    let familyId = bp.familyId;
    if (familyId && !/^FAM-\d{3,}$/.test(familyId)) {
      const key = `${bp.SiteId}:${familyId}`;
      if (!families.has(key)) families.set(key, `FAM-${String(++familyNumber).padStart(3, "0")}`);
      familyId = families.get(key);
    }
    return { ...bp, ChecklistCode: code, familyId };
  });
  const codeFor = (site: unknown, code: unknown) => map.get(`${site}:${code}`) ?? code;
  const remapWr = <W extends ReferencedWr>(wr: W): W => {
    const record = wr as W & { ChecklistStandardCode?: string };
    return { ...wr, ...(record.ChecklistStandardCode ? { ChecklistStandardCode: codeFor(wr.SiteId, record.ChecklistStandardCode) } : {}),
      ChecklistInstances: Array.isArray(wr.ChecklistInstances) ? wr.ChecklistInstances.map((step: Record<string, unknown>) => ({ ...step, ChecklistCode: codeFor(wr.SiteId, step.ChecklistCode) })) : wr.ChecklistInstances };
  };
  return { ...state, blueprints, blueprintAuditLog: state.blueprintAuditLog?.map((entry) => ({ ...entry, blueprintCode: String(codeFor(entry.siteId, entry.blueprintCode)) })),
    schedules: state.schedules.map((order) => resolveBlueprintSchedule({ ...order, ChecklistCode: String(codeFor(order.SiteId, order.ChecklistCode)) }, blueprints)),
    workRequests: state.workRequests.map(remapWr), deletedWorkRequests: state.deletedWorkRequests?.map(remapWr) };
}

// Legacy fields are accepted at the boundary, then deterministically converted without rewriting executed checklist snapshots.
export function migratePmState<T extends PmState>(state: T): T {
  if (state.pmModelVersion === 60) {
    const blueprints = state.blueprints.map((item) => PM_ChecklistStandardSchema.parse(item));
    validateBlueprintFamilies(blueprints);
    const ids = new Set<string>(), assignments = new Set<string>(), anchors = new Map<string, string>();
    const schedules = state.schedules.map((item) => {
      const parsed = PM_ScheduleSchema.parse(item);
      const id = `${item.SiteId}:${item.ScheduleId}`;
      if (ids.has(id)) throw new Error(`Duplicate PMS order #${item.ScheduleId}.`);
      ids.add(id);
      const order = resolveBlueprintSchedule(parsed, blueprints);
      if (order.IsActive) {
        const assignment = `${order.SiteId}:${pmTargetKey(order)}:${order.ChecklistCode}`;
        if (assignments.has(assignment)) throw new Error(`Duplicate blueprint assignment for equipment ${order.EquipmentCodes[0]}.`);
        assignments.add(assignment);
        if (order.suppressionMode !== "independent") {
          const family = `${order.SiteId}:${pmTargetKey(order)}:${order.suppressionGroupKey}`;
          if (anchors.has(family) && anchors.get(family) !== order.anchorDate) throw new Error(`Family orders on ${order.EquipmentCodes[0]} must share one anchor date.`);
          anchors.set(family, order.anchorDate!);
        }
      }
      return order;
    });
    const normalized = schedules.map((order) => {
      if (!order.IsActive) return PM_ScheduleSchema.parse(order);
      const cycle = getPmCycle(order, schedules);
      const date = order.cycleDate ?? addCycleInterval(cycle.cycleDate, cycle.interval, cycle.unit);
      const peer = cycle.group.find((item) => item.cycleDate);
      const cycleDate = peer?.cycleDate ?? date;
      const peak = peer?.peakSlotIndex ?? cycle.peakSlotIndex;
      if (order.cycleDate && order.cycleDate !== cycleDate) throw new Error("Family PMS rows must share one Cycle Date.");
      if (order.peakSlotIndex !== undefined && order.peakSlotIndex !== peak) throw new Error("Family PMS rows must share one peak position.");
      const perYear = Math.max(1, cycle.visitsPerYear);
      return PM_ScheduleSchema.parse({ ...order, anchorDate: cycleDate, sharedAnchorDate: cycleDate, cycleDate, peakSlotIndex: peak,
        annualSlotIndex: cycle.unit === "months" ? (peak - 1) % perYear + 1 : undefined,
        peakYearIndex: cycle.unit === "months" ? Math.floor((peak - 1) / perYear) + 1 : undefined });
    });
    normalized.filter((order) => order.IsActive).forEach((order) => getPmCycle(order, normalized));
    return renameBlueprints({ ...state, blueprints, schedules: normalized });
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
    const ids: string[] = [];
    for (const equipment of old.EquipmentCodes.length ? old.EquipmentCodes : old.equipmentCode ? [old.equipmentCode] : [""]) {
      const retain = ids.length === 0 && /^(?!00000)\d{5}$/.test(old.ScheduleId);
      if (!retain && ++number > 99999) throw new Error("PMS order number range exhausted during migration.");
      const id = retain ? old.ScheduleId : String(number).padStart(5, "0");
      const blueprintId = blueprintMap.get(key(old.SiteId, old.ScheduleId)) ?? old.ChecklistCode;
      const blueprint = blueprints.find((item) => item.ChecklistCode === blueprintId && (!item.SiteId || item.SiteId === old.SiteId));
      if (!blueprint) throw new Error(`Missing blueprint for PMS ${old.ScheduleId}.`);
      const anchor = sharedFamilyAnchor(schedules, blueprints, equipment || pmTargetKey(old), blueprint) ?? old.anchorDate ?? old.sharedAnchorDate ?? old.NextDueDate.slice(0, 10);
      const duplicate = old.IsActive && schedules.some((item) => item.IsActive && item.SiteId === old.SiteId && item.ChecklistCode === blueprintId && item.EquipmentCodes.includes(equipment));
      if (duplicate) notes.push(`Legacy duplicate PMS ${old.ScheduleId} retained as inactive PMS #${id}; existing WR history is preserved.`);
      schedules.push(resolveBlueprintSchedule({ ...old, ScheduleId: id, ChecklistCode: blueprintId, EquipmentCodes: equipment ? [equipment] : [],
        anchorDate: anchor, cycleDate: old.cycleDate ?? (!old.anchorDate && !old.sharedAnchorDate ? anchor : undefined),
        IsActive: duplicate ? false : old.IsActive }, blueprints));
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
      return { ...log, id: lower ? `suppressed:${log.siteId}:${lower}:${log.targetType && log.targetType !== "equipment" ? log.targetKey : log.equipmentCode}:${log.dueDate}` : log.id,
        suppressedPmsId: lower,
        coveredByPmsId: log.coveredByPmsId ? String(mapId(log.siteId, log.coveredByPmsId, [log.equipmentCode])) : undefined };
    }) };
}

export function uniquePmsOrdersAcrossSites<T extends PmState>(states: T[]): T[] {
  const used = new Set<string>();
  const usedBlueprints = new Set<string>();
  const blueprintHigh = Math.max(0, ...states.flatMap((state) => state.blueprints.map((bp) => Number(/^CB-(\d{4})-/.exec(bp.ChecklistCode)?.[1] ?? 0))));
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
    const next = schedules.every((order, index) => order === state.schedules[index]) ? state :
      remapPmsReferences({ ...state, schedules, pmMigrationNotes: [...(state.pmMigrationNotes ?? []), "PMS order IDs were reallocated to avoid collisions with another site; all WR and compliance references were migrated."] },
        (site, id) => map.get(`${site}:${id}`) ?? id);
    return renameBlueprints(next, usedBlueprints, blueprintHigh);
  });
}
