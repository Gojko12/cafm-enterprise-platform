"use client";

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
  selectedEquipmentCodes?: string[];
  showEquipment?: boolean;
  compact?: boolean;
  onLocationChange: (selection: {
    building: Building | null;
    floor: Floor | null;
    room: Room | null;
  }) => void;
  onEquipmentChange?: (codes: string[]) => void;
}

type PickerType = "building" | "floor" | "room";

export function LocationEquipmentPickerGroup({
  buildings,
  floors,
  rooms,
  equipment = [],
  selectedBuilding,
  selectedFloor,
  selectedRoom,
  selectedEquipmentCodes = [],
  showEquipment = true,
  compact = false,
  onLocationChange,
  onEquipmentChange,
}: LocationEquipmentPickerGroupProps) {
  const [activePicker, setActivePicker] = useState<PickerType | "equipment" | null>(
    null,
  );
  const selectedEquipment = useMemo(
    () =>
      equipment
        .filter((item) => selectedEquipmentCodes.includes(item.EquipmentCode))
        .map((item) => item.EquipmentCode)
        .sort((a, b) => a.localeCompare(b)),
    [equipment, selectedEquipmentCodes],
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

  return (
    <div className={compact ? "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" : "space-y-3"}>
      <PickerRow
        compact={compact}
        label="Building"
        value={
          selectedBuilding
            ? `${selectedBuilding.bl_id} - ${selectedBuilding.Name}`
            : "All Buildings"
        }
        selected={Boolean(selectedBuilding)}
        onSelect={() => setActivePicker("building")}
        onClear={() => onLocationChange({ building: null, floor: null, room: null })}
      />
      <PickerRow
        compact={compact}
        label="Floor"
        value={selectedFloor?.LevelName ?? "All Floors"}
        selected={Boolean(selectedFloor)}
        onSelect={() => setActivePicker("floor")}
        onClear={() =>
          onLocationChange({ building: selectedBuilding, floor: null, room: null })
        }
      />
      <PickerRow
        compact={compact}
        label="Room"
        value={
          selectedRoom
            ? `${selectedRoom.RoomCode} - ${selectedRoom.Name}`
            : "All Rooms"
        }
        selected={Boolean(selectedRoom)}
        onSelect={() => setActivePicker("room")}
        onClear={() =>
          onLocationChange({
            building: selectedBuilding,
            floor: selectedFloor,
            room: null,
          })
        }
      />
      {showEquipment && (
        <PickerRow
          compact={compact}
          label="Equipment"
          value={
            selectedEquipment.length
              ? selectedEquipment.join(", ")
              : "All Equipment"
          }
          selected={selectedEquipment.length > 0}
          onSelect={() => setActivePicker("equipment")}
          onClear={() => onEquipmentChange?.([])}
        />
      )}
      {activePicker === "building" && (
        <PickBuildingModal
          buildings={buildings}
          onSelect={chooseBuilding}
          onClose={() => setActivePicker(null)}
        />
      )}
      {activePicker === "floor" && (
        <PickFloorModal
          floors={floors}
          selectedBuilding={selectedBuilding}
          onSelect={chooseFloor}
          onClose={() => setActivePicker(null)}
        />
      )}
      {activePicker === "room" && (
        <PickRoomModal
          rooms={rooms}
          selectedBuilding={selectedBuilding}
          selectedFloor={selectedFloor}
          onSelect={chooseRoom}
          onClose={() => setActivePicker(null)}
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
          selectedEquipmentCodes={selectedEquipment}
          onClose={() => setActivePicker(null)}
          onConfirm={(codes) => {
            onEquipmentChange?.(codes);
            setActivePicker(null);
          }}
        />
      )}
    </div>
  );
}

function PickerRow({
  compact,
  label,
  value,
  selected,
  onSelect,
  onClear,
}: {
  compact?: boolean;
  label: string;
  value: string;
  selected: boolean;
  onSelect: () => void;
  onClear: () => void;
}) {
  return (
    <div className={compact ? "min-w-0 flex items-center gap-1" : "grid grid-cols-[6rem_minmax(0,1fr)_auto_auto] items-center gap-2"}>
      <span className={compact ? "text-xs font-medium text-gray-700" : "text-sm font-medium text-gray-700"}>{label}</span>
      <input
        readOnly
        value={value}
        aria-label={`Selected ${label}`}
        className={compact ? "min-w-0 w-full px-1 py-1 border rounded bg-gray-50 text-xs" : "min-w-0 w-full px-3 py-2 border border-gray-300 rounded bg-gray-50 text-sm"}
      />
      <button
        type="button"
        onClick={onSelect}
        className={compact ? "px-1 py-1 bg-blue-600 text-white rounded text-xs" : "px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"}
      >
        Select...
      </button>
      {selected ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label}`}
          className={compact ? "px-1 bg-red-100 text-red-700 rounded font-bold" : "px-2 py-2 bg-red-100 text-red-700 rounded font-bold hover:bg-red-200"}
        >
          ✕
        </button>
      ) : (
        compact ? null : <span className="w-8" />
      )}
    </div>
  );
}

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
  const filtered = items.filter((item) =>
    matches(item, query.trim().toLowerCase()),
  );
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-2xl max-h-[85vh] bg-white rounded-lg shadow-xl flex flex-col"
      >
        <header className="px-5 py-4 border-b flex items-center justify-between">
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
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filtered.map((item, index) => (
            <div
              key={`${primaryText(item)}-${index}`}
              className="flex items-center justify-between gap-3 p-3 border rounded"
            >
              <div className="min-w-0">
                <div className="font-medium">{primaryText(item)}</div>
                {subtitle && <div className="text-sm text-gray-600">{subtitle(item)}</div>}
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
  selectedEquipmentCodes: string[];
  onConfirm: (codes: string[]) => void;
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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Select Equipment"
        className="w-full max-w-4xl max-h-[92vh] bg-white rounded-xl flex flex-col"
      >
        <header className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-bold">Select Equipment</h3>
          <span className="text-sm text-blue-700">{stagedSelection.size} selected</span>
        </header>
        <button
          type="button"
          aria-expanded={filtersExpanded}
          onClick={() => setFiltersExpanded((expanded) => !expanded)}
          className="px-5 py-3 text-left font-medium border-b"
        >
          Filter {filtersExpanded ? "▲" : "▼"}
        </button>
        {filtersExpanded && (
          <div className="p-5 border-b space-y-3">
            <LocationEquipmentPickerGroup
              buildings={buildings}
              floors={floors}
              rooms={rooms}
              selectedBuilding={filterBuilding}
              selectedFloor={filterFloor}
              selectedRoom={filterRoom}
              showEquipment={false}
              onLocationChange={({ building, floor, room }) => {
                setFilterBuilding(building);
                setFilterFloor(floor);
                setFilterRoom(room);
              }}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {filteredEquipment.map((item) => {
            const isSelected = stagedSelection.has(item.EquipmentCode);
            return (
              <article key={item.EquipmentCode} className="p-3 border rounded-lg space-y-1">
                <div className="font-semibold">EQ: {item.EquipmentCode}</div>
                <div className="text-sm">{item.EquipmentName}</div>
                <div className="text-xs text-gray-500">
                  {item.RoomCode} • {item.LevelName} • {item.bl_id}
                </div>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() =>
                    setStagedSelection((current) => {
                      const next = new Set(current);
                      if (next.has(item.EquipmentCode)) next.delete(item.EquipmentCode);
                      else next.add(item.EquipmentCode);
                      return next;
                    })
                  }
                  className={`w-full px-3 py-2 rounded text-white font-medium ${
                    isSelected ? "bg-orange-500 hover:bg-orange-600" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {isSelected ? "Unselect" : "Select"}
                </button>
              </article>
            );
          })}
          {filteredEquipment.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-500">No equipment found</p>
          )}
        </div>
        <footer className="sticky bottom-0 bg-white border-t px-5 py-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStagedSelection(new Set())}
            className="flex-1 min-w-[9rem] px-4 py-2 bg-orange-500 text-white rounded"
          >
            Unselect All
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-w-[9rem] px-4 py-2 bg-gray-200 text-gray-800 rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm([...stagedSelection])}
            className="flex-1 min-w-[9rem] px-4 py-2 bg-blue-600 text-white rounded"
          >
            Confirm Selection
          </button>
        </footer>
      </section>
    </div>
  );
}
