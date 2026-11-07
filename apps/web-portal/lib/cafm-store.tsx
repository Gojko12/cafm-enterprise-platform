"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { CLASSICAL_TRADES } from "@cafm/shared-schema";
import type { BaseWorkRequest, Building, Equipment, Floor, PM_ChecklistStandard, PM_Schedule, Room, SiteId, SiteRoleAssignment, SiteRoleAssignmentTrade, LJRole, UserAccess } from "@cafm/shared-schema";
import {
  ESOC_BUILDINGS, ESOC_EQUIPMENT, ESOC_FLOORS, ESOC_ROOMS,
  ESTEC_BUILDINGS, ESTEC_EQUIPMENT, ESTEC_FLOORS, ESTEC_ROOMS,
  ESRIN_BUILDINGS, ESRIN_EQUIPMENT, ESRIN_FLOORS, ESRIN_ROOMS,
  SAMPLE_WORK_REQUESTS,
} from "@/lib/seed-data";

export const ASSIGNMENT_ROLES = ["ESA_TM", "ESA_CCM", "TRADE_TM", "TRADE_CM", "ESA_TO", "ESA_LJM", "ESA_DO", "ESA_IM"] as const;
export type AssignmentRole = typeof ASSIGNMENT_ROLES[number];
export const TRADE_ASSIGNMENT_ROLES = ["ESA_TM", "ESA_CCM", "TRADE_TM", "TRADE_CM"] as const;
export const SITE_ASSIGNMENT_ROLES = ["ESA_TO", "ESA_LJM", "ESA_DO", "ESA_IM"] as const;
export const ROLE_LABELS: Record<AssignmentRole, string> = {
  ESA_TM: "ESA Trade Manager", ESA_CCM: "ESA Cost Centre Manager", TRADE_TM: "Trade Manager",
  TRADE_CM: "Trade Contract Manager", ESA_TO: "ESA Technical Officer", ESA_LJM: "ESA Long Job Manager",
  ESA_DO: "Draftsman", ESA_IM: "CIFM Inventory Admin",
};
export interface TradeRoleMapping {
  SiteId: SiteId;
  Trade: string;
  assignments: Partial<Record<AssignmentRole, string>>;
}
export interface SiteRoleMapping {
  SiteId: SiteId;
  assignments: Partial<Record<AssignmentRole, string>>;
}

interface DemoData {
  sites: SiteId[];
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  desks: ExtractedDesk[];
  equipment: Equipment[];
  blueprints: PM_ChecklistStandard[];
  schedules: PM_Schedule[];
  workRequests: BaseWorkRequest[];
  users: UserAccess[];
  craftspeople: { id: string; Name: string; LastName: string; Trade: string; HourlyRate: number; ShiftHours: number; SiteId: SiteId; SkillLevel: number }[];
  tradeRoleMappings: TradeRoleMapping[];
  siteRoleMappings: SiteRoleMapping[];
  siteRoleAssignments: SiteRoleAssignment[];
}

export interface ExtractedDesk {
  id: string;
  SiteId: SiteId;
  bl_id: string;
  LevelName: string;
  RoomCode: string;
  centerX: number;
  centerY: number;
  widthM?: number | null;
  heightM?: number | null;
  name?: string | null;
  deskType: string;
  isPermanent: boolean;
}

const STORAGE_KEY = "cafm-demo-data-v1";

function seedData(): DemoData {
  const sites: SiteId[] = ["SITE-01", "SITE-02", "SITE-03"];
  const trades: SiteRoleAssignmentTrade[] = [...CLASSICAL_TRADES, "All"];
  const stageRoles: LJRole[] = ["ESA_TM", "TRADE_TM", "ESA_CCM", "TRADE_CM", "ESA_TO", "ESA_LJM", "ESA_DO", "ESA_IM", "ESA_LONG_JOB", "TRADE_LONG_JOB"];
  const peopleByRole: Record<LJRole, { main: string; deputy: string }> = {
    ESA_TM: { main: "Yvonne", deputy: "Bastian" },
    TRADE_TM: { main: "Claudia", deputy: "Bastian" },
    ESA_CCM: { main: "Gregor", deputy: "Lidija" },
    TRADE_CM: { main: "Stefan", deputy: "Gregor" },
    ESA_TO: { main: "Thomas", deputy: "Lidija" },
    ESA_LJM: { main: "Gregor", deputy: "Stefan" },
    ESA_DO: { main: "Draftsman", deputy: "Stefan" },
    ESA_IM: { main: "Inventory Admin", deputy: "Lidija" },
    ESA_LONG_JOB: { main: "Thomas", deputy: "Yvonne" },
    TRADE_LONG_JOB: { main: "Claudia", deputy: "Bastian" },
  };
  const siteRoleAssignments: SiteRoleAssignment[] = [];
  for (const site of sites) {
    for (const role of stageRoles) {
      const roleTrades: SiteRoleAssignmentTrade[] = ["ESA_TO", "ESA_LJM", "ESA_DO", "ESA_IM"].includes(role)
        ? ["All"]
        : trades.filter((trade) => trade !== "All");
      for (const trade of roleTrades) {
        for (const level of ["Main", "Deputy"] as const) {
          const names = peopleByRole[role];
          siteRoleAssignments.push({
            AssignmentId: `${site}-${role}-${trade}-${level}`,
            SiteId: site,
            PersonName: names[level === "Main" ? "main" : "deputy"],
            RoleCode: role,
            Trade: trade,
            AssignmentLevel: level,
            ReceiveNotifications: level === "Main",
          });
        }
      }
    }
  }
  const setSeed = (person: string, role: LJRole, trade: SiteRoleAssignmentTrade, level: "Main" | "Deputy", notify: boolean) => {
    const assignment = siteRoleAssignments.find((item) =>
      item.SiteId === "SITE-01" && item.RoleCode === role && item.Trade === trade && item.AssignmentLevel === level);
    if (assignment) {
      assignment.PersonName = person;
      assignment.ReceiveNotifications = notify;
    }
  };
  setSeed("Mark", "ESA_TM", "Mechanical", "Main", true);
  setSeed("Mark", "ESA_TM", "Electrical", "Deputy", false);
  setSeed("Yvonne", "ESA_TM", "Electrical", "Main", true);
  setSeed("Claudia", "TRADE_TM", "Mechanical", "Main", true);
  setSeed("Bastian", "TRADE_TM", "Mechanical", "Deputy", false);
  const users: UserAccess[] = sites.flatMap((site) => ASSIGNMENT_ROLES.map((role) => ({
    UserId: `${site}-${role}`, DisplayName: `${ROLE_LABELS[role]} (${site})`,
    SystemRole: role, AssignedSiteIds: [site], LJRoles: [role], Trades: [...CLASSICAL_TRADES], CanAccessAll: false,
  })));
  return {
    sites,
    buildings: [...ESOC_BUILDINGS, ...ESTEC_BUILDINGS, ...ESRIN_BUILDINGS],
    floors: [...ESOC_FLOORS, ...ESTEC_FLOORS, ...ESRIN_FLOORS],
    rooms: [...ESOC_ROOMS, ...ESTEC_ROOMS, ...ESRIN_ROOMS],
    desks: [],
    equipment: [...ESOC_EQUIPMENT, ...ESTEC_EQUIPMENT, ...ESRIN_EQUIPMENT],
    blueprints: [],
    schedules: [],
    workRequests: [...SAMPLE_WORK_REQUESTS],
    users,
    craftspeople: [],
    tradeRoleMappings: sites.flatMap((site) => CLASSICAL_TRADES.map((trade) => ({
      SiteId: site, Trade: trade,
      assignments: Object.fromEntries(TRADE_ASSIGNMENT_ROLES.map((role) => [role, `${site}-${role}`])),
    }))),
    siteRoleMappings: sites.map((site) => ({
      SiteId: site, assignments: Object.fromEntries(SITE_ASSIGNMENT_ROLES.map((role) => [role, `${site}-${role}`])),
    })),
    siteRoleAssignments,
  };
}

interface Store {
  data: DemoData;
  setData: React.Dispatch<React.SetStateAction<DemoData>>;
  reset: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function CafmStoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DemoData>(seedData);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        const defaults = seedData();
        if (!parsed || typeof parsed !== "object" ||
            !["buildings", "floors", "rooms", "equipment", "blueprints", "schedules", "workRequests"].every((key) => Array.isArray((parsed as Record<string, unknown>)[key])) ||
            (("users" in parsed) && !Array.isArray((parsed as Record<string, unknown>).users)) ||
            (("tradeRoleMappings" in parsed) && !Array.isArray((parsed as Record<string, unknown>).tradeRoleMappings)) ||
            (("siteRoleMappings" in parsed) && !Array.isArray((parsed as Record<string, unknown>).siteRoleMappings)) ||
            (("siteRoleAssignments" in parsed) && !Array.isArray((parsed as Record<string, unknown>).siteRoleAssignments)) ||
            (("sites" in parsed) && !Array.isArray((parsed as Record<string, unknown>).sites)) ||
            (("desks" in parsed) && !Array.isArray((parsed as Record<string, unknown>).desks)) ||
            (("craftspeople" in parsed) && !Array.isArray((parsed as Record<string, unknown>).craftspeople))) {
          throw new Error("Stored demo data has an invalid format.");
        }
        const savedData = parsed as Partial<DemoData>;
        const siteRoleMappings = savedData.siteRoleMappings ?? defaults.siteRoleMappings.map((site) => {
          const legacy = savedData.tradeRoleMappings?.find((mapping) => mapping.SiteId === site.SiteId);
          return legacy ? { ...site, assignments: { ...site.assignments,
            ...Object.fromEntries(SITE_ASSIGNMENT_ROLES.filter((role) => legacy.assignments[role] !== undefined)
              .map((role) => [role, legacy.assignments[role]])) } } : site;
        });
        const tradeRoleMappings = savedData.tradeRoleMappings?.map((mapping) => ({
          ...mapping, assignments: Object.fromEntries(TRADE_ASSIGNMENT_ROLES
            .filter((role) => mapping.assignments[role] !== undefined)
            .map((role) => [role, mapping.assignments[role]])),
        })) ?? defaults.tradeRoleMappings;
        setData({ ...defaults, ...savedData, tradeRoleMappings, siteRoleMappings,
          siteRoleAssignments: savedData.siteRoleAssignments ?? defaults.siteRoleAssignments,
          craftspeople: savedData.craftspeople ?? defaults.craftspeople });
      }
    } catch (error) {
      console.error("Could not load demo data", error);
      window.alert("Could not load saved demo data. The saved data was not overwritten; reset demo data to recover.");
      return;
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error("Could not save demo data", error);
      window.alert("Could not save demo data to local storage.");
    }
  }, [data, ready]);

  const reset = () => {
    if (!window.confirm("Reset all saved demo data? This cannot be undone.")) return;
    setData(seedData());
    setReady(true);
  };

  return <StoreContext.Provider value={{ data, setData, reset }}>{children}</StoreContext.Provider>;
}

export function useCafmStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useCafmStore must be used within CafmStoreProvider");
  return store;
}
