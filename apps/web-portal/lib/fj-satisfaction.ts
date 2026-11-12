import type { BaseWorkRequest, SatisfactionFollowUpStatus, SatisfactionSurveyRecord, SiteSlaConfig } from "@cafm/shared-schema";
import { defaultSiteSlaConfig } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { toLocalIso } from "./fj-sla";

export const SEEDED_DISSATISFACTION_RECIPIENTS = {
  allTrades: ["yvonne.becker@esa.example", "mark.meyer@esa.example"],
  byTrade: { Electrical: ["lukas.weber@esa.example"], Mechanical: ["claudia.fischer@esa.example"] } as Record<string, string[]>,
};

export function getSiteSlaConfig(data: Pick<DemoData, "siteSlaConfig">, siteId: string): SiteSlaConfig {
  if (data.siteSlaConfig) return data.siteSlaConfig;
  const config = defaultSiteSlaConfig(siteId);
  return { ...config, dissatisfactionRecipients: { allTrades: [...SEEDED_DISSATISFACTION_RECIPIENTS.allTrades], byTrade: { ...SEEDED_DISSATISFACTION_RECIPIENTS.byTrade } } };
}

export const isCompletedFj = (wr: BaseWorkRequest) => wr.WR_Type === "FJ" && wr.Percentage >= 78 && wr.Percentage <= 100 && wr.WorkRequestStatus !== "Cancelled";

export function newSurvey(wr: BaseWorkRequest, nowIso: string): SatisfactionSurveyRecord {
  return {
    token: `${wr.WR_ID}-${Math.random().toString(36).slice(2, 10)}`.toLowerCase(),
    status: "Sent_Pending", sentAt: nowIso, sentToEmail: wr.RequestorEmail, notifiedRecipients: [], followUpNotes: [],
  };
}

// Idempotent: only FJs at 78%/100% without a survey receive one; returns the same object when nothing changes.
export function ensureFjSurveys(data: DemoData): DemoData {
  if (!data.workRequests.some((wr) => isCompletedFj(wr) && !wr.Satisfaction)) return data;
  const now = new Date().toISOString();
  return { ...data, workRequests: data.workRequests.map((wr) => isCompletedFj(wr) && !wr.Satisfaction ? { ...wr, Satisfaction: newSurvey(wr, now) } : wr) };
}

export function resolveDissatisfactionRecipients(config: SiteSlaConfig, trade: string | undefined): string[] {
  const recipients = config.dissatisfactionRecipients;
  return [...new Set([...recipients.allTrades, ...(trade ? recipients.byTrade[trade] ?? [] : [])].map((item) => item.trim()).filter(Boolean))];
}

export function recipientLabel(data: Pick<DemoData, "userAccessProfiles">, email: string): string {
  const profile = data.userAccessProfiles.find((item) => item.email?.toLowerCase() === email.toLowerCase());
  return profile ? `${profile.fullName} <${email}>` : email;
}

export interface SurveyResponse { satisfied: boolean; stars: number; feedback: string }

export function submitSurveyResponse(data: DemoData, wrId: string, response: SurveyResponse, now = new Date()): DemoData {
  const target = data.workRequests.find((wr) => wr.WR_ID === wrId);
  if (!target) return data;
  const iso = now.toISOString();
  const config = getSiteSlaConfig(data, target.SiteId);
  const recipients = response.satisfied ? [] : resolveDissatisfactionRecipients(config, target.TradeName ?? target.TradeId);
  const survey = target.Satisfaction ?? newSurvey(target, iso);
  const record: SatisfactionSurveyRecord = {
    ...survey, status: "Answered", satisfactionStatus: response.satisfied ? "Satisfied" : "Dissatisfied",
    ratingStars: Math.max(1, Math.min(5, Math.round(response.stars))), feedbackText: response.feedback.trim() || undefined, feedbackAt: iso,
    followUpStatus: response.satisfied ? undefined : "Needs_Follow_Up", notifiedRecipients: recipients,
  };
  const notifications = recipients.map((recipient) => ({
    id: `fjn-${wrId}-${recipient}`, wrId, recipient, createdAt: iso, kind: "FJ_DISSATISFACTION" as const,
    message: `Requestor ${target.RequestorName ?? "unknown"} rated ${wrId} ${record.ratingStars}/5 — Service Not OK.`, read: false,
  }));
  return {
    ...data,
    workRequests: data.workRequests.map((wr) => wr.WR_ID === wrId ? { ...wr, Satisfaction: record, UpdatedAt: iso } : wr),
    fjNotifications: [...(data.fjNotifications ?? []).filter((item) => !(item.wrId === wrId && recipients.includes(item.recipient))), ...notifications],
  };
}

export function addFollowUpNote(data: DemoData, wrId: string, note: { by: string; method: "Phone Call" | "Email Sent" | "In-Person" | "Internal Note"; status: SatisfactionFollowUpStatus; text: string }): DemoData {
  const now = toLocalIso(new Date());
  return { ...data, workRequests: data.workRequests.map((wr) => wr.WR_ID !== wrId || !wr.Satisfaction ? wr : {
    ...wr, UpdatedAt: new Date().toISOString(),
    Satisfaction: { ...wr.Satisfaction, followUpStatus: note.status, followUpNotes: [...wr.Satisfaction.followUpNotes, { id: crypto.randomUUID(), at: now, ...note }] },
  }) };
}

export const isDissatisfied = (wr: BaseWorkRequest) => wr.WR_Type === "FJ" && wr.Satisfaction?.satisfactionStatus === "Dissatisfied";
