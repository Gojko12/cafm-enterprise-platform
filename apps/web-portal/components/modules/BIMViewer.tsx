"use client";

import React, { useState } from "react";
import { AlertCircle, Sliders, Eye, Upload, Layers } from "lucide-react";
import { useApp } from "@/lib/hooks/useApp";
import { getSampleData } from "@/lib/utils/sampleData";

export function BIMViewer() {
  const { useSampleData } = useApp();
  const sampleData = useSampleData ? getSampleData() : { equipment: [] };

  const [sectionBoxEnabled, setSectionBoxEnabled] = useState(false);
  const [clippingPlane, setClippingPlane] = useState(50);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [ifcFile, setIfcFile] = useState<File | null>(null);

  const handleIfcUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIfcFile(file);
      alert(
        `Simulated IFC loading: ${file.name}\n\nIn production, this loads via web-ifc library into Three.js viewport.`,
      );
    }
  };

  const handleAssetClick = (equipmentCode: string) => {
    setSelectedAsset(equipmentCode);
    const equipment = sampleData.equipment.find(
      (e) => e.EquipmentCode === equipmentCode,
    );
    console.log("Asset selected in 3D viewer:", equipment);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="max-w-full mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">3D BIM Model Viewer</h1>
          <p className="text-sm text-gray-600 mt-1">
            Interactive Three.js / web-ifc viewer with bidirectional asset linking
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* 3D Viewport */}
        <div className="flex-1 bg-gray-900 rounded-lg border border-gray-300 overflow-hidden relative shadow-lg">
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <Layers size={64} className="text-gray-700 mx-auto mb-4" />
              <div className="text-gray-300">
                <p className="text-lg font-semibold mb-2">3D BIM Viewport</p>
                <p className="text-sm text-gray-500">
                  In production: Three.js + web-ifc rendering engine
                </p>
                <p className="text-sm text-gray-500">
                  Camera controls: Orbit | Section box | Clipping planes
                </p>
              </div>
            </div>
          </div>

          {/* Viewport Controls Overlay */}
          <div className="absolute top-4 right-4 bg-white rounded-lg border border-gray-300 shadow-lg p-3 space-y-3">
            <div className="text-xs font-semibold text-gray-700 border-b pb-2">
              Viewport Controls
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sectionBoxEnabled}
                  onChange={(e) => setSectionBoxEnabled(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-xs font-medium text-gray-700">
                  Section Box
                </span>
              </label>

              {sectionBoxEnabled && (
                <div>
                  <label className="text-xs text-gray-600 font-medium">
                    Clipping Plane: {clippingPlane}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={clippingPlane}
                    onChange={(e) => setClippingPlane(Number(e.target.value))}
                    className="w-full h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer mt-2 pt-2 border-t">
                <input
                  type="checkbox"
                  defaultChecked
                  className="rounded border-gray-300"
                />
                <span className="text-xs font-medium text-gray-700">
                  Show Storeys
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Asset List & Controls */}
        <div className="w-96 bg-white rounded-lg border border-gray-300 overflow-hidden flex flex-col shadow-lg">
          {/* Upload Section */}
          <div className="bg-blue-50 border-b border-blue-200 p-4">
            <label htmlFor="ifc-input" className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
              <Upload size={18} />
              <span>Upload .IFC Model</span>
            </label>
            <input
              id="ifc-input"
              type="file"
              accept=".ifc"
              onChange={handleIfcUpload}
              className="hidden"
            />
            {ifcFile && (
              <p className="text-xs text-blue-600 mt-2">
                <strong>Loaded:</strong> {ifcFile.name}
              </p>
            )}
          </div>

          {/* Asset List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 border-b border-gray-200">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Sliders size={16} />
                BIM-Linked Equipment
              </p>
            </div>

            <div className="space-y-2 p-4">
              {sampleData.equipment.map((equipment) => (
                <div
                  key={equipment.EquipmentCode}
                  onClick={() => handleAssetClick(equipment.EquipmentCode)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedAsset === equipment.EquipmentCode
                      ? "bg-blue-100 border-blue-400"
                      : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  <div className="text-xs font-mono text-gray-600">
                    {equipment.EquipmentCode}
                  </div>
                  <div className="text-sm font-semibold text-gray-900 mt-1">
                    {equipment.EquipmentName}
                  </div>
                  {equipment.BIM_GlobalId && (
                    <div className="text-xs text-gray-500 mt-1">
                      BIM ID: {equipment.BIM_GlobalId}
                    </div>
                  )}
                  <div className="text-xs text-gray-600 mt-1">
                    {equipment.Manufacturer} {equipment.Model}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Asset Details Drawer */}
          {selectedAsset && (
            <div className="bg-blue-50 border-t border-blue-200 p-4">
              {(() => {
                const asset = sampleData.equipment.find(
                  (e) => e.EquipmentCode === selectedAsset,
                );
                return asset ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-blue-600 font-medium">Code</p>
                      <p className="text-sm font-semibold text-blue-900">
                        {asset.EquipmentCode}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 font-medium">
                        Location
                      </p>
                      <p className="text-sm font-semibold text-blue-900">
                        {asset.bl_id} › {asset.LevelName} › {asset.RoomCode}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 font-medium">
                        Status
                      </p>
                      <p className="text-sm font-semibold text-blue-900">
                        {asset.Status} • {asset.Criticality}
                      </p>
                    </div>
                    <button className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                      View Full Profile
                    </button>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
