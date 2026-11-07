"use client";

import React, { createContext, ReactNode, useState } from "react";
import { UserRole, ROLE_PERMISSIONS } from "@cafm/shared-schema";
import { SiteContextProvider, useSiteContext } from "@/lib/contexts/SiteContext";
import { CafmStoreProvider, useCafmStore } from "@/lib/cafm-store";
import type { Building, Floor, Room } from "@cafm/shared-schema";

export interface AppContextType {
  // Role management
  currentRole: UserRole;
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
  return <SiteContextProvider><CafmStoreProvider><ScopedAppProvider>{children}</ScopedAppProvider></CafmStoreProvider></SiteContextProvider>;
}

function ScopedAppProvider({ children }: { children: ReactNode }) {
  const { activePerson, activeSiteId, currentUser } = useSiteContext();
  const { data } = useCafmStore();
  const matchingUser = [currentUser, ...data.users].find((user) => user &&
    (user.DisplayName === activePerson || user.UserId === activePerson) && user.AssignedSiteIds.includes(activeSiteId));
  const roles: UserRole[] = activePerson === "SiteAdmin" ? ["SiteAdministrator"] : [
    ...(activePerson === "TeamLeader" ? ["TeamLeader" as const] : []),
    ...(matchingUser && matchingUser.SystemRole !== "SiteAdministrator" ? [matchingUser.SystemRole] : []),
    ...data.siteRoleAssignments.filter((assignment) => assignment.SiteId === activeSiteId && assignment.PersonName === activePerson)
      .map((assignment) => assignment.RoleCode),
  ];
  const currentRole = roles[0] ?? "StandardEmployee";
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<Floor | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [useSampleData] = useState(true);

  const canAccess = (permission: string) => (roles.length ? roles : [currentRole])
    .some((role) => ROLE_PERMISSIONS[role].some((item) => item === permission));

  const value: AppContextType = {
    currentRole,
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
      {children}
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
