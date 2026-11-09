import React, { useState, useEffect } from "react";
import { BaseWorkRequest } from "@cafm/shared-schema";
import { formatDistanceToNow, format } from "date-fns";

interface WRPreviewCardProps {
  wr: BaseWorkRequest;
  onClick?: () => void;
}

export const WRPreviewCard: React.FC<WRPreviewCardProps> = ({ wr, onClick }) => {
  const [colorClass, setColorClass] = useState("bg-green-50 border-green-300");

  useEffect(() => {
    const now = new Date();
    const dueDate = wr.DueDate ? new Date(wr.DueDate) : null;
    const marginDate = wr.MarginDate ? new Date(wr.MarginDate) : null;

    if (dueDate && now > dueDate) {
      setColorClass("bg-red-50 border-red-300");
    } else if (marginDate && now > marginDate) {
      setColorClass("bg-orange-50 border-orange-300");
    } else {
      setColorClass("bg-green-50 border-green-300");
    }
  }, [wr.DueDate, wr.MarginDate]);

  const getWRTypeLabel = () => {
    return wr.WR_Type || "UNKNOWN";
  };

  const getPercentageDisplay = () => {
    if (wr.Percentage !== undefined) {
      return `${wr.Percentage}%`;
    }
    return "50%";
  };

  const getStatusBadgeColor = () => {
    const percentage = wr.Percentage || 50;
    if (percentage === 100) return "bg-green-200 text-green-800";
    if (percentage >= 78) return "bg-blue-200 text-blue-800";
    return "bg-yellow-200 text-yellow-800";
  };

  const formatDateShort = (dateStr?: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return format(date, "MMM d");
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-white p-3.5 mb-3 cursor-pointer shadow-sm border border-slate-200/80 space-y-2 hover:shadow-md transition-shadow ${colorClass.replace(/bg-\S+/g, "")}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onClick) onClick();
      }}
      aria-label={`Work Request ${wr.WR_ID || "unknown"}`}
    >
      {/* Row 1: WR_ID | Description/Code | Trade */}
      <div className="flex flex-wrap items-start gap-2 mb-2">
        <div className="font-bold text-sm text-gray-900 break-all">
          {wr.WR_ID || "WR-?"}
        </div>
        <div className="min-w-0 flex-1 text-sm text-gray-700 break-words">
          {wr.Description || "No description"}
        </div>
        <div className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded whitespace-nowrap">
          {wr.TradeName || "—"}
        </div>
      </div>

      {/* Row 2: MarginDate | DueDate */}
      <p className="text-xs text-slate-500">{[wr.bl_id, wr.LevelName, wr.RoomCode, wr.EquipmentCodes.join(", ")].filter(Boolean).join(" · ")}</p>
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-2">
        <span>
          Margin: {wr.MarginDate ? formatDateShort(wr.MarginDate) : "—"}
        </span>
        <span>
          Due: {wr.DueDate ? formatDateShort(wr.DueDate) : "—"}
        </span>
      </div>

      {/* Row 3: WR_Type badge | Percentage badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-1 bg-gray-200 text-gray-800 rounded font-medium">
          {getWRTypeLabel()}
        </span>
        <span className={`text-xs px-2 py-1 rounded font-medium ${getStatusBadgeColor()}`}>
          {getPercentageDisplay()}
        </span>
      </div>
    </div>
  );
};
