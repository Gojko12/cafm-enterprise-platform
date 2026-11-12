"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, Camera, Clock } from "lucide-react";
import type { UrgencyCode } from "@cafm/shared-schema";
import { formatDateTimeDDMMYYYY } from "@cafm/shared-schema";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { computeFjSla } from "@/lib/fj-sla";
import { getSiteSlaConfig } from "@/lib/fj-satisfaction";
import { LocationEquipmentPickerGroup } from "@/components/common/LocationEquipmentPickerGroup";

import type { FastJobData } from "@/lib/fj-factory";
export type { FastJobData };

interface FastJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: FastJobData) => void;
  /** Pre-fills the location step (e.g. from a selected 3D room). */
  initialLocation?: { bl_id: string; levelName: string; roomCode: string } | null;
}

const INTAKE_CHANNELS = ["Phone Call", "Email", "Walk-in", "Self-Service"] as const;
const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

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
  const { activeSiteId, activePerson } = useSiteContext();
  const { data } = useCafmStore();
  const { profile } = useActiveUserPermissions();
  const isHelpdesk = profile?.primaryRole === "Helpdesk" || !!profile?.isHelpdesk;
  const [onBehalf, setOnBehalf] = useState(isHelpdesk);
  const [intakeChannel, setIntakeChannel] = useState<(typeof INTAKE_CHANNELS)[number]>(isHelpdesk ? "Phone Call" : "Self-Service");
  const [requestorKey, setRequestorKey] = useState("");
  const [requestorName, setRequestorName] = useState("");
  const [requestorEmail, setRequestorEmail] = useState("");
  const [requestorPhone, setRequestorPhone] = useState("");
  const [requestorDepartment, setRequestorDepartment] = useState("");
  const [tradeName, setTradeName] = useState("Electrical");
  const [urgencyCode, setUrgencyCode] = useState<UrgencyCode>("NORMAL");
  const [deferChoice, setDeferChoice] = useState(true);
  const slaConfig = useMemo(() => getSiteSlaConfig(data, activeSiteId), [data, activeSiteId]);
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => { if (isOpen) setNow(new Date().toISOString()); }, [isOpen, step]);
  useEffect(() => { setOnBehalf(isHelpdesk); setIntakeChannel(isHelpdesk ? "Phone Call" : "Self-Service"); }, [isHelpdesk, activePerson]);
  const sla = useMemo(() => computeFjSla(slaConfig, tradeName, urgencyCode, now, { deferToNextBusinessDay: deferChoice }), [slaConfig, tradeName, urgencyCode, now, deferChoice]);
  const requestors = data.userAccessProfiles.filter((item) => item.siteId === activeSiteId && item.email && !item.linkedCraftpersonId);
  const tradeOptions = Object.keys(slaConfig.matrix);
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
      if (selectedEquipmentCodes.length <= 1 && selectedBuildingId && selectedLevelName && selectedRoomCode) {
        setStep("create-job");
      }
    } else {
      if (description && selectedEquipmentCodes.length <= 1 && selectedBuildingId && selectedLevelName && selectedRoomCode) {
        const requestorOk = !onBehalf || requestorName.trim();
        if (!requestorOk) { alert("Enter the requestor name."); return; }
        const self = profile;
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
          createdAt: now,
          tradeName,
          urgencyCode,
          deferToNextBusinessDay: deferChoice,
          intakeChannel,
          requestorName: onBehalf ? requestorName.trim() : self?.fullName ?? activePerson,
          requestorEmail: (onBehalf ? requestorEmail : self?.email)?.trim() || undefined,
          requestorPhone: (onBehalf ? requestorPhone : self?.phone)?.trim() || undefined,
          requestorDepartment: (onBehalf ? requestorDepartment : self?.department)?.trim() || undefined,
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
    setRequestorKey("");
    setRequestorName("");
    setRequestorEmail("");
    setRequestorPhone("");
    setRequestorDepartment("");
    setUrgencyCode("NORMAL");
    setDeferChoice(true);
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
                  ⚡ <strong>Tip:</strong> Pick one equipment item, or leave equipment empty to log a room-level job
                  (e.g. a light bulb in a room). You can also scan the equipment QR code to auto-fill these fields.
                </p>
              </div>
            </div>
          ) : (
            // Step 2: Create Job Details
            <div className="space-y-4">
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2" aria-label="Requestor">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">Requestor</h3>
                  <div className="inline-flex rounded-lg border border-slate-300 bg-white text-xs">
                    <button type="button" aria-pressed={!onBehalf} onClick={() => setOnBehalf(false)} className={`px-3 py-1 rounded-l-lg ${!onBehalf ? "bg-blue-600 text-white" : ""}`}>For Myself</button>
                    <button type="button" aria-pressed={onBehalf} onClick={() => setOnBehalf(true)} className={`px-3 py-1 rounded-r-lg ${onBehalf ? "bg-blue-600 text-white" : ""}`}>On Behalf of Another Person</button>
                  </div>
                </div>
                <p className="text-xs text-slate-600">Opened by <strong>{profile?.fullName ?? activePerson}</strong>{profile?.primaryRole ? ` (${profile.primaryRole})` : ""}</p>
                {onBehalf && <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs sm:col-span-2">Intake Channel
                    <select value={intakeChannel} onChange={(e) => setIntakeChannel(e.target.value as (typeof INTAKE_CHANNELS)[number])} className={inputClass}>
                      {INTAKE_CHANNELS.map((channel) => <option key={channel}>{channel}</option>)}
                    </select></label>
                  <label className="text-xs sm:col-span-2">Requestor (site directory)
                    <select value={requestorKey} onChange={(e) => {
                      setRequestorKey(e.target.value);
                      const person = requestors.find((item) => item.id === e.target.value);
                      if (person) { setRequestorName(person.fullName); setRequestorEmail(person.email ?? ""); setRequestorPhone(person.phone ?? ""); setRequestorDepartment(person.department ?? ""); }
                    }} className={inputClass}>
                      <option value="">Select a person or type details below…</option>
                      {requestors.map((person) => <option key={person.id} value={person.id}>{person.fullName} · {person.email}</option>)}
                    </select></label>
                  <label className="text-xs">Requestor name *<input value={requestorName} onChange={(e) => setRequestorName(e.target.value)} className={inputClass} /></label>
                  <label className="text-xs">Email<input type="email" value={requestorEmail} onChange={(e) => setRequestorEmail(e.target.value)} className={inputClass} /></label>
                  <label className="text-xs">Phone<input value={requestorPhone} onChange={(e) => setRequestorPhone(e.target.value)} className={inputClass} /></label>
                  <label className="text-xs">Department<input value={requestorDepartment} onChange={(e) => setRequestorDepartment(e.target.value)} className={inputClass} /></label>
                </div>}
              </section>

              <section className="rounded-lg border border-slate-200 p-3 space-y-2" aria-label="Trade and urgency">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-medium">Trade
                    <select value={tradeName} onChange={(e) => setTradeName(e.target.value)} className={inputClass}>
                      {tradeOptions.map((trade) => <option key={trade}>{trade}</option>)}
                    </select></label>
                  <label className="text-xs font-medium">Urgency
                    <select value={urgencyCode} onChange={(e) => setUrgencyCode(e.target.value as UrgencyCode)} className={inputClass}>
                      {[...slaConfig.urgencyLevels].sort((a, b) => a.order - b.order).map((level) => <option key={level.code} value={level.code}>{level.label}</option>)}
                    </select></label>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" aria-label="SLA Calculation Preview">
                  <p className="font-semibold">SLA Calculation Preview · {sla.targetLabel}</p>
                  <p>Clock starts: <strong>{formatDateTimeDDMMYYYY(sla.startAt)}</strong> · Due: <strong>{formatDateTimeDDMMYYYY(sla.dueAt)}</strong> · Margin: <strong>{formatDateTimeDDMMYYYY(sla.marginAt)}</strong></p>
                  {sla.warning && <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
                    <p className="text-xs font-semibold">⚠ {sla.warning}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      <button type="button" onClick={() => setUrgencyCode("SUPER_URGENT")} className="rounded bg-red-600 px-2 py-1 text-white">Upgrade to Super Urgent</button>
                      <label className="inline-flex items-center gap-1"><input type="checkbox" checked={deferChoice} onChange={(e) => setDeferChoice(e.target.checked)} /> Schedule start for next business morning 08:00</label>
                    </div>
                  </div>}
                </div>
              </section>

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
                    • Equipment: <strong>{selectedEquipment || "None (room-level job)"}</strong>
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
                ? selectedEquipmentCodes.length > 1 || !selectedBuildingId || !selectedLevelName || !selectedRoomCode
                : !description || selectedEquipmentCodes.length > 1 || (onBehalf && !requestorName.trim())
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
