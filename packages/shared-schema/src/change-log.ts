import { z } from "zod";

/**
 * V62 (MASTER_SPEC Section 112): dedicated change log.
 *
 * CHANGE_LOG_TYPES is the configurable list of "important" change kinds that can
 * be recorded in the change_log table. SuperAdmins toggle each rule in
 * ChangeLogSettings (per site); the appender in apps/web-portal/lib/change-log.ts
 * only emits entries whose rule is enabled.
 */
export const CHANGE_LOG_TYPES = [
  "location.rename",
  "workRequest.created",
  "workRequest.status",
  "workRequest.assignment",
  "equipment.status",
  "locationFreeze.change",
  "blueprint.change",
  "pmSchedule.change",
  "sla.change",
  "person.change",
] as const;

export type ChangeLogType = (typeof CHANGE_LOG_TYPES)[number];

export const CHANGE_LOG_TYPE_LABELS: Record<ChangeLogType, string> = {
  "location.rename": "Location rename (building / floor / room code)",
  "workRequest.created": "Work request created",
  "workRequest.status": "Work request status / % changed",
  "workRequest.assignment": "Work request craftsperson assignment changed",
  "equipment.status": "Equipment status changed",
  "locationFreeze.change": "Location freeze added / changed / removed",
  "blueprint.change": "PM blueprint (checklist) changed",
  "pmSchedule.change": "PM schedule changed",
  "sla.change": "SLA settings changed",
  "person.change": "Person (directory / access profile) changed",
};

/** One row of the change_log table. oldKey === newKey unless the record key itself was renamed. */
export const ChangeLogEntrySchema = z.object({
  id: z.string().min(1),
  siteId: z.string().min(1),
  changeType: z.enum(CHANGE_LOG_TYPES),
  /** State collection the change belongs to, e.g. "workRequests". */
  collection: z.string().min(1),
  /** Identity of the changed record (WR_ID, EquipmentCode, freeze id, ...). */
  recordKey: z.string().min(1),
  /** Old key: equals newKey except when the key itself was renamed. */
  oldKey: z.string().min(1),
  newKey: z.string().min(1),
  oldValue: z.string(),
  newValue: z.string(),
  modifiedBy: z.string().min(1),
  /** DD-MM-YYYY (house date format). */
  modifiedDate: z.string().min(1),
  /** HH:MM:SS local. */
  modifiedTime: z.string().min(1),
  /** ISO timestamp; ordering + id entropy. */
  at: z.string().min(1),
});

export type ChangeLogEntry = z.infer<typeof ChangeLogEntrySchema>;

export const ChangeLogRuleSchema = z.object({
  changeType: z.enum(CHANGE_LOG_TYPES),
  label: z.string().min(1),
  enabled: z.boolean(),
});

export const ChangeLogSettingsSchema = z.object({
  siteId: z.string().min(1),
  rules: z.array(ChangeLogRuleSchema),
});

export type ChangeLogRule = z.infer<typeof ChangeLogRuleSchema>;
export type ChangeLogSettings = z.infer<typeof ChangeLogSettingsSchema>;

/** Newest-first cap per site, mirroring LOCATION_RENAME_LOG_CAP. */
export const CHANGE_LOG_CAP = 500;

export function defaultChangeLogSettings(siteId: string): ChangeLogSettings {
  return {
    siteId,
    rules: CHANGE_LOG_TYPES.map((changeType) => ({ changeType, label: CHANGE_LOG_TYPE_LABELS[changeType], enabled: true })),
  };
}

export function isChangeTypeEnabled(settings: ChangeLogSettings | undefined, changeType: ChangeLogType): boolean {
  const rule = settings?.rules.find((item) => item.changeType === changeType);
  return rule ? rule.enabled : true; // default: log everything until configured otherwise
}
