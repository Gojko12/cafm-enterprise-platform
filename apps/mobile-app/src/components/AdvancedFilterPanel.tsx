import React, { useMemo, useState } from "react";
import { Building, Equipment, Floor, Room } from "@cafm/shared-schema";
import { FilterCriteria } from "@/lib/store";
import { LocationEquipmentPickerGroup } from "./LocationEquipmentPickerGroup";

interface AdvancedFilterPanelProps {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  equipment: Equipment[];
  trades: string[];
  currentFilters: FilterCriteria;
  onFiltersChange: (filters: FilterCriteria) => void;
  onApplyFilters: () => void;
  resultCount: number;
}

export const AdvancedFilterPanel: React.FC<AdvancedFilterPanelProps> = ({
  buildings,
  floors,
  rooms,
  equipment,
  trades,
  currentFilters,
  onFiltersChange,
  onApplyFilters,
  resultCount,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherTab, setOtherTab] = useState<"start" | "margin" | "due">("start");
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
    onFiltersChange({ showOnlyWithChecklist: false, selectedEquipmentCodes: new Set() });
    onApplyFilters();
  };
  const set = (patch: Partial<FilterCriteria>) => onFiltersChange({ ...currentFilters, ...patch });
  const activeCount = Object.values(currentFilters).filter((value) => (value instanceof Set ? value.size > 0 : Boolean(value))).length;
  const otherCount = [currentFilters.startDateFrom, currentFilters.startDateTo, currentFilters.marginDateFrom, currentFilters.marginDateTo, currentFilters.dueDateFrom, currentFilters.dueDateTo].filter(Boolean).length;
  const otherFields = {
    start: ["startDateFrom", "startDateTo"],
    margin: ["marginDateFrom", "marginDateTo"],
    due: ["dueDateFrom", "dueDateTo"],
  } as const;
  const [fromKey, toKey] = otherFields[otherTab];
  const dateInput = "w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs";
  const labelClass = "mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400";

  return (
    <div className="mobile-filter-panel">
      <button
        onClick={() => setIsExpanded(true)}
        className="relative rounded-full border bg-white px-3 py-2 text-sm font-medium"
        aria-expanded={isExpanded}
      >
        <span>⚡ Filter ({activeCount})</span>
        {activeCount > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-600" />}
      </button>

      {isExpanded && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50" onClick={() => setIsExpanded(false)}>
          <div role="dialog" aria-modal="true" aria-label="Advanced filters" className="flex max-h-[85%] w-full flex-col rounded-t-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <h2 className="text-base font-bold">Filters</h2>
              <div className="flex items-center gap-3">
                <button type="button" onClick={handleResetFilters} className="text-xs font-medium text-blue-600">Reset all</button>
                <button type="button" onClick={() => setIsExpanded(false)} aria-label="Close filters" className="text-lg leading-none text-slate-500">✕</button>
              </div>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-2.5">
              <LocationEquipmentPickerGroup
                buildings={buildings}
                floors={floors}
                rooms={rooms}
                equipment={equipment}
                selectedBuilding={selectedBuilding}
                selectedFloor={selectedFloor}
                selectedRoom={selectedRoom}
                selectedEquipmentCodes={currentFilters.selectedEquipmentCodes}
                onLocationChange={({ building, floor, room }) => set({ bl_id: building?.bl_id, levelName: floor?.LevelName, roomCode: room?.RoomCode })}
                onEquipmentChange={(codes) => set({ selectedEquipmentCodes: codes })}
              />

              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className={labelClass} htmlFor="filter-wr-id">WR ID</label>
                  <input id="filter-wr-id" type="text" placeholder="2026000001" value={currentFilters.wrId || ""} onChange={(e) => set({ wrId: e.target.value || undefined })} className={dateInput} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="filter-trade">Trade</label>
                  <select id="filter-trade" aria-label="Trade" value={currentFilters.trade || ""} onChange={(e) => set({ trade: e.target.value || undefined })} className={dateInput}>
                    <option value="">All</option>
                    {trades.map((trade) => <option key={trade} value={trade}>{trade}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className={labelClass + " mb-0"}>Assigned Date</span>
                  <button type="button" aria-expanded={otherOpen} onClick={() => setOtherOpen(!otherOpen)} className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    + Other Dates (Start, Margin, Due) ▾
                    {otherCount > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[10px] text-white">{otherCount}</span>}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input type="date" aria-label="Assigned from" value={currentFilters.assignedDateFrom || ""} onChange={(e) => set({ assignedDateFrom: e.target.value || undefined })} className={dateInput} />
                  <input type="date" aria-label="Assigned to" value={currentFilters.assignedDateTo || ""} onChange={(e) => set({ assignedDateTo: e.target.value || undefined })} className={dateInput} />
                </div>
              </div>

              {otherOpen && (
                <div className="space-y-1.5 rounded-xl bg-slate-50 p-2">
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-200 p-0.5">
                    {(["start", "margin", "due"] as const).map((tab) => (
                      <button key={tab} type="button" onClick={() => setOtherTab(tab)} className={`rounded-md py-1 text-xs font-medium capitalize ${otherTab === tab ? "bg-white shadow-sm" : "text-slate-600"}`}>{tab} Date</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input type="date" aria-label={`${otherTab} from`} value={currentFilters[fromKey] || ""} onChange={(e) => set({ [fromKey]: e.target.value || undefined })} className={dateInput} />
                    <input type="date" aria-label={`${otherTab} to`} value={currentFilters[toKey] || ""} onChange={(e) => set({ [toKey]: e.target.value || undefined })} className={dateInput} />
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={currentFilters.showOnlyWithChecklist || false} onChange={(e) => set({ showOnlyWithChecklist: e.target.checked })} className="h-4 w-4" />
                Show only with checklist
              </label>
            </div>

            <div className="flex gap-2 border-t bg-white px-3.5 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
              <button onClick={handleResetFilters} className="flex-1 rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Reset</button>
              <button onClick={() => { onApplyFilters(); setIsExpanded(false); }} className="flex-[2] rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">Apply Filters ({resultCount} matches)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};