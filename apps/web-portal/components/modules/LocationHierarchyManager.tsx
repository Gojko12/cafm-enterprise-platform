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
