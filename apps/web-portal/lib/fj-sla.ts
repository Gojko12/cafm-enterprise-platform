import type { SiteSlaConfig, SlaRule, UrgencyCode, UrgencyLevel } from "@cafm/shared-schema";
import { defaultSiteSlaConfig } from "@cafm/shared-schema";

export const WEEKEND_HOLIDAY_WARNING =
  "This urgency level cannot be dispatched during weekends/holidays (only Super Urgent / enabled SLAs allow weekend/holiday call-out). SLA clock starts next business day at 08:00.";

const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 17;

export interface SlaComputation {
  rule: SlaRule;
  level?: UrgencyLevel;
  trade: string;
  urgencyCode: UrgencyCode;
  createdAt: string;
  startAt: string;
  dueAt: string;
  marginAt: string;
  weekendOrHoliday: boolean;
  deferredToNextBusinessDay: boolean;
  warning?: string;
  targetLabel: string;
}

const pad = (value: number) => String(value).padStart(2, "0");
export const toLocalIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const holidayKey = (date: Date) => `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;

export function isHoliday(date: Date, config: SiteSlaConfig): boolean {
  const key = holidayKey(date);
  return config.holidays.some((holiday) => holiday.date === key);
}
export function isWeekend(date: Date): boolean {
  return date.getDay() === 0 || date.getDay() === 6;
}
export function isBusinessDay(date: Date, config: SiteSlaConfig): boolean {
  return !isWeekend(date) && !isHoliday(date, config);
}
export function nextBusinessMorning(from: Date, config: SiteSlaConfig): Date {
  const next = new Date(from.getFullYear(), from.getMonth(), from.getDate(), BUSINESS_START_HOUR, 0, 0, 0);
  do { next.setDate(next.getDate() + 1); } while (!isBusinessDay(next, config));
  return next;
}

function addBusinessDays(start: Date, days: number, config: SiteSlaConfig): Date {
  const result = new Date(start);
  let remaining = Math.ceil(days);
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result, config)) remaining -= 1;
  }
  return result;
}

// Adds working minutes inside the 08:00-17:00 window of business days.
function addBusinessMinutes(start: Date, minutes: number, config: SiteSlaConfig): Date {
  const result = new Date(start);
  let remaining = minutes;
  const normalize = () => {
    if (!isBusinessDay(result, config) || result.getHours() >= BUSINESS_END_HOUR) {
      result.setTime(nextBusinessMorning(result, config).getTime());
    } else if (result.getHours() < BUSINESS_START_HOUR) {
      result.setHours(BUSINESS_START_HOUR, 0, 0, 0);
    }
  };
  normalize();
  while (remaining > 0) {
    const endOfDay = new Date(result);
    endOfDay.setHours(BUSINESS_END_HOUR, 0, 0, 0);
    const available = Math.max(0, (endOfDay.getTime() - result.getTime()) / 60000);
    if (remaining <= available) { result.setTime(result.getTime() + remaining * 60000); remaining = 0; }
    else { remaining -= available; result.setTime(endOfDay.getTime()); normalize(); }
  }
  return result;
}

function addDuration(start: Date, value: number, unit: "hours" | "days", mode: SlaRule["clockMode"], config: SiteSlaConfig): Date {
  if (mode === "24x7") return new Date(start.getTime() + value * (unit === "hours" ? 3600000 : 86400000));
  if (unit === "days") {
    const whole = Math.floor(value);
    const base = whole > 0 ? addBusinessDays(start, whole, config) : new Date(start);
    const fraction = value - whole;
    return fraction > 0 ? addBusinessMinutes(base, fraction * 9 * 60, config) : base;
  }
  return addBusinessMinutes(start, value * 60, config);
}

export function describeRule(rule: SlaRule): string {
  return `${rule.targetValue} ${rule.targetUnit === "hours" ? (rule.targetValue === 1 ? "hour" : "hours") : (rule.targetValue === 1 ? "day" : "days")} · ${rule.clockMode === "24x7" ? "24/7" : "business days"}`;
}

export function findSlaRule(config: SiteSlaConfig, trade: string, urgencyCode: UrgencyCode): SlaRule {
  const fallback = defaultSiteSlaConfig(config.siteId);
  return config.matrix[trade]?.[urgencyCode] ?? fallback.matrix.Mechanical[urgencyCode];
}

export function computeFjSla(config: SiteSlaConfig, trade: string, urgencyCode: UrgencyCode, createdAtIso: string, options: { deferToNextBusinessDay?: boolean } = {}): SlaComputation {
  const rule = findSlaRule(config, trade, urgencyCode);
  const created = new Date(createdAtIso);
  const valid = Number.isFinite(created.getTime()) ? created : new Date();
  const offHours = !isBusinessDay(valid, config);
  const needsDeferral = offHours && !rule.allowWeekendHolidayRequest;
  const deferred = needsDeferral && options.deferToNextBusinessDay !== false;
  const start = deferred ? nextBusinessMorning(valid, config) : valid;
  const due = addDuration(start, rule.targetValue, rule.targetUnit, rule.clockMode, config);
  const marginValue = rule.marginHoursOrDays ?? 0;
  const margin = marginValue > 0 ? addDuration(due, marginValue, rule.targetUnit, rule.clockMode, config) : due;
  return {
    rule, level: config.urgencyLevels.find((item) => item.code === urgencyCode), trade, urgencyCode,
    createdAt: toLocalIso(valid), startAt: toLocalIso(start), dueAt: toLocalIso(due), marginAt: toLocalIso(margin),
    weekendOrHoliday: offHours, deferredToNextBusinessDay: deferred,
    warning: needsDeferral ? WEEKEND_HOLIDAY_WARNING : undefined,
    targetLabel: `${config.urgencyLevels.find((item) => item.code === urgencyCode)?.label ?? urgencyCode} (${describeRule(rule)})`,
  };
}

// Only the date part is stored for day-based SLAs; hourly SLAs retain HH:mm precision.
export function slaStoredDate(isoLocal: string, rule: SlaRule): string {
  return rule.targetUnit === "hours" ? isoLocal : isoLocal.slice(0, 10);
}
