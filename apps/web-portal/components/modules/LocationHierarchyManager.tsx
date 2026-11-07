"use client";

import React, { useState, useMemo } from "react";
import {
  MapPin,
  FileUp,
  Plus,
  Trash2,
  Edit,
} from "lucide-react";
import { useApp } from "@/lib/hooks/useApp";
import { useCafmStore } from "@/lib/cafm-store";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { LocationEquipmentPickerGroup } from "@/components/common/LocationEquipmentPickerGroup";
import { CadUpload } from "@/components/modules/CadUpload";
import { OverviewTable } from "@/components/common/TableColumns";
import type { Building, Floor, Room } from "@cafm/shared-schema";

const buildingColumns = [
  { id: "code", label: "Building", value: (item: Building) => item.bl_id },
  { id: "name", label: "Name", value: (item: Building) => item.Name },
  { id: "address", label: "Address", value: (item: Building) => item.Address },
];
const floorColumns = [
  { id: "building", label: "Building", value: (item: Floor) => item.bl_id },
  { id: "floor", label: "Floor", value: (item: Floor) => item.LevelName },
  { id: "number", label: "Floor Number", value: (item: Floor) => item.FloorNumber },
  { id: "area", label: "Gross Area (m²)", value: (item: Floor) => item.GrossAreaM2 },
];
const roomColumns = [
  { id: "building", label: "Building", value: (item: Room) => item.bl_id },
  { id: "floor", label: "Floor", value: (item: Room) => item.LevelName },
  { id: "code", label: "Room", value: (item: Room) => item.RoomCode },
  { id: "name", label: "Name", value: (item: Room) => item.Name },
  { id: "area", label: "Net Area (m²)", value: (item: Room) => item.NetAreaM2 },
];

export function LocationHierarchyManager() {
  const {
    selectedBuilding,
    selectedFloor,
    selectedRoom,
    setSelectedBuilding,
    setSelectedFloor,
    setSelectedRoom,
  } = useApp();

  const { data } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const sampleData = useMemo(() => ({
    buildings: data.buildings.filter((item) => item.SiteId === activeSiteId),
    floors: data.floors.filter((item) => item.SiteId === activeSiteId),
    rooms: data.rooms.filter((item) => item.SiteId === activeSiteId),
  }), [data.buildings, data.floors, data.rooms, activeSiteId]);

  const [showAddRoom, setShowAddRoom] = useState(false);
  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Cascading Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <MapPin size={24} className="text-blue-600" />
            Cascading Location Hierarchy
          </h2>

          <div className="space-y-4">
            <LocationEquipmentPickerGroup
              buildings={sampleData.buildings}
              floors={sampleData.floors}
              rooms={sampleData.rooms}
              selectedBuilding={selectedBuilding}
              selectedFloor={selectedFloor}
              selectedRoom={selectedRoom}
              showEquipment={false}
              onLocationChange={({ building, floor, room }) => {
                setSelectedBuilding(building);
                setSelectedFloor(floor);
                setSelectedRoom(room);
              }}
            />
            {selectedBuilding && (
              <p className="text-xs text-gray-500">{selectedBuilding.Address}</p>
            )}
            {selectedFloor && (
              <p className="text-xs text-gray-500">
                Floor {selectedFloor.FloorNumber} • {selectedFloor.GrossAreaM2 || 0} m²
              </p>
            )}
            {selectedRoom && (
              <p className="text-xs text-gray-500">
                {selectedRoom.RoomCategory} • {selectedRoom.NetAreaM2 || 0} m²
              </p>
            )}
          </div>
        </div>

        <section className="space-y-4 rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Buildings</h2>
          <OverviewTable preferenceKey="locations-buildings" columns={buildingColumns} rows={sampleData.buildings} rowKey={(item) => item.bl_id}
            onRow={(item) => { setSelectedBuilding(item); setSelectedFloor(null); setSelectedRoom(null); }} />
          <h2 className="font-semibold">Floors</h2>
          <OverviewTable preferenceKey="locations-floors" columns={floorColumns} rows={sampleData.floors.filter((item) => !selectedBuilding || item.bl_id === selectedBuilding.bl_id)}
            rowKey={(item) => `${item.bl_id}:${item.LevelName}`} onRow={(item) => { setSelectedBuilding(sampleData.buildings.find((building) => building.bl_id === item.bl_id) ?? null); setSelectedFloor(item); setSelectedRoom(null); }} />
          <h2 className="font-semibold">Rooms</h2>
          <OverviewTable preferenceKey="locations-rooms" columns={roomColumns} rows={sampleData.rooms.filter((item) => (!selectedBuilding || item.bl_id === selectedBuilding.bl_id) && (!selectedFloor || item.LevelName === selectedFloor.LevelName))}
            rowKey={(item) => `${item.bl_id}:${item.LevelName}:${item.RoomCode}`} onRow={(item) => { setSelectedBuilding(sampleData.buildings.find((building) => building.bl_id === item.bl_id) ?? null); setSelectedFloor(sampleData.floors.find((floor) => floor.bl_id === item.bl_id && floor.LevelName === item.LevelName) ?? null); setSelectedRoom(item); }} />
        </section>

        {/* Selected Room Details */}
        {selectedRoom && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">
              Room Details: {selectedRoom.RoomCode}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-blue-600 font-medium">Name</p>
                <p className="text-sm font-semibold text-blue-900">
                  {selectedRoom.Name}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600 font-medium">Net Area</p>
                <p className="text-sm font-semibold text-blue-900">
                  {selectedRoom.NetAreaM2} m²
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600 font-medium">Category</p>
                <p className="text-sm font-semibold text-blue-900">
                  {selectedRoom.RoomCategory}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600 font-medium">Department</p>
                <p className="text-sm font-semibold text-blue-900">
                  {selectedRoom.Department || "—"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* DWG/DXF Upload Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileUp size={20} className="text-amber-600" />
            Floor Plan CAD Upload (DXF)
          </h3>

          {selectedFloor ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Upload a DXF file for:{" "}
                <span className="font-semibold">
                  {selectedBuilding?.Name} › {selectedFloor.LevelName}
                </span>
              </p>

              <CadUpload floor={selectedFloor} />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr><th>Room code</th><th>Name</th><th>Net area (m²)</th></tr>
                  </thead>
                  <tbody>
                    {sampleData.rooms
                      .filter((room) => room.bl_id === selectedFloor.bl_id && room.LevelName === selectedFloor.LevelName)
                      .map((room) => (
                        <tr key={room.RoomCode} className="border-t">
                          <td>{room.RoomCode}</td><td>{room.Name}</td><td>{room.NetAreaM2 ?? "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">
              Select a floor first to upload a CAD file.
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
            <Edit size={18} />
            Edit Location
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
            <Trash2 size={18} />
            Delete
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={18} />
            Add New Room
          </button>
        </div>
      </div>
    </div>
  );
}
