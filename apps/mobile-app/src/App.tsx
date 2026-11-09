import React, { useState, useEffect, useCallback, useRef } from "react";
import { initOfflineEngine, OfflineEngine } from "./lib/offline-engine";
import { getDB } from "./lib/db";
import {
  MobileHeader,
  TechnicianHome,
  AdvancedFilterPanel,
  QRScanner,
  EquipmentInspectionView,
  PM_StepDefinition,
} from "./components";
import {
  BaseWorkRequest,
  Building,
  Floor,
  Room,
  Equipment,
  SiteId,
  WR_Statuses,
  LocationFreezeSchema,
  UserAccessProfileSchema,
} from "@cafm/shared-schema";
import type { LocationFreeze } from "@cafm/shared-schema";
import { z } from "zod";
import { applyFilters, useFilterStore } from "./lib/store";
import type { FilterCriteria } from "./lib/store";
import { MobileChecklist } from "./components/MobileChecklist";
import { ExecutionHub } from "./components/ExecutionHub";
import { stable } from "./lib/portal-sync";

type AppView = "home" | "hub" | "checklist" | "scanner" | "inspection" | "qa-spot-check";
const siteContextSchema = z.object({
  craftspeople: z.array(z.object({ id: z.string(), Name: z.string(), LastName: z.string(), Trade: z.string(), HourlyRate: z.number(), SiteId: z.string() })),
  locationFreezes: z.array(LocationFreezeSchema),
  userAccessProfiles: z.array(UserAccessProfileSchema).default([]),
});

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>("home");
  const [activeSiteId, setActiveSiteId] = useState<SiteId>("SITE-01");
  const [currentTechnicianId, setCurrentTechnicianId] = useState<string>("");
  const [technicians, setTechnicians] = useState<z.infer<typeof siteContextSchema>["craftspeople"]>([]);
  const [freezes, setFreezes] = useState<LocationFreeze[]>([]);
  const [profiles, setProfiles] = useState<z.infer<typeof UserAccessProfileSchema>[]>([]);
  const [followUpDescription, setFollowUpDescription] = useState("");
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpError, setFollowUpError] = useState("");
  const [openCompletion, setOpenCompletion] = useState(false);
  const activeSelection = useRef({ activeSiteId, currentTechnicianId });
  activeSelection.current = { activeSiteId, currentTechnicianId };

  // State
  const [engine, setEngine] = useState<OfflineEngine | null>(null);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);
  const [myWRs, setMyWRs] = useState<BaseWorkRequest[]>([]);
  const [unassignedWRs, setUnassignedWRs] = useState<BaseWorkRequest[]>([]);
  const [siteWRs, setSiteWRs] = useState<BaseWorkRequest[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);

  // Selected items for views
  const [selectedWR, setSelectedWR] = useState<BaseWorkRequest | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [checklistSteps, setChecklistSteps] = useState<PM_StepDefinition[]>([]);

  // Filters
  const filters = useFilterStore((state) => state.filters);
  const setFilter = useFilterStore((state) => state.setFilter);
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const refreshData = useCallback(async () => {
    const db = await getDB();
    const [storedBuildings, storedFloors, storedRooms, storedEquipment, storedRequests, context] = await Promise.all([
      db.getAll("buildings"), db.getAll("floors"), db.getAll("rooms"),
      db.getAll("equipment"), db.getAll("workRequests"), db.get("syncMetadata", `siteContext:${activeSiteId}`),
    ]);
    if (activeSelection.current.activeSiteId !== activeSiteId ||
        activeSelection.current.currentTechnicianId !== currentTechnicianId) return;
    const siteRequests = storedRequests.filter((item) => item.SiteId === activeSiteId);
    const siteContext = context ? siteContextSchema.parse(JSON.parse(context.value)) : { craftspeople: [], locationFreezes: [], userAccessProfiles: [] };
    const people = siteContext.craftspeople.filter((item) => item.SiteId === activeSiteId);
    setTechnicians(people);
    setFreezes(siteContext.locationFreezes.filter((item) => item.siteId === activeSiteId));
    setProfiles(siteContext.userAccessProfiles.filter((item) => item.siteId === activeSiteId));
    const technician = people.find((item) => item.id === currentTechnicianId);
    if (!technician && people.length) { setCurrentTechnicianId(people[0].id); return; }
    setSiteWRs(siteRequests);
    setMyWRs(siteRequests.filter((wr) => wr.AssignedUserIds?.includes(currentTechnicianId) || wr.AssignedCraftpersonIds.includes(currentTechnicianId)));
    const access = siteContext.userAccessProfiles.find((item) => item.siteId === activeSiteId && item.linkedCraftpersonId === currentTechnicianId);
    const buildingAllowed = (building: string) => !!access && (!access.vpaBuildingIds.length || access.vpaBuildingIds.includes(building));
    setBuildings(storedBuildings.filter((item) => item.SiteId === activeSiteId && buildingAllowed(item.bl_id)));
    setFloors(storedFloors.filter((item) => item.SiteId === activeSiteId && buildingAllowed(item.bl_id)));
    setRooms(storedRooms.filter((item) => item.SiteId === activeSiteId && buildingAllowed(item.bl_id)));
    setEquipment(storedEquipment.filter((item) => item.SiteId === activeSiteId && buildingAllowed(item.bl_id) && !!item.PrimaryTradeId && !!access?.vpaTrades.some((trade) => trade === item.PrimaryTradeId)));
    setUnassignedWRs(siteRequests.filter((wr) => !wr.AssignedUserIds?.length && !wr.AssignedCraftpersonIds.length && !!access && access.vpaTrades.some((trade) => trade === wr.TradeName || trade === wr.TradeId) && (!access.vpaBuildingIds.length || access.vpaBuildingIds.includes(wr.bl_id))));
    setSelectedWR((current) => current ? siteRequests.find((wr) => wr.WR_ID === current.WR_ID) ?? current : null);
  }, [activeSiteId, currentTechnicianId]);

  useEffect(() => {
    setEngine(initOfflineEngine());
  }, []);

  useEffect(() => {
    setFilter("trade", undefined);
    setAppliedFilters((current) => ({ ...current, trade: undefined }));
  }, [activeSiteId, currentTechnicianId, setFilter]);

  useEffect(() => {
    if (!engine) return;
    engine.configureSync(activeSiteId, currentTechnicianId, isSimulatedOffline);
    void refreshData().catch((error) => console.error("Could not load offline data:", error));
    if (isSimulatedOffline) return;
    const sync = () => {
      void engine.syncNow().then(refreshData).catch((error) => console.error("Background sync failed:", error));
    };
    sync();
    const interval = window.setInterval(sync, 30000);
    return () => window.clearInterval(interval);
  }, [engine, activeSiteId, currentTechnicianId, isSimulatedOffline, refreshData]);

  const handleSyncNow = async () => {
    if (!engine) throw new Error("The offline engine is not ready.");
    const result = await engine.syncAfterChanges();
    await refreshData();
    return result;
  };

  const handleToggleOfflineMode = (isOffline: boolean) => {
    setIsSimulatedOffline(isOffline);
  };

  const handleClaimWR = async (wrId: string) => {
    const claimed = unassignedWRs.find((wr) => wr.WR_ID === wrId);
    if (!claimed || !engine || !access?.permissions.canClaimUnassignedWR) throw new Error("You are not permitted to claim this work request.");
    try {
      await engine.saveWorkRequest({ ...claimed, AssignedCraftpersonIds: [...(claimed.AssignedCraftpersonIds ?? []), currentTechnicianId], AssignedUserIds: [...(claimed.AssignedUserIds ?? []), currentTechnicianId] }, claimed);
      await refreshData();
    } catch (error) {
      console.error("Could not claim work request:", error);
      throw error;
    }
  };

  const handleOpenWR = (wrId: string) => {
    const wr = [...myWRs, ...unassignedWRs].find((w) => w.WR_ID === wrId);
    if (wr) {
      setSelectedWR(wr);
      const sourceSteps = wr.ChecklistSteps?.length ? wr.ChecklistSteps : wr.ChecklistInstances ?? [];
      setChecklistSteps([...sourceSteps].sort((a, b) => a.SortOrder - b.SortOrder).map((step) => ({
        StepId: step.StepId, StepNumber: step.SortOrder, StepTitle: step.Title, InputType: step.InputType,
        favourableBoolean: step.favourableBoolean, MinThreshold: step.MinThreshold, MaxThreshold: step.MaxThreshold, Unit: step.Unit,
        RequiresPhotoOnFailure: step.RequiresPhotoOnFailure, RequiresCommentOnFailure: step.RequiresCommentOnFailure,
        IsRequired: "IsRequired" in step ? step.IsRequired : true,
        Options: (step.Options ?? []).map((option) => ({ OptionId: option.OptionId, OptionValue: option.Value, TriggersFailure: option.TriggersFailure })),
      })));
      setCurrentView("hub");
    }
  };

  const handleScanEquipment = (equipmentCode: string) => {
    const eq = equipment.find((e) => e.EquipmentCode === equipmentCode);
    if (eq) {
      setSelectedEquipment(eq);
      setCurrentView("inspection");
    } else {
      alert(`Equipment ${equipmentCode} not found`);
    }
  };

  const persistCreatedRequest = async (request: BaseWorkRequest) => {
    if (!engine) {
      throw new Error("The offline work request store is not ready yet.");
    }
    await engine.saveWorkRequest(request, null);
    setSiteWRs((current) => [...current, request]);
    if (request.AssignedCraftpersonIds.includes(currentTechnicianId) || request.AssignedUserIds.includes(currentTechnicianId)) setMyWRs((current) => [...current, request]);
  };

  const handleCreateMobileFJ = async (job: {
    equipmentCode: string;
    bl_id: string;
    levelName: string;
    roomCode: string;
    description: string;
    photoUrl?: string;
  }) => {
    if (!access?.permissions.canCreateFJ) throw new Error("Permission required to create a Fast Job.");
    const issued = WR_Statuses.find(
      (status) =>
        status.Percentage === 50 &&
        status.ESAWorkType === "Corrective Maintenance",
    );
    if (!issued) throw new Error("Issued status configuration is missing.");
    const now = new Date().toISOString();
    const request: BaseWorkRequest = {
      WR_ID: `FJ-${Date.now()}`,
      JobID: `JOB-${Date.now()}`,
      WR_Type: "FJ",
      ESAWorkType: issued.ESAWorkType,
      Description: job.description,
      ProblemLocation: `${job.bl_id} / ${job.levelName} / ${job.roomCode}`,
      EquipmentCodes: [job.equipmentCode],
      TotalTimeMinutes: 0,
      CreatedDate: now.slice(0, 10),
      WorkRequestStatus: issued.WorkRequestStatus,
      WorkRequestSubstatus: issued.WorkRequestSubstatus,
      Percentage: issued.Percentage,
      bl_id: job.bl_id,
      LevelName: job.levelName,
      RoomCode: job.roomCode,
      SiteId: activeSiteId,
      AssignedCraftpersonIds: [],
      AssignedUserIds: [currentTechnicianId],
      CreatedBy: currentTechnicianId,
      IsFrozen: false,
      StartDateTBD: false,
      RequiresSAT: false,
      RequiresDrawingUpdate: false,
      RequiresInventoryUpdate: false,
      AcceptanceGates: [],
      UpdatedAt: now,
      Attachments: job.photoUrl ? [{ id: crypto.randomUUID(), name: "Fast job photo", type: "image", dataUrl: job.photoUrl }] : [],
    };
    await persistCreatedRequest(request);
  };

  const handleCreateMobileLJ = async (job: {
    equipmentCodes: string[];
    bl_id: string;
    levelName: string;
    roomCode?: string;
    description: string;
  }) => {
    if (!access?.permissions.canCreateLJ) throw new Error("Permission required to create a Long Job.");
    const now = new Date().toISOString();
    const request: BaseWorkRequest = {
      WR_ID: `LJ-${Date.now()}`,
      JobID: `JOB-${Date.now()}`,
      WR_Type: "LJ",
      ESAWorkType: "Corrective Maintenance",
      Description: job.description,
      ProblemLocation: `${job.bl_id} / ${job.levelName}${job.roomCode ? ` / ${job.roomCode}` : ""}`,
      EquipmentCodes: job.equipmentCodes,
      TotalTimeMinutes: 0,
      CreatedDate: now.slice(0, 10),
      WorkRequestStatus: "Requested",
      WorkRequestSubstatus: "New Request for Quotation",
      Percentage: 0,
      bl_id: job.bl_id,
      LevelName: job.levelName,
      RoomCode: job.roomCode,
      SiteId: activeSiteId,
      AssignedCraftpersonIds: [],
      AssignedUserIds: [currentTechnicianId],
      CreatedBy: currentTechnicianId,
      IsFrozen: false,
      StartDateTBD: false,
      RequiresSAT: false,
      RequiresDrawingUpdate: false,
      RequiresInventoryUpdate: false,
      AcceptanceGates: [],
      UpdatedAt: now,
    };
    await persistCreatedRequest(request);
  };

  const handleApplyFilters = () => {
    setAppliedFilters(useFilterStore.getState().filters);
  };
  const person = technicians.find((item) => item.id === currentTechnicianId);
  const access = profiles.find((item) => item.linkedCraftpersonId === currentTechnicianId && item.siteId === activeSiteId);
  const technicianName = person ? `${person.Name} ${person.LastName}` : currentTechnicianId;
  const saveSelected = async (change: (wr: BaseWorkRequest) => BaseWorkRequest, message: string) => {
    if (!engine || !selectedWR) throw new Error("Offline storage or work request is not ready.");
    const current = await engine.getWorkRequest(selectedWR.WR_ID);
    if (!current || current.SiteId !== activeSiteId) throw new Error("Work request is no longer available on this site.");
    const changed = change(current), now = new Date().toISOString();
    const updated: BaseWorkRequest = { ...changed, UpdatedAt: now, Activity: [...(changed.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: currentTechnicianId, actorName: technicianName, actorRole: "MobileTechnician", createdAt: now, text: message }] };
    await engine.saveWorkRequest(updated, current);
    setSelectedWR(updated);
    setSiteWRs((items) => items.map((item) => item.WR_ID === updated.WR_ID ? updated : item));
    setMyWRs((items) => items.map((item) => item.WR_ID === updated.WR_ID ? updated : item));
    setUnassignedWRs((items) => items.map((item) => item.WR_ID === updated.WR_ID ? updated : item));
  };
  const createFollowUp = async () => {
    if (!access?.permissions.canOpenFollowUpFJ) throw new Error("You are not permitted to create a follow-up FJ.");
    if (!selectedWR || !followUpDescription.trim()) throw new Error("Enter a follow-up description.");
    const issued = WR_Statuses.find((status) => status.ESAWorkType === "Corrective Maintenance" && status.Percentage === 50);
    if (!issued) throw new Error("Issued status configuration is missing.");
    const now = new Date().toISOString();
    const request: BaseWorkRequest = { WR_ID: `FJ-${crypto.randomUUID()}`, WR_Type: "FJ", ...issued, Description: followUpDescription.trim(), SiteId: selectedWR.SiteId, bl_id: selectedWR.bl_id, LevelName: selectedWR.LevelName, RoomCode: selectedWR.RoomCode, ProblemLocation: selectedWR.ProblemLocation, EquipmentCodes: [...selectedWR.EquipmentCodes], TradeId: selectedWR.TradeId, TradeName: selectedWR.TradeName, OriginatingWR_ID: selectedWR.WR_ID, ...(selectedWR.WR_Type === "PM" ? { ParentPM_WR_ID: selectedWR.WR_ID } : {}), ...(selectedWR.WR_Type === "FJ" ? { OriginatingFJ_WR_ID: selectedWR.WR_ID } : {}), CreatedDate: now.slice(0, 10), CreatedBy: technicianName, AssignedCraftpersonIds: [currentTechnicianId], AssignedUserIds: [currentTechnicianId], TotalTimeMinutes: 0, IsFrozen: false, StartDateTBD: false, RequiresSAT: false, RequiresDrawingUpdate: false, RequiresInventoryUpdate: false, AcceptanceGates: [], Activity: [{ id: crypto.randomUUID(), kind: "log", actorId: currentTechnicianId, actorName: technicianName, actorRole: "MobileTechnician", createdAt: now, text: `Created follow-up for ${selectedWR.WR_ID}.` }] };
    await persistCreatedRequest(request);
    setFollowUpOpen(false);
    try { await handleSyncNow(); alert(`Follow-up ${request.WR_ID} saved and synchronized.`); }
    catch (error) { alert(`Follow-up ${request.WR_ID} saved offline. Synchronization failed: ${error instanceof Error ? error.message : "Retry Sync Now."}`); }
  };
  const openFollowUp = () => {
    if (!selectedWR || !access?.permissions.canOpenFollowUpFJ) return;
    setFollowUpDescription(`Follow-up for ${selectedWR.WR_ID}: `);
    setFollowUpError("");
    setFollowUpOpen(true);
  };
  const finishChecklist = () => { if (!access?.permissions.canCompleteWR78) return; setOpenCompletion(true); setCurrentView("hub"); };

  // Render based on current view
  const renderContent = () => {
    switch (currentView) {
      case "hub":
        return selectedWR ? <ExecutionHub wr={selectedWR} technician={currentTechnicianId} technicianName={technicianName} person={person} people={technicians} equipment={equipment} freezes={freezes} save={saveSelected} back={() => { setOpenCompletion(false); setCurrentView("home"); setSelectedWR(null); }} checklist={() => { setOpenCompletion(false); setCurrentView("checklist"); }} followUp={access?.permissions.canOpenFollowUpFJ ? openFollowUp : undefined} canComplete={!!access?.permissions.canCompleteWR78} openCompletion={openCompletion} sync={async () => { await handleSyncNow(); }} /> : null;
      case "checklist":
        if (!selectedWR) return null;
        if (selectedWR.WR_Type === "PM") return <MobileChecklist key={selectedWR.WR_ID} wr={selectedWR} steps={checklistSteps} exit={() => setCurrentView("hub")} complete={access?.permissions.canCompleteWR78 ? finishChecklist : undefined} followUp={access?.permissions.canOpenFollowUpFJ ? openFollowUp : undefined} save={async (results, baseline) => saveSelected((current) => {
          const now = new Date().toISOString();
          const changed = results.filter((result) => stable(result) !== stable(baseline.find((item) => item.stepId === result.stepId)));
          for (const result of changed) {
            if (stable(current.ChecklistResults?.find((item) => item.stepId === result.stepId)) !== stable(baseline.find((item) => item.stepId === result.stepId))) throw new Error(`Step ${result.stepId} changed elsewhere. Your edits have not been saved; resolve the conflict before leaving.`);
          }
          return { ...current, ChecklistResults: [...(current.ChecklistResults ?? []).filter((item) => !changed.some((result) => result.stepId === item.stepId)), ...changed], ChecklistHistory: [...(current.ChecklistHistory ?? []), ...changed.map((result) => ({ id: crypto.randomUUID(), timestamp: now, performedBy: technicianName, actionType: "Mobile checklist updated", stepReference: result.stepId, details: `Answer: ${String(result.value)}; ${result.passed ? "favourable" : "unfavourable"}${result.comment ? `; ${result.comment}` : ""}` }))], StepAuditLogs: [...(current.StepAuditLogs ?? []), ...changed.flatMap((result) => { const instance = current.ChecklistInstances?.find((item) => item.StepId === result.stepId); return instance ? [{ AuditLogId: crypto.randomUUID(), StepInstanceId: instance.StepInstanceId, WR_ID: current.WR_ID, ActorId: currentTechnicianId, Action: "modified" as const, PreviousValue: baseline.find((item) => item.stepId === result.stepId)?.value, NewValue: result.value, OccurredAt: now }] : []; })] };
        }, "Checklist progress saved.")} />;
        {
          const todo = selectedWR.todoSteps ?? [];
          const todoSteps: PM_StepDefinition[] = [...todo].sort((a, b) => a.order - b.order).map((step) => ({ StepId: step.id, StepNumber: step.order, StepTitle: step.title, Instruction: step.instruction, InputType: "Boolean", favourableBoolean: true, RequiresPhotoOnFailure: false, RequiresCommentOnFailure: false }));
          const todoWR: BaseWorkRequest = { ...selectedWR, ChecklistResults: todo.map((step) => ({ stepId: step.id, value: step.completed ? "true" : "", passed: step.isFavourable ?? true, completedAt: step.completedAt ?? selectedWR.CreatedDate, comment: step.technicianComment, photoPaths: step.photoUrls })) };
          return <MobileChecklist key={selectedWR.WR_ID} wr={todoWR} steps={todoSteps} exit={() => setCurrentView("hub")} complete={access?.permissions.canCompleteWR78 ? finishChecklist : undefined} followUp={access?.permissions.canOpenFollowUpFJ ? openFollowUp : undefined} todoMode addSteps={(selectedWR.WR_Type === "FJ" ? access?.permissions.canDefineChecklistFJ : access?.permissions.canDefineChecklistLJ) ? async (titles, scope) => saveSelected((current) => {
            const existing = current.todoSteps ?? [];
            const start = Math.max(0, ...existing.map((step) => step.order));
            return { ...current, ...(scope !== undefined ? { roughScopeNotes: scope } : {}), todoSteps: [...existing, ...titles.map((title, index) => ({ id: crypto.randomUUID(), order: start + index + 1, title, completed: false }))] };
          }, `Added ${titles.length} technician to-do step(s).`) : undefined} save={async (results, baseline) => saveSelected((current) => {
            const changed = results.filter((result) => stable(result) !== stable(baseline.find((item) => item.stepId === result.stepId)));
            if (changed.some((result) => !(current.todoSteps ?? []).some((step) => step.id === result.stepId))) throw new Error("A technician step was removed elsewhere. Your edits have not been saved.");
            return { ...current, todoSteps: (current.todoSteps ?? []).map((step) => {
              const result = changed.find((item) => item.stepId === step.id);
              if (!result) return step;
              const before = baseline.find((item) => item.stepId === step.id);
              if (step.completed !== (!!before && before.value !== "") || (before && ((step.isFavourable ?? true) !== before.passed || step.technicianComment !== before.comment || stable(step.photoUrls) !== stable(before.photoPaths)))) throw new Error(`Step ${step.id} changed elsewhere. Your edits have not been saved; resolve the conflict before leaving.`);
              return { ...step, completed: result.value !== "", completedBy: result.value !== "" ? (step.completed ? step.completedBy : technicianName) : undefined, completedAt: result.value !== "" ? (step.completed ? step.completedAt : result.completedAt) : undefined, technicianComment: result.comment, photoUrls: result.photoPaths, isFavourable: result.passed };
            }) };
          }, "Technician task progress saved.")} />;
        }
      case "scanner":
        return (
          <QRScanner
            onScanComplete={handleScanEquipment}
            onCancel={() => setCurrentView("home")}
          />
        );

      case "inspection":
        return selectedEquipment ? (
          <EquipmentInspectionView
            equipment={selectedEquipment}
            activeWRs={[]}
            historicalWRs={[]}
            buildings={buildings}
            floors={floors}
            rooms={rooms}
            equipmentList={equipment}
            onCreateFJ={access?.permissions.canCreateFJ ? handleCreateMobileFJ : undefined}
            onCreateLJ={access?.permissions.canCreateLJ ? handleCreateMobileLJ : undefined}
            onLogTechnicalAudit={access?.permissions.canAuditChooseWRs ? () => setCurrentView("qa-spot-check") : undefined}
            onClose={() => {
              setCurrentView("home");
              setSelectedEquipment(null);
            }}
          />
        ) : null;

      case "qa-spot-check":
        return selectedEquipment ? <div className="space-y-3 p-4 pt-40"><h2 className="text-xl font-bold">QA spot-check · {selectedEquipment.EquipmentCode}</h2><button onClick={() => setCurrentView("inspection")}>Back to equipment</button>{siteWRs.filter((wr) => (wr.WR_Type === "PM" || wr.WR_Type === "FJ") && !!access?.permissions.canAuditChooseWRs && access.permissions.auditWRTypes.includes(wr.WR_Type) && access.permissions.auditTrades.some((trade) => trade === wr.TradeName || trade === wr.TradeId) && (!access.vpaBuildingIds.length || access.vpaBuildingIds.includes(wr.bl_id)) && wr.EquipmentCodes.includes(selectedEquipment.EquipmentCode) && (wr.Percentage === 78 || wr.Percentage === 100)).map((wr) => <div key={wr.WR_ID} className="rounded border bg-white p-3"><strong>{wr.WR_ID} · {wr.WR_Type}</strong><p>{wr.Description}</p><p>QA: {wr.QA_AuditStatus ?? "None"}</p><button disabled={!!wr.QA_AuditStatus && wr.QA_AuditStatus !== "None"} onClick={() => {
          if (!engine) { alert("Offline engine is not ready."); return; }
          const now = new Date().toISOString();
          const next: BaseWorkRequest = { ...wr, QA_CompletionDate: (wr.UpdatedAt ?? wr.CreatedDate).slice(0, 10), QA_AuditStatus: "SelectedForAudit", QA_SelectionMode: "QRScanOnSite", UpdatedAt: now, Activity: [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: currentTechnicianId, actorName: currentTechnicianId, actorRole: "MobileTechnician", createdAt: now, text: "Selected for QA audit by equipment QR spot-check." }] };
          void engine.saveWorkRequest(next, wr).then(refreshData).then(() => alert("Selected for audit. Sync to the web portal when online.")).catch((error: unknown) => alert(error instanceof Error ? error.message : "Could not select audit."));
        }}>Inspect This WR (QR Spot-Check)</button></div>)}</div> : null;

      case "home":
      default:
        return (
          <div className="pt-40 pb-20">
            <AdvancedFilterPanel
              trades={access?.vpaTrades ?? []}
              buildings={buildings}
              floors={floors}
              rooms={rooms}
              equipment={equipment}
              currentFilters={filters}
              onFiltersChange={(newFilters) => {
                if (newFilters.trade !== filters.trade) setAppliedFilters((current) => ({ ...current, trade: newFilters.trade }));
                Object.entries(newFilters).forEach(([key, value]) => {
                  setFilter(key as keyof FilterCriteria, value);
                });
              }}
              onApplyFilters={handleApplyFilters}
            />

            <TechnicianHome
              myWRs={applyFilters(myWRs, appliedFilters)}
              unassignedWRs={applyFilters(unassignedWRs, appliedFilters)}
              onClaimWR={access?.permissions.canClaimUnassignedWR ? handleClaimWR : undefined}
              onOpenWR={handleOpenWR}
            />
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-50 mobile-app">
      {/* Header */}
      <MobileHeader
        activeSiteId={activeSiteId}
        technicianId={currentTechnicianId}
        technicians={technicians}
        onTechnicianChange={(id) => { if (currentView !== "home") { alert("Return to the work request list before switching technicians."); return; } setMyWRs([]); setUnassignedWRs([]); setCurrentTechnicianId(id); }}
        onSiteChange={(site) => {
          if (currentView !== "home") {
            alert("Return to the work request list before switching sites.");
            return;
          }
          setMyWRs([]); setUnassignedWRs([]); setSiteWRs([]); setTechnicians([]); setProfiles([]); setFreezes([]); setCurrentTechnicianId(""); setActiveSiteId(site);
        }}
        onSyncNow={handleSyncNow}
        isSimulatedOffline={isSimulatedOffline}
        onToggleOfflineMode={handleToggleOfflineMode}
      />

      {/* Main Content */}
      <main className="h-screen overflow-y-auto flex flex-col">{renderContent()}</main>
      {followUpOpen && selectedWR && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"><div role="dialog" aria-modal="true" aria-label="Create Follow-Up FJ" className="w-full max-w-lg space-y-3 rounded bg-white p-4"><h2 className="font-bold">Create Follow-Up FJ</h2><p>{selectedWR.bl_id} / {selectedWR.LevelName ?? "—"} / {selectedWR.RoomCode ?? "—"} · {selectedWR.EquipmentCodes.join(", ")}</p><textarea aria-label="Follow-up description" className="w-full rounded border p-2" value={followUpDescription} onChange={(e) => setFollowUpDescription(e.target.value)} />{followUpError && <p role="alert" className="text-rose-700">{followUpError}</p>}<div className="flex gap-2"><button disabled={creatingFollowUp} className="rounded bg-green-700 p-2 text-white disabled:opacity-50" onClick={() => { setCreatingFollowUp(true); setFollowUpError(""); void createFollowUp().catch((error: unknown) => setFollowUpError(error instanceof Error ? error.message : "Could not create follow-up.")).finally(() => setCreatingFollowUp(false)); }}>Create Follow-Up FJ</button><button disabled={creatingFollowUp} className="rounded border p-2" onClick={() => setFollowUpOpen(false)}>Cancel</button></div></div></div>}

      {/* Bottom Navigation Tabs */}
      {currentView === "home" && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-center justify-around z-40 mobile-nav">
          <button
            onClick={() => setCurrentView("home")}
            className="flex-1 py-3 text-center hover:bg-gray-50 transition-colors"
            aria-label="Home tab"
            aria-current={currentView === "home" ? "page" : undefined}
          >
            <div className="text-xl">📋</div>
            <div className="text-xs font-medium text-gray-700">Work Requests</div>
          </button>
          <button
            onClick={() => setCurrentView("scanner")}
            className="flex-1 py-3 text-center hover:bg-gray-50 transition-colors"
            aria-label="Scanner tab"
          >
            <div className="text-xl">📱</div>
            <div className="text-xs font-medium text-gray-700">Scan QR</div>
          </button>
          <button
            className="flex-1 py-3 text-center hover:bg-gray-50 transition-colors opacity-50 cursor-not-allowed"
            aria-label="Reports tab (disabled)"
            title="Coming in next phase"
          >
            <div className="text-xl">📊</div>
            <div className="text-xs font-medium text-gray-700">Reports</div>
          </button>
          <button
            className="flex-1 py-3 text-center hover:bg-gray-50 transition-colors opacity-50 cursor-not-allowed"
            aria-label="Settings tab (disabled)"
            title="Coming in next phase"
          >
            <div className="text-xl">⚙️</div>
            <div className="text-xs font-medium text-gray-700">Settings</div>
          </button>
        </nav>
      )}
    </div>
  );
}
