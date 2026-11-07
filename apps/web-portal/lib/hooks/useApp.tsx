"use client";

import React, { createContext, ReactNode, useState, useCallback } from "react";
import { UserRole, ROLE_PERMISSIONS } from "@cafm/shared-schema";
import { SiteContextProvider } from "@/lib/contexts/SiteContext";
import { CafmStoreProvider } from "@/lib/cafm-store";
import type { Building, Floor, Room } from "@cafm/shared-schema";

export interface AppContextType {
  // Role management
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  canAccess: (permission: string) => boolean;

  // Location hierarchy
  selectedBuilding: Building | null;
  selectedFloor: Floor | null;
  selectedRoom: Room | null;
  setSelectedBuilding: (building: Building | null) => void;
  setSelectedFloor: (floor: Floor | null) => void;
  setSelectedRoom: (room: Room | null) => void;

  // Sample data flag
  useSampleData: boolean;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentRole, setCurrentRole] = useState<UserRole>("SiteAdministrator");
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<Floor | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [useSampleData] = useState(true);

  const canAccess = useCallback(
    (permission: string) => {
      return ROLE_PERMISSIONS[currentRole].includes(permission as any);
    },
    [currentRole],
  );

  const value: AppContextType = {
    currentRole,
    setCurrentRole,
    canAccess,
    selectedBuilding,
    selectedFloor,
    selectedRoom,
    setSelectedBuilding,
    setSelectedFloor,
    setSelectedRoom,
    useSampleData,
  };

  return (
    <AppContext.Provider value={value}>
      <SiteContextProvider>
        <CafmStoreProvider>{children}</CafmStoreProvider>
      </SiteContextProvider>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = React.useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
