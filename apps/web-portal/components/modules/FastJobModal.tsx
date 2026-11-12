"use client";

import React, { useEffect, useState } from "react";
import { X, Camera, Clock } from "lucide-react";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useCafmStore } from "@/lib/cafm-store";
import { LocationEquipmentPickerGroup } from "@/components/common/LocationEquipmentPickerGroup";

interface FastJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: FastJobData) => void;
  /** Pre-fills the location step (e.g. from a selected 3D room). */
  initialLocation?: { bl_id: string; levelName: string; roomCode: string } | null;
}

export interface FastJobData {
  equipmentCode: string;
  bl_id: string;
  levelName: string;
  roomCode: string;
  description: string;
  photoUrl?: string;
  photoName?: string;
  photoType?: string;
  timeSpentMinutes: number;
  createdAt: string;
}

export function FastJobModal({ isOpen, onClose, onSubmit, initialLocation }: FastJobModalProps) {
  const [step, setStep] = useState<"select-location" | "create-job">("select-location");
  const [selectedEquipmentCodes, setSelectedEquipmentCodes] = useState<string[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState("");
  const [selectedLevelName, setSelectedLevelName] = useState("");
  const [selectedRoomCode, setSelectedRoomCode] = useState("");
  const [description, setDescription] = useState("");
  const [timeSpent, setTimeSpent] = useState(30);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>();
  const { activeSiteId } = useSiteContext();
  const { data } = useCafmStore();
  const buildings = data.buildings.filter((item) => item.SiteId === activeSiteId);
  const floors = data.floors.filter((item) => item.SiteId === activeSiteId);
  const rooms = data.rooms.filter((item) => item.SiteId === activeSiteId);
  const equipment = data.equipment.filter((item) => item.SiteId === activeSiteId);
  const selectedBuilding =
    buildings.find((item) => item.bl_id === selectedBuildingId) ?? null;
  const selectedFloor =
    floors.find(
      (item) =>
        item.bl_id === selectedBuildingId && item.LevelName === selectedLevelName,
    ) ?? null;
  const selectedRoom =
    rooms.find(
      (item) =>
        item.bl_id === selectedBuildingId &&
        item.LevelName === selectedLevelName &&
        item.RoomCode === selectedRoomCode,
    ) ?? null;
  const selectedEquipment = selectedEquipmentCodes[0] || "";

  useEffect(() => {
    if (!isOpen || !initialLocation) return;
    setSelectedBuildingId(initialLocation.bl_id);
    setSelectedLevelName(initialLocation.levelName);
    setSelectedRoomCode(initialLocation.roomCode);
  }, [isOpen, initialLocation]);

  if (!isOpen) return null;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      setPhotoPreview(undefined);
      reader.onerror = () => {
        setPhotoFile(null);
        alert("Could not read the selected photo.");
      };
      reader.onload = () => {
        if (typeof reader.result !== "string") {
          setPhotoFile(null);
          alert("Could not read the selected photo.");
          return;
        }
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = () => {
    if (photoFile && !photoPreview) {
      alert("Wait for the selected photo to finish loading.");
      return;
    }
    if (step === "select-location") {
      if (selectedEquipmentCodes.length === 1 && selectedBuildingId && selectedLevelName && selectedRoomCode) {
        setStep("create-job");
      }
    } else {
      if (description && selectedEquipmentCodes.length === 1 && selectedBuildingId && selectedLevelName && selectedRoomCode) {
        onSubmit?.({
          equipmentCode: selectedEquipment,
          bl_id: selectedBuildingId,
          levelName: selectedLevelName,
          roomCode: selectedRoomCode,
          description,
          photoUrl: photoPreview,
          photoName: photoFile?.name,
          photoType: photoFile?.type,
          timeSpentMinutes: timeSpent,
          createdAt: new Date().toISOString(),
        });
        handleReset();
        onClose();
      }
    }
  };

  const handleReset = () => {
    setStep("select-location");
    setSelectedEquipmentCodes([]);
    setSelectedBuildingId("");
    setSelectedLevelName("");
    setSelectedRoomCode("");
    setDescription("");
    setTimeSpent(30);
    setPhotoFile(null);
    setPhotoPreview(undefined);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            Create Fast Job (30 Seconds)
          </h2>
          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          {step === "select-location" ? (
            // Step 1: Select Location & Equipment
            <div className="space-y-4">
              <LocationEquipmentPickerGroup
                buildings={buildings}
                floors={floors}
                rooms={rooms}
                equipment={equipment}
                selectedBuilding={selectedBuilding}
                selectedFloor={selectedFloor}
                selectedRoom={selectedRoom}
                selectedEquipmentCodes={selectedEquipmentCodes}
                onLocationChange={({ building, floor, room }) => {
                  setSelectedBuildingId(building?.bl_id || "");
                  setSelectedLevelName(floor?.LevelName || "");
                  setSelectedRoomCode(room?.RoomCode || "");
                }}
                onEquipmentChange={(codes) => {
                  setSelectedEquipmentCodes(codes);
                  if (codes.length === 1) {
                    const item = equipment.find((candidate) => candidate.EquipmentCode === codes[0]);
                    if (item) {
                      setSelectedBuildingId(item.bl_id);
                      setSelectedLevelName(item.LevelName);
                      setSelectedRoomCode(item.RoomCode);
                    }
                  }
                }}
              />

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  ⚡ <strong>Tip:</strong> You can also scan the equipment QR code to
                  auto-fill these fields
                </p>
              </div>
            </div>
          ) : (
            // Step 2: Create Job Details
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Replace broken lamp in hallway"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time Spent (minutes)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="5"
                    max="480"
                    step="5"
                    value={timeSpent}
                    onChange={(e) => setTimeSpent(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg min-w-fit">
                    <Clock size={18} className="text-gray-600" />
                    <span className="font-semibold text-gray-900">
                      {timeSpent} min
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Photo Evidence
                </label>
                {!photoPreview ? (
                  <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                    <Camera size={32} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">
                      Click to take or upload photo
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="space-y-2">
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="max-h-48 rounded-lg border border-gray-300"
                    />
                    <button
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoPreview(undefined);
                      }}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Remove Photo
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold text-green-900">
                  ✓ Quick Summary
                </p>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>
                    • Equipment: <strong>{selectedEquipment}</strong>
                  </li>
                  <li>
                    • Location: <strong>{selectedBuildingId} / {selectedLevelName} / {selectedRoomCode}</strong>
                  </li>
                  <li>
                    • Time: <strong>{timeSpent} minutes</strong>
                  </li>
                  <li>
                    • Status: <strong>Auto-marked 78% Technically Completed</strong>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={() => {
              if (step === "create-job") {
                setStep("select-location");
              } else {
                handleReset();
                onClose();
              }
            }}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            {step === "create-job" ? "Back" : "Cancel"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              step === "select-location"
                ? selectedEquipmentCodes.length !== 1 || !selectedBuildingId || !selectedLevelName || !selectedRoomCode
                : !description || selectedEquipmentCodes.length !== 1
            }
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {step === "select-location" ? "Next →" : "Submit & Close (78%)"}
          </button>
        </div>
      </div>
    </div>
  );
}
