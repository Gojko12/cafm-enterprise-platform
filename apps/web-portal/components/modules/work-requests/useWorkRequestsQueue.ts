"use client";

import { useEffect, useState } from "react";
import type { BaseWorkRequest, Building, Floor, Room, WR_Type } from "@cafm/shared-schema";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import { useApp } from "@/lib/hooks/useApp";
import { buildFastJobWR } from "@/lib/fj-factory";
import { isDissatisfied } from "@/lib/fj-satisfaction";
import { allocateWorkRequestId } from "@/lib/wr-id-migration";
import { getChecklistProgress, getFollowUpFJsForPM, getParentPM, getUnfavourableStepCount, isPmEligibleForExecutionSignals } from "@/lib/wr-signals";
import type { SignalTab } from "@/lib/wr-signals";
import type { FastJobData } from "@/components/modules/FastJobModal";

export type PmQueueBucket = "issued" | "inspection" | "passed" | "corrected" | "completed" | "cancelled";
export type WrSignalFilter = "unfavourable" | "follow-up" | "parent" | "incomplete-checklist";

export const PM_QUEUE_BUCKETS: Array<{ id: PmQueueBucket; label: string }> = [
  { id: "issued", label: "Issued PM WRs" },
  { id: "inspection", label: "To Be Inspected PM WRs" },
  { id: "passed", label: "Passed Inspected PM WRs" },
  { id: "corrected", label: "PM WRs to be corrected" },
  { id: "completed", label: "Completed PM WRs" },
  { id: "cancelled", label: "Canceled PM WRs" },
];

/** A PM that failed QA or was reopened from 78% for rework belongs strictly in `PM WRs to be corrected`. */
export const needsPmCorrection = (wr: BaseWorkRequest) =>
  wr.QA_AuditStatus === "QA_Failed_ActionRequired" || wr.QA_InspectionStatus === "ToBeCorrected" ||
  wr.AuditInspectionStatus === "PM WRs to be corrected";

export function isInPmQueue(wr: BaseWorkRequest, queue: PmQueueBucket): boolean {
  const qaStatus = wr.QA_InspectionStatus;
  switch (queue) {
    // Reopened / QA-failed PMs never appear in `Issued PM WRs` — only in `PM WRs to be corrected`.
    case "issued": return (wr.Percentage === 50 || wr.Percentage === 55) && !needsPmCorrection(wr);
    case "inspection": return wr.Percentage === 78 && qaStatus !== "Passed" && qaStatus !== "ToBeCorrected" &&
      wr.AuditInspectionStatus !== "Passed Inspected" && wr.AuditInspectionStatus !== "PM WRs to be corrected" &&
      wr.QA_AuditStatus !== "QA_Failed_ActionRequired";
    case "passed": return wr.Percentage === 78 && (qaStatus === "Passed" || wr.AuditInspectionStatus === "Passed Inspected") && !needsPmCorrection(wr);
    case "corrected": return needsPmCorrection(wr) && wr.Percentage !== 27;
    case "completed": return wr.Percentage === 100;
    case "cancelled": return wr.Percentage === 27;
  }
}

export function useWorkRequestsQueue(requestType: WR_Type) {
  const { activeSiteId, currentUser, activePerson } = useSiteContext();
  const { currentRole } = useApp();
  const { data, setData } = useCafmStore();
  const { profile, permissions } = useActiveUserPermissions();
  const workRequests = data.workRequests;
  const [view, setView] = useState<"grid" | "card">("grid");
  const [isFilterExpanded, setFilterExpanded] = useState(false);
  const [filterVersion, setFilterVersion] = useState(0);
  const [columnFilterCount, setColumnFilterCount] = useState(0);
  const [groupLJ, setGroupLJ] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [bucket, setBucket] = useState<PmQueueBucket>("issued");
  const [correctionDrafts, setCorrectionDrafts] = useState<Record<string, string>>({});
  const [teamQueue, setTeamQueue] = useState(false);
  const [fjView, setFjView] = useState<"all" | "dissatisfied">("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fastJobOpen, setFastJobOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "view" | "escalate">("create");
  const [selectedWR, setSelectedWR] = useState<BaseWorkRequest | null>(null);
  const [pmPopupWR, setPmPopupWR] = useState<BaseWorkRequest | null>(null);
  const [pmView, setPmView] = useState<"queue" | "hub">("queue");
  const [initialTab, setInitialTab] = useState<SignalTab>();
  const [signalFilter, setSignalFilter] = useState<WrSignalFilter | null>(null);
  const [locationFilter, setLocationFilter] = useState<{ building: Building | null; floor: Floor | null; room: Room | null }>({ building: null, floor: null, room: null });
  const [selectedEquipmentCodes, setSelectedEquipmentCodes] = useState<string[]>([]);
  const [textFilter, setTextFilter] = useState("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");

  useEffect(() => { setColumnFilterCount(0); }, [activeSiteId, requestType, view]);
  useEffect(() => { setSignalFilter(null); }, [activeSiteId, requestType]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (requestType === "PM" && params.get("view") === "hub") setPmView("hub");
  }, [requestType]);
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

  const siteRequests = workRequests.filter((wr) => wr.SiteId === activeSiteId && wr.WR_Type === requestType && !!profile &&
    profile.vpaTrades.some((trade) => trade === wr.TradeName || trade === wr.TradeId) &&
    (!profile.vpaBuildingIds.length || profile.vpaBuildingIds.includes(wr.bl_id)));

  const scopedRequests = siteRequests.filter((wr) => {
    if (requestType === "FJ" && teamQueue && wr.Percentage !== 78) return false;
    if (requestType === "FJ" && fjView === "dissatisfied" && !isDissatisfied(wr)) return false;
    if (requestType === "PM" && !isInPmQueue(wr, bucket)) return false;
    if (locationFilter.building && wr.bl_id !== locationFilter.building.bl_id) return false;
    if (locationFilter.floor && wr.LevelName !== locationFilter.floor.LevelName) return false;
    if (locationFilter.room && wr.RoomCode !== locationFilter.room.RoomCode) return false;
    if (selectedEquipmentCodes.length > 0 && !wr.EquipmentCodes?.some((code) => selectedEquipmentCodes.includes(code))) return false;
    if (dueDateFrom && (!wr.DueDate || wr.DueDate.slice(0, 10) < dueDateFrom)) return false;
    if (dueDateTo && (!wr.DueDate || wr.DueDate.slice(0, 10) > dueDateTo)) return false;
    const query = textFilter.trim().toLowerCase();
    return !query || wr.WR_ID.toLowerCase().includes(query) || wr.Description.toLowerCase().includes(query) || wr.TradeName?.toLowerCase().includes(query);
  });

  const hasSignal = (wr: BaseWorkRequest, signal: WrSignalFilter) =>
    signal === "unfavourable" ? (wr.WR_Type !== "PM" || isPmEligibleForExecutionSignals(wr)) && getUnfavourableStepCount(wr, data) > 0 :
      signal === "follow-up" ? isPmEligibleForExecutionSignals(wr) && getFollowUpFJsForPM(wr.WR_ID, workRequests).length > 0 :
        signal === "parent" ? !!getParentPM(wr, workRequests) :
          isPmEligibleForExecutionSignals(wr) && getChecklistProgress(wr, data).incomplete.length > 0;

  const filteredRequests = scopedRequests.filter((wr) => !signalFilter || hasSignal(wr, signalFilter));
  // Execution-signal pills are meaningless in `Issued PM WRs` and `Canceled PM WRs` and stay hidden there.
  const signalsHidden = requestType === "PM" && (bucket === "issued" || bucket === "cancelled");

  const resetFilters = () => {
    setLocationFilter({ building: null, floor: null, room: null });
    setSelectedEquipmentCodes([]);
    setTextFilter("");
    setDueDateFrom("");
    setDueDateTo("");
    setBucket("issued");
    setFilterVersion((version) => version + 1);
    setColumnFilterCount(0);
  };

  const handleSubmitFJ = (job: FastJobData) => {
    if (!permissions?.canCreateFJ) { alert("Permission required to create a Fast Job."); return; }
    const newWR = buildFastJobWR(job, { siteId: activeSiteId, data, actor: { userId: currentUser?.UserId, displayName: profile?.fullName ?? currentUser?.DisplayName ?? activePerson, role: currentRole, personId: profile?.id } });
    setData((current) => ({ ...current, workRequests: [...current.workRequests, newWR] }));
    setFastJobOpen(false);
  };

  const handleCreateLJ = () => {
    if (!permissions?.canCreateLJ) { alert("Permission required to create a Long Job."); return; }
    setSelectedWR(null);
    setDrawerMode("create");
    setDrawerOpen(true);
  };

  const handleViewWR = (wr: BaseWorkRequest, tab?: SignalTab) => {
    setInitialTab(tab);
    setSelectedWR(null);
    setPmPopupWR(null);
    if (wr.WR_Type === "PM") { setPmPopupWR(wr); return; }
    setSelectedWR(wr);
    setDrawerMode("view");
    setDrawerOpen(false);
  };

  const handleEscalateToLJ = (wr: BaseWorkRequest) => {
    if (!permissions?.canCreateLJ) { alert("Permission required to create a Long Job."); return; }
    setSelectedWR(wr);
    setDrawerMode("escalate");
    setDrawerOpen(true);
  };

  // Deep link: /preventive-maintenance?wr=2026000123 opens that WR directly.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("wr");
    if (!id) return;
    const target = workRequests.find((wr) => wr.WR_ID === id && wr.SiteId === activeSiteId && wr.WR_Type === requestType);
    if (target) handleViewWR(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, requestType]);

  const handleSubmitWR = (wr: Partial<BaseWorkRequest>) => {
    if (!permissions?.canCreateLJ) { alert("Permission required to create a Long Job."); return; }
    if (drawerMode === "create") {
      if (!wr.bl_id || !wr.TradeId || !wr.Description?.trim()) {
        alert("A description, trade and building are required.");
        return;
      }
      const newWR: BaseWorkRequest = {
        WR_ID: allocateWorkRequestId(data.workRequests, { site: activeSiteId, deleted: data.deletedWorkRequests ?? [] }),
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
        WR_ID: allocateWorkRequestId(data.workRequests, { site: activeSiteId, deleted: data.deletedWorkRequests ?? [] }),
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
        timeSessions: undefined,
        laborEntries: undefined,
        todoSteps: undefined,
        roughScopeNotes: undefined,
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

  return {
    data, setData, workRequests, activeSiteId, currentUser, activePerson, currentRole, profile, permissions,
    view, setView, isFilterExpanded, setFilterExpanded, filterVersion, columnFilterCount, setColumnFilterCount,
    groupLJ, setGroupLJ, collapsedGroups, setCollapsedGroups, bucket, setBucket, correctionDrafts, setCorrectionDrafts,
    teamQueue, setTeamQueue, fjView, setFjView, drawerOpen, setDrawerOpen, fastJobOpen, setFastJobOpen,
    drawerMode, setDrawerMode, selectedWR, setSelectedWR, pmPopupWR, setPmPopupWR, pmView, setPmView,
    initialTab, setInitialTab, signalFilter, setSignalFilter, locationFilter, setLocationFilter,
    selectedEquipmentCodes, setSelectedEquipmentCodes, textFilter, setTextFilter,
    dueDateFrom, setDueDateFrom, dueDateTo, setDueDateTo,
    siteBuildings, siteFloors, siteRooms, siteEquipment, siteRequests, scopedRequests, filteredRequests,
    hasSignal, signalsHidden, resetFilters, handleSubmitFJ, handleCreateLJ, handleViewWR, handleEscalateToLJ, handleSubmitWR,
  };
}

export type WorkRequestsQueue = ReturnType<typeof useWorkRequestsQueue>;
