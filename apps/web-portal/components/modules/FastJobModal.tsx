"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, Camera } from "lucide-react";
import type { CifmPerson, UrgencyCode } from "@cafm/shared-schema";
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
const inputClass = "w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function FastJobModal({ isOpen, onClose, onSubmit, initialLocation }: FastJobModalProps) {
  const [step, setStep] = useState<"select-location" | "create-job">("select-location");
  const [selectedEquipmentCodes, setSelectedEquipmentCodes] = useState<string[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState("");
  const [selectedLevelName, setSelectedLevelName] = useState("");
  const [selectedRoomCode, setSelectedRoomCode] = useState("");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>();
  const { activeSiteId, activePerson } = useSiteContext();
  const { data } = useCafmStore();
  const { profile } = useActiveUserPermissions();
  const isHelpdesk = profile?.primaryRole === "Helpdesk" || !!profile?.isHelpdesk;
  const [onBehalf, setOnBehalf] = useState(isHelpdesk);
  const [intakeChannel, setIntakeChannel] = useState<(typeof INTAKE_CHANNELS)[number]>(isHelpdesk ? "Phone Call" : "Self-Service");
  const [requestorId, setRequestorId] = useState("");
  const [tradeName, setTradeName] = useState("Electrical");
  const [urgencyCode, setUrgencyCode] = useState<UrgencyCode>("NORMAL");
  const [deferChoice, setDeferChoice] = useState(true);
  const slaConfig = useMemo(() => getSiteSlaConfig(data, activeSiteId), [data, activeSiteId]);
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => { if (isOpen) setNow(new Date().toISOString()); }, [isOpen, step]);
  useEffect(() => { setOnBehalf(isHelpdesk); setIntakeChannel(isHelpdesk ? "Phone Call" : "Self-Service"); setRequestorId(""); }, [isHelpdesk, activePerson]);
  const sla = useMemo(() => computeFjSla(slaConfig, tradeName, urgencyCode, now, { deferToNextBusinessDay: deferChoice }), [slaConfig, tradeName, urgencyCode, now, deferChoice]);
  const tradeOptions = Object.keys(slaConfig.matrix);
  const buildings = data.buildings.filter((item) => item.SiteId === activeSiteId);
  const floors = data.floors.filter((item) => item.SiteId === activeSiteId);
  const rooms = data.rooms.filter((item) => item.SiteId === activeSiteId);
  const equipment = data.equipment.filter((item) => item.SiteId === activeSiteId);
  const selectedBuilding = buildings.find((item) => item.bl_id === selectedBuildingId) ?? null;
  const selectedFloor = floors.find((item) => item.bl_id === selectedBuildingId && item.LevelName === selectedLevelName) ?? null;
  const selectedRoom = rooms.find((item) => item.bl_id === selectedBuildingId && item.LevelName === selectedLevelName && item.RoomCode === selectedRoomCode) ?? null;
  const selectedEquipment = selectedEquipmentCodes[0] || "";

  const directory = useMemo(() => data.cifmPeople ?? [], [data.cifmPeople]);
  const myself: CifmPerson | null = useMemo(() => {
    const name = profile?.fullName ?? activePerson;
    const match = directory.find((item) => item.displayName === name || (profile?.username && item.username === profile.username));
    if (match) return match;
    if (!name) return null;
    return { id: `self-${name}`, employeeCode: "", displayName: name, email: profile?.email ?? "", phone: profile?.phone ?? "", departmentTeam: profile?.department ?? "",
      stationedSiteId: activeSiteId, stationedBuildingId: "", stationedFloorId: "", stationedRoomId: "", isFmStaff: true };
  }, [directory, profile, activePerson, activeSiteId]);
  const requestor = onBehalf ? directory.find((item) => item.id === requestorId) ?? null : myself;
  const options = useMemo(() => [...directory]
    .sort((a, b) => Number(b.stationedSiteId === activeSiteId) - Number(a.stationedSiteId === activeSiteId) || a.displayName.localeCompare(b.displayName)), [directory, activeSiteId]);

  useEffect(() => {
    if (!isOpen || !initialLocation) return;
    setSelectedBuildingId(initialLocation.bl_id);
    setSelectedLevelName(initialLocation.levelName);
    setSelectedRoomCode(initialLocation.roomCode);
  }, [isOpen, initialLocation]);

  if (!isOpen) return null;

  const stationedHere = (person: CifmPerson | null) => !!person && person.stationedSiteId === activeSiteId && !!person.stationedRoomId;
  const applyStationedRoom = (person: CifmPerson) => {
    setSelectedBuildingId(person.stationedBuildingId);
    setSelectedLevelName(person.stationedFloorId);
    setSelectedRoomCode(person.stationedRoomId);
  };
  const pickRequestor = (person: CifmPerson | undefined) => {
    setRequestorId(person?.id ?? "");
    if (person && !selectedBuildingId && person.stationedSiteId === activeSiteId) {
      setSelectedBuildingId(person.stationedBuildingId);
      setSelectedLevelName(person.stationedFloorId);
    }
  };

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

  const handleReset = () => {
    setStep("select-location");
    setSelectedEquipmentCodes([]);
    setSelectedBuildingId("");
    setSelectedLevelName("");
    setSelectedRoomCode("");
    setDescription("");
    setPhotoFile(null);
    setPhotoPreview(undefined);
    setRequestorId("");
    setUrgencyCode("NORMAL");
    setDeferChoice(true);
  };

  const handleSubmit = () => {
    if (photoFile && !photoPreview) {
      alert("Wait for the selected photo to finish loading.");
      return;
    }
    if (step === "select-location") {
      if (selectedEquipmentCodes.length <= 1 && selectedBuildingId && selectedLevelName && selectedRoomCode) setStep("create-job");
      return;
    }
    if (!description || selectedEquipmentCodes.length > 1 || !selectedBuildingId || !selectedLevelName || !selectedRoomCode) return;
    if (onBehalf && !requestor) { alert("Select the CIFM employee who reported the problem."); return; }
    onSubmit?.({
      equipmentCode: selectedEquipment,
      bl_id: selectedBuildingId,
      levelName: selectedLevelName,
      roomCode: selectedRoomCode,
      description,
      photoUrl: photoPreview,
      photoName: photoFile?.name,
      photoType: photoFile?.type,
      timeSpentMinutes: 0,
      createdAt: now,
      tradeName,
      urgencyCode,
      deferToNextBusinessDay: deferChoice,
      intakeChannel,
      requestorName: requestor?.displayName ?? profile?.fullName ?? activePerson,
      requestorEmail: requestor?.email.trim() || undefined,
      requestorPhone: requestor?.phone.trim() || undefined,
      requestorDepartment: requestor?.departmentTeam.trim() || undefined,
    });
    handleReset();
    onClose();
  };

  const close = () => { handleReset(); onClose(); };
  const submitDisabled = step === "select-location"
    ? selectedEquipmentCodes.length > 1 || !selectedBuildingId || !selectedLevelName || !selectedRoomCode
    : !description || selectedEquipmentCodes.length > 1 || (onBehalf && !requestor);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/50">
      <div className="w-full max-w-xl max-h-[84vh] flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
          <h2 className="text-base font-bold text-gray-900">Create Fast Job</h2>
          <button onClick={close} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5">
          {step === "select-location" ? (
            <div className="space-y-3">
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
              <p className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
                ⚡ <strong>Tip:</strong> Pick one equipment item, or leave equipment empty to log a room-level job (e.g. a light bulb in a room).
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">📍 <strong>{selectedBuildingId} / {selectedLevelName} / {selectedRoomCode}</strong>{selectedEquipment ? ` · ${selectedEquipment}` : " · room-level job"}</p>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-medium">Intake Channel
                  <select value={intakeChannel} onChange={(e) => setIntakeChannel(e.target.value as (typeof INTAKE_CHANNELS)[number])} className={inputClass}>
                    {INTAKE_CHANNELS.map((channel) => <option key={channel}>{channel}</option>)}
                  </select></label>
                <div className="text-xs font-medium">Reported
                  <div className="mt-1 inline-flex w-full rounded-lg border border-slate-300 bg-white text-xs">
                    <button type="button" aria-pressed={!onBehalf} onClick={() => setOnBehalf(false)} className={`flex-1 px-2 py-1.5 rounded-l-lg ${!onBehalf ? "bg-blue-600 text-white" : ""}`}>For Myself</button>
                    <button type="button" aria-pressed={onBehalf} onClick={() => setOnBehalf(true)} className={`flex-1 px-2 py-1.5 rounded-r-lg ${onBehalf ? "bg-blue-600 text-white" : ""}`}>On Behalf Of</button>
                  </div>
                </div>
              </div>

              {onBehalf && <label className="block text-xs font-medium">Requestor *
                <select value={requestorId} onChange={(e) => pickRequestor(options.find((item) => item.id === e.target.value))} className={inputClass}>
                  <option value="">Select requestor from CIFM directory…</option>
                  {options.map((person) => <option key={person.id} value={person.id}>{person.displayName} · {person.departmentTeam} · {person.stationedRoomId || "no room"}{person.stationedSiteId === activeSiteId ? "" : ` · ${person.stationedSiteId}`}</option>)}
                </select></label>}

              {requestor && <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700 truncate" aria-label="CIFM employee details">
                📍 {requestor.stationedRoomId || "—"} · 👥 {requestor.departmentTeam || "—"} · ✉ {requestor.email || "—"} · 📞 {requestor.phone || "—"}
                {stationedHere(requestor) && <button type="button" onClick={() => applyStationedRoom(requestor)} className="ml-2 font-semibold text-blue-700 hover:underline">Use room</button>}
              </div>}

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
              <div className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-900" aria-label="SLA Calculation Preview">
                ⏱ {sla.targetLabel} · Due <strong>{formatDateTimeDDMMYYYY(sla.dueAt)}</strong> · Margin <strong>{formatDateTimeDDMMYYYY(sla.marginAt)}</strong>
              </div>
              {sla.warning && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
                <p className="text-xs font-semibold">⚠ {sla.warning}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  <button type="button" onClick={() => setUrgencyCode("SUPER_URGENT")} className="rounded bg-red-600 px-2 py-1 text-white">Upgrade to Super Urgent</button>
                  <label className="inline-flex items-center gap-1"><input type="checkbox" checked={deferChoice} onChange={(e) => setDeferChoice(e.target.checked)} /> Schedule start for next business morning 08:00</label>
                </div>
              </div>}

              <label className="block text-xs font-medium">Description *
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g., Replace broken lamp in hallway" rows={2} className={inputClass} />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                {!photoPreview ? (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-blue-500 hover:bg-blue-50">
                    <Camera size={16} className="text-gray-400" /> 📷 Attach Photo (Optional)
                    <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                  </label>
                ) : (
                  <div className="flex items-center gap-2">
                    <img src={photoPreview} alt="Preview" className="h-10 w-10 rounded border border-gray-300 object-cover" />
                    <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(undefined); }} className="text-xs text-red-600 hover:text-red-800">Remove</button>
                  </div>
                )}
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-700">{selectedEquipment || selectedRoomCode || "Location"} · Status: 50% Issued</span>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 py-2.5 border-t bg-slate-50 flex justify-between items-center">
          <button onClick={() => { if (step === "create-job") setStep("select-location"); else close(); }} className="px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 text-sm">
            {step === "create-job" ? "Back" : "Cancel"}
          </button>
          <button onClick={handleSubmit} disabled={submitDisabled} className="px-5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm transition-colors">
            {step === "select-location" ? "Next →" : "Create Fast Job (50%)"}
          </button>
        </div>
      </div>
    </div>
  );
}
