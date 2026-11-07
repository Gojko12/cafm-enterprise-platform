"use client";

import React, { createContext, ReactNode, useState, useCallback, useEffect } from "react";
import { SiteId, LJRole, UserAccess } from "@cafm/shared-schema";

export interface SiteContextType {
  // Active site
  activeSiteId: SiteId;
  setActiveSiteId: (siteId: SiteId) => void;

  // Available sites for current user
  availableSites: SiteId[];
  setAvailableSites: (sites: SiteId[]) => void;

  // Current user access info
  currentUser: UserAccess | null;
  setCurrentUser: (user: UserAccess | null) => void;

  // Long Job Role
  activeLJRole: LJRole | null;
  setActiveLJRole: (role: LJRole | null) => void;

  // Helpers
  canSwitchSites: () => boolean;
  isMultiSiteUser: () => boolean;
}

export const SiteContext = createContext<SiteContextType | undefined>(undefined);

export function SiteContextProvider({ children }: { children: ReactNode }) {
  const [activeSiteId, setActiveSiteId] = useState<SiteId>("SITE-01");
  const [availableSites, setAvailableSites] = useState<SiteId[]>(["SITE-01"]);
  const [currentUser, setCurrentUser] = useState<UserAccess | null>(null);
  const [activeLJRole, setActiveLJRole] = useState<LJRole | null>(null);

  const canSwitchSites = useCallback(() => {
    if (!currentUser) return false;
    return currentUser.SystemRole === "SiteAdministrator" || currentUser.CanAccessAll;
  }, [currentUser]);

  const isMultiSiteUser = useCallback(() => {
    return availableSites.length > 1;
  }, [availableSites]);

  // Initialize from localStorage
  useEffect(() => {
    try {
      const savedSiteId = localStorage.getItem("activeSiteId") as SiteId | null;
      if (savedSiteId && availableSites.includes(savedSiteId)) {
        setActiveSiteId(savedSiteId);
      }
    } catch (e) {
      // localStorage not available
    }
  }, [availableSites]);

  // Save to localStorage when activeS changes
  useEffect(() => {
    try {
      localStorage.setItem("activeSiteId", activeSiteId);
    } catch (e) {
      // localStorage not available
    }
  }, [activeSiteId]);

  const value: SiteContextType = {
    activeSiteId,
    setActiveSiteId,
    availableSites,
    setAvailableSites,
    currentUser,
    setCurrentUser,
    activeLJRole,
    setActiveLJRole,
    canSwitchSites,
    isMultiSiteUser,
  };

  return (
    <SiteContext.Provider value={value}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSiteContext() {
  const context = React.useContext(SiteContext);
  if (context === undefined) {
    throw new Error("useSiteContext must be used within a SiteContextProvider");
  }
  return context;
}
