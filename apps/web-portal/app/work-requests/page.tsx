"use client";

import React, { useEffect, useState } from "react";
import { Plus, MoreVertical, ArrowUp, Eye } from "lucide-react";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { LongJobDrawer } from "@/components/modules/long-jobs/LongJobDrawer";
import { BaseWorkRequest, WR_Statuses, WR_Type } from "@cafm/shared-schema";
import type { Building, Floor, Room } from "@cafm/shared-schema";
import { useCafmStore } from "@/lib/cafm-store";
import { LocationEquipmentPickerGroup } from "@/components/common/LocationEquipmentPickerGroup";
import { FastJobModal, type FastJobData } from "@/components/modules/FastJobModal";
import { PMWorkRequestPopup } from "@/components/modules/PMWorkRequestPopup";
import { FJWorkRequestPopup } from "@/components/modules/FJWorkRequestPopup";
import { LJWorkRequestPopup } from "@/components/modules/LJWorkRequestPopup";
import { WRDataGrid } from "@/components/modules/WRDataGrid";
import { groupLongJobs } from "@/lib/wr-overview";
import { useApp } from "@/lib/hooks/useApp";
import Link from "next/link";

const mockWorkRequests: BaseWorkRequest[] = [
  {
    WR_ID: "LJ-001-2026",
    JobID: "JOB-001",
    WR_Type: "LJ",
    ESAWorkType: "Corrective Maintenance",
    Description: "HVAC System Replacement - Darmstadt Building A",
    ProblemLocation: "Building A / Floor 3 / HVAC Room",
    EstimatedCostEur: 2500,
    CreatedDate: "2026-11-01",
    WorkRequestStatus: "Requested",
    WorkRequestSubstatus: "New Request for Quotation",
    Percentage: 0,
    SiteId: "SITE-01",
    bl_id: "BL-001",
    LevelName: "Floor 3",
    RoomCode: "HVAC-001",
    AssignedCraftpersonIds: [],
    AssignedUserIds: ["user-001"],
    CreatedBy: "user-001",
    RequiresSAT: true,
    RequiresDrawingUpdate: true,
    RequiresInventoryUpdate: false,
    AcceptanceGates: [],
    UpdatedAt: "2026-11-06",
    IsFrozen: false,
    EquipmentCodes: [],
    TotalTimeMinutes: 0,
    StartDateTBD: false,
  },
  {
    WR_ID: "FJ-002-2026",
    WR_Type: "FJ",
    ESAWorkType: "Corrective Maintenance",
    Description: "Door Repair - Noordwijk Reception",
    ProblemLocation: "Main Reception",
    EstimatedCostEur: 450,
    CreatedDate: "2026-10-20",
    WorkRequestStatus: "Issued",
    WorkRequestSubstatus: "Issued",
    Percentage: 50,
    SiteId: "SITE-02",
    bl_id: "BL-002",
    LevelName: "Floor 1",
    RoomCode: "REC-001",
    AssignedCraftpersonIds: [],
    AssignedUserIds: ["user-002"],
    CreatedBy: "user-002",
    UpdatedAt: "2026-11-05",
    IsFrozen: false,
    EquipmentCodes: [],
    TotalTimeMinutes: 0,
    StartDateTBD: false,
    RequiresSAT: false,
    RequiresDrawingUpdate: false,
    RequiresInventoryUpdate: false,
    AcceptanceGates: [],
  },
  {
    WR_ID: "LJ-003-2026",
    WR_Type: "LJ",
    ESAWorkType: "Corrective Maintenance",
    Description: "Electrical Grid Upgrade - Frascati Building C",
    ProblemLocation: "Building C / Electrical Room",
    EstimatedCostEur: 4500,
    CreatedDate: "2026-10-15",
    WorkRequestStatus: "Issued",
    WorkRequestSubstatus: "Issued and In Process",
    Percentage: 50,
    SiteId: "SITE-03",
    bl_id: "BL-003",
    LevelName: "Basement",
    RoomCode: "ELEC-001",
    AssignedCraftpersonIds: ["tech-001", "tech-002"],
    AssignedUserIds: ["user-003"],
    CreatedBy: "user-003",
    RequiresSAT: true,
    RequiresDrawingUpdate: true,
    RequiresInventoryUpdate: true,
    AcceptanceGates: [],
    UpdatedAt: "2026-11-04",
    IsFrozen: false,
    EquipmentCodes: [],
    TotalTimeMinutes: 0,
    StartDateTBD: false,
  },
];

export default function WorkRequestsPage() {
  const { activeSiteId, currentUser } = useSiteContext();
  const { currentRole } = useApp();
  const { data, setData } = useCafmStore();
  const workRequests = data.workRequests;
  const [requestType, setRequestType] = useState<WR_Type>("PM");
  const [view, setView] = useState<"grid" | "card">("grid");
  const [isFilterExpanded, setFilterExpanded] = useState(false);
  const [filterVersion, setFilterVersion] = useState(0);
  const [columnFilterCount, setColumnFilterCount] = useState(0);
  const [groupLJ, setGroupLJ] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  useEffect(() => { setColumnFilterCount(0); }, [activeSiteId, requestType, view]);
  const [bucket, setBucket] = useState<"issued" | "inspection" | "passed" | "corrected" | "completed" | "cancelled">("issued");
  const [correctionDrafts, setCorrectionDrafts] = useState<Record<string, string>>({});
  const [teamQueue, setTeamQueue] = useState(false);
  useEffect(() => {
    const updateType = () => {
      const type = window.location.hash.slice(1);
      if (type === "PM" || type === "FJ" || type === "LJ") setRequestType(type);
    };
    updateType();
    window.addEventListener("hashchange", updateType);
    return () => window.removeEventListener("hashchange", updateType);
  }, []);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fastJobOpen, setFastJobOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "view" | "escalate">(
    "create"
  );
  const [selectedWR, setSelectedWR] = useState<BaseWorkRequest | null>(null);
  const [pmPopupWR, setPmPopupWR] = useState<BaseWorkRequest | null>(null);
  const [locationFilter, setLocationFilter] = useState<{
    building: Building | null;
    floor: Floor | null;
    room: Room | null;
  }>({ building: null, floor: null, room: null });
  const [selectedEquipmentCodes, setSelectedEquipmentCodes] = useState<string[]>([]);
  const [textFilter, setTextFilter] = useState("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  useEffect(() => {
    setDrawerOpen(false);
    setFastJobOpen(false);
    setSelectedWR(null);
    setPmPopupWR(null);
    setLocationFilter({ building: null, floor: null, room: null });
    setSelectedEquipmentCodes([]);
    setTeamQueue(false);
  }, [activeSiteId]);
  const siteBuildings = data.buildings.filter((item) => item.SiteId === activeSiteId);
  const siteFloors = data.floors.filter((item) => item.SiteId === activeSiteId);
  const siteRooms = data.rooms.filter((item) => item.SiteId === activeSiteId);
  const siteEquipment = data.equipment.filter((item) => item.SiteId === activeSiteId);

  // Filter by active site
  const siteRequests = workRequests.filter((wr) => wr.SiteId === activeSiteId && wr.WR_Type === requestType);
  const buckets = [
    { id: "issued" as const, label: "Issued PM WRs" },
    { id: "inspection" as const, label: "To Be Inspected PM WRs" },
    { id: "passed" as const, label: "Passed Inspected PM WRs" },
    { id: "corrected" as const, label: "PM WRs to be corrected" },
    { id: "completed" as const, label: "Completed PM WRs" },
    { id: "cancelled" as const, label: "Canceled PM WRs" },
  ];
  const isInPmQueue = (wr: BaseWorkRequest, queue: typeof bucket) => {
    const qaStatus = wr.QA_InspectionStatus;
    switch (queue) {
      case "issued": return wr.Percentage === 50 || wr.Percentage === 55;
      case "inspection": return wr.Percentage === 78 && qaStatus !== "Passed" && qaStatus !== "ToBeCorrected" &&
        wr.AuditInspectionStatus !== "Passed Inspected" && wr.AuditInspectionStatus !== "PM WRs to be corrected";
      case "passed": return wr.Percentage === 78 && (qaStatus === "Passed" || wr.AuditInspectionStatus === "Passed Inspected");
      case "corrected": return qaStatus === "ToBeCorrected" || wr.AuditInspectionStatus === "PM WRs to be corrected";
      case "completed": return wr.Percentage === 100;
      case "cancelled": return wr.Percentage === 27;
    }
  };
  const filteredRequests = siteRequests.filter((wr) => {
    if (requestType === "FJ" && teamQueue && wr.Percentage !== 78) return false;
    if (
      requestType === "PM" &&
      !isInPmQueue(wr, bucket)
    ) {
      return false;
    }
    if (locationFilter.building && wr.bl_id !== locationFilter.building.bl_id) return false;
    if (locationFilter.floor && wr.LevelName !== locationFilter.floor.LevelName) return false;
    if (locationFilter.room && wr.RoomCode !== locationFilter.room.RoomCode) return false;
    if (
      selectedEquipmentCodes.length > 0 &&
      !wr.EquipmentCodes?.some((code) => selectedEquipmentCodes.includes(code))
    ) {
      return false;
    }
    if (dueDateFrom && (!wr.DueDate || wr.DueDate.slice(0, 10) < dueDateFrom)) return false;
    if (dueDateTo && (!wr.DueDate || wr.DueDate.slice(0, 10) > dueDateTo)) return false;
    const query = textFilter.trim().toLowerCase();
    return (
      !query ||
      wr.WR_ID.toLowerCase().includes(query) ||
      wr.Description.toLowerCase().includes(query) ||
      wr.TradeName?.toLowerCase().includes(query)
    );
  });

  const handleSubmitFJ = (job: FastJobData) => {
    const createdAt = new Date().toISOString();
    const issuedStatus = WR_Statuses.find(
      (status) =>
        status.Percentage === 50 &&
        status.ESAWorkType === "Corrective Maintenance",
    );
    if (!issuedStatus) {
      throw new Error("Issued status configuration is missing.");
    }
    const newWR: BaseWorkRequest = {
      WR_ID: `FJ-${Date.now()}`,
      JobID: `JOB-${Date.now()}`,
      WR_Type: "FJ",
      ESAWorkType: "Corrective Maintenance",
      Description: job.description,
      ProblemLocation: `${job.bl_id} / ${job.levelName} / ${job.roomCode}`,
      CreatedDate: createdAt.slice(0, 10),
      WorkRequestStatus: issuedStatus.WorkRequestStatus,
      WorkRequestSubstatus: issuedStatus.WorkRequestSubstatus,
      Percentage: issuedStatus.Percentage,
      SiteId: activeSiteId,
      bl_id: job.bl_id,
      LevelName: job.levelName,
      RoomCode: job.roomCode,
      AssignedCraftpersonIds: [],
      AssignedUserIds: [],
      CreatedBy: "current-user",
      IsFrozen: false,
      EquipmentCodes: [job.equipmentCode],
      TotalTimeMinutes: job.timeSpentMinutes,
      StartDateTBD: false,
      RequiresSAT: false,
      RequiresDrawingUpdate: false,
      RequiresInventoryUpdate: false,
      AcceptanceGates: [],
      UpdatedAt: createdAt,
      Attachments: job.photoUrl ? [{ id: crypto.randomUUID(), name: job.photoName ?? "fast-job-photo", type: job.photoType || "image/unknown", dataUrl: job.photoUrl }] : [],
      Activity: [
        { id: crypto.randomUUID(), kind: "log", actorId: currentUser?.UserId ?? "current-user",
          actorName: currentUser?.DisplayName ?? "Current user", actorRole: currentRole, createdAt,
          text: `Fast Job created at 50% by ${currentUser?.DisplayName ?? "Current user"}` },
        ...(job.photoUrl ? [{ id: crypto.randomUUID(), kind: "log" as const, actorId: currentUser?.UserId ?? "current-user",
          actorName: currentUser?.DisplayName ?? "Current user", actorRole: currentRole, createdAt,
          text: `Image '${job.photoName ?? "fast-job-photo"}' was added by ${currentUser?.DisplayName ?? "Current user"}` }] : []),
      ],
    };
    setData((current) => ({ ...current, workRequests: [...current.workRequests, newWR] }));
    setFastJobOpen(false);
  };

  const handleCreateLJ = () => {
    setSelectedWR(null);
    setDrawerMode("create");
    setDrawerOpen(true);
  };

  const handleViewWR = (wr: BaseWorkRequest) => {
    if (wr.WR_Type === "PM") {
      setPmPopupWR(wr);
      return;
    }
    setSelectedWR(wr);
    setDrawerMode("view");
    setDrawerOpen(false);
  };

  const handleEscalateToLJ = (wr: BaseWorkRequest) => {
    setSelectedWR(wr);
    setDrawerMode("escalate");
    setDrawerOpen(true);
  };

  const handleSubmitWR = (wr: Partial<BaseWorkRequest>) => {
    if (drawerMode === "create") {
      if (!wr.bl_id || !wr.TradeId || !wr.Description?.trim()) {
        alert("A description, trade and building are required.");
        return;
      }
      const newWR: BaseWorkRequest = {
        WR_ID: wr.WR_ID || `LJ-${Math.random().toString(36).substring(7).toUpperCase()}-2026`,
        JobID: wr.JobID || `JOB-${Date.now()}`,
        WR_Type: "LJ",
        ESAWorkType: wr.ESAWorkType || "Corrective Maintenance",
        Description: wr.Description || "New Long Job",
        ProblemLocation: wr.ProblemLocation,
        CreatedDate: wr.CreatedDate || new Date().toISOString().split("T")[0],
        WorkRequestStatus: "Requested",
        WorkRequestSubstatus: wr.ProcessTrack === "RFW" ? "New Request for Work" : "New Request for Quotation",
        Percentage: 0,
        ProcessTrack: wr.ProcessTrack ?? "RFQ",
        AssignedRoles: wr.AssignedRoles,
        CostType: wr.CostType ?? "Fixed",
        SiteId: activeSiteId,
        bl_id: wr.bl_id,
        LevelName: wr.LevelName,
        RoomCode: wr.RoomCode,
        TradeId: wr.TradeId,
        TradeName: wr.TradeName,
        AssignedCraftpersonIds: [],
        AssignedUserIds: [],
        CreatedBy: "current-user",
        IsFrozen: false,
        EquipmentCodes: wr.EquipmentCodes || [],
        TotalTimeMinutes: wr.TotalTimeMinutes || 0,
        StartDateTBD: false,
        RequiresSAT: wr.RequiresSAT || false,
        RequiresDrawingUpdate: wr.RequiresDrawingUpdate || false,
        RequiresInventoryUpdate: wr.RequiresInventoryUpdate || false,
        AcceptanceGates: wr.AcceptanceGates || [],
        EstimatedCostEur: wr.EstimatedCostEur,
        Activity: [{ id: crypto.randomUUID(), kind: "log", actorId: currentUser?.UserId ?? "current-user",
          actorName: currentUser?.DisplayName ?? "Current user", actorRole: currentRole, createdAt: new Date().toISOString(),
          text: `Long Job created at 0% by ${currentUser?.DisplayName ?? "Current user"}` }],
      };
      setData((current) => ({ ...current, workRequests: [...current.workRequests, newWR] }));
    } else if (drawerMode === "escalate" && selectedWR) {
      const ljWR: BaseWorkRequest = {
        ...selectedWR,
        WR_ID: `LJ-${Math.random().toString(36).substring(7).toUpperCase()}-2026`,
        WR_Type: "LJ",
        OriginatingFJ_WR_ID: selectedWR.WR_ID,
        ProcessTrack: "RFQ",
        AssignedRoles: { ...data.tradeRoleMappings.find((item) => item.SiteId === activeSiteId && item.Trade === selectedWR.TradeId)?.assignments,
          ...data.siteRoleMappings.find((item) => item.SiteId === activeSiteId)?.assignments },
        Percentage: 10,
        WorkRequestStatus: "Requested",
        WorkRequestSubstatus: "Work Request from Fast Job - On Hold",
        ChecklistSteps: undefined,
        ChecklistResults: undefined,
        Attachments: [],
        Activity: [{ id: crypto.randomUUID(), kind: "log", actorId: currentUser?.UserId ?? "current-user",
          actorName: currentUser?.DisplayName ?? "Current user", actorRole: currentRole, createdAt: new Date().toISOString(),
          text: `Long Job created at 10% from ${selectedWR.WR_ID} by ${currentUser?.DisplayName ?? "Current user"}` }],
        EstimatedCostEur: wr.EstimatedCostEur || selectedWR.EstimatedCostEur,
        CostType: wr.CostType ?? selectedWR.CostType ?? "Fixed",
        RequiresSAT: wr.RequiresSAT !== undefined ? wr.RequiresSAT : selectedWR.RequiresSAT || false,
        RequiresDrawingUpdate: wr.RequiresDrawingUpdate !== undefined ? wr.RequiresDrawingUpdate : selectedWR.RequiresDrawingUpdate || false,
        RequiresInventoryUpdate: wr.RequiresInventoryUpdate !== undefined ? wr.RequiresInventoryUpdate : selectedWR.RequiresInventoryUpdate || false,
      };
      setData((current) => ({ ...current, workRequests: [...current.workRequests.map((item) => item.WR_ID === selectedWR.WR_ID && item.SiteId === selectedWR.SiteId
        ? { ...item, EscalatedToLJ_WR_ID: ljWR.WR_ID, Activity: [...(item.Activity ?? []), {
          id: crypto.randomUUID(), kind: "log" as const, actorId: currentUser?.UserId ?? "current-user",
          actorName: currentUser?.DisplayName ?? "Current user", actorRole: currentRole, createdAt: new Date().toISOString(),
          text: `Fast Job escalated to ${ljWR.WR_ID} by ${currentUser?.DisplayName ?? "Current user"}` }] } : item), ljWR] }));
    }
  };

  return (
    <div className="space-y-6 p-6">
      <section className="bg-white border rounded-lg">
        <div className="min-h-10 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
          {requestType === "LJ" && <button onClick={handleCreateLJ} className="rounded bg-blue-600 px-2 py-1 text-white">+ Create LJ</button>}
          {requestType === "FJ" && <button onClick={() => setFastJobOpen(true)} className="rounded bg-blue-600 px-2 py-1 text-white">+ Create FJ</button>}
          <button type="button" aria-expanded={isFilterExpanded} onClick={() => setFilterExpanded((value) => !value)} className="font-semibold whitespace-nowrap">
            {isFilterExpanded ? "▼" : "▶"} Filter Work Requests <span className="rounded-full bg-blue-100 px-2">{columnFilterCount + [!!locationFilter.building, !!locationFilter.floor, !!locationFilter.room, selectedEquipmentCodes.length > 0, !!textFilter.trim(), !!dueDateFrom, !!dueDateTo].filter(Boolean).length}</span>
          </button>
          <input value={textFilter} onChange={(event) => setTextFilter(event.target.value)} placeholder="Quick search" aria-label="Search work requests" className="min-w-0 w-40 rounded border px-2 py-1" />
          </div>
          <div className="flex items-center gap-2">
          <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={`rounded px-2 py-1 ${view === "grid" ? "bg-blue-600 text-white" : "border"}`}>Data Grid</button>
          <button type="button" aria-pressed={view === "card"} onClick={() => setView("card")} className={`rounded px-2 py-1 ${view === "card" ? "bg-blue-600 text-white" : "border"}`}>Card View</button>
          <button
            type="button"
            onClick={() => {
              setLocationFilter({ building: null, floor: null, room: null });
              setSelectedEquipmentCodes([]);
              setTextFilter("");
              setDueDateFrom("");
              setDueDateTo("");
              setBucket("issued");
              setFilterVersion((version) => version + 1);
              setColumnFilterCount(0);
            }}
            className="px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Reset Filter
          </button>
          </div>
        </div>
        {isFilterExpanded && <div className="space-y-2 border-t p-3 text-xs">
        <LocationEquipmentPickerGroup
          compact
          buildings={siteBuildings}
          floors={siteFloors}
          rooms={siteRooms}
          equipment={siteEquipment}
          selectedBuilding={locationFilter.building}
          selectedFloor={locationFilter.floor}
          selectedRoom={locationFilter.room}
          selectedEquipmentCodes={selectedEquipmentCodes}
          onLocationChange={setLocationFilter}
          onEquipmentChange={setSelectedEquipmentCodes}
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="text-sm text-gray-600">
            Due From
            <input
              type="date"
              value={dueDateFrom}
              onChange={(event) => setDueDateFrom(event.target.value)}
              className="mt-1 block w-full px-3 py-2 border rounded"
            />
          </label>
          <label className="text-sm text-gray-600">
            Due To
            <input
              type="date"
              value={dueDateTo}
              onChange={(event) => setDueDateTo(event.target.value)}
              className="mt-1 block w-full px-3 py-2 border rounded"
            />
          </label>
        </div></div>}
      </section>

      {currentRole === "TeamLeader" && requestType !== "LJ" && (
        <button type="button" className="block w-full text-left bg-blue-50 border border-blue-200 rounded p-4"
          onClick={() => { if (requestType === "PM") setBucket("inspection"); else setTeamQueue((value) => !value); }}>
          <strong>Team Leader Checklist &amp; WR Overview</strong>
          <span className="block text-sm">Review {siteRequests.filter((wr) => wr.Percentage === 78).length} technically completed {requestType} work requests.</span>
        </button>
      )}
      {requestType === "PM" && <div className="flex flex-wrap gap-2">
        {buckets.map((item) => <button key={item.id} onClick={() => setBucket(item.id)}
          aria-pressed={bucket === item.id}
          className={`px-3 py-2 rounded text-sm ${bucket === item.id ? "bg-blue-100 text-blue-900" : "bg-white border"}`}>
          {item.label} ({siteRequests.filter((wr) => isInPmQueue(wr, item.id)).length})
        </button>)}
      </div>}
      {requestType === "LJ" && <div className="flex gap-2 text-xs"><button aria-pressed={groupLJ} onClick={() => setGroupLJ(true)} className="rounded border px-2 py-1">Group by Substatus</button><button aria-pressed={!groupLJ} onClick={() => setGroupLJ(false)} className="rounded border px-2 py-1">Flat List</button></div>}
      {view === "grid" ? <WRDataGrid key={`${activeSiteId}-${requestType}-${filterVersion}`} requestType={requestType} requests={filteredRequests} onOpen={handleViewWR} grouped={requestType === "LJ" && groupLJ} onFilterCount={setColumnFilterCount} /> :
      <div className="grid gap-4">
        {filteredRequests.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-600">
              No work requests for {activeSiteId}. Create one to get started.
            </p>
          </div>
        ) : (
          (requestType === "LJ" && groupLJ ? groupLongJobs(filteredRequests) : [{ key: "all", requests: filteredRequests, percentage: 0, description: "", track: "", cost: 0 }]).map((group) => (
            <React.Fragment key={group.key}>
            {requestType === "LJ" && groupLJ && <button className="rounded border bg-slate-100 p-2 text-left text-sm font-semibold" aria-expanded={!collapsedGroups.includes(group.key)} onClick={() => setCollapsedGroups((current) => current.includes(group.key) ? current.filter((key) => key !== group.key) : [...current, group.key])}>
              {collapsedGroups.includes(group.key) ? "▶" : "▼"} {group.percentage}% · {group.description} · {group.track} · {group.requests.length} LJs · {group.cost.toLocaleString("en-IE", { style: "currency", currency: "EUR" })}
            </button>}
            {(!groupLJ || requestType !== "LJ" || !collapsedGroups.includes(group.key)) && group.requests.map((wr) => (
            <div
              key={wr.WR_ID}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Card Header */}
              <div className="p-4 flex items-start justify-between border-b border-gray-100">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {wr.WR_ID}
                    </h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        wr.WR_Type === "LJ"
                          ? "bg-orange-100 text-orange-800"
                          : wr.WR_Type === "FJ"
                          ? "bg-green-100 text-green-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {wr.WR_Type}
                    </span>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {wr.Percentage}%
                    </span>
                  </div>
                  <p className="text-gray-700">{wr.Description}</p>
                  <p className="text-sm text-gray-600 mt-1">{wr.ProblemLocation}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewWR(wr)}
                    className="p-2 hover:bg-gray-100 rounded-lg text-blue-600"
                  >
                    <Eye size={20} />
                  </button>
                  {wr.WR_Type === "FJ" && !wr.EscalatedToLJ_WR_ID && (
                    <button
                      onClick={() => handleEscalateToLJ(wr)}
                      className="p-2 hover:bg-gray-100 rounded-lg text-orange-600"
                      title="Escalate to Long Job"
                    >
                      <ArrowUp size={20} />
                    </button>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 bg-gray-50 space-y-2">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Status</p>
                    <p className="font-medium text-gray-900">
                      {wr.WorkRequestSubstatus}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Estimated Cost</p>
                    <p className="font-medium text-gray-900">
                      {wr.EstimatedCostEur} EUR
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Created</p>
                    <p className="font-medium text-gray-900">{wr.CreatedDate}</p>
                  </div>
                </div>

                {/* Acceptance Gates Info */}
                {wr.WR_Type === "LJ" && (wr.RequiresSAT || wr.RequiresDrawingUpdate || wr.RequiresInventoryUpdate) && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-700 mb-2">
                      Required Gates:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {wr.RequiresSAT && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                          SAT
                        </span>
                      )}
                      {wr.RequiresDrawingUpdate && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                          Drawing/Eng
                        </span>
                      )}
                      {wr.RequiresInventoryUpdate && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                          CIFM Inventory
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {requestType === "PM" && bucket === "passed" && wr.Percentage === 78 && (
                  <button type="button" onClick={() => {
                    const complete = WR_Statuses.find((status) => status.ESAWorkType === wr.ESAWorkType && status.Percentage === 100);
                    if (!complete) { alert(`No 100% WR_Statuses configuration exists for ${wr.ESAWorkType}.`); return; }
                    const now = new Date().toISOString();
                    setData((current) => ({ ...current, workRequests: current.workRequests.map((item) =>
                      item.WR_ID === wr.WR_ID && item.SiteId === wr.SiteId ? {
                        ...item, Percentage: 100, WorkRequestStatus: complete.WorkRequestStatus,
                        WorkRequestSubstatus: complete.WorkRequestSubstatus, QA_InspectionStatus: "Passed",
                        UpdatedAt: now, Activity: [...(item.Activity ?? []), {
                          id: crypto.randomUUID(), kind: "log" as const, actorId: currentUser?.UserId ?? "current-user",
                          actorName: currentUser?.DisplayName ?? "Current user", actorRole: currentRole, createdAt: now,
                          text: `Passed PM WR completed at 100% by ${currentUser?.DisplayName ?? "Current user"}`,
                        }],
                      } : item,
                    ) }));
                  }} className="mt-3 rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white">Complete (100%)</button>
                )}
                {requestType === "PM" && bucket === "corrected" && (
                  <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                    <p className="text-sm"><strong>QA_IssueDescription:</strong> {wr.QA_IssueDescription || "No issue description recorded."}</p>
                    <p className="text-sm"><strong>QA_CorrectionComment:</strong> {wr.QA_CorrectionComment || "No correction comment recorded."}</p>
                    <label className="block text-sm">Correction performed / re-submission comment
                      <textarea value={correctionDrafts[wr.WR_ID] ?? ""} onChange={(event) => setCorrectionDrafts((value) => ({ ...value, [wr.WR_ID]: event.target.value }))}
                        className="mt-1 block w-full rounded border p-2" rows={2} />
                    </label>
                    <button type="button" disabled={!correctionDrafts[wr.WR_ID]?.trim()} onClick={() => {
                      const comment = correctionDrafts[wr.WR_ID]?.trim();
                      if (!comment) return;
                      const now = new Date().toISOString();
                      setData((current) => ({ ...current, workRequests: current.workRequests.map((item) =>
                        item.WR_ID === wr.WR_ID && item.SiteId === wr.SiteId ? {
                          ...item, QA_InspectionStatus: "Pending", AuditInspectionStatus: "To Be Inspected",
                          QA_CorrectionComment: comment, UpdatedAt: now,
                          Activity: [...(item.Activity ?? []), {
                            id: crypto.randomUUID(), kind: "log" as const, actorId: currentUser?.UserId ?? "current-user",
                            actorName: currentUser?.DisplayName ?? "Current user", actorRole: currentRole, createdAt: now,
                            text: `Correction completed and PM WR re-submitted for QA by ${currentUser?.DisplayName ?? "Current user"}: ${comment}`,
                          }],
                        } : item,
                      ) }));
                      setCorrectionDrafts((value) => ({ ...value, [wr.WR_ID]: "" }));
                    }} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Correction Complete &amp; Re-submit</button>
                  </div>
                )}

              </div>

            </div>
          ))}</React.Fragment>))
        )}
      </div>}
      {/* Drawer */}
      {pmPopupWR && <PMWorkRequestPopup
        key={`${pmPopupWR.SiteId}-${pmPopupWR.WR_ID}`}
        workRequest={workRequests.find((wr) => wr.WR_ID === pmPopupWR.WR_ID && wr.SiteId === pmPopupWR.SiteId) ?? pmPopupWR}
        onClose={() => setPmPopupWR(null)}
        onNavigate={(id) => {
          const target = workRequests.find((wr) => wr.WR_ID === id && wr.SiteId === activeSiteId);
          if (!target) { alert(`Work request ${id} is not available at this site.`); return; }
          if (target.WR_Type === "LJ") {
            setPmPopupWR(null);
            setSelectedWR(target);
            setDrawerMode("view");
            setDrawerOpen(false);
          } else if (target.WR_Type === "FJ") {
            setPmPopupWR(null);
            setSelectedWR(target);
            setDrawerMode("view");
          } else {
            setPmPopupWR(target);
          }
        }}
        onEscalateToLJ={(wr) => {
          setPmPopupWR(null);
          handleEscalateToLJ(wr);
        }}
      />}
      {selectedWR && drawerMode === "view" && selectedWR.WR_Type === "FJ" && <FJWorkRequestPopup
        key={`${selectedWR.SiteId}-${selectedWR.WR_ID}`}
        workRequest={workRequests.find((wr) => wr.WR_ID === selectedWR.WR_ID && wr.SiteId === selectedWR.SiteId) ?? selectedWR}
        onClose={() => setSelectedWR(null)}
        onNavigate={(id) => {
          const target = workRequests.find((wr) => wr.WR_ID === id && wr.SiteId === activeSiteId);
          if (!target) { alert(`Work request ${id} is not available at this site.`); return; }
          if (target.WR_Type === "PM") {
            setSelectedWR(null);
            setPmPopupWR(target);
          } else {
            setSelectedWR(target);
            setDrawerMode("view");
          }
        }}
        onEscalateToLJ={(wr) => {
          setSelectedWR(null);
          handleEscalateToLJ(wr);
        }}
      />}
      {selectedWR && drawerMode === "view" && selectedWR.WR_Type === "LJ" && <LJWorkRequestPopup
        key={`${selectedWR.SiteId}-${selectedWR.WR_ID}`}
        workRequest={workRequests.find((wr) => wr.WR_ID === selectedWR.WR_ID && wr.SiteId === selectedWR.SiteId) ?? selectedWR}
        onClose={() => setSelectedWR(null)}
        onNavigate={(id) => {
          const target = workRequests.find((wr) => wr.WR_ID === id && wr.SiteId === activeSiteId);
          if (!target) { alert(`Work request ${id} is not available at this site.`); return; }
          if (target.WR_Type === "PM") {
            setSelectedWR(null);
            setPmPopupWR(target);
          } else setSelectedWR(target);
        }}
      />}
      <LongJobDrawer
        key={`${activeSiteId}-${drawerMode}-${selectedWR?.WR_ID || "new"}-${drawerOpen}`}
        isOpen={drawerOpen && drawerMode !== "view"}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmitWR}
        onNavigate={(id) => {
          const target = workRequests.find((wr) => wr.WR_ID === id && wr.SiteId === activeSiteId);
          if (!target) { alert(`Work request ${id} is not available at this site.`); return; }
          setSelectedWR(target);
          setDrawerMode("view");
        }}
        workRequest={selectedWR ? workRequests.find((wr) => wr.WR_ID === selectedWR.WR_ID && wr.SiteId === selectedWR.SiteId) ?? selectedWR : null}
        mode={drawerMode}
      />
      <FastJobModal
        isOpen={fastJobOpen}
        onClose={() => setFastJobOpen(false)}
        onSubmit={handleSubmitFJ}
      />
    </div>
  );
}
