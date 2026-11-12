import { notify } from "../lib/toast";
import { PhotoCapture } from "../../../web-portal/components/common/PhotoCapture";
import React, { useState, useEffect } from "react";
import { Equipment, BaseWorkRequest, Building, Floor, Room } from "@cafm/shared-schema";
import { LocationEquipmentPickerGroup } from "./LocationEquipmentPickerGroup";
import { EquipmentDetailsSheet } from "./EquipmentDetailsSheet";

interface EquipmentInspectionViewProps {
  equipment: Equipment;
  activeWRs: BaseWorkRequest[];
  historicalWRs: BaseWorkRequest[];
  buildings?: Building[];
  floors?: Floor[];
  rooms?: Room[];
  equipmentList?: Equipment[];
  onStartPM?: () => void;
  onOpenWR?: (wrId: string) => void;
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
  onOpenWR,
  onCreateFJ,
  onLogTechnicalAudit,
  onDeskCheckIn,
  onClose,
}) => {
  const [showFJModal, setShowFJModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [activeOpen, setActiveOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fjDescription, setFjDescription] = useState("");
  const [fjPhoto, setFjPhoto] = useState<string | null>(null);
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
      notify("Please enter a description");
      return;
    }
    const equipmentCode =
      selectedEquipmentCodes.size === 1
        ? Array.from(selectedEquipmentCodes)[0]
        : undefined;
    if (!equipmentCode || !selectedBuilding || !selectedFloor || !selectedRoom) {
      notify("Select one equipment item and a complete building, floor, and room.");
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
      notify("Could not save the Fast Job. Please try again.");
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

        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
        >
          View Full Details, Docs, Floor Plan &amp; BIM {"\u2192"}
        </button>

        {/* Active Work Requests */}
        <section>
          <button
            type="button"
            aria-expanded={activeOpen}
            onClick={() => setActiveOpen((open) => !open)}
            className="w-full flex items-center justify-between text-sm font-bold text-gray-900 mb-2"
          >
            <span>Active WRs ({activeWRs.length})</span>
            <span aria-hidden="true" className={`text-xs text-gray-500 transition-transform ${activeOpen ? "rotate-180" : ""}`}>{"\u25be"}</span>
          </button>
          {activeOpen && (activeWRs.length === 0 ? (
            <p className="text-xs text-gray-600">No active work requests</p>
          ) : (
            <div className="space-y-2">
              {activeWRs.slice(0, 20).map((wr) => (
                <button type="button" key={wr.WR_ID} onClick={() => onOpenWR?.(wr.WR_ID)} className="w-full rounded-lg border border-blue-200 bg-blue-50 p-2 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-900">{wr.WR_ID} <span className="font-normal text-gray-500">{"\u00b7"} {wr.WR_Type}</span></span>
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">{wr.Percentage ?? 50}%</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-gray-600">{wr.Description}</div>
                </button>
              ))}
            </div>
          ))}
        </section>

        {/* Historical WRs */}
        <section>
          <button
            type="button"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
            className="w-full flex items-center justify-between text-sm font-bold text-gray-900 mb-2"
          >
            <span>Historical ({historicalWRs.length})</span>
            <span aria-hidden="true" className={`text-xs text-gray-500 transition-transform ${historyOpen ? "rotate-180" : ""}`}>{"\u25be"}</span>
          </button>
          {historyOpen && (historicalWRs.length === 0 ? (
            <p className="text-xs text-gray-600">No historical work requests</p>
          ) : (
            <div className="space-y-2">
              {historicalWRs.slice(0, 30).map((wr) => (
                <button type="button" key={wr.WR_ID} onClick={() => onOpenWR?.(wr.WR_ID)} className="w-full rounded-lg border border-gray-200 bg-gray-50 p-2 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-900">{wr.WR_ID} <span className="font-normal text-gray-500">{"\u00b7"} {wr.WR_Type}</span></span>
                    <span className="rounded-full bg-gray-500 px-2 py-0.5 text-[11px] font-semibold text-white">{wr.Percentage ?? 100}%</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-gray-600">{wr.Description}</div>
                </button>
              ))}
            </div>
          ))}
        </section>

        {onCreateFJ && (
          <button
            type="button"
            onClick={handleCreateFJ}
            className="w-full rounded-xl border border-slate-300 bg-white py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            + Create Fast Job (FJ)
          </button>
        )}
      </div>

      {/* Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 mobile-equipment-actions">
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

      {showDetails && (
        <EquipmentDetailsSheet
          siteId={equipment.SiteId}
          equipmentCode={equipment.EquipmentCode}
          equipmentName={equipment.EquipmentName}
          onClose={() => setShowDetails(false)}
        />
      )}

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
                  <PhotoCapture multiple={false} onPhotos={(urls) => setFjPhoto(urls[0] ?? null)} />
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

    </div>
  );
};
