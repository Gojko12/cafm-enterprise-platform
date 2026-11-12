import { z } from "zod";

export const UrgencyCodeSchema = z.enum(["SUPER_URGENT", "URGENT", "PRIORITY", "NORMAL", "LOW"]);
export type UrgencyCode = z.infer<typeof UrgencyCodeSchema>;

export const SlaClockModeSchema = z.enum(["24x7", "BUSINESS_DAYS"]);
export type SlaClockMode = z.infer<typeof SlaClockModeSchema>;

export const UrgencyLevelSchema = z.object({
  code: UrgencyCodeSchema,
  label: z.string().min(1),
  color: z.string().min(1),
  description: z.string().default(""),
  order: z.number().int(),
});
export type UrgencyLevel = z.infer<typeof UrgencyLevelSchema>;

export const SlaRuleSchema = z.object({
  targetValue: z.number().positive(),
  targetUnit: z.enum(["hours", "days"]),
  marginHoursOrDays: z.number().min(0).optional(),
  clockMode: SlaClockModeSchema,
  allowWeekendHolidayRequest: z.boolean(),
});
export type SlaRule = z.infer<typeof SlaRuleSchema>;

export const SlaHolidaySchema = z.object({
  date: z.string().regex(/^\d{2}-\d{2}-\d{4}$/),
  name: z.string().min(1),
});
export type SlaHoliday = z.infer<typeof SlaHolidaySchema>;

export const SiteSlaConfigSchema = z.object({
  siteId: z.string().min(1),
  urgencyLevels: z.array(UrgencyLevelSchema).min(1),
  // trade -> urgency code -> rule
  matrix: z.record(z.string(), z.record(z.string(), SlaRuleSchema)),
  holidays: z.array(SlaHolidaySchema).default([]),
  dissatisfactionRecipients: z.object({
    allTrades: z.array(z.string()).default([]),
    byTrade: z.record(z.string(), z.array(z.string())).default({}),
  }),
});
export type SiteSlaConfig = z.infer<typeof SiteSlaConfigSchema>;

export const DEFAULT_URGENCY_LEVELS: UrgencyLevel[] = [
  { code: "SUPER_URGENT", label: "Super Urgent", color: "#dc2626", description: "Safety or mission-critical failure; 24/7 call-out.", order: 1 },
  { code: "URGENT", label: "Urgent", color: "#f97316", description: "Significant disruption to operations.", order: 2 },
  { code: "PRIORITY", label: "Priority", color: "#eab308", description: "Needs attention ahead of routine work.", order: 3 },
  { code: "NORMAL", label: "Normal", color: "#22c55e", description: "Standard corrective request.", order: 4 },
  { code: "LOW", label: "Low", color: "#64748b", description: "Cosmetic or non-disruptive.", order: 5 },
];

export const DEFAULT_SLA_RULES: Record<UrgencyCode, SlaRule> = {
  SUPER_URGENT: { targetValue: 4, targetUnit: "hours", marginHoursOrDays: 1, clockMode: "24x7", allowWeekendHolidayRequest: true },
  URGENT: { targetValue: 1, targetUnit: "days", marginHoursOrDays: 0.5, clockMode: "BUSINESS_DAYS", allowWeekendHolidayRequest: false },
  PRIORITY: { targetValue: 2, targetUnit: "days", marginHoursOrDays: 1, clockMode: "BUSINESS_DAYS", allowWeekendHolidayRequest: false },
  NORMAL: { targetValue: 5, targetUnit: "days", marginHoursOrDays: 1, clockMode: "BUSINESS_DAYS", allowWeekendHolidayRequest: false },
  LOW: { targetValue: 10, targetUnit: "days", marginHoursOrDays: 2, clockMode: "BUSINESS_DAYS", allowWeekendHolidayRequest: false },
};

export const SLA_TRADES = ["Mechanical", "Electrical", "Civil", "MultiTechnic", "Cleaning", "HeavyGang", "Catering"] as const;

export function defaultSiteSlaConfig(siteId: string): SiteSlaConfig {
  return {
    siteId,
    urgencyLevels: DEFAULT_URGENCY_LEVELS.map((level) => ({ ...level })),
    matrix: Object.fromEntries(SLA_TRADES.map((trade) => [trade, Object.fromEntries(
      UrgencyCodeSchema.options.map((code) => [code, { ...DEFAULT_SLA_RULES[code] }]))])),
    holidays: [
      { date: "01-01-2026", name: "New Year's Day" },
      { date: "03-04-2026", name: "Good Friday" },
      { date: "06-04-2026", name: "Easter Monday" },
      { date: "01-05-2026", name: "Labour Day" },
      { date: "25-12-2026", name: "Christmas Day" },
      { date: "26-12-2026", name: "Boxing Day" },
    ],
    dissatisfactionRecipients: { allTrades: [], byTrade: {} },
  };
}

export const SatisfactionFollowUpStatusSchema = z.enum(["Needs_Follow_Up", "Contacted", "In_Progress", "Resolved"]);
export type SatisfactionFollowUpStatus = z.infer<typeof SatisfactionFollowUpStatusSchema>;

export const FollowUpNoteSchema = z.object({
  id: z.string(),
  at: z.string(),
  by: z.string(),
  method: z.enum(["Phone Call", "Email Sent", "In-Person", "Internal Note"]),
  status: SatisfactionFollowUpStatusSchema,
  text: z.string(),
});
export type FollowUpNote = z.infer<typeof FollowUpNoteSchema>;

export const SatisfactionSurveyRecordSchema = z.object({
  token: z.string(),
  status: z.enum(["Sent_Pending", "Answered"]),
  sentAt: z.string(),
  sentToEmail: z.string().optional(),
  satisfactionStatus: z.enum(["Satisfied", "Dissatisfied"]).optional(),
  ratingStars: z.number().int().min(1).max(5).optional(),
  feedbackText: z.string().optional(),
  feedbackAt: z.string().optional(),
  followUpStatus: SatisfactionFollowUpStatusSchema.optional(),
  notifiedRecipients: z.array(z.string()).default([]),
  followUpNotes: z.array(FollowUpNoteSchema).default([]),
});
export type SatisfactionSurveyRecord = z.infer<typeof SatisfactionSurveyRecordSchema>;
