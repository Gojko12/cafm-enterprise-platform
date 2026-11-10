"use client";

import React from "react";
import { formatDateTimeDDMMYYYY } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";

export function QAReportNotifications() {
  const { data } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const profile = data.userAccessProfiles.find((item) => item.siteId === activeSiteId && item.personName === activePerson);
  const identities = [activePerson, profile?.fullName, profile?.email].filter((value): value is string => !!value).map((value) => value.trim().toLowerCase());
  const reports = (data.qaAuditReports ?? []).filter((report) => report.siteId === activeSiteId && report.recipients.some((recipient) => identities.includes(recipient.trim().toLowerCase())));
  if (!reports.length) return null;
  return <section className="rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-950"><h2 className="font-bold">📣 QA Reports Addressed to You ({reports.length})</h2>{reports.slice().reverse().map((report) => <p key={report.id}>{formatDateTimeDDMMYYYY(report.createdAt)} · {report.inspector} · {report.passedCount} passed / {report.failedCount} failed {report.executiveSummary && `· ${report.executiveSummary}`} · <a className="underline" href="/technical-audits?tab=analytics">View report archive</a></p>)}</section>;
}
