import React, { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { SiteId } from "@cafm/shared-schema";
import type { SyncStatus } from "../lib/offline-engine";

interface MobileHeaderProps {
  activeSiteId: SiteId;
  onSiteChange?: (site: SiteId) => void;
  onSyncNow?: () => Promise<SyncStatus>;
  isSimulatedOffline?: boolean;
  onToggleOfflineMode?: (isOffline: boolean) => void;
  technicianId: string;
  technicians: Array<{ id: string; Name: string; LastName: string; Trade: string }>;
  onTechnicianChange: (id: string) => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  activeSiteId,
  onSiteChange,
  onSyncNow,
  isSimulatedOffline = false,
  onToggleOfflineMode,
  technicianId,
  technicians,
  onTechnicianChange,
}) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      if (onSyncNow) {
        const status = await onSyncNow();
        setPendingCount(status.pending);
      } else {
        throw new Error("Synchronization is not available.");
      }
      setLastSyncTime(new Date());
    } catch (error) {
      console.error("Sync failed:", error);
      alert(error instanceof Error ? error.message : "Synchronization failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOfflineToggle = () => {
    if (onToggleOfflineMode) {
      onToggleOfflineMode(!isSimulatedOffline);
    }
  };

  const getLastSyncDisplay = () => {
    if (!lastSyncTime) return "Never synced";
    return `Last sync: ${formatDistanceToNow(lastSyncTime, { addSuffix: false })} ago`;
  };

  return (
    <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50 mobile-header">
      <div className="max-w-full px-4 py-3">
        {/* Row 1: Site Badge and Status Indicator */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
              <select aria-label="Active site" value={activeSiteId} onChange={(event) => {
                const site = event.target.value;
                if (site === "SITE-01" || site === "SITE-02" || site === "SITE-03") onSiteChange?.(site);
              }} className="bg-transparent">
                <option value="SITE-01">SITE-01</option>
                <option value="SITE-02">SITE-02</option>
                <option value="SITE-03">SITE-03</option>
              </select>
            </div>
            <label className="mb-1 block text-xs">Technician <select aria-label="Active technician" value={technicianId} onChange={(e) => onTechnicianChange(e.target.value)} className="ml-1 max-w-[75%] rounded border p-1">{!technicians.some((person) => person.id === technicianId) && <option value={technicianId}>{technicianId || "Select technician"}</option>}{technicians.map((person) => <option key={person.id} value={person.id}>{person.Name} {person.LastName} · {person.Trade}</option>)}</select></label>

            {/* Online/Offline Toggle */}
            <button
              onClick={handleOfflineToggle}
              className={`w-4 h-4 rounded-full transition-colors ${
                isSimulatedOffline ? "bg-red-500" : "bg-green-500"
              }`}
              title={isSimulatedOffline ? "Offline mode" : "Online mode"}
              aria-label={isSimulatedOffline ? "Switch to online mode" : "Switch to offline mode"}
            />
          </div>

          {/* Pending Sync Badge */}
          {pendingCount > 0 && (
            <div className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
              <span>{pendingCount}</span>
              <span>pending</span>
            </div>
          )}
        </div>

        {/* Row 2: Sync Button and Timestamp */}
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>{getLastSyncDisplay()}</span>

          <button
            onClick={handleSyncNow}
            disabled={isSyncing || isSimulatedOffline}
            className="px-3 py-1 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            aria-label="Sync now"
          >
            {isSyncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>
      </div>
    </header>
  );
};
