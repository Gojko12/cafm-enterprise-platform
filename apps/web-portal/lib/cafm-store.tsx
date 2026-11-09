"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import type { SiteId } from "@cafm/shared-schema";
import type { DemoData } from "./cafm-data";
import { seedAccessProfiles, resolveEffectivePermissions } from "./access-profiles";
import { ahuTemplate } from "./equipment-inspection";
import { reconcileAssurance } from "./assurance-workflow";
export { getEffectiveCraftpersonShift } from "./craftperson-shifts";
export type { DemoData, ExtractedDesk, TradeRoleMapping, SiteRoleMapping } from "./cafm-data";

export { ASSIGNMENT_ROLES, TRADE_ASSIGNMENT_ROLES, SITE_ASSIGNMENT_ROLES, ROLE_LABELS, seedSiteData } from "./demo-seed";
import { scopeData, withAccessProfileDefaults, seedData, SITE_ASSIGNMENT_ROLES, TRADE_ASSIGNMENT_ROLES } from "./demo-seed";
const STORAGE_KEY = "cafm-demo-data-v17";
const LEGACY_STORAGE_KEYS = ["cafm-demo-data-v16", "cafm-demo-data-v15", "cafm-demo-data-v14", "cafm-demo-data-v13", "cafm-demo-data-v12", "cafm-demo-data-v11", "cafm-demo-data-v10", "cafm-demo-data-v9", "cafm-demo-data-v8", "cafm-demo-data-v7", "cafm-demo-data-v6", "cafm-demo-data-v5", "cafm-demo-data-v4", "cafm-demo-data-v3", "cafm-demo-data-v2", "cafm-demo-data-v1"];
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
  const token = process.env.NEXT_PUBLIC_CAFM_SYNC_TOKEN;
  const response = await fetch("/api/cafm-state", {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "X-CAFM-Site-Id": site, "X-CAFM-Person": person, ...(body ? { "Content-Type": "application/json" } : {}) },
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
        initial = scopeData(withAccessProfileDefaults({ ...defaults, auditCampaigns: [], auditFindings: [], auditInspections: [], auditTemplates: [], auditAssurance: { checkpointTemplates: [ahuTemplate], equipmentInspections: [] }, ...savedData, roleDefinitions: savedData.roleDefinitions, locationFreezes: savedData.locationFreezes ?? [], craftpersonAbsences: savedData.craftpersonAbsences ?? [], tradeRoleMappings, siteRoleMappings,
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
          const remoteData = { ...seedData(), auditCampaigns: [], auditFindings: [], auditInspections: [], auditTemplates: [], auditAssurance: { checkpointTemplates: [ahuTemplate], equipmentInspections: [] }, craftpersonAbsences: [], locationFreezes: [], ...remote.state,
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
            const remoteData = { ...seedData(), auditCampaigns: [], auditFindings: [], auditInspections: [], auditTemplates: [], auditAssurance: { checkpointTemplates: [ahuTemplate], equipmentInspections: [] }, craftpersonAbsences: [], locationFreezes: [], ...remote.state,
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
        const snapshot = reconcileAssurance(current.current);
        if (snapshot !== current.current) { current.current = snapshot; if (active) setData(snapshot); }
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
            const remoteData = { ...seedData(), auditCampaigns: [], auditFindings: [], auditInspections: [], auditTemplates: [], auditAssurance: { checkpointTemplates: [ahuTemplate], equipmentInspections: [] }, craftpersonAbsences: [], locationFreezes: [], ...result.state,
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
    next = reconcileAssurance(next);
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
    setData((previous) => reconcileAssurance(typeof update === "function" ? update(previous) : update));
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
