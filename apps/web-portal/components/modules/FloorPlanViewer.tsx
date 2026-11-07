"use client";

import React, { useState, useRef, useEffect } from "react";
import { ZoomIn, ZoomOut, Info, AlertCircle } from "lucide-react";
import { useApp } from "@/lib/hooks/useApp";
import { useCafmStore } from "@/lib/cafm-store";
import type { Room } from "@cafm/shared-schema";
import { CadUpload } from "@/components/modules/CadUpload";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { resolveEquipmentLocation, type EquipmentLocationQuery } from "@/lib/equipment-locator";

export function FloorPlanViewer() {
  const { selectedFloor: selectedFloorFromApp } = useApp();
  const { data: sampleData } = useCafmStore();
  const { activeSiteId } = useSiteContext();
  const [locator, setLocator] = useState<EquipmentLocationQuery | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.has("eqId")) setLocator({ building: query.get("buildingId") ?? "", floor: query.get("floorId") ?? "", room: query.get("roomId") ?? "", equipment: query.get("eqId") ?? "" });
  }, []);
  const resolved = locator ? resolveEquipmentLocation(locator, activeSiteId, sampleData) : null;
  const equipment = resolved?.equipment;
  const selectedFloor = locator ? resolved?.floor ?? null : selectedFloorFromApp;
  const locatedRoom = resolved?.room;

  const [zoomLevel, setZoomLevel] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedRoomForInspection, setSelectedRoomForInspection] =
    useState<Room | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);

  const roomsInFloor = selectedFloor
    ? sampleData.rooms.filter(
        (r) =>
          r.bl_id === selectedFloor.bl_id &&
          r.LevelName === selectedFloor.LevelName &&
          r.SiteId === selectedFloor.SiteId,
      )
    : [];
  const points = (locatedRoom ? [locatedRoom] : roomsInFloor).flatMap((room) => room.Polygon?.coordinates.flat() ?? []);
  const minX = points.length ? Math.min(...points.map((point) => point[0])) : 0;
  const minY = points.length ? Math.min(...points.map((point) => point[1])) : 0;
  const width = points.length ? Math.max(...points.map((point) => point[0])) - minX : 500;
  const height = points.length ? Math.max(...points.map((point) => point[1])) - minY : 500;

  // Mock work request data for maintenance mode color coding
  const getRoomColor = (room: Room) => {
    if (!maintenanceMode) return "#e0e7ff";

    // Simulate: some rooms have overdue WRs, some have active ones
    const hash = room.RoomCode.charCodeAt(0) + room.RoomCode.charCodeAt(1);
    if (hash % 3 === 0) return "#ef4444"; // red = overdue WRs
    if (hash % 3 === 1) return "#f97316"; // orange = active WRs
    return "#10b981"; // emerald = healthy
  };

  const handleZoom = (direction: "in" | "out") => {
    setZoomLevel((prev) =>
      direction === "in" ? Math.min(prev + 0.2, 3) : Math.max(prev - 0.2, 0.5),
    );
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2 || e.ctrlKey) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (locator && (!selectedFloor || !locatedRoom)) return <div role="alert" className="p-6 text-red-700">The requested equipment or its room polygon is unavailable at the active site.</div>;
  if (!selectedFloor) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <AlertCircle size={48} className="text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Please select a floor to view the floor plan.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Floor Plan: {selectedFloor.LevelName}</h1>
            <p className="text-sm text-gray-600">
              {selectedFloor.GrossAreaM2} m² • {roomsInFloor.length} rooms
            </p>
            {locatedRoom && equipment && <p className="text-sm text-blue-700">Equipment {equipment.EquipmentCode} is located in highlighted room {locatedRoom.RoomCode}; its exact position is not recorded.{locatedRoom.PolygonSource === "Demo" || locatedRoom.PolygonSource === "CAD Sample" ? " This is demonstration geometry, not a surveyed floor plan." : ""}</p>}
          </div>
          <div className="flex items-center gap-4">
            <CadUpload floor={selectedFloor} />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">
                Maintenance Mode
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Maintenance Mode Legend */}
      {maintenanceMode && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
          <div className="max-w-6xl mx-auto flex gap-6">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-400"></div>
              <span className="text-sm text-gray-700">Overdue WRs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-orange-400"></div>
              <span className="text-sm text-gray-700">Active WRs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-emerald-400"></div>
              <span className="text-sm text-gray-700">Healthy</span>
            </div>
          </div>
        </div>
      )}

      {/* Floor Plan Viewer */}
      <div className="flex-1 relative bg-white overflow-hidden">
        {/* Zoom Controls */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-white rounded-lg border border-gray-300 shadow-lg">
          <button
            onClick={() => handleZoom("in")}
            className="p-2 hover:bg-gray-100 transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={20} className="text-gray-600" />
          </button>
          <div className="px-3 py-1 text-xs font-semibold text-gray-600 text-center">
            {Math.round(zoomLevel * 100)}%
          </div>
          <button
            onClick={() => handleZoom("out")}
            className="p-2 hover:bg-gray-100 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={20} className="text-gray-600" />
          </button>
        </div>

        {/* SVG Canvas */}
        <svg
          ref={svgRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          viewBox={`${minX - width * 0.05} ${minY - height * 0.05} ${Math.max(width * 1.1, 1)} ${Math.max(height * 1.1, 1)}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <g
            transform={`translate(${panX}, ${panY}) scale(${zoomLevel})`}
            style={{ transformOrigin: "0 0" }}
          >
            {/* Grid background */}
            <defs>
              <pattern
                id="grid"
                width="50"
                height="50"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 50 0 L 0 0 0 50"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect width="500" height="500" fill="url(#grid)" />

            {/* Room Polygons */}
            {roomsInFloor.map((room) => {
              if (!room.Polygon) return null;

              const isSelected = selectedRoomForInspection?.RoomCode === room.RoomCode || locatedRoom?.RoomCode === room.RoomCode;
              const fillColor = getRoomColor(room);
              const coords = room.Polygon.coordinates.map((ring) =>
                ring.map((point, index) => `${index === 0 ? "M" : "L"} ${point[0]} ${point[1]}`).join(" ") + " Z",
              ).join(" ");
              const ring = room.Polygon.coordinates[0];
              const labelX = (Math.min(...ring.map((point) => point[0])) + Math.max(...ring.map((point) => point[0]))) / 2;
              const labelY = (Math.min(...ring.map((point) => point[1])) + Math.max(...ring.map((point) => point[1]))) / 2;

              return (
                <g
                  key={room.RoomCode}
                  className="room-polygon group"
                  onClick={() => setSelectedRoomForInspection(room)}
                  style={{ cursor: "pointer" }}
                >
                  <path
                    d={coords}
                    fillRule="evenodd"
                    fill={fillColor}
                    stroke={isSelected ? "#0066cc" : "#999"}
                    strokeWidth={Math.max(width, height) * (isSelected ? 0.005 : 0.002)}
                    opacity="0.7"
                    className="transition-all"
                  />
                  <text
                    x={labelX}
                    y={labelY}
                    fontSize={Math.max(width, height) * 0.025}
                    fontWeight="600"
                    fill="#000"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    pointerEvents="none"
                  >
                    {room.RoomCode}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Inspection Drawer */}
      {selectedRoomForInspection && (
        <div className="bg-white border-t border-gray-200 p-4 max-h-64 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Room Inspection: {selectedRoomForInspection.RoomCode}
              </h3>
              <button
                onClick={() => setSelectedRoomForInspection(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-xs text-gray-500 font-medium">Room Name</p>
                <p className="font-semibold text-gray-900">
                  {selectedRoomForInspection.Name}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Net Area</p>
                <p className="font-semibold text-gray-900">
                  {selectedRoomForInspection.NetAreaM2} m²
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Category</p>
                <p className="font-semibold text-gray-900">
                  {selectedRoomForInspection.RoomCategory}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Department</p>
                <p className="font-semibold text-gray-900">
                  {selectedRoomForInspection.Department || "—"}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                <Info size={16} />
                View Equipment
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm">
                Create Work Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
