import { create } from "zustand";
import { BaseWorkRequest, Equipment } from "@cafm/shared-schema";

export interface FilterCriteria {
  bl_id?: string;
  levelName?: string;
  roomCode?: string;
  wrId?: string;
  trade?: string;
  showOnlyWithChecklist?: boolean;
  assignedDateFrom?: string;
  assignedDateTo?: string;
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
    if (filters.showOnlyWithChecklist) count++;
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

/**
 * Apply filter criteria to work requests
 */
export function applyFilters(wrs: BaseWorkRequest[], filters: FilterCriteria): BaseWorkRequest[] {
  let result = wrs;

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
  const assignedOf = (wr: BaseWorkRequest) => wr.CraftpersonAssignments?.[0]?.assignedStartDateTime || wr.StartDate || wr.CreatedDate;
  if (filters.assignedDateFrom || filters.assignedDateTo) {
    result = result.filter((wr) => inRange(assignedOf(wr), filters.assignedDateFrom, filters.assignedDateTo));
  }
  if (filters.startDateFrom || filters.startDateTo) {
    result = result.filter((wr) => inRange(wr.CraftpersonAssignments?.[0]?.assignedStartDateTime || wr.StartDate_DateToPerform || wr.StartDate, filters.startDateFrom, filters.startDateTo));
  }
  if (filters.dueDateFrom) {
    result = result.filter((wr) => !wr.DueDate || wr.DueDate >= filters.dueDateFrom!);
  }

  if (filters.dueDateTo) {
    result = result.filter((wr) => !wr.DueDate || wr.DueDate <= filters.dueDateTo!);
  }

  if (filters.marginDateFrom) {
    result = result.filter((wr) => !wr.MarginDate || wr.MarginDate >= filters.marginDateFrom!);
  }

  if (filters.marginDateTo) {
    result = result.filter((wr) => !wr.MarginDate || wr.MarginDate <= filters.marginDateTo!);
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
