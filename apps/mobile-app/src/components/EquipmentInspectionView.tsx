import React, { useState, useEffect } from "react";
import { Equipment, BaseWorkRequest, Building, Floor, Room } from "@cafm/shared-schema";
import { LocationEquipmentPickerGroup } from "./LocationEquipmentPickerGroup";

interface EquipmentInspectionViewProps {
  equipment: Equipment;
  activeWRs: BaseWorkRequest[];
  historicalWRs: BaseWorkRequest[];
  buildings?: Building[];
  floors?: Floor[];
  rooms?: Room[];
  equipmentList?: Equipment[];
  onStartPM?: () => void;
  onCreateFJ?: (data: {
    equipmentCode: string;
    bl_id: string;
    levelName: string;
    roomCode: string;
    description: string;
    photoUrl?: string;
  }) => void | Promise<void>;
  onCreateLJ?: (data: {
    equipmentCodes: string[];
    bl_id: string;
    levelName: string;
    roomCode?: string;
    description: string;
  }) => void | Promise<void>;
  onLogTechnicalAudit?: () => void;
  onDeskCheckIn?: () => void;
  onClose?: () => void;
}

export const EquipmentInspectionView: React.FC<EquipmentInspectionViewProps> = ({
  equipment,
  activeWRs,
  historicalWRs,
  buildings = [],
  floors = [],
  rooms = [],
  equipmentList = [],
  onStartPM,
  onCreateFJ,
  onCreateLJ,
  onLogTechnicalAudit,
  onDeskCheckIn,
  onClose,
}) => {
  const [showFJModal, setShowFJModal] = useState(false);
  const [showLJModal, setShowLJModal] = useState(false);
  const [fjDescription, setFjDescription] = useState("");
  const [fjPhoto, setFjPhoto] = useState<string | null>(null);
  const [ljDescription, setLjDescription] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<Floor | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [selectedEquipmentCodes, setSelectedEquipmentCodes] = useState<Set<string>>(
    () => new Set([equipment.EquipmentCode]),
  );

  useEffect(() => {
    setSelectedBuilding(
      buildings.find((item) => item.bl_id === equipment.bl_id) ?? null,
    );
    setSelectedFloor(
      floors.find(
        (item) =>
          item.bl_id === equipment.bl_id && item.LevelName === equipment.LevelName,
      ) ?? null,
    );
    setSelectedRoom(
      rooms.find(
        (item) =>
          item.bl_id === equipment.bl_id &&
          item.LevelName === equipment.LevelName &&
          item.RoomCode === equipment.RoomCode,
      ) ?? null,
    );
    setSelectedEquipmentCodes(new Set([equipment.EquipmentCode]));
  }, [equipment, buildings, floors, rooms]);

  const handleCreateFJ = () => {
    setShowFJModal(true);
  };

  const handleFJComplete = async () => {
    if (!fjDescription.trim()) {
      alert("Please enter a description");
      return;
    }
    const equipmentCode =
      selectedEquipmentCodes.size === 1
        ? Array.from(selectedEquipmentCodes)[0]
        : undefined;
    if (!equipmentCode || !selectedBuilding || !selectedFloor || !selectedRoom) {
      alert("Select one equipment item and a complete building, floor, and room.");
      return;
    }
    try {
      await onCreateFJ?.({
        equipmentCode,
        bl_id: selectedBuilding.bl_id,
        levelName: selectedFloor.LevelName,
        roomCode: selectedRoom.RoomCode,
        description: fjDescription.trim(),
        photoUrl: fjPhoto || undefined,
      });
      setShowFJModal(false);
      setFjDescription("");
      setFjPhoto(null);
    } catch (error) {
      console.error("Could not create Fast Job", error);
      alert("Could not save the Fast Job. Please try again.");
    }
  };

  const handleLJComplete = async () => {
    if (!ljDescription.trim() || !selectedBuilding || !selectedFloor) {
      alert("Enter a description and select a building and floor.");
      return;
    }
    try {
      await onCreateLJ?.({
        equipmentCodes: Array.from(selectedEquipmentCodes),
        bl_id: selectedBuilding.bl_id,
        levelName: selectedFloor.LevelName,
        roomCode: selectedRoom?.RoomCode,
        description: ljDescription.trim(),
      });
      setShowLJModal(false);
      setLjDescription("");
    } catch (error) {
      console.error("Could not create Long Job", error);
      alert("Could not save the Long Job. Please try again.");
    }
  };

  const onLocationChange = ({
    building,
    floor,
    room,
  }: {
    building: Building | null;
    floor: Floor | null;
    room: Room | null;
  }) => {
    setSelectedBuilding(building);
    setSelectedFloor(floor);
    setSelectedRoom(room);
  };

  const handleEquipmentChange = (codes: Set<string>) => {
    setSelectedEquipmentCodes(codes);
    if (codes.size !== 1) return;
    const selected = equipmentList.find(
      (item) => item.EquipmentCode === Array.from(codes)[0],
    );
    if (!selected) return;
    setSelectedBuilding(
      buildings.find((item) => item.bl_id === selected.bl_id) ?? null,
    );
    setSelectedFloor(
      floors.find(
        (item) =>
          item.bl_id === selected.bl_id && item.LevelName === selected.LevelName,
      ) ?? null,
    );
    setSelectedRoom(
      rooms.find(
        (item) =>
          item.bl_id === selected.bl_id &&
          item.LevelName === selected.LevelName &&
          item.RoomCode === selected.RoomCode,
      ) ?? null,
    );
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFjPhoto(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const getLocationDisplay = () => {
    return `${equipment.bl_id} / ${equipment.LevelName} / ${equipment.RoomCode}`;
  };

  return (
    <div className="flex flex-col h-full bg-white mobile-equipment-inspection">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between z-40">
        <div>
          <h2 className="text-lg font-bold">{equipment.EquipmentName}</h2>
          <p className="text-xs text-gray-600">{equipment.EquipmentCode}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 font-bold text-xl"
          aria-label="Close inspection view"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-24">
        {/* Equipment Details */}
        <section className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Details</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-600">Location:</span>
              <span className="font-medium text-gray-900">{getLocationDisplay()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Serial:</span>
              <span className="font-medium text-gray-900">{equipment.SerialNumber || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Manufacturer:</span>
              <span className="font-medium text-gray-900">{equipment.Manufacturer || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Model:</span>
              <span className="font-medium text-gray-900">{equipment.Model || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Trade:</span>
              <span className="font-medium text-gray-900">
                {equipment.PrimaryTradeId || "—"}
              </span>
            </div>
          </div>
        </section>

        {/* Active Work Requests */}
        <section>
          <h3 className="text-sm font-bold text-gray-900 mb-2">
            Active WRs ({activeWRs.length})
          </h3>
          {activeWRs.length === 0 ? (
            <p className="text-xs text-gray-600">No active work requests</p>
          ) : (
            <div className="space-y-2">
              {activeWRs.slice(0, 5).map((wr) => (
                <div key={wr.WR_ID} className="bg-blue-50 border border-blue-200 rounded p-2">
                  <div className="text-xs font-medium text-gray-900">{wr.WR_ID}</div>
                  <div className="text-xs text-gray-600">{wr.Description}</div>
                  <div className="text-xs text-blue-600 mt-1">{wr.Percentage || 50}%</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Historical WRs */}
        <section>
          <h3 className="text-sm font-bold text-gray-900 mb-2">
            Historical ({historicalWRs.length})
          </h3>
          {historicalWRs.length === 0 ? (
            <p className="text-xs text-gray-600">No historical work requests</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {historicalWRs.slice(0, 10).map((wr) => (
                <div key={wr.WR_ID} className="bg-gray-50 border border-gray-200 rounded p-2">
                  <div className="text-xs font-medium text-gray-900">{wr.WR_ID}</div>
                  <div className="text-xs text-gray-600 truncate">{wr.Description}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 space-y-2 mobile-equipment-actions">
        <button
          onClick={onStartPM}
          className="w-full px-4 py-3 bg-blue-500 text-white font-medium rounded hover:bg-blue-600 transition-colors text-sm"
        >
          Start Assigned PM
        </button>

        {onCreateFJ && <button
          onClick={handleCreateFJ}
          className="w-full px-4 py-3 bg-green-500 text-white font-medium rounded hover:bg-green-600 transition-colors text-sm"
        >
          Create Fast Job (&lt;750€)
        </button>}

        {onCreateLJ && <button
          onClick={() => setShowLJModal(true)}
          className="w-full px-4 py-3 bg-orange-500 text-white font-medium rounded hover:bg-orange-600 transition-colors text-sm"
        >
          Create Long Job (≥750€)
        </button>}

        <div className="flex gap-2">
          {onLogTechnicalAudit && <button
            onClick={onLogTechnicalAudit}
            className="flex-1 px-4 py-2 bg-purple-500 text-white font-medium rounded hover:bg-purple-600 transition-colors text-sm"
          >
            Technical Audit
          </button>}
          <button
            onClick={onDeskCheckIn}
            className="flex-1 px-4 py-2 bg-gray-500 text-white font-medium rounded hover:bg-gray-600 transition-colors text-sm"
          >
            Desk Check-In
          </button>
        </div>
      </div>

      {/* Fast Job Modal */}
      {showFJModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end mobile-fj-modal">
          <div className="w-full bg-white rounded-t-lg p-4 max-h-screen overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Create Fast Job</h3>

            <div className="space-y-4">
              <LocationEquipmentPickerGroup
                buildings={buildings}
                floors={floors}
                rooms={rooms}
                equipment={equipmentList}
                selectedBuilding={selectedBuilding}
                selectedFloor={selectedFloor}
                selectedRoom={selectedRoom}
                selectedEquipmentCodes={selectedEquipmentCodes}
                onLocationChange={onLocationChange}
                onEquipmentChange={handleEquipmentChange}
              />
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Description
                </label>
                <textarea
                  value={fjDescription}
                  onChange={(e) => setFjDescription(e.target.value)}
                  placeholder="Brief description of the issue..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  aria-label="Fast job description"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Photo (optional)
                </label>
                {fjPhoto ? (
                  <div className="relative">
                    <img
                      src={fjPhoto}
                      alt="Fast job photo"
                      className="w-full h-40 object-cover rounded"
                    />
                    <button
                      onClick={() => setFjPhoto(null)}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center"
                      aria-label="Remove photo"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label className="block">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoCapture}
                      capture="environment"
                      className="hidden"
                      aria-label="Capture photo"
                    />
                    <div className="w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-blue-400 transition-colors">
                      <p className="text-sm text-gray-600">Tap to capture photo</p>
                    </div>
                  </label>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowFJModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 font-medium rounded hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFJComplete}
                  className="flex-1 px-4 py-3 bg-green-500 text-white font-medium rounded hover:bg-green-600 transition-colors"
                >
                  Complete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLJModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end mobile-lj-modal">
          <div className="w-full bg-white rounded-t-lg p-4 max-h-[95vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Create Long Job</h3>
              <button
                type="button"
                onClick={() => setShowLJModal(false)}
                aria-label="Close Long Job modal"
                className="p-2"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <LocationEquipmentPickerGroup
                buildings={buildings}
                floors={floors}
                rooms={rooms}
                equipment={equipmentList}
                selectedBuilding={selectedBuilding}
                selectedFloor={selectedFloor}
                selectedRoom={selectedRoom}
                selectedEquipmentCodes={selectedEquipmentCodes}
                onLocationChange={onLocationChange}
                onEquipmentChange={handleEquipmentChange}
              />
              <textarea
                value={ljDescription}
                onChange={(event) => setLjDescription(event.target.value)}
                placeholder="Long Job description..."
                aria-label="Long Job description"
                rows={4}
                className="w-full px-3 py-2 border rounded text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowLJModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLJComplete}
                  className="flex-1 px-4 py-3 bg-orange-500 text-white rounded"
                >
                  Create Long Job
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
