import React, { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

interface MobileHeaderProps {
  activeSiteId: string;
  onSyncNow?: () => void;
  isSimulatedOffline?: boolean;
  onToggleOfflineMode?: (isOffline: boolean) => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  activeSiteId,
  onSyncNow,
  isSimulatedOffline = false,
  onToggleOfflineMode,
}) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [displaySiteId, setDisplaySiteId] = useState(activeSiteId);

  useEffect(() => {
    setDisplaySiteId(activeSiteId);
  }, [activeSiteId]);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      if (onSyncNow) {
        await onSyncNow();
      }
      setLastSyncTime(new Date());
      setPendingCount(0);
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
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
              {displaySiteId}
            </div>

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
