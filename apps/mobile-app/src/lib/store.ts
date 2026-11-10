import { create } from "zustand";
import { BaseWorkRequest, Equipment } from "@cafm/shared-schema";

export type WorkTypeCode = "PM" | "FJ" | "LJ";

export interface FilterCriteria {
  bl_id?: string;
  levelName?: string;
  roomCode?: string;
  wrId?: string;
  trade?: string;
  selectedSubstatuses?: number[];
  workTypes?: WorkTypeCode[];
  scheduledDateFrom?: string;
  scheduledDateTo?: string;
  startDateFrom?: string;
  startDateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  marginDateFrom?: string;
  marginDateTo?: string;
  selectedEquipmentCodes?: Set<string>;
}

interface FilterStore {
  filters: FilterCriteria;
  setFilter: (key: keyof FilterCriteria, value: unknown) => void;
  resetFilters: () => void;
  toggleEquipmentSelection: (code: string) => void;
  clearEquipmentSelection: () => void;
  getAppliedFiltersCount: () => number;
}

export const useFilterStore = create<FilterStore>((set, get) => ({
  filters: {
    selectedEquipmentCodes: new Set(),
  },
  setFilter: (key, value) =>
    set((state) => ({
      filters: {
        ...state.filters,
        [key]: value,
      },
    })),
  resetFilters: () =>
    set({
      filters: {
        selectedEquipmentCodes: new Set(),
      },
    }),
  toggleEquipmentSelection: (code: string) =>
    set((state) => {
      const newSelection = new Set(state.filters.selectedEquipmentCodes);
      if (newSelection.has(code)) {
        newSelection.delete(code);
      } else {
        newSelection.add(code);
      }
      return {
        filters: {
          ...state.filters,
          selectedEquipmentCodes: newSelection,
        },
      };
    }),
  clearEquipmentSelection: () =>
    set((state) => ({
      filters: {
        ...state.filters,
        selectedEquipmentCodes: new Set(),
      },
    })),
  getAppliedFiltersCount: () => {
    const filters = get().filters;
    let count = 0;
    if (filters.bl_id) count++;
    if (filters.levelName) count++;
    if (filters.roomCode) count++;
    if (filters.wrId) count++;
    if (filters.trade) count++;
    if (filters.workTypes?.length && filters.workTypes.length < 3) count++;
    if (filters.scheduledDateFrom || filters.scheduledDateTo) count++;
    if (filters.startDateFrom || filters.startDateTo) count++;
    if (filters.dueDateFrom) count++;
    if (filters.dueDateTo) count++;
    if (filters.marginDateFrom) count++;
    if (filters.marginDateTo) count++;
    if (filters.selectedEquipmentCodes && filters.selectedEquipmentCodes.size > 0) count++;
    return count;
  },
}));

interface SyncStatus {
  isOnline: boolean;
  syncInProgress: boolean;
  lastSyncTime: string | null;
  pendingCount: number;
  conflictCount: number;
}

interface MobileStore {
  currentTab: "my-wrs" | "unassigned";
  setCurrentTab: (tab: "my-wrs" | "unassigned") => void;
  syncStatus: SyncStatus;
  setSyncStatus: (status: Partial<SyncStatus>) => void;
  currentTechnicianId: string | null;
  setCurrentTechnician: (id: string | null) => void;
}

export const useMobileStore = create<MobileStore>((set) => ({
  currentTab: "my-wrs",
  setCurrentTab: (tab) => set({ currentTab: tab }),
  syncStatus: {
    isOnline: navigator.onLine,
    syncInProgress: false,
    lastSyncTime: null,
    pendingCount: 0,
    conflictCount: 0,
  },
  setSyncStatus: (status) =>
    set((state) => ({
      syncStatus: {
        ...state.syncStatus,
        ...status,
      },
    })),
  currentTechnicianId: null,
  setCurrentTechnician: (id) => set({ currentTechnicianId: id }),
}));

/** The four distinct WR dates; the scheduled date is strictly the Team Leader / PMS execution slot. */
export const scheduledSlotStartOf = (wr: BaseWorkRequest) => wr.CraftpersonAssignments?.[0]?.assignedStartDateTime;
export const scheduledDateOf = (wr: BaseWorkRequest) => scheduledSlotStartOf(wr)?.slice(0, 10);
export const startDateOf = (wr: BaseWorkRequest) => (wr.StartDate_DateToPerform || wr.StartDate)?.slice(0, 10);

/**
 * Apply filter criteria to work requests
 */
export function applyFilters(wrs: BaseWorkRequest[], filters: FilterCriteria): BaseWorkRequest[] {
  let result = wrs;

  if (filters.workTypes?.length && filters.workTypes.length < 3) {
    const types = new Set<string>(filters.workTypes);
    result = result.filter((wr) => types.has(wr.WR_Type));
  }

  if (filters.selectedSubstatuses?.length) {
    const allowed = new Set(filters.selectedSubstatuses);
    result = result.filter((wr) => allowed.has(Number(wr.Percentage)));
  }

  if (filters.bl_id) {
    result = result.filter((wr) => wr.bl_id === filters.bl_id);
  }

  if (filters.levelName) {
    result = result.filter((wr) => wr.LevelName === filters.levelName);
  }

  if (filters.roomCode) {
    result = result.filter((wr) => wr.RoomCode === filters.roomCode);
  }

  if (filters.wrId) {
    result = result.filter((wr) => wr.WR_ID.includes(filters.wrId!));
  }

  if (filters.trade) {
    result = result.filter((wr) => wr.TradeName === filters.trade);
  }

  const inRange = (value: string | undefined, from?: string, to?: string) => {
    if (!from && !to) return true;
    const day = value?.slice(0, 10);
    if (!day) return false;
    return (!from || day >= from) && (!to || day <= to);
  };
  if (filters.scheduledDateFrom || filters.scheduledDateTo) {
    result = result.filter((wr) => inRange(scheduledDateOf(wr), filters.scheduledDateFrom, filters.scheduledDateTo));
  }
  if (filters.startDateFrom || filters.startDateTo) {
    result = result.filter((wr) => inRange(startDateOf(wr), filters.startDateFrom, filters.startDateTo));
  }
  if (filters.dueDateFrom || filters.dueDateTo) {
    result = result.filter((wr) => inRange(wr.DueDate, filters.dueDateFrom, filters.dueDateTo));
  }
  if (filters.marginDateFrom || filters.marginDateTo) {
    result = result.filter((wr) => inRange(wr.MarginDate, filters.marginDateFrom, filters.marginDateTo));
  }

  if (filters.selectedEquipmentCodes && filters.selectedEquipmentCodes.size > 0) {
    result = result.filter((wr) =>
      wr.EquipmentCodes?.some((code) => filters.selectedEquipmentCodes!.has(code)),
    );
  }

  return result;
}

/**
 * Filter equipment list by search query
 */
export function filterEquipmentByQuery(
  equipment: Equipment[],
  query: string,
): Equipment[] {
  if (!query.trim()) return equipment;

  const lowerQuery = query.toLowerCase();
  return equipment.filter(
    (eq) =>
      eq.EquipmentCode.toLowerCase().includes(lowerQuery) ||
      eq.LocalEquipmentCode?.toLowerCase().includes(lowerQuery) ||
      eq.EquipmentName.toLowerCase().includes(lowerQuery) ||
      eq.EquipmentUseEnglish?.toLowerCase().includes(lowerQuery),
  );
}
