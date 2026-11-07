import React, { useState, useEffect } from "react";
import { BaseWorkRequest } from "@cafm/shared-schema";
import { formatDistanceToNow } from "date-fns";

interface WorkSessionTimerProps {
  wrId: string;
  onSessionComplete?: (totalMinutes: number, reason?: string) => void;
}

export const WorkSessionTimer: React.FC<WorkSessionTimerProps> = ({
  wrId,
  onSessionComplete,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideMinutes, setOverrideMinutes] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isRunning) {
      interval = setInterval(() => {
        setTotalSeconds((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleStart = () => {
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleStop = () => {
    setIsRunning(false);
    const minutes = Math.floor(totalSeconds / 60);
    if (onSessionComplete) {
      onSessionComplete(minutes);
    }
    setTotalSeconds(0);
  };

  const handleOverrideClick = () => {
    setShowOverrideModal(true);
  };

  const handleConfirmOverride = () => {
    const minutes = parseInt(overrideMinutes, 10);
    if (isNaN(minutes) || !overrideReason.trim()) {
      alert("Please enter valid time and reason");
      return;
    }

    setIsRunning(false);
    if (onSessionComplete) {
      onSessionComplete(minutes, overrideReason);
    }
    setShowOverrideModal(false);
    setOverrideMinutes("");
    setOverrideReason("");
    setTotalSeconds(0);
  };

  const totalMinutes = Math.floor(totalSeconds / 60);

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-4 mobile-work-session-timer">
      <div className="space-y-4">
        {/* Timer Display */}
        <div className="text-center">
          <div className="text-5xl font-bold text-gray-900 font-mono mb-2">
            {formatTime(totalSeconds)}
          </div>
          <div className="text-sm text-gray-600">
            Total: {totalMinutes} minute{totalMinutes !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleStart}
            disabled={isRunning}
            className="flex-1 px-4 py-2 bg-green-500 text-white font-medium rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            aria-label="Start timer"
          >
            Start
          </button>
          <button
            onClick={handlePause}
            disabled={!isRunning}
            className="flex-1 px-4 py-2 bg-yellow-500 text-white font-medium rounded hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            aria-label="Pause timer"
          >
            Pause
          </button>
          <button
            onClick={handleStop}
            disabled={totalSeconds === 0}
            className="flex-1 px-4 py-2 bg-red-500 text-white font-medium rounded hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            aria-label="Stop timer"
          >
            Stop
          </button>
        </div>

        {/* Override Button */}
        <button
          onClick={handleOverrideClick}
          className="w-full px-4 py-2 bg-orange-100 text-orange-700 font-medium rounded hover:bg-orange-200 transition-colors text-sm"
          aria-label="Manual override"
        >
          Manual Override
        </button>
      </div>

      {/* Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 w-full">
            <h3 className="text-lg font-bold mb-4">Manual Time Override</h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Time (minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  value={overrideMinutes}
                  onChange={(e) => setOverrideMinutes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="e.g. 45"
                  aria-label="Override time in minutes"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Reason (required)
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="Why are you overriding?"
                  rows={3}
                  aria-label="Override reason"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowOverrideModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmOverride}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors font-medium"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
