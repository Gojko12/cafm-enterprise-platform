import { notify } from "../lib/toast";
import React, { useState, useEffect } from "react";
import { BaseWorkRequest } from "@cafm/shared-schema";
import { WRPreviewCard } from "./WRPreviewCard";
import { isOverdue, localDateTime, scheduledSlot } from "../../../web-portal/lib/field-updates";
import { wallMinutes } from "../../../web-portal/lib/dispatch";
import { formatPlannedRange } from "../lib/human-time";

interface TechnicianHomeProps {
  myWRs: BaseWorkRequest[];
  unassignedWRs: BaseWorkRequest[];
  onClaimWR?: (wrId: string) => Promise<void>;
  onOpenWR?: (wrId: string) => void;
  onReport: (wrId: string) => void;
  technician: string;
  now: number;
  filterControl?: React.ReactNode;
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
}) => {
  const [activeTab, setActiveTab] = useState<"my-wrs" | "unassigned">("my-wrs");
  const [type, setType] = useState<"All" | "PM" | "FJ" | "LJ">("All");
  const [showClaimToast, setShowClaimToast] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [agenda, setAgenda] = useState<"agenda" | "overdue" | "today" | "upcoming" | "all">("agenda");

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
  const typed = (activeTab === "my-wrs" ? myWRs : unassignedWRs).filter((wr) => type === "All" || wr.WR_Type === type);
  const dateOf = (wr: BaseWorkRequest) => scheduledSlot(wr, technician)?.assignedStartDateTime.slice(0, 10) ?? wr.StartDate_DateToPerform;
  const overdue = (wr: BaseWorkRequest) => isOverdue(wr, new Date(now), technician);
  const displayWRs = typed.filter((wr) => agenda === "agenda" || agenda === "all" || (agenda === "overdue" ? overdue(wr) : agenda === "today" ? dateOf(wr) === currentDate : !!dateOf(wr) && dateOf(wr)! > currentDate));
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

  return (
    <div className="flex flex-col h-full mobile-technician-home">
      {/* Tab Switcher */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-30">
        <div className="flex items-center gap-2 px-3">
          <button
            onClick={() => setActiveTab("my-wrs")}
            className={`py-3 px-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "my-wrs"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
            aria-selected={activeTab === "my-wrs"}
          >
            My WRs ({myWRs.length})
          </button>
          <button
            onClick={() => setActiveTab("unassigned")}
            className={`py-3 px-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "unassigned"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
            aria-selected={activeTab === "unassigned"}
          >
            Unassigned ({unassignedWRs.length})
          </button>
          <div className="ml-auto">{filterControl}</div>
        </div>
        <div className="flex gap-2 overflow-x-auto bg-white px-4 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"><button className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${agenda === "all" ? "bg-blue-600 text-white" : "bg-slate-100"}`} onClick={() => { setAgenda("all"); setType("All"); }}>All</button><button className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${agenda === "overdue" ? "bg-blue-600 text-white" : "bg-slate-100"}`} onClick={() => setAgenda("overdue")}>🚨 Overdue</button><button className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${agenda === "today" ? "bg-blue-600 text-white" : "bg-slate-100"}`} onClick={() => setAgenda("today")}>📅 Today</button>{(["PM", "FJ", "LJ"] as const).map((item) => <button key={item} aria-pressed={type === item} onClick={() => setType(item)} className={`rounded-full px-3 py-1 text-sm ${type === item ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>{item}</button>)}</div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-20">
        {isEmptyState ? (
          <div className="flex items-center justify-center h-64">
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
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            {orderedGroups.map(([label, requests]) => <section key={label}>{label && <h3 className="mb-2 mt-3 font-bold">{label}</h3>}{requests.map((wr) => (
              <div key={wr.WR_ID} className={`relative ${activeTab === "my-wrs" && overdue(wr) ? "mb-3 rounded-lg border-2 border-rose-500 bg-rose-50" : ""}`}>
                {activeTab === "my-wrs" && overdue(wr) && <div className="rounded-t border-2 border-rose-500 bg-rose-50 p-2 text-sm text-rose-900"><strong>⏰ SHOULD BE DONE BY {scheduledSlot(wr, technician)?.assignedEndDateTime ?? wr.StartDate_DateToPerform} — Still Open ({wr.Percentage}%)</strong><button className="ml-2 underline" onClick={() => onReport(wr.WR_ID)}>🚩 Explain Delay / Push to Team Leader</button></div>}
                {activeTab === "my-wrs" && !overdue(wr) && dateOf(wr) && (() => { const slot = scheduledSlot(wr, technician); const today = dateOf(wr) === currentDate; const inTodaySection = today && agenda !== "all"; const range = slot ? formatPlannedRange(slot.assignedStartDateTime, slot.assignedEndDateTime, new Date(now)) : dateOf(wr); const prefix = today ? (inTodaySection ? "?? " : "?? Planned Today: ") : "?? Can start early anytime: "; return <div className="rounded-t bg-blue-50 p-2 text-sm text-blue-900">{prefix}{range}</div>; })()}
                <WRPreviewCard
                  wr={wr}
                  onClick={() => onOpenWR?.(wr.WR_ID || "")}
                />
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
