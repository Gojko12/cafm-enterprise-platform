import React, { useMemo, useState } from "react";
import { Building, Equipment, Floor, Room, CLASSICAL_TRADES } from "@cafm/shared-schema";
import { FilterCriteria } from "@/lib/store";
import { LocationEquipmentPickerGroup } from "./LocationEquipmentPickerGroup";

interface AdvancedFilterPanelProps {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  equipment: Equipment[];
  currentFilters: FilterCriteria;
  onFiltersChange: (filters: FilterCriteria) => void;
  onApplyFilters: () => void;
}

export const AdvancedFilterPanel: React.FC<AdvancedFilterPanelProps> = ({
  buildings,
  floors,
  rooms,
  equipment,
  currentFilters,
  onFiltersChange,
  onApplyFilters,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedBuilding = useMemo(
    () => buildings.find((building) => building.bl_id === currentFilters.bl_id) ?? null,
    [buildings, currentFilters.bl_id],
  );
  const selectedFloor = useMemo(
    () =>
      floors.find(
        (floor) =>
          floor.bl_id === currentFilters.bl_id &&
          floor.LevelName === currentFilters.levelName,
      ) ?? null,
    [floors, currentFilters.bl_id, currentFilters.levelName],
  );
  const selectedRoom = useMemo(
    () =>
      rooms.find(
        (room) =>
          room.bl_id === currentFilters.bl_id &&
          room.LevelName === currentFilters.levelName &&
          room.RoomCode === currentFilters.roomCode,
      ) ?? null,
    [rooms, currentFilters.bl_id, currentFilters.levelName, currentFilters.roomCode],
  );

  const handleResetFilters = () => {
    onFiltersChange({
      bl_id: undefined,
      levelName: undefined,
      roomCode: undefined,
      wrId: undefined,
      trade: undefined,
      showOnlyWithChecklist: false,
      dueDateFrom: undefined,
      dueDateTo: undefined,
      marginDateFrom: undefined,
      marginDateTo: undefined,
      selectedEquipmentCodes: new Set(),
    });
    onApplyFilters();
  };

  return (
    <div className="bg-white border-b border-gray-200 mobile-filter-panel">
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 font-medium text-left text-sm hover:bg-gray-50 flex items-center justify-between"
        aria-expanded={isExpanded}
      >
        <span>Advanced Filters</span>
        <span className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}>▼</span>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 py-4 border-t border-gray-100 space-y-4 pb-4">
          {/* Location Pickers */}
          <div className="space-y-3">
            <LocationEquipmentPickerGroup
              buildings={buildings}
              floors={floors}
              rooms={rooms}
              equipment={equipment}
              selectedBuilding={selectedBuilding}
              selectedFloor={selectedFloor}
              selectedRoom={selectedRoom}
              selectedEquipmentCodes={currentFilters.selectedEquipmentCodes}
              onLocationChange={({ building, floor, room }) =>
                onFiltersChange({
                  ...currentFilters,
                  bl_id: building?.bl_id,
                  levelName: floor?.LevelName,
                  roomCode: room?.RoomCode,
                })
              }
              onEquipmentChange={(codes) =>
                onFiltersChange({ ...currentFilters, selectedEquipmentCodes: codes })
              }
            />
          </div>

          {/* Filter Inputs */}
          <div className="space-y-3 border-t border-gray-100 pt-3">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">WR ID</label>
              <input
                type="text"
                placeholder="e.g. 2026000001"
                value={currentFilters.wrId || ""}
                onChange={(e) =>
                  onFiltersChange({ ...currentFilters, wrId: e.target.value || undefined })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Trade</label>
              <select
                aria-label="Trade"
                value={currentFilters.trade || ""}
                onChange={(e) =>
                  onFiltersChange({ ...currentFilters, trade: e.target.value || undefined })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              ><option value="">All Trades</option>{CLASSICAL_TRADES.map((trade) => <option key={trade} value={trade}>{trade}</option>)}</select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Due From</label>
                <input
                  type="date"
                  value={currentFilters.dueDateFrom || ""}
                  onChange={(e) =>
                    onFiltersChange({
                      ...currentFilters,
                      dueDateFrom: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Due To</label>
                <input
                  type="date"
                  value={currentFilters.dueDateTo || ""}
                  onChange={(e) =>
                    onFiltersChange({
                      ...currentFilters,
                      dueDateTo: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="withChecklist"
                checked={currentFilters.showOnlyWithChecklist || false}
                onChange={(e) =>
                  onFiltersChange({
                    ...currentFilters,
                    showOnlyWithChecklist: e.target.checked,
                  })
                }
                className="w-4 h-4"
              />
              <label htmlFor="withChecklist" className="text-sm text-gray-700">
                Show only with checklist
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 border-t border-gray-100 pt-3">
            <button
              onClick={handleResetFilters}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded hover:bg-gray-300 transition-colors"
            >
              Reset
            </button>
            <button
              onClick={onApplyFilters}
              className="flex-1 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded hover:bg-blue-600 transition-colors"
            >
              Apply Filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
