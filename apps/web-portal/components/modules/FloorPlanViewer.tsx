"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { ZoomIn, ZoomOut, Info, AlertCircle, Zap } from "lucide-react";
import { useApp } from "@/lib/hooks/useApp";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import type { BaseWorkRequest, Room } from "@cafm/shared-schema";
import { CadUpload } from "@/components/modules/CadUpload";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { resolveEquipmentLocation, type EquipmentLocationQuery } from "@/lib/equipment-locator";
import { OpenRoomInBimButton } from "@/components/common/LocateInBim";
import { FastJobModal } from "@/components/modules/FastJobModal";
import { buildFastJobWR, type FastJobData } from "@/lib/fj-factory";

export function FloorPlanViewer() {
  const { selectedFloor: selectedFloorFromApp } = useApp();
  const { data: sampleData, setData } = useCafmStore();
  const { activeSiteId, activePerson, currentUser } = useSiteContext();
  const { permissions, profile } = useActiveUserPermissions();
  const [locator, setLocator] = useState<EquipmentLocationQuery | null>(null);
  const [urlTarget, setUrlTarget] = useState<{ building: string; floor: string; room?: string } | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.has("eqId")) setLocator({ building: query.get("buildingId") ?? "", floor: query.get("floorId") ?? "", room: query.get("roomId") ?? "", equipment: query.get("eqId") ?? "" });
    // Deep link from the 3D BIM viewer: /floor-plans?building=…&floor=…&room=…
    else if (query.get("building") && query.get("floor")) setUrlTarget({ building: query.get("building")!, floor: query.get("floor")!, room: query.get("room") ?? undefined });
  }, []);
  const resolved = locator ? resolveEquipmentLocation(locator, activeSiteId, sampleData) : null;
  const equipment = resolved?.equipment;
  const urlFloor = urlTarget
    ? sampleData.floors.find((floor) => floor.SiteId === activeSiteId && floor.bl_id === urlTarget.building && floor.LevelName === urlTarget.floor) ?? null
    : null;
  const selectedFloor = locator ? resolved?.floor ?? null : urlFloor ?? selectedFloorFromApp;
  const locatedRoom = resolved?.room;

  const [zoomLevel, setZoomLevel] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedRoomForInspection, setSelectedRoomForInspection] =
    useState<Room | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(true);
  const [pinFjMode, setPinFjMode] = useState(false);
  const [fastJobOpen, setFastJobOpen] = useState(false);
  const [fastJobLocation, setFastJobLocation] = useState<{ bl_id: string; levelName: string; roomCode: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!urlTarget?.room) return;
    const room = sampleData.rooms.find((entry) => entry.SiteId === activeSiteId && entry.bl_id === urlTarget.building && entry.RoomCode === urlTarget.room);
    if (room) setSelectedRoomForInspection(room);
  }, [urlTarget, sampleData.rooms, activeSiteId]);

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

  // Live open WRs per room drive both the maintenance colors and the ⚡ FJ badges.
  const openWrsByRoom = useMemo(() => {
    const map = new Map<string, BaseWorkRequest[]>();
    if (!selectedFloor) return map;
    for (const wr of sampleData.workRequests) {
      if (wr.SiteId !== activeSiteId || wr.Percentage >= 100 || !wr.RoomCode) continue;
      if (wr.bl_id !== selectedFloor.bl_id || wr.LevelName !== selectedFloor.LevelName) continue;
      const list = map.get(wr.RoomCode);
      if (list) list.push(wr);
      else map.set(wr.RoomCode, [wr]);
    }
    return map;
  }, [sampleData.workRequests, activeSiteId, selectedFloor]);
  const today = new Date().toISOString().slice(0, 10);

  const getRoomColor = (room: Room) => {
    if (!maintenanceMode) return "#e0e7ff";
    const wrs = openWrsByRoom.get(room.RoomCode) ?? [];
    if (wrs.some((wr) => (wr.Percentage === 50 || wr.Percentage === 55) && !!wr.DueDate && wr.DueDate < today)) return "#ef4444"; // red = overdue WRs
    if (wrs.length) return "#f97316"; // orange = active WRs
    return "#10b981"; // emerald = healthy
  };

  const openFastJobInRoom = (room: Room) => {
    setFastJobLocation({ bl_id: room.bl_id, levelName: room.LevelName, roomCode: room.RoomCode });
    setFastJobOpen(true);
  };

  const createFastJob = (job: FastJobData) => {
    if (!permissions?.canCreateFJ) { alert("Permission required to create a Fast Job."); return; }
    const newWR = buildFastJobWR(job, {
      siteId: activeSiteId,
      data: sampleData,
      actor: { userId: currentUser?.UserId, displayName: profile?.fullName ?? activePerson, role: String(profile?.primaryRole ?? ""), personId: profile?.id },
      source: "Fast Job pinned on the 2D floor plan",
    });
    setData((current) => ({ ...current, workRequests: [...current.workRequests, newWR] }));
    setFastJobOpen(false);
    setPinFjMode(false);
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
            {permissions?.canCreateFJ && (
              <button
                type="button"
                onClick={() => setPinFjMode((value) => !value)}
                aria-pressed={pinFjMode}
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${pinFjMode ? "border-amber-500 bg-amber-500 text-white" : "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"}`}
              >
                <Zap size={15} /> {pinFjMode ? "Click a room to pin the Fast Job…" : "⚡ Pin & Create Fast Job"}
              </button>
            )}
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
              const openFjCount = (openWrsByRoom.get(room.RoomCode) ?? []).filter((wr) => wr.WR_Type === "FJ").length;
              const coords = room.Polygon.coordinates.map((ring) =>
                ring.map((point, index) => `${index === 0 ? "M" : "L"} ${point[0]} ${point[1]}`).join(" ") + " Z",
              ).join(" ");
              const ring = room.Polygon.coordinates[0];
              const labelX = (Math.min(...ring.map((point) => point[0])) + Math.max(...ring.map((point) => point[0]))) / 2;
              const labelY = (Math.min(...ring.map((point) => point[1])) + Math.max(...ring.map((point) => point[1]))) / 2;
              const fontSize = Math.max(width, height) * 0.025;

              return (
                <g
                  key={room.RoomCode}
                  className="room-polygon group"
                  onClick={() => (pinFjMode ? openFastJobInRoom(room) : setSelectedRoomForInspection(room))}
                  style={{ cursor: pinFjMode ? "crosshair" : "pointer" }}
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
                    fontSize={fontSize}
                    fontWeight="600"
                    fill="#000"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    pointerEvents="none"
                  >
                    {room.RoomCode}
                  </text>
                  {openFjCount > 0 && (
                    <text
                      x={labelX}
                      y={labelY + fontSize * 1.2}
                      fontSize={fontSize * 0.9}
                      fontWeight="700"
                      fill="#b45309"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      pointerEvents="none"
                      aria-label={`${openFjCount} open Fast Job${openFjCount === 1 ? "" : "s"} in ${room.RoomCode}`}
                    >
                      ⚡{openFjCount} FJ
                    </text>
                  )}
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

            <div className="flex flex-wrap items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                <Info size={16} />
                View Equipment
              </button>
              {permissions?.canCreateFJ && (
                <button
                  onClick={() => openFastJobInRoom(selectedRoomForInspection)}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm"
                >
                  <Zap size={16} /> + Create Fast Job in Room
                </button>
              )}
              <OpenRoomInBimButton
                siteId={activeSiteId}
                buildingId={selectedRoomForInspection.bl_id}
                roomCode={selectedRoomForInspection.RoomCode}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-700 text-white rounded-lg hover:bg-cyan-800 transition-colors text-sm"
              />
              <span className="text-sm text-gray-600">
                {(openWrsByRoom.get(selectedRoomForInspection.RoomCode) ?? []).length} open WR(s) in this room
              </span>
            </div>
          </div>
        </div>
      )}

      <FastJobModal
        isOpen={fastJobOpen}
        onClose={() => setFastJobOpen(false)}
        onSubmit={createFastJob}
        initialLocation={fastJobLocation}
      />
    </div>
  );
}
