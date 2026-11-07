import React, { useState, useEffect } from "react";
import { Building, Floor, Room } from "@cafm/shared-schema";
import { FilterCriteria } from "@/lib/store";

interface AdvancedFilterPanelProps {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  currentFilters: FilterCriteria;
  onFiltersChange: (filters: FilterCriteria) => void;
  onApplyFilters: () => void;
}

export const AdvancedFilterPanel: React.FC<AdvancedFilterPanelProps> = ({
  buildings,
  floors,
  rooms,
  currentFilters,
  onFiltersChange,
  onApplyFilters,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchBuildingText, setSearchBuildingText] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<Floor | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  useEffect(() => {
    if (currentFilters.bl_id) {
      const building = buildings.find((b) => b.bl_id === currentFilters.bl_id);
      setSelectedBuilding(building || null);
    }
  }, [currentFilters.bl_id, buildings]);

  useEffect(() => {
    if (currentFilters.levelName && selectedBuilding) {
      const floor = floors.find(
        (f) => f.bl_id === selectedBuilding.bl_id && f.LevelName === currentFilters.levelName
      );
      setSelectedFloor(floor || null);
    }
  }, [currentFilters.levelName, floors, selectedBuilding]);

  useEffect(() => {
    if (currentFilters.roomCode && selectedFloor) {
      const room = rooms.find(
        (r) =>
          r.bl_id === selectedBuilding?.bl_id &&
          r.LevelName === selectedFloor.LevelName &&
          r.RoomCode === currentFilters.roomCode
      );
      setSelectedRoom(room || null);
    }
  }, [currentFilters.roomCode, rooms, selectedBuilding, selectedFloor]);

  const handleBuildingSelect = (building: Building) => {
    setSelectedBuilding(building);
    setSelectedFloor(null);
    setSelectedRoom(null);
    setSearchBuildingText("");
    onFiltersChange({
      ...currentFilters,
      bl_id: building.bl_id,
      levelName: undefined,
      roomCode: undefined,
    });
  };

  const handleFloorSelect = (floor: Floor) => {
    setSelectedFloor(floor);
    setSelectedRoom(null);
    onFiltersChange({
      ...currentFilters,
      levelName: floor.LevelName,
      roomCode: undefined,
    });
  };

  const handleRoomSelect = (room: Room) => {
    setSelectedRoom(room);
    onFiltersChange({
      ...currentFilters,
      roomCode: room.RoomCode,
    });
  };

  const handleResetFilters = () => {
    setSelectedBuilding(null);
    setSelectedFloor(null);
    setSelectedRoom(null);
    setSearchBuildingText("");
    onFiltersChange({
      wrId: undefined,
      trade: undefined,
      showOnlyWithChecklist: false,
      dueDateFrom: undefined,
      dueDateTo: undefined,
      marginDateFrom: undefined,
      marginDateTo: undefined,
    });
  };

  const filteredBuildings = buildings.filter((b) =>
    b.Name.toLowerCase().includes(searchBuildingText.toLowerCase())
  );

  const filteredFloors = selectedBuilding
    ? floors.filter((f) => f.bl_id === selectedBuilding.bl_id)
    : [];

  const filteredRooms = selectedFloor
    ? rooms.filter(
        (r) =>
          r.bl_id === selectedBuilding?.bl_id && r.LevelName === selectedFloor.LevelName
      )
    : [];

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
            {/* Building Picker */}
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-2">Building</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search building..."
                  value={searchBuildingText}
                  onChange={(e) => setSearchBuildingText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  aria-label="Search buildings"
                />
                {searchBuildingText && filteredBuildings.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-40 max-h-40 overflow-y-auto">
                    {filteredBuildings.map((b) => (
                      <button
                        key={b.bl_id}
                        onClick={() => handleBuildingSelect(b)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm"
                      >
                        {b.Name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedBuilding && (
                <div className="text-xs text-blue-600 mt-1">Selected: {selectedBuilding.Name}</div>
              )}
            </div>

            {/* Floor Picker */}
            {selectedBuilding && filteredFloors.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-2">Floor</label>
                <div className="grid grid-cols-3 gap-2">
                  {filteredFloors.map((f) => (
                    <button
                      key={f.LevelName}
                      onClick={() => handleFloorSelect(f)}
                      className={`px-3 py-2 text-xs font-medium rounded transition-colors ${
                        selectedFloor?.LevelName === f.LevelName
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {f.LevelName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Room Picker */}
            {selectedFloor && filteredRooms.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-2">Room</label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {filteredRooms.map((r) => (
                    <button
                      key={r.RoomCode}
                      onClick={() => handleRoomSelect(r)}
                      className={`w-full text-left px-3 py-2 text-xs rounded transition-colors ${
                        selectedRoom?.RoomCode === r.RoomCode
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {r.RoomCode}: {r.Name}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
              <input
                type="text"
                placeholder="e.g. Electrical"
                value={currentFilters.trade || ""}
                onChange={(e) =>
                  onFiltersChange({ ...currentFilters, trade: e.target.value || undefined })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
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
