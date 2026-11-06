"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  MapPin,
  FileUp,
  Plus,
  Trash2,
  Edit,
} from "lucide-react";
import { useApp } from "@/lib/hooks/useApp";
import { getSampleData } from "@/lib/utils/sampleData";
import type { Building, Floor, Room } from "@cafm/shared-schema";

export function LocationHierarchyManager() {
  const {
    selectedBuilding,
    selectedFloor,
    selectedRoom,
    setSelectedBuilding,
    setSelectedFloor,
    setSelectedRoom,
    useSampleData,
  } = useApp();

  const sampleData = useSampleData ? getSampleData() : { buildings: [], floors: [], rooms: [] };

  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showUploadDwg, setShowUploadDwg] = useState(false);
  const [dwgFile, setDwgFile] = useState<File | null>(null);

  // Filter floors by selected building
  const availableFloors = useMemo(() => {
    if (!selectedBuilding) return sampleData.floors;
    return sampleData.floors.filter((f) => f.bl_id === selectedBuilding.bl_id);
  }, [selectedBuilding, sampleData.floors]);

  // Filter rooms by selected floor
  const availableRooms = useMemo(() => {
    if (!selectedFloor) return sampleData.rooms;
    return sampleData.rooms.filter(
      (r) =>
        r.bl_id === selectedFloor.bl_id &&
        r.LevelName === selectedFloor.LevelName,
    );
  }, [selectedFloor, sampleData.rooms]);

  const handleBuildingChange = (buildingId: string) => {
    const building = sampleData.buildings.find((b) => b.bl_id === buildingId);
    setSelectedBuilding(building || null);
    setSelectedFloor(null);
    setSelectedRoom(null);
  };

  const handleFloorChange = (floorIndex: string) => {
    const floor = availableFloors.find(
      (f) => `${f.bl_id}:${f.LevelName}` === floorIndex,
    );
    setSelectedFloor(floor || null);
    setSelectedRoom(null);
  };

  const handleRoomChange = (roomCode: string) => {
    const room = availableRooms.find((r) => r.RoomCode === roomCode);
    setSelectedRoom(room || null);
  };

  const handleDwgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDwgFile(file);
    
    // Simulate dry-run extraction
    console.log(`Dry-run: Processing ${file.name} for floor plan extraction`);
    alert(
      `Simulated CAD extraction: File "${file.name}" would extract ${3}-${5} rooms with net areas.\n\nIn production, this connects to the previewCadExtractionDryRun Cloud Function.`,
    );
    
    setShowUploadDwg(false);
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Cascading Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <MapPin size={24} className="text-blue-600" />
            Cascading Location Hierarchy
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Building Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Building</label>
              <div className="relative">
                <select
                  value={selectedBuilding?.bl_id || ""}
                  onChange={(e) => handleBuildingChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white pr-8"
                >
                  <option value="">-- Select Building --</option>
                  {sampleData.buildings.map((b) => (
                    <option key={b.bl_id} value={b.bl_id}>
                      {b.Name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={18}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none"
                />
              </div>
              {selectedBuilding && (
                <p className="text-xs text-gray-500">{selectedBuilding.Address}</p>
              )}
            </div>

            {/* Floor Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">
                Floor {selectedBuilding ? "✓" : ""}
              </label>
              <div className="relative">
                <select
                  value={
                    selectedFloor
                      ? `${selectedFloor.bl_id}:${selectedFloor.LevelName}`
                      : ""
                  }
                  onChange={(e) => handleFloorChange(e.target.value)}
                  disabled={!selectedBuilding}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white pr-8 disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="">-- Select Floor --</option>
                  {availableFloors.map((f) => (
                    <option key={`${f.bl_id}:${f.LevelName}`} value={`${f.bl_id}:${f.LevelName}`}>
                      {f.LevelName} ({f.GrossAreaM2 || 0} m²)
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={18}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none"
                />
              </div>
              {selectedFloor && (
                <p className="text-xs text-gray-500">
                  Floor {selectedFloor.FloorNumber} • {selectedFloor.GrossAreaM2 || 0} m²
                </p>
              )}
            </div>

            {/* Room Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">
                Room {selectedFloor ? "✓" : ""}
              </label>
              <div className="relative">
                <select
                  value={selectedRoom?.RoomCode || ""}
                  onChange={(e) => handleRoomChange(e.target.value)}
                  disabled={!selectedFloor}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white pr-8 disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="">-- Select Room --</option>
                  {availableRooms.map((r) => (
                    <option key={r.RoomCode} value={r.RoomCode}>
                      {r.RoomCode} - {r.Name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={18}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none"
                />
              </div>
              {selectedRoom && (
                <p className="text-xs text-gray-500">
                  {selectedRoom.RoomCategory} • {selectedRoom.NetAreaM2 || 0} m²
                </p>
              )}
            </div>
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
            Floor Plan CAD Upload (DWG/DXF)
          </h3>

          {selectedFloor ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Upload DWG or DXF file for:{" "}
                <span className="font-semibold">
                  {selectedBuilding?.Name} › {selectedFloor.LevelName}
                </span>
              </p>

              {!showUploadDwg ? (
                <button
                  onClick={() => setShowUploadDwg(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                >
                  <FileUp size={18} />
                  Choose CAD File
                </button>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept=".dwg,.dxf"
                    onChange={handleDwgUpload}
                    className="hidden"
                    id="dwg-input"
                  />
                  <label
                    htmlFor="dwg-input"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <FileUp size={32} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-600">
                      Click to select or drag DWG/DXF file
                    </span>
                    <span className="text-xs text-gray-500">
                      Supported: .dwg, .dxf
                    </span>
                  </label>
                </div>
              )}

              {dwgFile && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-900">
                    <span className="font-semibold">Selected:</span> {dwgFile.name}
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    Dry-run preview shows extracted room boundaries and net areas.
                  </p>
                </div>
              )}
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
