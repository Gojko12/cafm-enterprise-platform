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
  const [showUploadDwg, setShowUploadDwg] = useState(false);
  const [dwgFile, setDwgFile] = useState<File | null>(null);

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
