import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Building, Equipment, Floor, Room } from "@cafm/shared-schema";
import { extractPctKey, FilterCriteria, WorkTypeCode } from "@/lib/store";
import { LocationEquipmentPickerGroup } from "./LocationEquipmentPickerGroup";
import { DateInputDDMMYYYY } from "./DateInputDDMMYYYY";

interface AdvancedFilterPanelProps {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  equipment: Equipment[];
  trades: string[];
  currentFilters: FilterCriteria;
  onFiltersChange: (filters: FilterCriteria) => void;
  onResetFilters: () => void;
  substatusOptions: { value: number; count: number }[];
  defaultSubstatuses: number[];
  workTypes: WorkTypeCode[];
  onWorkTypesChange: (types: WorkTypeCode[]) => void;
  schedule: "agenda" | "overdue" | "today" | "upcoming" | "all";
  onScheduleChange: (value: "agenda" | "overdue" | "today" | "upcoming" | "all") => void;
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
  onResetFilters,
  substatusOptions,
  defaultSubstatuses,
  workTypes,
  onWorkTypesChange,
  schedule,
  onScheduleChange,
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

  const handleResetFilters = () => onResetFilters();
  const set = (patch: Partial<FilterCriteria>) => onFiltersChange({ ...currentFilters, ...patch });
  const selectedPercents = (currentFilters.selectedSubstatuses ?? []).map((Percentage) => Number(extractPctKey({ Percentage }).replace("%", "")));
  const isDefaultSubstatus = selectedPercents.length === defaultSubstatuses.length && defaultSubstatuses.every((value) => selectedPercents.includes(value));
  const togglePercent = (value: number) => set({ selectedSubstatuses: selectedPercents.includes(value) ? selectedPercents.filter((item) => item !== value) : [...selectedPercents, value].sort((a, b) => a - b) });
  const activeCount = Object.entries(currentFilters).filter(([key, value]) => key === "selectedSubstatuses" ? !isDefaultSubstatus : key === "workTypes" ? false : (value instanceof Set ? value.size > 0 : Boolean(value))).length + (workTypes.length > 0 && workTypes.length < 3 ? 1 : 0) + (schedule === "overdue" || schedule === "today" ? 1 : 0);
  const otherCount = [currentFilters.startDateFrom, currentFilters.startDateTo, currentFilters.dueDateFrom, currentFilters.dueDateTo, currentFilters.marginDateFrom, currentFilters.marginDateTo].filter(Boolean).length;
  const toggleWorkType = (type: WorkTypeCode) => {
    const next = workTypes.includes(type) ? workTypes.filter((item) => item !== type) : [...workTypes, type];
    onWorkTypesChange(next.length >= 3 ? [] : next);
  };
  const allTypes = workTypes.length === 0 || workTypes.length === 3;
  const otherFields = {
    start: ["startDateFrom", "startDateTo"],
    due: ["dueDateFrom", "dueDateTo"],
    margin: ["marginDateFrom", "marginDateTo"],
  } as const;
  const [fromKey, toKey] = otherFields[otherTab];
  const dateInput = "w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs";
  const labelClass = "mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400";

  return (
    <div className="mobile-filter-panel">
      <button
        onClick={() => setIsExpanded(true)}
        className="flex h-9 shrink-0 items-center whitespace-nowrap rounded-xl border bg-white px-2.5 text-xs font-semibold"
        aria-expanded={isExpanded}
      >
        <span>⚡ <span className="hidden min-[380px]:inline">Filter </span>({activeCount})</span>
      </button>

      {isExpanded && createPortal(
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/50" onClick={() => setIsExpanded(false)}>
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

              <div>
                <span className={labelClass}>Schedule</span>
                <div role="group" aria-label="Schedule" className="grid grid-cols-3 gap-0.5 rounded-xl bg-slate-100 p-0.5">
                  {([["All", "agenda"], ["Overdue", "overdue"], ["Today", "today"]] as const).map(([label, value]) => {
                    const active = value === "agenda" ? schedule === "agenda" || schedule === "all" : schedule === value;
                    return <button key={value} type="button" aria-pressed={active} onClick={() => onScheduleChange(value)} className={`rounded-lg py-1.5 text-xs font-medium ${active ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}>{label}</button>;
                  })}
                </div>
              </div>

              <div>
                <span className={labelClass}>Work Type</span>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" aria-pressed={allTypes} onClick={() => onWorkTypesChange([])} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${allTypes ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>All</button>
                  {(["PM", "FJ", "LJ"] as const).map((item) => { const on = workTypes.includes(item); return <button key={item} type="button" aria-pressed={on} onClick={() => toggleWorkType(item)} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{item}</button>; })}
                </div>
              </div>

              <div>
                <span className={labelClass}>Substatus (%)</span>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" aria-pressed={selectedPercents.length === 0} onClick={() => set({ selectedSubstatuses: [] })} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${selectedPercents.length === 0 ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>All %</button>
                  {substatusOptions.map((option) => <button key={option.value} type="button" aria-pressed={selectedPercents.includes(option.value)} onClick={() => togglePercent(option.value)} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${selectedPercents.includes(option.value) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{option.value}% ({option.count})</button>)}
                </div>
              </div>

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
                  <span className={labelClass + " mb-0"}>Scheduled Date</span>
                  <button type="button" aria-expanded={otherOpen} onClick={() => setOtherOpen(!otherOpen)} className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    + Other Dates (Start, Due, Margin) ▾
                    {otherCount > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[10px] text-white">{otherCount}</span>}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <DateInputDDMMYYYY aria-label="Scheduled from" value={currentFilters.scheduledDateFrom || ""} onValueChange={(value) => set({ scheduledDateFrom: value || undefined })} className={dateInput} />
                  <DateInputDDMMYYYY aria-label="Scheduled to" value={currentFilters.scheduledDateTo || ""} onValueChange={(value) => set({ scheduledDateTo: value || undefined })} className={dateInput} />
                </div>
              </div>

              {otherOpen && (
                <div className="space-y-1.5 rounded-xl bg-slate-50 p-2">
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-200 p-0.5">
                    {(["start", "due", "margin"] as const).map((tab) => (
                      <button key={tab} type="button" onClick={() => setOtherTab(tab)} className={`rounded-md py-1 text-xs font-medium capitalize ${otherTab === tab ? "bg-white shadow-sm" : "text-slate-600"}`}>{tab} Date</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <DateInputDDMMYYYY aria-label={`${otherTab} from`} value={currentFilters[fromKey] || ""} onValueChange={(value) => set({ [fromKey]: value || undefined })} className={dateInput} />
                    <DateInputDDMMYYYY aria-label={`${otherTab} to`} value={currentFilters[toKey] || ""} onValueChange={(value) => set({ [toKey]: value || undefined })} className={dateInput} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t bg-white px-3.5 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
              <button onClick={handleResetFilters} className="flex-1 rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Reset all</button>
              <button onClick={() => setIsExpanded(false)} className="flex-[2] rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">Done · Show {resultCount} WRs</button>
            </div>
          </div>
        </div>,
        document.querySelector(".mobile-app") ?? document.body,
      )}
    </div>
  );
};