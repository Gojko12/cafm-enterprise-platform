"use client";

import React, { useState } from "react";
import { X, Camera, Clock } from "lucide-react";

interface FastJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: FastJobData) => void;
}

export interface FastJobData {
  equipmentCode: string;
  bl_id: string;
  levelName: string;
  roomCode: string;
  description: string;
  photoUrl?: string;
  timeSpentMinutes: number;
  createdAt: string;
}

export function FastJobModal({ isOpen, onClose, onSubmit }: FastJobModalProps) {
  const [step, setStep] = useState<"select-location" | "create-job">("select-location");
  const [selectedEquipment, setSelectedEquipment] = useState("");
  const [selectedBuildingLevel, setSelectedBuildingLevel] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [description, setDescription] = useState("");
  const [timeSpent, setTimeSpent] = useState(30);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>();

  if (!isOpen) return null;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = () => {
    if (step === "select-location") {
      if (selectedEquipment && selectedBuildingLevel && selectedRoom) {
        setStep("create-job");
      }
    } else {
      if (description && selectedEquipment && selectedBuildingLevel && selectedRoom) {
        onSubmit?.({
          equipmentCode: selectedEquipment,
          bl_id: selectedBuildingLevel.split("/")[0] || "",
          levelName: selectedBuildingLevel.split("/")[1] || "",
          roomCode: selectedRoom,
          description,
          photoUrl: photoPreview,
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
    setSelectedEquipment("");
    setSelectedBuildingLevel("");
    setSelectedRoom("");
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Equipment *
                </label>
                <select
                  value={selectedEquipment}
                  onChange={(e) => setSelectedEquipment(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose Equipment...</option>
                  <option value="0000000001">
                    0000000001 - HVAC Unit (Building A)
                  </option>
                  <option value="0000000002">
                    0000000002 - Electrical Panel (Building B)
                  </option>
                  <option value="0000000003">
                    0000000003 - Water Pump (Building C)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Building / Floor *
                </label>
                <select
                  value={selectedBuildingLevel}
                  onChange={(e) => setSelectedBuildingLevel(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose Location...</option>
                  <option value="BL001/Floor1">
                    BL001 / Floor 1
                  </option>
                  <option value="BL001/Floor2">
                    BL001 / Floor 2
                  </option>
                  <option value="BL002/Floor1">
                    BL002 / Floor 1
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Room *
                </label>
                <select
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose Room...</option>
                  <option value="R101">R101 - Server Room</option>
                  <option value="R102">R102 - Office</option>
                  <option value="R103">R103 - Storage</option>
                </select>
              </div>

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
                    • Location: <strong>{selectedBuildingLevel} / {selectedRoom}</strong>
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
                ? !selectedEquipment || !selectedBuildingLevel || !selectedRoom
                : !description || !selectedEquipment
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
