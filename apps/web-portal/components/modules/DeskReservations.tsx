"use client";

import React, { useState, useMemo } from "react";
import { Calendar, MapPin, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useApp } from "@/lib/hooks/useApp";
import { getSampleData } from "@/lib/utils/sampleData";
import type { Room } from "@cafm/shared-schema";

export function DeskReservations() {
  const { useSampleData } = useApp();
  const sampleData = useSampleData ? getSampleData() : { rooms: [], desks: [] };

  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  );
  const [selectedDesk, setSelectedDesk] = useState<string | null>(null);

  // Filter desk-reservable rooms
  const reservableRooms = useMemo(() => {
    return sampleData.rooms.filter((r) => r.IsDeskReservable);
  }, [sampleData.rooms]);

  // Get available desks for selected room and date range
  const getDesksForRoom = (room: Room) => {
    const deskCount = room.RoomCategory === "Workspace" ? 10 : 4;
    const desks = Array.from({ length: deskCount }, (_, i) => ({
      id: `D-${room.RoomCode}-${String(i + 1).padStart(3, "0")}`,
      name: `Desk ${i + 1}`,
      status:
        i % 3 === 0 ? "occupied" : i % 2 === 0 ? "reserved" : "available",
    }));
    return desks;
  };

  const roomDesks = selectedRoom ? getDesksForRoom(selectedRoom) : [];

  // Mock grace period countdown
  const getGraceCountdown = (deskId: string) => {
    const hash = deskId.charCodeAt(0);
    if (hash % 5 === 0) return "15 min";
    if (hash % 5 === 1) return "45 min";
    if (hash % 5 === 2) return "2 hr";
    if (hash % 5 === 3) return "checked in";
    return null;
  };

  const handleReserveDesk = (deskId: string) => {
    alert(
      `Desk ${deskId} reserved from ${startDate} to ${endDate}.\n\nQR code generated for check-in.`,
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">
          Desk Reservations & Space Booking
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Interactive floor plan booking with real-time desk availability
        </p>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto bg-white rounded-lg border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Room</label>
          <select
            value={selectedRoom?.RoomCode || ""}
            onChange={(e) => {
              const room = reservableRooms.find((r) => r.RoomCode === e.target.value);
              setSelectedRoom(room || null);
              setSelectedDesk(null);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Select Room --</option>
            {reservableRooms.map((r) => (
              <option key={r.RoomCode} value={r.RoomCode}>
                {r.RoomCode} - {r.Name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-col gap-2 justify-end">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
            <Calendar size={16} className="inline mr-2" />
            Search
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="max-w-7xl mx-auto flex gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-400"></div>
          <span className="text-gray-700">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-400"></div>
          <span className="text-gray-700">Reserved (by you)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-orange-400"></div>
          <span className="text-gray-700">Reserved (by others)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-400"></div>
          <span className="text-gray-700">Occupied</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gray-400"></div>
          <span className="text-gray-700">Permanent</span>
        </div>
      </div>

      {/* Desk Grid */}
      {selectedRoom ? (
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Room Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-blue-900">
                  {selectedRoom.Name}
                </h3>
                <p className="text-sm text-blue-600 mt-1 flex items-center gap-2">
                  <MapPin size={16} />
                  {selectedRoom.RoomCode} • {selectedRoom.NetAreaM2} m²
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-blue-600 font-medium">
                  {selectedRoom.Department}
                </p>
              </div>
            </div>
          </div>

          {/* Desk Grid */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">
              Available Desks
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {roomDesks.map((desk) => {
                const deskStatus = desk.status;
                const graceCountdown = getGraceCountdown(desk.id);
                const isSelected = selectedDesk === desk.id;

                let bgColor = "bg-emerald-100 border-emerald-300";
                let badgeColor = "bg-emerald-500";
                let statusText = "Available";
                let canBook = true;

                if (deskStatus === "reserved") {
                  bgColor = "bg-orange-100 border-orange-300";
                  badgeColor = "bg-orange-500";
                  statusText = "Reserved";
                  canBook = true;
                } else if (deskStatus === "occupied") {
                  bgColor = "bg-red-100 border-red-300";
                  badgeColor = "bg-red-500";
                  statusText = "Occupied";
                  canBook = false;
                }

                return (
                  <div
                    key={desk.id}
                    onClick={() => canBook && setSelectedDesk(desk.id)}
                    className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      isSelected
                        ? "ring-2 ring-blue-500"
                        : "hover:shadow-md"
                    } ${bgColor} ${
                      !canBook ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    <div className="text-sm font-bold text-gray-900">
                      {desk.name}
                    </div>
                    <div className={`text-xs font-semibold text-white mt-2 px-2 py-1 ${badgeColor} rounded text-center`}>
                      {statusText}
                    </div>
                    {graceCountdown && (
                      <div className="text-xs text-gray-600 mt-2 flex items-center gap-1">
                        <Clock size={12} />
                        {graceCountdown}
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle
                          size={20}
                          className="text-blue-600"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Booking Summary */}
          {selectedDesk && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <h4 className="text-lg font-semibold text-green-900 mb-4 flex items-center gap-2">
                <CheckCircle size={20} />
                Booking Summary
              </h4>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-xs text-green-600 font-medium">Desk</p>
                  <p className="font-semibold text-green-900">{selectedDesk}</p>
                </div>
                <div>
                  <p className="text-xs text-green-600 font-medium">Room</p>
                  <p className="font-semibold text-green-900">
                    {selectedRoom.RoomCode}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-green-600 font-medium">Start Date</p>
                  <p className="font-semibold text-green-900">{startDate}</p>
                </div>
                <div>
                  <p className="text-xs text-green-600 font-medium">End Date</p>
                  <p className="font-semibold text-green-900">{endDate}</p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg mb-4 border border-green-300">
                <p className="text-sm text-gray-600">
                  <strong>Check-In Instructions:</strong> QR code will be provided. Scan via mobile app to check in.
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Auto-release grace period: 30 minutes. Unclaimed bookings are automatically released.
                </p>
              </div>

              <button
                onClick={() => handleReserveDesk(selectedDesk)}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
              >
                Confirm Desk Reservation
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-7xl mx-auto bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <AlertCircle size={48} className="text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">
            Select a room to view available desks
          </p>
        </div>
      )}
    </div>
  );
}
