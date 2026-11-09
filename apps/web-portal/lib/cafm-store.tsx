"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { CLASSICAL_TRADES, EquipmentStatusSchema, LocationFreezeSchema, normalizeEquipmentStatus } from "@cafm/shared-schema";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import type { SiteId, SiteRoleAssignment, SiteRoleAssignmentTrade, LJRole, UserAccess } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { section20Seed } from "./section20-seed";
import { resolveAbsencePerson } from "./absence-identity";
import { DEFAULT_QA_FAILURE_REASONS } from "./qa-settings";
import { seedAccessProfiles, defaultRoleDefinitions, migrateRoles, resolveEffectivePermissions } from "./access-profiles";
export { getEffectiveCraftpersonShift } from "./craftperson-shifts";
export type { DemoData, ExtractedDesk, TradeRoleMapping, SiteRoleMapping } from "./cafm-data";

export const ASSIGNMENT_ROLES = ["ESA_TM", "ESA_CCM", "TRADE_TM", "TRADE_CM", "ESA_TO", "ESA_LJM", "ESA_DO", "ESA_IM"] as const;
export type AssignmentRole = typeof ASSIGNMENT_ROLES[number];
export const TRADE_ASSIGNMENT_ROLES = ["ESA_TM", "ESA_CCM", "TRADE_TM", "TRADE_CM"] as const;
export const SITE_ASSIGNMENT_ROLES = ["ESA_TO", "ESA_LJM", "ESA_DO", "ESA_IM"] as const;
export const ROLE_LABELS: Record<AssignmentRole, string> = {
  ESA_TM: "ESA Trade Manager", ESA_CCM: "ESA Cost Centre Manager", TRADE_TM: "Trade Manager",
  TRADE_CM: "Trade Contract Manager", ESA_TO: "ESA Technical Officer", ESA_LJM: "ESA Long Job Manager",
  ESA_DO: "Draftsman", ESA_IM: "CIFM Inventory Admin",
};
const STORAGE_KEY = "cafm-demo-data-v15";
const LEGACY_STORAGE_KEYS = ["cafm-demo-data-v14", "cafm-demo-data-v13", "cafm-demo-data-v12", "cafm-demo-data-v11", "cafm-demo-data-v10", "cafm-demo-data-v9", "cafm-demo-data-v8", "cafm-demo-data-v7", "cafm-demo-data-v6", "cafm-demo-data-v5", "cafm-demo-data-v4", "cafm-demo-data-v3", "cafm-demo-data-v2", "cafm-demo-data-v1"];
const PENDING_KEY = "cafm-demo-pending-v1";
const BASE_KEY = "cafm-demo-base-v1";
function safeStorageSet(key: string, value: string): boolean {
  const storage = window.localStorage;
  for (let index = storage.length - 1; index >= 0; index--) {
    const candidate = storage.key(index);
    if (candidate?.startsWith("cafm-demo-base-") && !candidate.startsWith(`${BASE_KEY}:`)) {
      const suffix = candidate.includes(":") ? candidate.slice(candidate.indexOf(":")) : "";
      if (!storage.getItem(`${PENDING_KEY}${suffix}`)) storage.removeItem(candidate);
    }
  }
  try { storage.setItem(key, value); return true; }
  catch (error) {
    if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      console.warn("Browser storage quota exceeded; the disk sync remains active.", key);
      return false;
    }
    throw error;
  }
}
export async function stateRequest(site: SiteId, person: string, method: "GET" | "POST", body?: unknown) {
  const token = process.env.NEXT_PUBLIC_CAFM_SYNC_TOKEN ||
    (process.env.NODE_ENV === "development" && window.location.hostname === "localhost" ? "cafm-local-development-sync-token-2026" : undefined);
  if (!token || token.length < 32) throw new Error("Local demo sync token is not configured.");
  const response = await fetch("/api/cafm-state", {
    method,
    headers: { Authorization: `Bearer ${token}`, "X-CAFM-Site-Id": site, "X-CAFM-Person": person, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result ? String(result.error) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  if (!result || typeof result !== "object" || !("revision" in result) || typeof result.revision !== "number" || !("state" in result)) {
    throw new Error("Invalid state response.");
  }
  return { revision: result.revision, state: result.state };
}

function scopeData(data: DemoData, site: SiteId): DemoData {
  return {
    ...data,
    sites: [site],
    buildings: data.buildings.filter((item) => item.SiteId === site),
    floors: data.floors.filter((item) => item.SiteId === site),
    rooms: data.rooms.filter((item) => item.SiteId === site),
    desks: data.desks.filter((item) => item.SiteId === site),
    equipment: data.equipment.filter((item) => item.SiteId === site).map((item) => ({ ...item, Status: EquipmentStatusSchema.default("In Service").parse(normalizeEquipmentStatus(item.Status)) })),
    blueprints: data.blueprints.filter((item) => !item.SiteId || item.SiteId === site),
    schedules: data.schedules.filter((item) => item.SiteId === site),
    workRequests: data.workRequests.filter((item) => item.SiteId === site),
    deletedWorkRequests: (data.deletedWorkRequests ?? []).filter((item) => item.SiteId === site),
    users: data.users.filter((item) => item.AssignedSiteIds.includes(site))
      .map((item) => ({ ...item, AssignedSiteIds: [site] })),
    craftspeople: data.craftspeople.filter((item) => item.SiteId === site),
    userAccessProfiles: data.userAccessProfiles.filter((item) => item.siteId === site),
    craftpersonAbsences: (data.craftpersonAbsences ?? []).filter((item) => item.siteId === site).map((item) => {
      const person = resolveAbsencePerson(item, data.craftspeople);
      return person ? { ...item, craftpersonId: person.id } : item;
    }),
    locationFreezes: (data.locationFreezes ?? []).map((item) => LocationFreezeSchema.parse(item)).filter((item) => item.siteId === site),
    tradeRoleMappings: data.tradeRoleMappings.filter((item) => item.SiteId === site),
    siteRoleMappings: data.siteRoleMappings.filter((item) => item.SiteId === site),
    siteRoleAssignments: data.siteRoleAssignments.filter((item) => item.SiteId === site),
    qaInspectorAssignments: (data.qaInspectorAssignments ?? []).filter((item) => item.siteId === site),
    qaAuditReports: (data.qaAuditReports ?? []).filter((item) => item.siteId === site),
  };
}

function withAccessProfileDefaults(data: DemoData, site: SiteId): DemoData {
  const { roles, profiles } = migrateRoles(data.userAccessProfiles ?? seedAccessProfiles([site], data.craftspeople, data.users), data.roleDefinitions);
  return {
    ...data,
    roleDefinitions: roles,
    userAccessProfiles: profiles,
  };
}

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
  const seeded = section20Seed(sites);
  return {
    sites,
    mobileMutationIds: [],
    deletedWorkRequests: [],
    desks: [],
    locationFreezes: sites.flatMap((site) => [1, 2].map((number) => ({
      id: `${site}-freeze-${number}`, siteId: site, buildingId: `S${site.slice(-2)}-BL-${number}`,
      ...(number === 2 ? { floorId: "Level 0", roomId: `S${site.slice(-2)}-B2-L0-R1` } : {}),
      title: number === 1 ? "Mission Operations Freeze" : "Technical Plant Shutdown",
      description: number === 1 ? "Operational activities are restricted during mission preparations." : "Isolated plant equipment is undergoing safety certification.",
      responsiblePerson: number === 1 ? "Thomas" : "Yvonne",
      startDateTime: "2026-11-06T08:00", endDateTime: "2026-11-12T18:00",
      allowPM: number === 2, allowFJ: false, allowLJ: false,
    }))),
    craftpersonAbsences: sites.flatMap((site) => [
      { id: `${site}-leave-1`, siteId: site, craftpersonId: `S${site.slice(-2)}-C1`, absenceType: "Vacation" as const, startDate: "2026-11-09", endDate: "2026-11-10", isFullDay: true, unavailableHoursPerDay: 8, status: "Approved" as const, notes: "Annual leave" },
      { id: `${site}-leave-2`, siteId: site, craftpersonId: `S${site.slice(-2)}-C2`, absenceType: "SickLeave" as const, startDate: "2026-11-11", endDate: "2026-11-11", isFullDay: true, unavailableHoursPerDay: 8, status: "Approved" as const, notes: "" },
      { id: `${site}-leave-3`, siteId: site, craftpersonId: `S${site.slice(-2)}-C3`, absenceType: "Training" as const, startDate: "2026-11-11", endDate: "2026-11-11", isFullDay: false, startTime: "09:00", endTime: "13:00", unavailableHoursPerDay: 4, status: "Approved" as const, notes: "Safety training" },
    ]),
    ...seeded,
    users,
    userAccessProfiles: seedAccessProfiles(sites, seeded.craftspeople, users),
    roleDefinitions: defaultRoleDefinitions(),
    tradeRoleMappings: sites.flatMap((site) => CLASSICAL_TRADES.map((trade) => ({
      SiteId: site, Trade: trade,
      assignments: Object.fromEntries(TRADE_ASSIGNMENT_ROLES.map((role) => [role, `${site}-${role}`])),
    }))),
    siteRoleMappings: sites.map((site) => ({
      SiteId: site, assignments: Object.fromEntries(SITE_ASSIGNMENT_ROLES.map((role) => [role, `${site}-${role}`])),
    })),
    siteRoleAssignments,
    qaInspectorAssignments: sites.flatMap((siteId) => ["Mark", "Thomas", "Yvonne"].map((personName) => ({ id: `${siteId}-qa-${personName}`, siteId, personName, trades: [...CLASSICAL_TRADES], wrTypes: ["PM", "FJ"] }))),
    qaFailureReasons: [...DEFAULT_QA_FAILURE_REASONS],
  };
}

export function seedSiteData(site: SiteId): DemoData {
  return scopeData(withAccessProfileDefaults(seedData(), site), site);
}

interface Store {
  data: DemoData;
  setData: React.Dispatch<React.SetStateAction<DemoData>>;
  reset: () => void;
  commitSnapshot: (expected: DemoData, next: DemoData, options?: { optimistic?: boolean }) => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function CafmStoreProvider({ children }: { children: React.ReactNode }) {
  const { activeSiteId, activePerson } = useSiteContext();
  return <ScopedStoreProvider key={activeSiteId} site={activeSiteId} person={activePerson}>{children}</ScopedStoreProvider>;
}

function ScopedStoreProvider({ children, site, person }: { children: React.ReactNode; site: SiteId; person: string }) {
  const [data, setData] = useState<DemoData>(() => scopeData(seedData(), site));
  const personRef = useRef(person);
  personRef.current = person;
  const storageKey = `${STORAGE_KEY}:${site}`;
  const pendingKey = `${PENDING_KEY}:${site}`;
  const baseKey = `${BASE_KEY}:${site}`;
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const revision = useRef(0);
  const acknowledged = useRef("");
  const current = useRef(data);
  const busy = useRef(false);
  const blocked = useRef(false);
  const connected = useRef(false);
  const initialized = useRef(false);
  const offlineEdits = useRef(false);
  const knownRevision = useRef(false);
  current.current = data;

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
      const saved = localStorage.getItem(storageKey) ?? LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(`${key}:${site}`) ?? localStorage.getItem(key)).find(Boolean);
      let initial = scopeData(seedData(), site);
      const baseText = localStorage.getItem(baseKey);
      if (baseText) {
        const base: unknown = JSON.parse(baseText);
        if (!base || typeof base !== "object" || !("revision" in base) || !Number.isInteger(base.revision) ||
            typeof base.revision !== "number" || base.revision < 0 || !("snapshot" in base) || typeof base.snapshot !== "string") {
          throw new Error("Stored synchronization baseline has an invalid format.");
        }
        revision.current = base.revision;
        acknowledged.current = base.snapshot;
        knownRevision.current = true;
      }
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
            (("locationFreezes" in parsed) && !Array.isArray((parsed as Record<string, unknown>).locationFreezes)) ||
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
        initial = scopeData(withAccessProfileDefaults({ ...defaults, ...savedData, roleDefinitions: savedData.roleDefinitions, locationFreezes: savedData.locationFreezes ?? [], craftpersonAbsences: savedData.craftpersonAbsences ?? [], tradeRoleMappings, siteRoleMappings,
          siteRoleAssignments: savedData.siteRoleAssignments ?? defaults.siteRoleAssignments,
          craftspeople: savedData.craftspeople ?? defaults.craftspeople,
          userAccessProfiles: savedData.userAccessProfiles ?? seedAccessProfiles([site], savedData.craftspeople ?? defaults.craftspeople, savedData.users ?? defaults.users) } as DemoData, site), site);
      }
      try {
        const remote = await stateRequest(site, personRef.current, "GET");
        const pendingText = localStorage.getItem(pendingKey);
        const pending: unknown = pendingText ? JSON.parse(pendingText) : null;
        if (pending !== null && (!pending || typeof pending !== "object" || !("revision" in pending) ||
            typeof pending.revision !== "number" || !Number.isInteger(pending.revision) || pending.revision < 0)) {
          throw new Error("Stored pending synchronization data has an invalid format.");
        }
        revision.current = remote.revision;
        knownRevision.current = true;
        if (pending && typeof pending === "object" && "revision" in pending && pending.revision !== remote.revision) {
          blocked.current = true;
          setSyncError("The server changed while local edits were pending. Local edits were retained; resolve the conflict before syncing.");
        } else if (pending && typeof pending === "object" && "revision" in pending && pending.revision === remote.revision) {
          acknowledged.current = remote.state ? JSON.stringify(remote.state) : "";
        } else if (remote.state !== null) {
          if (!remote.state || typeof remote.state !== "object" || !("workRequests" in remote.state) || !Array.isArray(remote.state.workRequests)) {
            throw new Error("Invalid server state.");
          }
          const remoteData = { ...seedData(), craftpersonAbsences: [], locationFreezes: [], ...remote.state,
            roleDefinitions: "roleDefinitions" in remote.state ? remote.state.roleDefinitions : undefined,
            userAccessProfiles: "userAccessProfiles" in remote.state ? remote.state.userAccessProfiles : undefined } as DemoData;
          initial = scopeData(withAccessProfileDefaults(remoteData, site), site);
          acknowledged.current = JSON.stringify(remote.state);
        }
        connected.current = true;
        if (!blocked.current) safeStorageSet(baseKey, JSON.stringify({ revision: revision.current, snapshot: acknowledged.current }));
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Could not load server state.");
      }
      if (!active) return;
      current.current = initial;
      setData(initial);
      initialized.current = true;
      setReady(true);
      } catch (error) {
        console.error("Could not load demo data", error);
        if (active) setSyncError("Could not load saved demo data. The saved data was not overwritten.");
      }
    }
    void initialize();
    return () => { active = false; };
  }, [site, storageKey, pendingKey, baseKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      const saved = safeStorageSet(storageKey, JSON.stringify(data));
      if (saved && JSON.stringify(data) !== acknowledged.current) {
        safeStorageSet(pendingKey, JSON.stringify({ revision: revision.current }));
      }
    } catch (error) {
      console.error("Could not save demo data", error);
      setSyncError("Could not save demo data to local storage.");
    }
  }, [data, ready, storageKey, pendingKey]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    async function sync() {
      if (!initialized.current || busy.current || blocked.current) return;
      busy.current = true;
      try {
        if (!connected.current) {
          const remote = await stateRequest(site, personRef.current, "GET");
          const pendingText = localStorage.getItem(pendingKey);
          const pending: unknown = pendingText ? JSON.parse(pendingText) : null;
          if (pending !== null && (!pending || typeof pending !== "object" || !("revision" in pending) ||
              typeof pending.revision !== "number" || !Number.isInteger(pending.revision) || pending.revision < 0)) {
            blocked.current = true;
            throw new Error("Stored pending synchronization data has an invalid format.");
          }
          if (pending && typeof pending === "object" && "revision" in pending && pending.revision !== remote.revision) {
            blocked.current = true;
            throw new Error("The server changed while local edits were pending. Local edits were retained; resolve the conflict before syncing.");
          }
          if (offlineEdits.current && (!knownRevision.current || revision.current !== remote.revision)) {
            blocked.current = true;
            throw new Error("Cannot safely sync offline edits because the server baseline is unavailable or changed. Local edits were retained.");
          }
          revision.current = remote.revision;
          knownRevision.current = true;
          if (pending || offlineEdits.current) {
            acknowledged.current = remote.state ? JSON.stringify(remote.state) : "";
          } else if (remote.state !== null) {
            if (!remote.state || typeof remote.state !== "object" || !("workRequests" in remote.state) || !Array.isArray(remote.state.workRequests)) {
              throw new Error("Invalid server state.");
            }
            const remoteData = { ...seedData(), craftpersonAbsences: [], locationFreezes: [], ...remote.state,
              roleDefinitions: "roleDefinitions" in remote.state ? remote.state.roleDefinitions : undefined,
              userAccessProfiles: "userAccessProfiles" in remote.state ? remote.state.userAccessProfiles : undefined } as DemoData;
            const next = scopeData(withAccessProfileDefaults(remoteData, site), site);
            acknowledged.current = JSON.stringify(remote.state);
            current.current = next;
            if (active) setData(next);
          }
          connected.current = true;
          safeStorageSet(baseKey, JSON.stringify({ revision: revision.current, snapshot: acknowledged.current }));
        }
        const snapshot = current.current;
        const serialized = JSON.stringify(snapshot);
        if (serialized !== acknowledged.current) {
          const result = await stateRequest(site, personRef.current, "POST", { revision: revision.current, state: snapshot });
          revision.current = result.revision;
          acknowledged.current = serialized;
          offlineEdits.current = false;
          safeStorageSet(baseKey, JSON.stringify({ revision: revision.current, snapshot: acknowledged.current }));
          if (JSON.stringify(current.current) === serialized) localStorage.removeItem(pendingKey);
          else safeStorageSet(pendingKey, JSON.stringify({ revision: revision.current }));
        } else {
          const result = await stateRequest(site, personRef.current, "GET");
          if (result.revision !== revision.current && result.state && JSON.stringify(current.current) === serialized) {
            if (typeof result.state !== "object" || !("workRequests" in result.state) || !Array.isArray(result.state.workRequests)) throw new Error("Invalid server state.");
            const remoteData = { ...seedData(), craftpersonAbsences: [], locationFreezes: [], ...result.state,
              roleDefinitions: "roleDefinitions" in result.state ? result.state.roleDefinitions : undefined,
              userAccessProfiles: "userAccessProfiles" in result.state ? result.state.userAccessProfiles : undefined } as DemoData;
            const next = scopeData(withAccessProfileDefaults(remoteData, site), site);
            revision.current = result.revision;
            acknowledged.current = JSON.stringify(result.state);
            safeStorageSet(baseKey, JSON.stringify({ revision: revision.current, snapshot: acknowledged.current }));
            current.current = next;
            if (active) setData(next);
          }
        }
        if (active) setSyncError(null);
      } catch (error) {
        console.error("CAFM state sync failed", error);
        const message = error instanceof Error ? error.message : "State sync failed.";
        if (message.includes("changed")) blocked.current = true;
        if (active) setSyncError(message);
      } finally {
        busy.current = false;
      }
    }
    void sync();
    const interval = window.setInterval(() => void sync(), 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [ready, site, pendingKey, baseKey]);

  const commitSnapshot = async (expected: DemoData, next: DemoData, options?: { optimistic?: boolean }) => {
    if (!connected.current || blocked.current) throw new Error("Sync is unavailable or has a conflict; resolve it before importing.");
    if (busy.current) throw new Error("Synchronization is in progress. Try again.");
    const before = JSON.stringify(expected);
    if (JSON.stringify(current.current) !== before) throw new Error("Data changed since preview. Run the dry-run again.");
    const optimistic = options?.optimistic === true;
    const after = JSON.stringify(next);
    busy.current = true;
    let committed = false;
    if (optimistic) {
      current.current = next;
      setData(next);
    }
    try {
      const result = await stateRequest(site, personRef.current, "POST", { revision: revision.current, state: next });
      committed = true;
      revision.current = result.revision;
      acknowledged.current = after;
      if (JSON.stringify(current.current) !== (optimistic ? after : before)) {
        blocked.current = true;
        throw new Error("Changes were saved on the server, but local data changed during the commit. Local edits were retained; resolve the conflict.");
      }
      current.current = next;
      setData(next);
      let cacheError: string | null = null;
      try {
        safeStorageSet(storageKey, acknowledged.current);
        safeStorageSet(baseKey, JSON.stringify({ revision: revision.current, snapshot: acknowledged.current }));
        localStorage.removeItem(pendingKey);
      } catch (error) {
        blocked.current = true;
        console.error("Could not cache committed import", error);
        cacheError = "Changes were saved on the server, but the browser cache could not be updated. Reload before editing.";
      }
      setSyncError(cacheError);
    } catch (error) {
      if (optimistic && !committed) {
        if (JSON.stringify(current.current) === after) {
          current.current = expected;
          setData(expected);
        } else {
          blocked.current = true;
          setSyncError("The QA update could not be saved and local data changed during the request. Local edits were retained; resolve the conflict.");
        }
      }
      throw error;
    } finally {
      busy.current = false;
    }
  };

  const reset = () => {
    if (!window.confirm(`Replace saved demo data for ${site} with the Section 27 seed? This cannot be undone.`)) return;
    const previous = current.current;
    const next = { ...scopeData(seedData(), site), mobileMutationIds: previous.mobileMutationIds };
    void commitSnapshot(previous, next).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Reset failed.";
      console.error("Could not reset demo data", error);
      setSyncError(`Reset failed: ${message}`);
    });
  };

  const setUserData: React.Dispatch<React.SetStateAction<DemoData>> = (update) => {
    if (!connected.current) offlineEdits.current = true;
    setData(update);
  };
  return <StoreContext.Provider value={{ data, setData: setUserData, reset, commitSnapshot }}>
    {syncError && <div role="alert" className="bg-red-100 p-2 text-sm text-red-900">State sync: {syncError}</div>}
    {ready ? children : <div>Loading saved CAFM data...</div>}
  </StoreContext.Provider>;
}

export function useCafmStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useCafmStore must be used within CafmStoreProvider");
  return store;
}

export function useActiveUserPermissions() {
  const { data } = useCafmStore();
  const { activeSiteId, activePerson } = useSiteContext();
  const siteProfiles = data.userAccessProfiles.filter((item) => item.siteId === activeSiteId);
  const profile = siteProfiles.find((item) => item.personName === activePerson || item.fullName === activePerson) ??
    (activePerson === "Gregor" ? siteProfiles.find((item) => item.linkedCraftpersonId && item.personName.toLowerCase().startsWith("gregor ")) : undefined);
  const siteAdmin = profile?.isSiteAdmin && !profile.isSuperAdmin;
  const siteAllowed = !siteAdmin || (!!profile.managedSiteIds?.includes(activeSiteId));
  const governance = (key: keyof NonNullable<NonNullable<typeof profile>["siteAdminGovernance"]>) =>
    !siteAdmin || (siteAllowed && profile.siteAdminGovernance?.[key] === true);
  const resolved = profile && resolveEffectivePermissions(profile, data.roleDefinitions);
  const permissions = resolved && {
    ...resolved,
    canManageShiftsAndLeaves: resolved.canManageShiftsAndLeaves && governance("canManageFreezesAndShifts"),
    canManageLocationFreezes: resolved.canManageLocationFreezes && governance("canManageFreezesAndShifts"),
  };
  return { profile, permissions, governance };
}
