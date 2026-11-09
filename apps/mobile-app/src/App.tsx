import { notify } from "./lib/toast";
import { MOBILE_APP_VERSION } from "./version";
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
  CLASSICAL_TRADES,
} from "@cafm/shared-schema";
import type { LocationFreeze, UserAccessProfile, TechnicianFieldUpdate } from "@cafm/shared-schema";
import { z } from "zod";
import { applyFilters, useFilterStore } from "./lib/store";
import { classifyEquipmentWRs } from "./lib/equipment-wrs";
import type { FilterCriteria } from "./lib/store";
import { MobileChecklist } from "./components/MobileChecklist";
import { ExecutionHub } from "./components/ExecutionHub";
import { TimerCard, TimersPage, timerClock } from "./components/RunningTimers";
import { FieldUpdateModal } from "./components/FieldUpdateModal";
import { fieldReasonLabels, urgencyLabels } from "../../web-portal/lib/field-updates";
import { stable } from "./lib/portal-sync";
import { AuditInspection } from "./components/AuditInspection";
import { PhoneShare } from "../../web-portal/components/common/PhoneShare";

type AppView = "home" | "hub" | "checklist" | "scanner" | "inspection" | "qa-spot-check" | "timers" | "audit-assurance" | "settings";
const siteContextSchema = z.object({
  craftspeople: z.array(z.object({ id: z.string(), Name: z.string(), LastName: z.string(), Trade: z.string(), HourlyRate: z.number(), SiteId: z.string() })),
  locationFreezes: z.array(LocationFreezeSchema),
  userAccessProfiles: z.array(UserAccessProfileSchema).default([]),
});
type Technician = z.infer<typeof siteContextSchema>["craftspeople"][number];
const normalizePerson = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
function findProfile(profiles: UserAccessProfile[], person: Technician | undefined, site: SiteId) {
  if (!person) return undefined;
  const candidates = profiles.filter((profile) => profile.siteId === site);
  const linked = candidates.find((profile) => profile.linkedCraftpersonId === person.id);
  if (linked) return linked;
  const fullName = normalizePerson(`${person.Name} ${person.LastName}`);
  const full = candidates.filter((profile) => !profile.linkedCraftpersonId && [profile.personName, profile.fullName].some((name) => normalizePerson(name) === fullName));
  if (full.length === 1) return full[0];
  if (full.length) return undefined;
  const firstName = normalizePerson(person.Name);
  const first = candidates.filter((profile) => !profile.linkedCraftpersonId && [profile.personName, profile.fullName].some((name) => normalizePerson(name) === firstName));
  return first.length === 1 ? first[0] : undefined;
}

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
  const [checklistStart, setChecklistStart] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [loadedSite, setLoadedSite] = useState<SiteId | null>(null);
  const [timerStorageError, setTimerStorageError] = useState("");
  const [focusTimer, setFocusTimer] = useState(false);
  const [fieldWR, setFieldWR] = useState<string | null>(null);
  const [fieldNotice, setFieldNotice] = useState("");
  const checklistNavigation = useRef<((destination: () => void) => void) | null>(null);
  const hubNavigation = useRef<(() => boolean) | null>(null);
  const savingWR = useRef(false);
  const activeSelection = useRef({ activeSiteId, currentTechnicianId });
  activeSelection.current = { activeSiteId, currentTechnicianId };

  // State
  const [engine, setEngine] = useState<OfflineEngine | null>(null);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine);
  const [apiReachable, setApiReachable] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncNotice, setSyncNotice] = useState("");
  useEffect(() => { if (!syncNotice) return; const id = window.setTimeout(() => setSyncNotice(""), 2500); return () => window.clearTimeout(id); }, [syncNotice]);
  const [toast, setToast] = useState("");
  const [installError, setInstallError] = useState(false);
  const [phoneFrame, setPhoneFrame] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [apiBase, setApiBase] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const resumedSync = useRef(false);
  const lastBackgroundError = useRef("");
  const [myWRs, setMyWRs] = useState<BaseWorkRequest[]>([]);
  const [unassignedWRs, setUnassignedWRs] = useState<BaseWorkRequest[]>([]);
  const [siteWRs, setSiteWRs] = useState<BaseWorkRequest[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [siteEquipment, setSiteEquipment] = useState<Equipment[]>([]);

  // Selected items for views
  const [selectedWR, setSelectedWR] = useState<BaseWorkRequest | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [checklistSteps, setChecklistSteps] = useState<PM_StepDefinition[]>([]);

  // Filters
  const filters = useFilterStore((state) => state.filters);
  const setFilter = useFilterStore((state) => state.setFilter);
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [resetSignal, setResetSignal] = useState(0);
  const [pctOpen, setPctOpen] = useState(false);
  const substatusInitSite = useRef<string | null>(null);
  const percentCounts = new Map<number, number>();
  for (const wr of siteWRs) { const value = Number(wr.Percentage); if (Number.isFinite(value)) percentCounts.set(value, (percentCounts.get(value) ?? 0) + 1); }
  const substatusOptions = [...percentCounts.entries()].sort(([a], [b]) => a - b).map(([value, count]) => ({ value, count }));
  const existingPercents = substatusOptions.map((option) => option.value);
  const preferredPercents = existingPercents.filter((value) => value === 50 || value === 55);
  const defaultSubstatuses = preferredPercents.length ? preferredPercents : existingPercents.filter((value) => value < 78);
  const defaultKey = defaultSubstatuses.join(",");
  useEffect(() => {
    if (loadedSite !== activeSiteId || !siteWRs.length || substatusInitSite.current === activeSiteId) return;
    substatusInitSite.current = activeSiteId;
    const defaults = defaultKey ? defaultKey.split(",").map(Number) : [];
    useFilterStore.getState().setFilter("selectedSubstatuses", defaults);
    setAppliedFilters((current) => ({ ...current, selectedSubstatuses: defaults }));
  }, [loadedSite, activeSiteId, siteWRs.length, defaultKey]);
  const handleResetFilters = () => {
    const defaults = defaultKey ? defaultKey.split(",").map(Number) : [];
    const base: FilterCriteria = { showOnlyWithChecklist: false, selectedEquipmentCodes: new Set(), selectedSubstatuses: defaults };
    useFilterStore.setState({ filters: base });
    setAppliedFilters(base);
    setPctOpen(false);
    setResetSignal((value) => value + 1);
  };
  const setPercents = (values: number[]) => {
    useFilterStore.getState().setFilter("selectedSubstatuses", values);
    setAppliedFilters((current) => ({ ...current, selectedSubstatuses: values }));
  };
  const appliedPercents = appliedFilters.selectedSubstatuses ?? [];
  const percentChip = existingPercents.length ? (
    <>
      <button type="button" aria-expanded={pctOpen} onClick={() => setPctOpen((open) => !open)} className="whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">{appliedPercents.length ? appliedPercents.map((value) => `${value}%`).join(", ") : "All %"} {"\u25be"}</button>
      {pctOpen && <>
        <button type="button" onClick={() => setPercents([])} className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${appliedPercents.length === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>All %</button>
        {substatusOptions.map((option) => <button type="button" key={option.value} onClick={() => setPercents(appliedPercents.includes(option.value) ? appliedPercents.filter((value) => value !== option.value) : [...appliedPercents, option.value].sort((a, b) => a - b))} className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${appliedPercents.includes(option.value) ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>{option.value}% ({option.count})</button>)}
      </>}
    </>
  ) : null;

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
    if (!technician && people.length) {
      const saved = localStorage.getItem(`cafm-technician:${activeSiteId}`);
      const preferred = people.find((item) => item.id === saved) ?? people.find((item) => normalizePerson(`${item.Name} ${item.LastName}`) === "gregor gojkosek") ?? people[0];
      setCurrentTechnicianId(preferred.id);
      return;
    }
    setSiteWRs(siteRequests);
    setLoadedSite(activeSiteId);
    setMyWRs(siteRequests.filter((wr) => wr.AssignedUserIds?.includes(currentTechnicianId) || wr.AssignedCraftpersonIds.includes(currentTechnicianId)));
    const access = findProfile(siteContext.userAccessProfiles, technician, activeSiteId);
    const trades = access?.vpaTrades ?? (technician ? CLASSICAL_TRADES : []);
    const buildingAllowed = (building: string) => !!technician && (!access?.vpaBuildingIds.length || access.vpaBuildingIds.includes(building));
    setBuildings(storedBuildings.filter((item) => item.SiteId === activeSiteId && buildingAllowed(item.bl_id)));
    setFloors(storedFloors.filter((item) => item.SiteId === activeSiteId && buildingAllowed(item.bl_id)));
    setRooms(storedRooms.filter((item) => item.SiteId === activeSiteId && buildingAllowed(item.bl_id)));
    setEquipment(storedEquipment.filter((item) => item.SiteId === activeSiteId && buildingAllowed(item.bl_id) && !!item.PrimaryTradeId && trades.some((trade) => trade === item.PrimaryTradeId)));
    setSiteEquipment(storedEquipment.filter((item) => item.SiteId === activeSiteId));
    setUnassignedWRs(siteRequests.filter((wr) => !wr.AssignedCraftpersonIds.length && !wr.CraftpersonAssignments?.length && !!technician && trades.some((trade) => trade === wr.TradeName || trade === wr.TradeId) && buildingAllowed(wr.bl_id)));
    setSelectedWR((current) => current ? siteRequests.find((wr) => wr.WR_ID === current.WR_ID) ?? current : null);
  }, [activeSiteId, currentTechnicianId]);

  useEffect(() => {
    setEngine(initOfflineEngine());
    try { setApiBase(localStorage.getItem("cafm_api_base_url") ?? ""); }
    catch (error) { setSettingsError(error instanceof Error ? error.message : "Could not read the API base setting."); }
  }, []);
  useEffect(() => {
    const show = (event: Event) => { if (event instanceof CustomEvent && typeof event.detail === "string") setToast(event.detail); };
    window.addEventListener("cafm-toast", show);
    return () => window.removeEventListener("cafm-toast", show);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (currentTechnicianId) localStorage.setItem(`cafm-technician:${activeSiteId}`, currentTechnicianId);
  }, [activeSiteId, currentTechnicianId]);
  useEffect(() => {
    const online = () => setBrowserOnline(navigator.onLine);
    const connection = (event: Event) => { if (event instanceof CustomEvent) setApiReachable(event.detail === true); };
    const installation = () => setInstallError(true);
    window.addEventListener("online", online); window.addEventListener("offline", online);
    window.addEventListener("cafm-sync-connection", connection); window.addEventListener("cafm-offline-install-error", installation);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", online); window.removeEventListener("cafm-sync-connection", connection); window.removeEventListener("cafm-offline-install-error", installation); };
  }, []);
  useEffect(() => {
    let active = true;
    const update = () => { void getDB().then(async (db) => {
      const [mutations, photos] = await Promise.all([db.countFromIndex("syncQueue", "by-status", "PENDING"), db.countFromIndex("photoQueue", "by-status", "PENDING")]);
      if (active) setPendingCount(mutations + photos);
    }).catch((error: unknown) => { console.error("Could not count queued changes:", error); if (active) setSyncNotice("Could not read the offline queue."); }); };
    update(); const interval = window.setInterval(update, 2000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (loadedSite !== activeSiteId) return;
    const activeTimers: Record<string, { wrId: string; craftpersonId: string; craftpersonName: string; startedAt: string }> = {};
    for (const wr of siteWRs) for (const session of wr.timeSessions ?? []) {
      if (!session.endedAt) activeTimers[JSON.stringify([activeSiteId, wr.WR_ID, session.craftpersonId, session.id])] = { wrId: wr.WR_ID, craftpersonId: session.craftpersonId, craftpersonName: session.craftpersonName, startedAt: session.startedAt };
    }
    try { localStorage.setItem(`cafm-active-timers:${activeSiteId}`, JSON.stringify(activeTimers)); setTimerStorageError(""); }
    catch { setTimerStorageError("Could not save the timer index to local storage. Timers remain in offline work request storage."); }
  }, [siteWRs, activeSiteId, loadedSite]);

  useEffect(() => {
    if (focusTimer && currentView === "hub") {
      const target = document.getElementById("work-timer");
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
      setFocusTimer(false);
    }
  }, [focusTimer, currentView, selectedWR]);

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
      void engine.syncNow().then((status) => { lastBackgroundError.current = ""; window.dispatchEvent(new Event("cafm-sync-success")); if (status.synced || resumedSync.current) { setSyncNotice(`Synchronization complete. ${status.synced} changes sent; ${status.pending} remain queued.`); resumedSync.current = false; } return refreshData(); }).catch((error: unknown) => { const message = error instanceof Error ? error.message : "Background sync failed."; if (message.includes("already in progress") || message.includes("aborted")) return; console.error("Background sync failed:", error); if (lastBackgroundError.current !== message) { lastBackgroundError.current = message; notify(message); } });
    };
    sync();
    const interval = window.setInterval(sync, 5000);
    return () => window.clearInterval(interval);
  }, [engine, activeSiteId, currentTechnicianId, isSimulatedOffline, refreshData]);

  const handleSyncNow = async () => {
    if (!engine) throw new Error("The offline engine is not ready.");
    const result = await engine.syncAfterChanges();
    await refreshData();
    setSyncNotice(result.pending ? `Synchronized ${result.synced} changes; ${result.pending} remain queued.` : `Synchronization complete. ${result.synced} changes sent.`);
    return result;
  };

  const handleToggleOfflineMode = (isOffline: boolean) => {
    engine?.configureSync(activeSiteId, currentTechnicianId, isOffline);
    resumedSync.current = !isOffline;
    setIsSimulatedOffline(isOffline);
  };

  const handleClaimWR = async (wrId: string) => {
    const claimed = unassignedWRs.find((wr) => wr.WR_ID === wrId);
    if (!claimed || !engine || !access?.permissions.canClaimUnassignedWR) throw new Error("You are not permitted to claim this work request.");
    try {
      await engine.saveWorkRequest({ ...claimed, AssignedCraftpersonIds: [...claimed.AssignedCraftpersonIds, currentTechnicianId], AssignedUserIds: [...new Set([...(claimed.AssignedUserIds ?? []), currentTechnicianId])] }, claimed);
      await refreshData();
    } catch (error) {
      console.error("Could not claim work request:", error);
      throw error;
    }
  };

  const handleOpenWR = (wrId: string) => {
    const wr = siteWRs.find((w) => w.WR_ID === wrId);
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
    const wanted = equipmentCode.trim().toLowerCase();
    const eq = [...equipment, ...siteEquipment].find((e) => e.EquipmentCode.trim().toLowerCase() === wanted);
    if (eq) {
      setSelectedEquipment(eq);
      setCurrentView("inspection");
    } else {
      notify(`Equipment ${equipmentCode} not found`);
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
  const access = findProfile(profiles, person, activeSiteId);
  const vpaTrades = access?.vpaTrades ?? (person ? [...CLASSICAL_TRADES] : []);
  const technicianName = person ? `${person.Name} ${person.LastName}` : currentTechnicianId;
  const saveSelected = async (change: (wr: BaseWorkRequest) => BaseWorkRequest, message: string) => {
    if (!engine || !selectedWR) throw new Error("Offline storage or work request is not ready.");
    if (savingWR.current) throw new Error("Another work request save is in progress. Try again.");
    savingWR.current = true;
    try {
    const current = await engine.getWorkRequest(selectedWR.WR_ID);
    if (!current || current.SiteId !== activeSiteId) throw new Error("Work request is no longer available on this site.");
    const changed = change(current), now = new Date().toISOString();
    const updated: BaseWorkRequest = { ...changed, UpdatedAt: now, Activity: [...(changed.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: currentTechnicianId, actorName: technicianName, actorRole: "MobileTechnician", createdAt: now, text: message }] };
    await engine.saveWorkRequest(updated, current);
    setSelectedWR(updated);
    setSiteWRs((items) => items.map((item) => item.WR_ID === updated.WR_ID ? updated : item));
    setMyWRs((items) => items.map((item) => item.WR_ID === updated.WR_ID ? updated : item));
    setUnassignedWRs((items) => items.map((item) => item.WR_ID === updated.WR_ID ? updated : item));
    } finally { savingWR.current = false; }
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
    try { await handleSyncNow(); notify(`Follow-up ${request.WR_ID} saved and synchronized.`); }
    catch (error) { notify(`Follow-up ${request.WR_ID} saved offline. Synchronization failed: ${error instanceof Error ? error.message : "Retry Sync Now."}`); }
  };
  const openFollowUp = () => {
    if (!selectedWR || !access?.permissions.canOpenFollowUpFJ) return;
    setFollowUpDescription(`Follow-up for ${selectedWR.WR_ID}: `);
    setFollowUpError("");
    setFollowUpOpen(true);
  };
  const finishChecklist = () => { if (!access?.permissions.canCompleteWR78) return; setOpenCompletion(true); setCurrentView("hub"); };
  const submitFieldUpdate = async (draft: Pick<TechnicianFieldUpdate, "reasonCategory" | "urgency" | "message">) => {
    if (!engine || !fieldWR || !currentTechnicianId || !person) throw new Error("Work request or technician is unavailable.");
    if (savingWR.current) throw new Error("Another save is in progress. Try again.");
    savingWR.current = true;
    try {
      const current = await engine.getWorkRequest(fieldWR);
      if (!current || current.SiteId !== activeSiteId) throw new Error("Work request is no longer available on this site.");
      const createdAt = new Date().toISOString();
      const update: TechnicianFieldUpdate = { ...draft, id: crypto.randomUUID(), wrId: current.WR_ID, craftpersonId: currentTechnicianId, craftpersonName: technicianName, createdAt, status: "Open" };
      const text = `🚩 [${urgencyLabels[draft.urgency]} - ${fieldReasonLabels[draft.reasonCategory]}] ${technicianName} to Team Leader: ${draft.message}`;
      const updated: BaseWorkRequest = { ...current, UpdatedAt: createdAt, technicianFieldUpdates: [...(current.technicianFieldUpdates ?? []), update], Activity: [...(current.Activity ?? []), { id: crypto.randomUUID(), kind: "comment", actorId: currentTechnicianId, actorName: technicianName, actorRole: "MobileTechnician", createdAt, text }] };
      await engine.saveWorkRequest(updated, current);
      setSiteWRs((items) => items.map((item) => item.WR_ID === updated.WR_ID ? updated : item));
      setMyWRs((items) => items.map((item) => item.WR_ID === updated.WR_ID ? updated : item));
      setUnassignedWRs((items) => items.map((item) => item.WR_ID === updated.WR_ID ? updated : item));
      setSelectedWR((item) => item?.WR_ID === updated.WR_ID ? updated : item);
    } finally { savingWR.current = false; }
    try { await handleSyncNow(); setFieldNotice("Update saved and synchronized to the Team Leader."); }
    catch (problem) { setFieldNotice(`Update saved offline, but not yet synchronized: ${problem instanceof Error ? problem.message : "Retry Sync Now."} Please contact your Team Leader directly.`); }
  };
  const timers = siteWRs.flatMap((wr) => (wr.timeSessions ?? []).filter((session) => session.craftpersonId === currentTechnicianId && !session.endedAt).map((session) => ({ wr, session })));
  const selectedTimer = selectedWR?.timeSessions?.find((session) => session.craftpersonId === currentTechnicianId && !session.endedAt);
  const navigateSafely = (destination: () => void) => {
    if (creatingFollowUp) { notify("Wait for the current save to finish before navigating."); return; }
    if (followUpOpen || fieldWR) { notify("Close the open editor before navigating."); return; }
    if (currentView === "checklist") {
      if (!checklistNavigation.current) { notify("Checklist is not ready to leave yet."); return; }
      checklistNavigation.current(destination);
    } else if (savingWR.current) notify("Wait for the current save to finish before navigating.");
    else if (currentView !== "hub" || hubNavigation.current?.()) destination();
  };
  const openTimerWR = (id: string) => navigateSafely(() => {
    if (!siteWRs.some((wr) => wr.WR_ID === id)) { notify("This work request is no longer available on this site."); return; }
    setOpenCompletion(false);
    handleOpenWR(id);
    setFocusTimer(true);
  });
  const checklistTimerProps = {
    timerRunning: !!selectedTimer,
    timerLabel: selectedTimer ? `Timer Running: ${timerClock(selectedTimer.startedAt, now)}` : "Timer stopped",
    navigationRef: checklistNavigation,
  };

  // Render based on current view
  const renderContent = () => {
    if (currentView === "settings") return <section className="space-y-4 p-4 pb-32"><div className="flex items-start justify-between"><h1 className="text-xl font-bold">Profile</h1><span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">{MOBILE_APP_VERSION}</span></div><div className="rounded-xl border bg-white p-3"><strong>{technicianName || "Select technician"}</strong><p>{activeSiteId} · {access?.primaryRole ?? "Technician"}</p><p className="text-sm">VPA trades: {vpaTrades.join(", ") || "None"}</p></div><button className="rounded border bg-white p-3" onClick={() => handleToggleOfflineMode(!isSimulatedOffline)}>{isSimulatedOffline ? "🟢 Resume online" : "📴 Simulate offline"}</button><div className="rounded-xl border bg-white p-3"><strong>Field reports</strong><p>{siteWRs.flatMap((wr) => wr.technicianFieldUpdates ?? []).filter((item) => item.craftpersonId === currentTechnicianId).length} submitted updates</p></div><button className="rounded border bg-white p-3" onClick={() => setShareOpen(true)}>📱 Share / Open on Phone (QR &amp; URL)</button><details className="rounded-xl border bg-white p-3"><summary>Advanced Developer Options</summary><label className="block">API base URL (blank uses same origin)<input className="block w-full border p-2" value={apiBase} onChange={(event) => setApiBase(event.target.value)} placeholder="https://example.com" /></label>{settingsError && <p role="alert" className="text-red-700">{settingsError}</p>}<button className="rounded border bg-white p-2" onClick={() => { try { const value = apiBase.trim(); if (value) { const url = new URL(value, window.location.origin); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || (window.location.protocol === "https:" && url.protocol !== "https:")) throw new Error("Enter an HTTP(S) base URL without credentials, query or fragment; HTTPS apps require HTTPS."); localStorage.setItem("cafm_api_base_url", value); } else localStorage.removeItem("cafm_api_base_url"); setSettingsError(""); setSyncNotice("API base saved. Use Sync Now to reconnect."); } catch (error) { setSettingsError(error instanceof Error ? error.message : "Could not save API base URL."); } }}>Save API base</button></details><p className="text-sm">Offline refresh requires a previously installed production build over HTTPS or localhost.</p><div className="flex items-center justify-between text-[11px] text-slate-400"><span>CAFM Mobile · {MOBILE_APP_VERSION}</span><button className="underline" onClick={() => { void (async () => { try { const regs = await navigator.serviceWorker?.getRegistrations?.() ?? []; await Promise.all(regs.map((reg) => reg.unregister())); if ("caches" in window) await Promise.all((await caches.keys()).map((key) => caches.delete(key))); } finally { window.location.reload(); } })(); }}>↻ Force App Reload</button></div></section>;
    switch (currentView) {
      case "audit-assurance":
        return <AuditInspection key={activeSiteId} site={activeSiteId} equipment={siteEquipment} rooms={rooms} requests={siteWRs} profiles={profiles} sync={handleSyncNow} />;
      case "hub":
        return selectedWR ? <ExecutionHub key={selectedWR.WR_ID} wr={selectedWR} technician={currentTechnicianId} technicianName={technicianName} person={person} people={technicians} equipment={equipment} freezes={freezes} save={saveSelected} now={now} navigationRef={hubNavigation} report={() => setFieldWR(selectedWR.WR_ID)} back={() => { setOpenCompletion(false); setCurrentView("home"); setSelectedWR(null); }} checklist={(step) => { setOpenCompletion(false); setChecklistStart(step ?? 0); setCurrentView("checklist"); }} followUp={access?.permissions.canOpenFollowUpFJ ? openFollowUp : undefined} canComplete={!!access?.permissions.canCompleteWR78} openCompletion={openCompletion} sync={async () => { await handleSyncNow(); }} /> : null;
      case "checklist":
        if (!selectedWR) return null;
        if (selectedWR.WR_Type === "PM") return <MobileChecklist {...checklistTimerProps} startStep={checklistStart} key={selectedWR.WR_ID} wr={selectedWR} steps={checklistSteps} exit={() => setCurrentView("hub")} complete={access?.permissions.canCompleteWR78 ? finishChecklist : undefined} followUp={access?.permissions.canOpenFollowUpFJ ? openFollowUp : undefined} save={async (results, baseline) => saveSelected((current) => {
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
          return <MobileChecklist {...checklistTimerProps} startStep={checklistStart} key={selectedWR.WR_ID} wr={todoWR} steps={todoSteps} exit={() => setCurrentView("hub")} complete={access?.permissions.canCompleteWR78 ? finishChecklist : undefined} followUp={access?.permissions.canOpenFollowUpFJ ? openFollowUp : undefined} todoMode save={async (results, baseline) => saveSelected((current) => {
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
      case "timers":
        return <TimersPage timers={timers} requests={siteWRs} technician={currentTechnicianId} equipment={siteEquipment} now={now} open={openTimerWR} />;
      case "scanner":
        return (
          <QRScanner
            equipment={equipment}
            onScanComplete={handleScanEquipment}
            onCancel={() => setCurrentView("home")}
          />
        );

      case "inspection":
        return selectedEquipment ? (
          <EquipmentInspectionView
            equipment={selectedEquipment}
            activeWRs={classifyEquipmentWRs(selectedEquipment, siteWRs).activeWRs}
            historicalWRs={classifyEquipmentWRs(selectedEquipment, siteWRs).historicalWRs}
            onOpenWR={(wrId) => handleOpenWR(wrId)}
            onStartPM={(() => {
              const pm = classifyEquipmentWRs(selectedEquipment, siteWRs).activeWRs.find((wr) => wr.WR_Type === "PM");
              return pm ? () => handleOpenWR(pm.WR_ID) : undefined;
            })()}
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
        return selectedEquipment ? <div className="space-y-3 p-4"><h2 className="text-xl font-bold">QA spot-check · {selectedEquipment.EquipmentCode}</h2><button onClick={() => setCurrentView("inspection")}>Back to equipment</button>{siteWRs.filter((wr) => (wr.WR_Type === "PM" || wr.WR_Type === "FJ") && !!access?.permissions.canAuditChooseWRs && access.permissions.auditWRTypes.includes(wr.WR_Type) && access.permissions.auditTrades.some((trade) => trade === wr.TradeName || trade === wr.TradeId) && (!access.vpaBuildingIds.length || access.vpaBuildingIds.includes(wr.bl_id)) && wr.EquipmentCodes.includes(selectedEquipment.EquipmentCode) && (wr.Percentage === 78 || wr.Percentage === 100)).map((wr) => <div key={wr.WR_ID} className="rounded border bg-white p-3"><strong>{wr.WR_ID} · {wr.WR_Type}</strong><p>{wr.Description}</p><p>QA: {wr.QA_AuditStatus ?? "None"}</p><button disabled={!!wr.QA_AuditStatus && wr.QA_AuditStatus !== "None"} onClick={() => {
          if (!engine) { notify("Offline engine is not ready."); return; }
          const now = new Date().toISOString();
          const next: BaseWorkRequest = { ...wr, QA_CompletionDate: (wr.UpdatedAt ?? wr.CreatedDate).slice(0, 10), QA_AuditStatus: "SelectedForAudit", QA_SelectionMode: "QRScanOnSite", UpdatedAt: now, Activity: [...(wr.Activity ?? []), { id: crypto.randomUUID(), kind: "log", actorId: currentTechnicianId, actorName: currentTechnicianId, actorRole: "MobileTechnician", createdAt: now, text: "Selected for QA audit by equipment QR spot-check." }] };
          void engine.saveWorkRequest(next, wr).then(refreshData).then(() => notify("Selected for audit. Sync to the web portal when online.")).catch((error: unknown) => notify(error instanceof Error ? error.message : "Could not select audit."));
        }}>Inspect This WR (QR Spot-Check)</button></div>)}</div> : null;

      case "home":
      default:
        return (
          <div className="pb-20">
            <TechnicianHome
              filterControl={<AdvancedFilterPanel
              trades={vpaTrades}
              buildings={buildings}
              floors={floors}
              rooms={rooms}
              equipment={equipment}
              currentFilters={filters}
              resultCount={applyFilters(myWRs, filters).length + applyFilters(unassignedWRs, filters).length}
              onFiltersChange={(newFilters) => {
                if (newFilters.trade !== filters.trade) setAppliedFilters((current) => ({ ...current, trade: newFilters.trade }));
                Object.entries(newFilters).forEach(([key, value]) => {
                  setFilter(key as keyof FilterCriteria, value);
                });
              }}
              onApplyFilters={handleApplyFilters}
              onResetFilters={handleResetFilters}
              substatusOptions={substatusOptions}
              defaultSubstatuses={defaultSubstatuses}
            />}
              substatusChip={percentChip}
              resetSignal={resetSignal}
              myWRs={applyFilters(myWRs, appliedFilters)}
              unassignedWRs={applyFilters(unassignedWRs, appliedFilters)}
              onClaimWR={access?.permissions.canClaimUnassignedWR ? handleClaimWR : undefined}
              onOpenWR={handleOpenWR}
              onReport={setFieldWR}
              technician={currentTechnicianId}
              now={now}
            />
          </div>
        );
    }
  };

  return (
    <>
    <button className="desktop-frame-toggle" onClick={() => setPhoneFrame((value) => !value)}>{phoneFrame ? "🖥️ Full Width" : "📱 Phone Frame (390×844)"}</button>
    <div className={`fixed inset-0 bg-gray-50 mobile-app ${phoneFrame ? "phone-frame" : ""}`}>
      {/* Header */}
      <MobileHeader
        activeSiteId={activeSiteId}
        technicianId={currentTechnicianId}
        technicians={technicians}
        profiles={profiles}
        vpaTrades={vpaTrades}
        onTechnicianChange={(id) => { if ((currentView !== "home" && currentView !== "settings") || fieldWR) { notify("Close the editor before switching technicians."); return; } setMyWRs([]); setUnassignedWRs([]); setCurrentTechnicianId(id); }}
        onSiteChange={(site) => {
          if ((currentView !== "home" && currentView !== "settings") || fieldWR) {
            notify("Close the editor before switching sites.");
            return;
          }
          setLoadedSite(null); setMyWRs([]); setUnassignedWRs([]); setSiteWRs([]); setSiteEquipment([]); setTechnicians([]); setProfiles([]); setFreezes([]); setCurrentTechnicianId(""); setActiveSiteId(site);
        }}
        onSyncNow={handleSyncNow}
        isSimulatedOffline={isSimulatedOffline}
        isOffline={isSimulatedOffline || !browserOnline || !apiReachable}
        pendingCount={pendingCount}
      />
      {toast && <div role="status" className="absolute left-3 right-3 top-16 z-[100] rounded-xl bg-slate-800 p-3 text-sm text-white shadow-lg">{toast}<button className="float-right" onClick={() => setToast("")} aria-label="Dismiss">✕</button></div>}
      {(isSimulatedOffline || !browserOnline || !apiReachable) && <p role="status" className="bg-amber-100 px-3 py-2 text-sm text-amber-950">📴 OFFLINE MODE — Timer sessions, checklist answers, photos &amp; Sophia inspections are saved on device ({pendingCount} changes queued).</p>}
      {installError && <p role="alert" className="bg-amber-100 p-2 text-sm">Offline app installation failed. Keep this page open and reconnect before refreshing.</p>}
      {syncNotice && <p role="status" className="bg-emerald-100 px-3 py-1.5 text-xs text-emerald-900">{syncNotice}</p>}

      {timerStorageError && <p role="alert" className="bg-rose-100 px-3 py-1 text-xs text-rose-800">{timerStorageError}</p>}
      {timerStorageError && <p role="alert" className="bg-rose-100 text-xs text-rose-800">{timerStorageError}</p>}
      {/* Main Content */}
      <main className="h-screen overflow-y-auto flex flex-col">{fieldNotice && <p role="status" className="bg-amber-50 p-2 text-sm">{fieldNotice}<button className="ml-2 underline" onClick={() => setFieldNotice("")}>Dismiss</button></p>}{renderContent()}</main>
      {fieldWR && <FieldUpdateModal key={fieldWR} wrId={fieldWR} submit={submitFieldUpdate} close={() => setFieldWR(null)} />}
      {followUpOpen && selectedWR && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"><div role="dialog" aria-modal="true" aria-label="Create Follow-Up FJ" className="w-full max-w-lg space-y-3 rounded bg-white p-4"><h2 className="font-bold">Create Follow-Up FJ</h2><p>{selectedWR.bl_id} / {selectedWR.LevelName ?? "—"} / {selectedWR.RoomCode ?? "—"} · {selectedWR.EquipmentCodes.join(", ")}</p><textarea aria-label="Follow-up description" className="w-full rounded border p-2" value={followUpDescription} onChange={(e) => setFollowUpDescription(e.target.value)} />{followUpError && <p role="alert" className="text-rose-700">{followUpError}</p>}<div className="flex gap-2"><button disabled={creatingFollowUp} className="rounded bg-green-700 p-2 text-white disabled:opacity-50" onClick={() => { setCreatingFollowUp(true); setFollowUpError(""); void createFollowUp().catch((error: unknown) => setFollowUpError(error instanceof Error ? error.message : "Could not create follow-up.")).finally(() => setCreatingFollowUp(false)); }}>Create Follow-Up FJ</button><button disabled={creatingFollowUp} className="rounded border p-2" onClick={() => setFollowUpOpen(false)}>Cancel</button></div></div></div>}

      {/* Bottom Navigation Tabs */}
        <nav className="mobile-nav fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          {([
            ["home", "WRs", "M9 5h6M9 3h6v4H9z M6 5H4v16h16V5h-2 M8 11h8 M8 15h8"],
            ["scanner", "Scan QR", "M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5 M8 8h3v3H8z M14 8h2v2h-2z M8 14h2v2H8z M14 14h3v3h-3z"],
            ["audit-assurance", "Audit", "M12 3 4 6v5c0 5 3 8 8 10 5-2 8-5 8-10V6z M8 12l3 3 5-6"],
            ["timers", "Timers", "M9 2h6 M12 7V4 M12 12v4l3 2 M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0z"],
            ["settings", "Profile", "M4 7h16 M4 17h16 M8 4v6 M16 14v6"],
          ] as const).map(([view, label, icon]) => <button key={view} onClick={() => navigateSafely(() => setCurrentView(view))} className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-xs ${currentView === view ? "text-blue-700" : "text-slate-600"}`} aria-current={currentView === view ? "page" : undefined}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>{view === "timers" && timers.length > 0 && <span className="absolute right-4 top-0 rounded-full bg-emerald-600 px-1 text-white">{timers.length}</span>}{label}</button>)}
        </nav>
      {shareOpen && <PhoneShare initialUrl={`${window.location.origin}${window.location.pathname}`} onClose={() => setShareOpen(false)} />}
    </div>
    </>
  );
}
