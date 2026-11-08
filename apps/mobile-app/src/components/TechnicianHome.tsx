import React, { useState, useEffect } from "react";
import { BaseWorkRequest } from "@cafm/shared-schema";
import { WRPreviewCard } from "./WRPreviewCard";

interface TechnicianHomeProps {
  myWRs: BaseWorkRequest[];
  unassignedWRs: BaseWorkRequest[];
  onClaimWR?: (wrId: string) => Promise<void>;
  onOpenWR?: (wrId: string) => void;
}

export const TechnicianHome: React.FC<TechnicianHomeProps> = ({
  myWRs,
  unassignedWRs,
  onClaimWR,
  onOpenWR,
}) => {
  const [activeTab, setActiveTab] = useState<"my-wrs" | "unassigned">("my-wrs");
  const [type, setType] = useState<"All" | "PM" | "FJ" | "LJ">("All");
  const [showClaimToast, setShowClaimToast] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");

  const handleClaimWR = async (wrId: string) => {
    if (onClaimWR) {
      try { await onClaimWR(wrId); }
      catch (error) { alert(error instanceof Error ? error.message : "Could not claim the work request."); return; }
      setClaimMessage(`WR ${wrId} claimed successfully`);
      setShowClaimToast(true);
      setTimeout(() => setShowClaimToast(false), 3000);
    }
  };

  const displayWRs = (activeTab === "my-wrs" ? myWRs : unassignedWRs).filter((wr) => type === "All" || wr.WR_Type === type);
  const isEmptyState = displayWRs.length === 0;

  return (
    <div className="flex flex-col h-full mobile-technician-home">
      {/* Tab Switcher */}
      <div className="border-b border-gray-200 bg-white sticky top-16 z-40">
        <div className="flex items-center gap-4 px-4">
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
        </div>
        <div className="flex gap-2 bg-white px-4 py-2">{(["All", "PM", "FJ", "LJ"] as const).map((item) => <button key={item} aria-pressed={type === item} onClick={() => setType(item)} className={`rounded-full px-3 py-1 text-sm ${type === item ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>{item}</button>)}</div>
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
            {displayWRs.map((wr) => (
              <div key={wr.WR_ID} className="relative">
                <WRPreviewCard
                  wr={wr}
                  onClick={() => onOpenWR?.(wr.WR_ID || "")}
                />

                {/* Claim Button for Unassigned */}
                {activeTab === "unassigned" && (
                  <button
                    onClick={() => void handleClaimWR(wr.WR_ID || "")}
                    className="absolute bottom-4 right-4 px-4 py-2 bg-green-500 text-white text-xs font-bold rounded hover:bg-green-600 transition-colors"
                    aria-label={`Claim ${wr.WR_ID}`}
                  >
                    Claim
                  </button>
                )}
              </div>
            ))}
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
