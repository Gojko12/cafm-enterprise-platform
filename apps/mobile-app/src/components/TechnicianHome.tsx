import { notify } from "../lib/toast";
import React, { useState, useEffect } from "react";
import { BaseWorkRequest } from "@cafm/shared-schema";
import type { LocationFreeze } from "@cafm/shared-schema";
import { formatFreezePeriodWindow, getWorkRequestFreezes, localNowIso } from "../../../web-portal/lib/location-freezes";
import { WRPreviewCard } from "./WRPreviewCard";
import { isOverdue, localDateTime, scheduledSlot } from "../../../web-portal/lib/field-updates";
import { wallMinutes } from "../../../web-portal/lib/dispatch";
import { formatPlannedRange, formatShortDateTime } from "../lib/human-time";
import { TechnicianCalendarView } from "./TechnicianCalendarView";

interface TechnicianHomeProps {
  myWRs: BaseWorkRequest[];
  unassignedWRs: BaseWorkRequest[];
  onClaimWR?: (wrId: string) => Promise<void>;
  onOpenWR?: (wrId: string) => void;
  onReport: (wrId: string) => void;
  technician: string;
  now: number;
  filterControl?: React.ReactNode;
  resetSignal?: number;
  menuButton?: React.ReactNode;
  onTabChange?: (tab: "my-wrs" | "unassigned") => void;
  agenda?: Agenda;
  onAgendaChange?: (agenda: Agenda) => void;
  freezes?: LocationFreeze[];
  viewMode?: "card" | "compact";
  layout?: WrLayout;
  onLayoutChange?: (layout: WrLayout) => void;
  onResetFilters?: () => void;
}

export type Agenda = "agenda" | "overdue" | "today" | "upcoming" | "all";
export type WrLayout = "list" | "calendar";
export const WR_LAYOUT_KEY = "cafm_mobile_wr_layout";
export function readWrLayout(): WrLayout {
  try { return localStorage.getItem(WR_LAYOUT_KEY) === "calendar" ? "calendar" : "list"; } catch { return "list"; }
}
export const WR_VIEW_MODE_KEY = "cafm_mobile_wr_view_mode";
export function readWrViewMode(): "card" | "compact" {
  try { return localStorage.getItem(WR_VIEW_MODE_KEY) === "compact" ? "compact" : "card"; } catch { return "card"; }
}

export const TechnicianHome: React.FC<TechnicianHomeProps> = ({
  myWRs,
  unassignedWRs,
  onClaimWR,
  onOpenWR,
  onReport,
  technician,
  now,
  filterControl,
  resetSignal = 0,
  menuButton,
  onTabChange,
  agenda: agendaProp,
  onAgendaChange,
  freezes = [],
  viewMode = "card",
  layout = "list",
  onLayoutChange,
  onResetFilters,
}) => {
  const [activeTab, setActiveTabState] = useState<"my-wrs" | "unassigned">("my-wrs");
  const setActiveTab = (next: "my-wrs" | "unassigned") => { setActiveTabState(next); onTabChange?.(next); };
  const [showClaimToast, setShowClaimToast] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [agendaState, setAgendaState] = useState<Agenda>("agenda");
  const agenda = agendaProp ?? agendaState;
  const setAgenda = (next: Agenda) => { setAgendaState(next); onAgendaChange?.(next); };
  useEffect(() => { if (resetSignal) { setAgenda("agenda"); } }, [resetSignal]);

  const handleClaimWR = async (wrId: string) => {
    if (onClaimWR) {
      try { await onClaimWR(wrId); }
      catch (error) { notify(error instanceof Error ? error.message : "Could not claim the work request."); return; }
      setClaimMessage(`WR ${wrId} claimed successfully`);
      setShowClaimToast(true);
      setTimeout(() => setShowClaimToast(false), 3000);
    }
  };

  const currentDate = localDateTime(new Date(now)).slice(0, 10);
  const typed = activeTab === "my-wrs" ? myWRs : unassignedWRs;
  const dateOf = (wr: BaseWorkRequest) => scheduledSlot(wr, technician)?.assignedStartDateTime.slice(0, 10) ?? wr.StartDate_DateToPerform;
  const overdue = (wr: BaseWorkRequest) => isOverdue(wr, new Date(now), technician);
  const displayWRs = typed;
  const myCount = myWRs.length;
  const unassignedCount = unassignedWRs.length;
  const group = (wr: BaseWorkRequest) => {
    if (overdue(wr)) return "🚨 Overdue / Behind Planned Schedule";
    const date = dateOf(wr);
    if (date === currentDate) return "📅 Scheduled for Today";
    if (date && date > currentDate) {
      const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
      return date === localDateTime(tomorrow).slice(0, 10) ? "⏭ Tomorrow" : `⏭ ${date}`;
    }
    return date ? `📅 Scheduled ${date}` : "📂 Unscheduled / Flexible Assigned WRs";
  };
  const groups = new Map<string, BaseWorkRequest[]>();
  const sorted = [...displayWRs].sort((a, b) => (scheduledSlot(a, technician)?.assignedStartDateTime ?? dateOf(a) ?? "9999").localeCompare(scheduledSlot(b, technician)?.assignedStartDateTime ?? dateOf(b) ?? "9999"));
  for (const wr of sorted) { const key = activeTab === "my-wrs" && agenda !== "all" ? group(wr) : ""; groups.set(key, [...(groups.get(key) ?? []), wr]); }
  const orderedGroups = [...groups.entries()].sort(([a], [b]) => (a.startsWith("🚨") ? -1 : b.startsWith("🚨") ? 1 : a.startsWith("📂") ? 1 : b.startsWith("📂") ? -1 : 0));
  const isEmptyState = displayWRs.length === 0;
  const freezesFor = (wr: BaseWorkRequest) => getWorkRequestFreezes(wr, freezes, localNowIso());
  const compactRow = (wr: BaseWorkRequest) => {
    const slot = scheduledSlot(wr, technician);
    const late = activeTab === "my-wrs" && overdue(wr);
    const frozen = freezesFor(wr).length > 0;
    const due = slot ? formatShortDateTime(slot.assignedEndDateTime) : wr.StartDate_DateToPerform ? formatShortDateTime(wr.StartDate_DateToPerform) : "Unscheduled";
    const time = slot ? slot.assignedStartDateTime.slice(11, 16) : "";
    const pill = "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold";
    return <div key={wr.WR_ID} role="button" tabIndex={0} onClick={() => onOpenWR?.(wr.WR_ID || "")} onKeyDown={(event) => { if (event.key === "Enter") onOpenWR?.(wr.WR_ID || ""); }} className={`mb-1.5 cursor-pointer rounded-xl border bg-white px-3 py-2 shadow-2xs ${late ? "border-rose-300" : "border-slate-200"}`}>
      <div className="flex items-center gap-1.5">
        <span className={`${pill} bg-slate-800 text-white`}>{wr.WR_Type}</span>
        <span className={`${pill} bg-blue-100 text-blue-800`}>{wr.Percentage}%</span>
        <span className="shrink-0 text-xs font-bold">{wr.WR_ID}</span>
        {wr.CraftpersonAssignments?.some((item) => item.autoScheduledFromPmsId) && <span className={`${pill} bg-violet-100 text-violet-800`}>🔁 Auto-PMS</span>}
        <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{wr.Description}</span>
        {activeTab === "unassigned" && onClaimWR
          ? <button type="button" aria-label={`Claim ${wr.WR_ID}`} onClick={(event) => { event.stopPropagation(); void handleClaimWR(wr.WR_ID || ""); }} className="shrink-0 rounded-lg bg-green-600 px-2 py-0.5 text-[11px] font-bold text-white">Claim</button>
          : late ? <span className={`${pill} bg-rose-100 text-rose-800`}>Overdue</span>
          : frozen ? <span className={`${pill} bg-sky-100 text-sky-800`}>Freeze</span>
          : time ? <span className="shrink-0 text-[11px] font-medium text-slate-600">{time}</span> : null}
      </div>
      <p className="mt-0.5 truncate text-[11px] text-slate-500">{[[wr.bl_id, wr.RoomCode].filter(Boolean).join(" / "), wr.EquipmentCodes?.[0], wr.TradeName, due].filter(Boolean).join(" · ")}</p>
    </div>;
  };

  return (
    <div className="flex flex-col h-full mobile-technician-home">
      {/* Tab Switcher */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-30">
        <div className="flex min-w-0 items-center gap-1 px-2">
          {menuButton}
          <button
            onClick={() => setActiveTab("my-wrs")}
            className={`shrink-0 whitespace-nowrap py-3 px-1 font-medium text-xs border-b-2 transition-colors ${
              activeTab === "my-wrs"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
            aria-selected={activeTab === "my-wrs"}
          >
            My WRs ({myCount})
          </button>
          <button
            onClick={() => setActiveTab("unassigned")}
            className={`shrink-0 whitespace-nowrap py-3 px-1 font-medium text-xs border-b-2 transition-colors ${
              activeTab === "unassigned"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
            aria-selected={activeTab === "unassigned"}
          >
            <span className="hidden min-[380px]:inline">Unassigned</span><span className="min-[380px]:hidden">Pool</span> ({unassignedCount})
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <div role="group" aria-label="WR layout" className="flex overflow-hidden rounded-lg border border-slate-300">
              <button type="button" aria-label="List view" aria-pressed={layout === "list"} title="List" onClick={() => onLayoutChange?.("list")} className={`flex h-9 shrink-0 items-center px-2 ${layout === "list" ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" /></svg></button>
              <button type="button" aria-label="Calendar view" aria-pressed={layout === "calendar"} title="Calendar" onClick={() => onLayoutChange?.("calendar")} className={`flex h-9 shrink-0 items-center px-2 ${layout === "calendar" ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="1" /><path d="M5 1v4M11 1v4M2 7h12M5 10h2M9 10h2" /></svg></button>
            </div>
            {filterControl}
          </div>
        </div>
      </div>


      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-20">
        {layout === "calendar" ? (
          <TechnicianCalendarView wrs={displayWRs} technician={technician} now={now} freezes={freezes} onOpenWR={onOpenWR} onResetFilters={onResetFilters} />
        ) : isEmptyState ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <p className="text-gray-500 text-lg font-medium mb-2">
                {activeTab === "my-wrs"
                  ? "No assigned work requests"
                  : "No unassigned work requests"}
              </p>
              <p className="text-gray-400 text-sm">
                {activeTab === "my-wrs"
                  ? "Check back later for new assignments"
                  : "Browse My WRs to get started"}
              </p>
              <button type="button" className="mt-3 rounded-lg border px-3 py-2 text-sm text-blue-700" onClick={onResetFilters}>Reset Filters</button>
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            {orderedGroups.map(([label, requests]) => <section key={label}>{label && <h3 className="mb-2 mt-3 font-bold">{label}</h3>}{requests.map((wr) => viewMode === "compact" ? compactRow(wr) : (
              <div key={wr.WR_ID} className={`relative ${activeTab === "my-wrs" && overdue(wr) ? "mb-3 rounded-lg border-2 border-rose-500 bg-rose-50" : ""}`}>
                {activeTab === "my-wrs" && overdue(wr) && <div className="rounded-t border-2 border-rose-500 bg-rose-50 p-2 text-sm text-rose-900"><strong>⏰ SHOULD BE DONE BY {formatShortDateTime(scheduledSlot(wr, technician)?.assignedEndDateTime ?? wr.StartDate_DateToPerform)} — Still Open ({wr.Percentage}%)</strong><button className="ml-2 underline" onClick={() => onReport(wr.WR_ID)}>🚩 Explain Delay / Push to Team Leader</button></div>}
                {activeTab === "my-wrs" && !overdue(wr) && dateOf(wr) && (() => { const slot = scheduledSlot(wr, technician); const today = dateOf(wr) === currentDate; const inTodaySection = today && agenda !== "all"; const range = slot ? formatPlannedRange(slot.assignedStartDateTime, slot.assignedEndDateTime, new Date(now)) : dateOf(wr); const prefix = today ? (inTodaySection ? "\ud83d\udd50 " : "\ud83d\udd50 Planned Today: ") : "\ud83d\udd50 Can start early anytime: "; return <div className="rounded-t bg-blue-50 p-2 text-sm text-blue-900">{prefix}{range}</div>; })()}
                {wr.CraftpersonAssignments?.some((item) => item.autoScheduledFromPmsId) && <div className="rounded-t bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800">🔁 Auto-PMS · scheduled automatically by its PMS rule</div>}
                <WRPreviewCard
                  wr={wr}
                  onClick={() => onOpenWR?.(wr.WR_ID || "")}
                />
                {freezesFor(wr).length > 0 && <div className="mb-2 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-900"><strong>❄ Freeze Period</strong> · {freezesFor(wr)[0].title} · {formatFreezePeriodWindow(freezesFor(wr)[0].startDateTime, freezesFor(wr)[0].endDateTime, new Date(now))}</div>}
                {(wr.technicianFieldUpdates ?? []).filter((item) => item.craftpersonId === technician && item.teamLeaderReply).map((item) => <p key={item.id} className="mb-2 rounded bg-blue-50 p-2 text-sm">💬 Team Leader ({item.status}): {item.teamLeaderReply}</p>)}

                {/* Claim Button for Unassigned */}
                {activeTab === "unassigned" && onClaimWR && (
                  <button
                    onClick={() => void handleClaimWR(wr.WR_ID || "")}
                    className="absolute bottom-4 right-4 px-4 py-2 bg-green-500 text-white text-xs font-bold rounded hover:bg-green-600 transition-colors"
                    aria-label={`Claim ${wr.WR_ID}`}
                  >
                    Claim
                  </button>
                )}
              </div>
            ))}</section>)}
          </div>
        )}
      </div>

      {/* Claim Toast Notification */}
      {showClaimToast && (
        <div className="fixed bottom-24 left-4 right-4 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg animation-slide-up z-50">
          {claimMessage}
        </div>
      )}
    </div>
  );
};
