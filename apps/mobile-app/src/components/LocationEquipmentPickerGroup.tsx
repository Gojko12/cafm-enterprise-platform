import React, { useMemo, useState } from "react";
import type { Building, Equipment, Floor, Room } from "@cafm/shared-schema";

interface LocationEquipmentPickerGroupProps {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  equipment?: Equipment[];
  selectedBuilding: Building | null;
  selectedFloor: Floor | null;
  selectedRoom: Room | null;
  selectedEquipmentCodes?: Set<string>;
  showEquipment?: boolean;
  onLocationChange: (selection: {
    building: Building | null;
    floor: Floor | null;
    room: Room | null;
  }) => void;
  onEquipmentChange?: (codes: Set<string>) => void;
}

type PickerType = "building" | "floor" | "room";

export const LocationEquipmentPickerGroup: React.FC<
  LocationEquipmentPickerGroupProps
> = ({
  buildings,
  floors,
  rooms,
  equipment = [],
  selectedBuilding,
  selectedFloor,
  selectedRoom,
  selectedEquipmentCodes = new Set<string>(),
  showEquipment = true,
  onLocationChange,
  onEquipmentChange,
}) => {
  const [activePicker, setActivePicker] = useState<PickerType | "equipment" | null>(
    null,
  );

  const chooseBuilding = (building: Building) => {
    const floor =
      selectedFloor?.bl_id === building.bl_id ? selectedFloor : null;
    const room =
      floor &&
      selectedRoom?.bl_id === building.bl_id &&
      selectedRoom.LevelName === floor.LevelName
        ? selectedRoom
        : null;
    onLocationChange({ building, floor, room });
    setActivePicker(null);
  };

  const chooseFloor = (floor: Floor) => {
    const building = buildings.find((item) => item.bl_id === floor.bl_id) ?? null;
    const room =
      selectedRoom?.bl_id === floor.bl_id &&
      selectedRoom.LevelName === floor.LevelName
        ? selectedRoom
        : null;
    onLocationChange({ building, floor, room });
    setActivePicker(null);
  };

  const chooseRoom = (room: Room) => {
    const building = buildings.find((item) => item.bl_id === room.bl_id) ?? null;
    const floor =
      floors.find(
        (item) =>
          item.bl_id === room.bl_id && item.LevelName === room.LevelName,
      ) ?? null;
    onLocationChange({ building, floor, room });
    setActivePicker(null);
  };

  const clearBuilding = () =>
    onLocationChange({ building: null, floor: null, room: null });
  const clearFloor = () =>
    onLocationChange({ building: selectedBuilding, floor: null, room: null });
  const clearRoom = () =>
    onLocationChange({
      building: selectedBuilding,
      floor: selectedFloor,
      room: null,
    });

  const equipmentCodes = useMemo(
    () =>
      equipment
        .filter((item) => selectedEquipmentCodes.has(item.EquipmentCode))
        .map((item) => item.EquipmentCode)
        .sort((a, b) => a.localeCompare(b)),
    [equipment, selectedEquipmentCodes],
  );

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <PickerRow
        label="Building"
        value={
          selectedBuilding
            ? `${selectedBuilding.bl_id} - ${selectedBuilding.Name}`
            : "All ▾"
        }
        selected={Boolean(selectedBuilding)}
        onSelect={() => setActivePicker("building")}
        onClear={clearBuilding}
      />
      <PickerRow
        label="Floor"
        value={selectedFloor?.LevelName ?? "All ▾"}
        selected={Boolean(selectedFloor)}
        onSelect={() => setActivePicker("floor")}
        onClear={clearFloor}
      />
      <PickerRow
        label="Room"
        value={
          selectedRoom
            ? `${selectedRoom.RoomCode} - ${selectedRoom.Name}`
            : "All ▾"
        }
        selected={Boolean(selectedRoom)}
        onSelect={() => setActivePicker("room")}
        onClear={clearRoom}
      />
      {showEquipment && (
        <PickerRow
          label="Equipment"
          value={equipmentCodes.length ? equipmentCodes.join(", ") : "All ▾"}
          selected={equipmentCodes.length > 0}
          onSelect={() => setActivePicker("equipment")}
          onClear={() => onEquipmentChange?.(new Set<string>())}
        />
      )}

      {activePicker === "building" && (
        <PickBuildingModal
          buildings={buildings}
          onClose={() => setActivePicker(null)}
          onSelect={chooseBuilding}
        />
      )}
      {activePicker === "floor" && (
        <PickFloorModal
          floors={floors}
          selectedBuilding={selectedBuilding}
          onClose={() => setActivePicker(null)}
          onSelect={chooseFloor}
        />
      )}
      {activePicker === "room" && (
        <PickRoomModal
          rooms={rooms}
          selectedBuilding={selectedBuilding}
          selectedFloor={selectedFloor}
          onClose={() => setActivePicker(null)}
          onSelect={chooseRoom}
        />
      )}
      {activePicker === "equipment" && (
        <SelectEquipmentModal
          buildings={buildings}
          floors={floors}
          rooms={rooms}
          equipment={equipment}
          selectedBuilding={selectedBuilding}
          selectedFloor={selectedFloor}
          selectedRoom={selectedRoom}
          selectedEquipmentCodes={selectedEquipmentCodes}
          onClose={() => setActivePicker(null)}
          onConfirm={(codes) => {
            onEquipmentChange?.(codes);
            setActivePicker(null);
          }}
        />
      )}
    </div>
  );
};

const PickerRow = ({
  label,
  value,
  selected,
  onSelect,
  onClear,
}: {
  label: string;
  value: string;
  selected: boolean;
  onSelect: () => void;
  onClear: () => void;
}) => (
  <div className="relative min-w-0">
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Select ${label}`}
      className="flex w-full min-w-0 items-center justify-between gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 pr-7 text-left"
    >
      <span className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-400">{shortLabel(label)}</span>
        <span className={`block truncate text-xs ${selected ? "font-semibold text-slate-900" : "text-slate-600"}`}>{value}</span>
      </span>
      {!selected && <span aria-hidden="true" className="text-slate-400">▾</span>}
    </button>
    {selected && (
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label}`}
        className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold text-red-600"
      >
        ✕
      </button>
    )}
  </div>
);

const shortLabel = (label: string) => ({ Building: "BLDG", Floor: "FLOOR", Room: "ROOM", Equipment: "EQ" }[label] ?? label.toUpperCase());
function PickerModal<T>({
  title,
  items,
  searchPlaceholder,
  matches,
  primaryText,
  subtitle,
  onSelect,
  onClose,
}: {
  title: string;
  items: T[];
  searchPlaceholder: string;
  matches: (item: T, query: string) => boolean;
  primaryText: (item: T) => string;
  subtitle?: (item: T) => string;
  onSelect: (item: T) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = items.filter((item) => matches(item, query.trim().toLowerCase()));
  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/50 flex items-end sm:items-center justify-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-xl max-h-[85dvh] bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        <header className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2">
            ✕
          </button>
        </header>
        <div className="p-4 border-b">
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.map((item, index) => (
            <div
              key={`${primaryText(item)}-${index}`}
              className="flex items-center justify-between gap-3 p-3 border rounded"
            >
              <div className="min-w-0">
                <div className="font-medium">{primaryText(item)}</div>
                {subtitle && <div className="text-xs text-gray-600">{subtitle(item)}</div>}
              </div>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Select
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-500">No matching locations</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function PickBuildingModal({
  buildings,
  onSelect,
  onClose,
}: {
  buildings: Building[];
  onSelect: (building: Building) => void;
  onClose: () => void;
}) {
  return (
    <PickerModal
      title="Select Building"
      items={[...buildings].sort((a, b) => a.bl_id.localeCompare(b.bl_id))}
      searchPlaceholder="Search building..."
      matches={(item, query) =>
        `${item.bl_id} ${item.Name}`.toLowerCase().includes(query)
      }
      primaryText={(item) => `${item.bl_id} - ${item.Name}`}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}

export function PickFloorModal({
  floors,
  selectedBuilding,
  onSelect,
  onClose,
}: {
  floors: Floor[];
  selectedBuilding: Building | null;
  onSelect: (floor: Floor) => void;
  onClose: () => void;
}) {
  const choices = floors
    .filter((floor) => !selectedBuilding || floor.bl_id === selectedBuilding.bl_id)
    .sort(
      (a, b) =>
        a.bl_id.localeCompare(b.bl_id) || a.LevelName.localeCompare(b.LevelName),
    );
  return (
    <PickerModal
      title="Select Floor"
      items={choices}
      searchPlaceholder="Search floor..."
      matches={(item, query) =>
        `${item.LevelName} ${item.bl_id}`.toLowerCase().includes(query)
      }
      primaryText={(item) => item.LevelName}
      subtitle={(item) => `Building: ${item.bl_id}`}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}

export function PickRoomModal({
  rooms,
  selectedBuilding,
  selectedFloor,
  onSelect,
  onClose,
}: {
  rooms: Room[];
  selectedBuilding: Building | null;
  selectedFloor: Floor | null;
  onSelect: (room: Room) => void;
  onClose: () => void;
}) {
  const choices = rooms
    .filter((room) => {
      if (selectedFloor) {
        return (
          room.bl_id === selectedFloor.bl_id &&
          room.LevelName === selectedFloor.LevelName
        );
      }
      return !selectedBuilding || room.bl_id === selectedBuilding.bl_id;
    })
    .sort((a, b) => a.RoomCode.localeCompare(b.RoomCode));
  return (
    <PickerModal
      title="Select Room"
      items={choices}
      searchPlaceholder="Search room..."
      matches={(item, query) =>
        `${item.RoomCode} ${item.Name} ${item.LevelName} ${item.bl_id}`
          .toLowerCase()
          .includes(query)
      }
      primaryText={(item) => `${item.RoomCode} - ${item.Name}`}
      subtitle={(item) =>
        `Floor: ${item.LevelName} • Building: ${item.bl_id} (${item.NetAreaM2 ?? 0} m²)`
      }
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}

function SelectEquipmentModal({
  buildings,
  floors,
  rooms,
  equipment,
  selectedBuilding,
  selectedFloor,
  selectedRoom,
  selectedEquipmentCodes,
  onConfirm,
  onClose,
}: {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  equipment: Equipment[];
  selectedBuilding: Building | null;
  selectedFloor: Floor | null;
  selectedRoom: Room | null;
  selectedEquipmentCodes: Set<string>;
  onConfirm: (codes: Set<string>) => void;
  onClose: () => void;
}) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filterBuilding, setFilterBuilding] = useState(selectedBuilding);
  const [filterFloor, setFilterFloor] = useState(selectedFloor);
  const [filterRoom, setFilterRoom] = useState(selectedRoom);
  const [codeQuery, setCodeQuery] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [stagedSelection, setStagedSelection] = useState(
    () => new Set(selectedEquipmentCodes),
  );

  const filteredEquipment = equipment
    .filter(
      (item) =>
        (!filterBuilding || item.bl_id === filterBuilding.bl_id) &&
        (!filterFloor ||
          (item.bl_id === filterFloor.bl_id &&
            item.LevelName === filterFloor.LevelName)) &&
        (!filterRoom ||
          (item.bl_id === filterRoom.bl_id &&
            item.LevelName === filterRoom.LevelName &&
            item.RoomCode === filterRoom.RoomCode)) &&
        item.EquipmentCode.toLowerCase().includes(codeQuery.toLowerCase()) &&
        item.EquipmentName.toLowerCase().includes(nameQuery.toLowerCase()),
    )
    .sort((a, b) => a.EquipmentCode.localeCompare(b.EquipmentCode));

  const setLocation = ({
    building,
    floor,
    room,
  }: {
    building: Building | null;
    floor: Floor | null;
    room: Room | null;
  }) => {
    setFilterBuilding(building);
    setFilterFloor(floor);
    setFilterRoom(room);
  };

  const toggle = (code: string) => {
    setStagedSelection((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/50 flex items-end sm:items-center justify-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Select Equipment"
        className="w-full max-w-3xl max-h-[85dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white overflow-hidden shadow-2xl"
      >
        <header className="shrink-0 px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-lg font-bold">Select Equipment</h3>
          <span className="text-sm text-blue-700">{stagedSelection.size} selected</span>
        </header>
        <button
          type="button"
          aria-expanded={filtersExpanded}
          onClick={() => setFiltersExpanded((expanded) => !expanded)}
          className="shrink-0 px-4 py-2.5 text-left text-sm font-medium border-b"
        >
          Filter {filtersExpanded ? "▲" : "▼"}
        </button>
        {filtersExpanded && (
          <div className="shrink-0 max-h-[40dvh] overflow-y-auto p-4 border-b space-y-3">
            <LocationEquipmentPickerGroup
              buildings={buildings}
              floors={floors}
              rooms={rooms}
              selectedBuilding={filterBuilding}
              selectedFloor={filterFloor}
              selectedRoom={filterRoom}
              showEquipment={false}
              onLocationChange={setLocation}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={codeQuery}
                onChange={(event) => setCodeQuery(event.target.value)}
                placeholder="Equipment Code"
                aria-label="Equipment Code"
                className="px-3 py-2 border rounded"
              />
              <input
                value={nameQuery}
                onChange={(event) => setNameQuery(event.target.value)}
                placeholder="Equipment Name"
                aria-label="Equipment Name"
                className="px-3 py-2 border rounded"
              />
            </div>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5">
          {filteredEquipment.map((item) => {
            const isSelected = stagedSelection.has(item.EquipmentCode);
            return (
              <button
                key={item.EquipmentCode}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggle(item.EquipmentCode)}
                className={`w-full text-left px-3 py-2 rounded-xl border flex items-center justify-between gap-3 ${
                  isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.EquipmentCode} {"\u00b7"} {item.EquipmentName}</span>
                  <span className="block truncate text-xs text-slate-500">{item.RoomCode} {"\u00b7"} {item.LevelName} {"\u00b7"} {item.bl_id}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`h-6 w-6 shrink-0 rounded-full border flex items-center justify-center text-xs font-bold ${
                    isSelected ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 text-transparent"
                  }`}
                >
                  {"\u2713"}
                </span>
              </button>
            );
          })}
          {filteredEquipment.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-500">No equipment found</p>
          )}
        </div>
        <footer className="shrink-0 border-t bg-white px-3.5 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2">
          <button
            type="button"
            onClick={() => setStagedSelection(new Set<string>())}
            className="px-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-700"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(new Set(stagedSelection))}
            className="flex-1 px-3 py-2 rounded-xl bg-blue-600 text-sm font-semibold text-white"
          >
            Apply Selection ({stagedSelection.size})
          </button>
        </footer>
      </section>
    </div>
  );
}
