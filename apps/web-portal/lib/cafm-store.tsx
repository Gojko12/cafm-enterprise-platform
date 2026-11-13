"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { logChecklistCorrections, LEGACY_SITE_ALIAS } from "@cafm/shared-schema";
import type { SiteId } from "@cafm/shared-schema";
import { ensureFjSurveys } from "./fj-satisfaction";
import type { DemoData } from "./cafm-data";
import { seedAccessProfiles, resolveEffectivePermissions } from "./access-profiles";
import { ahuTemplate } from "./equipment-inspection";
import { reconcileAssurance } from "./assurance-workflow";
import { migratePmState } from "./pm-orders";
import { mergeRemoteState, recordStamp, stampChangedWorkRequests } from "./state-merge";
import { migrateWorkRequestIdsTo10Digits } from "./wr-id-migration";
export { getEffectiveCraftpersonShift } from "./craftperson-shifts";
export type { DemoData, ExtractedDesk, TradeRoleMapping, SiteRoleMapping } from "./cafm-data";

export { ASSIGNMENT_ROLES, TRADE_ASSIGNMENT_ROLES, SITE_ASSIGNMENT_ROLES, ROLE_LABELS, seedSiteData } from "./demo-seed";
import { scopeData, withAccessProfileDefaults, seedData, SITE_ASSIGNMENT_ROLES, TRADE_ASSIGNMENT_ROLES } from "./demo-seed";
const STORAGE_KEY = "cafm-demo-data-v24";
const LEGACY_STORAGE_KEYS = ["cafm-demo-data-v23", "cafm-demo-data-v22", "cafm-demo-data-v21", "cafm-demo-data-v20", "cafm-demo-data-v19", "cafm-demo-data-v16", "cafm-demo-data-v15", "cafm-demo-data-v14", "cafm-demo-data-v13", "cafm-demo-data-v12", "cafm-demo-data-v11", "cafm-demo-data-v10", "cafm-demo-data-v9", "cafm-demo-data-v8", "cafm-demo-data-v7", "cafm-demo-data-v6", "cafm-demo-data-v5", "cafm-demo-data-v4", "cafm-demo-data-v3", "cafm-demo-data-v2", "cafm-demo-data-v1"];
const PENDING_KEY = "cafm-demo-pending-v1";
// v2 baselines keep only `{ revision }` metadata; v1 baselines duplicated the whole state
// snapshot per site and pushed multi-site setups over Chrome's 5 MB localStorage quota.
const BASE_KEY = "cafm-demo-base-v2";
function normalizeServerState(state: DemoData, site: SiteId): DemoData {
  const remoteData = { ...seedData(), suppressedPmOccurrences: [], auditCampaigns: [], auditFindings: [], auditInspections: [], auditTemplates: [], auditAssurance: { checkpointTemplates: [ahuTemplate], equipmentInspections: [] }, ...state,
    roleDefinitions: "roleDefinitions" in state ? state.roleDefinitions : undefined,
    userAccessProfiles: "userAccessProfiles" in state ? state.userAccessProfiles : undefined } as DemoData;
  return ensureFjSurveys(scopeData(migrateWorkRequestIdsTo10Digits(withAccessProfileDefaults(remoteData, site)), site));
}
function trackNewerLocalWorkRequests(local: DemoData, remote: DemoData | null, dirtyIds: Set<string>) {
  const serverById = new Map((remote?.workRequests ?? []).map((wr) => [wr.WR_ID, wr]));
  for (const wr of local.workRequests) {
    const server = serverById.get(wr.WR_ID);
    if (!server || recordStamp(wr) > recordStamp(server)) dirtyIds.add(wr.WR_ID);
  }
}
function safeStorageSet(key: string, value: string): boolean {
  const storage = window.localStorage;
  for (let index = storage.length - 1; index >= 0; index--) {
    const candidate = storage.key(index);
    // Remove outdated baselines (including v1 full-state snapshots) for every site to reclaim quota.
    if (candidate?.startsWith("cafm-demo-base-") && !candidate.startsWith(`${BASE_KEY}:`)) storage.removeItem(candidate);
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
  commitSnapshot: (expected: DemoData, next: DemoData, options?: { optimistic?: boolean; forceReset?: boolean }) => Promise<void>;
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
  const dirtyWrIdsRef = useRef(new Set<string>());
  const pushTimer = useRef<number | null>(null);
  const schedulePush = useRef<(delay?: number) => void>(() => {});
  current.current = data;

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
      const legacySite = LEGACY_SITE_ALIAS[site];
      const saved = localStorage.getItem(storageKey) ?? LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(`${key}:${site}`) ?? (legacySite ? localStorage.getItem(`${key}:${legacySite}`) : null) ?? localStorage.getItem(key)).find(Boolean);
      let initial = scopeData(seedData(), site);
      const baseText = localStorage.getItem(baseKey);
      if (baseText) {
        const base: unknown = JSON.parse(baseText);
        if (!base || typeof base !== "object" || !("revision" in base) || !Number.isInteger(base.revision) ||
            typeof base.revision !== "number" || base.revision < 0) {
          throw new Error("Stored synchronization baseline has an invalid format.");
        }
        revision.current = base.revision;
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
        initial = scopeData(migrateWorkRequestIdsTo10Digits(withAccessProfileDefaults({ ...defaults, suppressedPmOccurrences: [], auditCampaigns: [], auditFindings: [], auditInspections: [], auditTemplates: [], auditAssurance: { checkpointTemplates: [ahuTemplate], equipmentInspections: [] }, ...savedData, roleDefinitions: savedData.roleDefinitions, locationFreezes: savedData.locationFreezes ?? [], craftpersonAbsences: savedData.craftpersonAbsences ?? [], tradeRoleMappings, siteRoleMappings,
          siteRoleAssignments: savedData.siteRoleAssignments ?? defaults.siteRoleAssignments,
          craftspeople: savedData.craftspeople ?? defaults.craftspeople,
          userAccessProfiles: savedData.userAccessProfiles ?? seedAccessProfiles([site], savedData.craftspeople ?? defaults.craftspeople, savedData.users ?? defaults.users) } as DemoData, site)), site);
      }
      try {
        const remote = await stateRequest(site, personRef.current, "GET");
        if (remote.state !== null && (!remote.state || typeof remote.state !== "object" ||
            !("workRequests" in remote.state) || !Array.isArray(remote.state.workRequests))) {
          throw new Error("Invalid server state.");
        }
        const pendingText = localStorage.getItem(pendingKey);
        const pending: unknown = pendingText ? JSON.parse(pendingText) : null;
        if (pending !== null && (!pending || typeof pending !== "object" || !("revision" in pending) ||
            typeof pending.revision !== "number" || !Number.isInteger(pending.revision) || pending.revision < 0)) {
          throw new Error("Stored pending synchronization data has an invalid format.");
        }
        revision.current = remote.revision;
        knownRevision.current = true;
        if (pending && typeof pending === "object" && "revision" in pending && pending.revision !== remote.revision) {
          // Keep local edits but merge newer server records; the next sync pushes the merged result.
          const normalizedRemote = remote.state ? normalizeServerState(remote.state as DemoData, site) : null;
          trackNewerLocalWorkRequests(initial, normalizedRemote, dirtyWrIdsRef.current);
          initial = ensureFjSurveys(scopeData(migrateWorkRequestIdsTo10Digits(mergeRemoteState(initial, normalizedRemote, dirtyWrIdsRef.current)), site));
          acknowledged.current = normalizedRemote ? JSON.stringify(normalizedRemote) : "";
        } else if (pending && typeof pending === "object" && "revision" in pending && pending.revision === remote.revision) {
          const normalizedRemote = remote.state ? normalizeServerState(remote.state as DemoData, site) : null;
          trackNewerLocalWorkRequests(initial, normalizedRemote, dirtyWrIdsRef.current);
          acknowledged.current = normalizedRemote ? JSON.stringify(normalizedRemote) : "";
        } else if (remote.state !== null) {
          if (!remote.state || typeof remote.state !== "object" || !("workRequests" in remote.state) || !Array.isArray(remote.state.workRequests)) {
            throw new Error("Invalid server state.");
          }
          initial = normalizeServerState(remote.state as DemoData, site);
          acknowledged.current = JSON.stringify(initial);
        }
        connected.current = true;
        if (!blocked.current) safeStorageSet(baseKey, JSON.stringify({ revision: revision.current }));
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Could not load server state.");
      }
      if (!active) return;
      initial = ensureFjSurveys(initial);
      current.current = initial;
      setData(initial);
      initialized.current = true;
      setReady(true);
      } catch (error) {
        console.error("Could not load demo data", error);
        // Corrupt or stale local cache must never block entry: drop it and continue with the seed (server state is re-pulled on the next sync).
        try { [storageKey, baseKey, pendingKey].forEach((key) => localStorage.removeItem(key)); } catch { /* storage unavailable */ }
        if (active) {
          const fallback = scopeData(seedData(), site);
          revision.current = 0;
          acknowledged.current = "";
          knownRevision.current = false;
          current.current = fallback;
          setData(fallback);
          initialized.current = true;
          setSyncError("Local cache was corrupt and has been reset. Reconnect to reload server data.");
          setReady(true);
        }
      }
    }
    void initialize();
    return () => { active = false; };
  }, [site, storageKey, pendingKey, baseKey]);

  useEffect(() => {
    if (!ready) return;
    const next = ensureFjSurveys(data);
    if (next !== data) setData(next);
  }, [data, ready]);

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
          if (remote.state !== null && (!remote.state || typeof remote.state !== "object" ||
              !("workRequests" in remote.state) || !Array.isArray(remote.state.workRequests))) {
            throw new Error("Invalid server state.");
          }
          const pendingText = localStorage.getItem(pendingKey);
          let pending: unknown = null;
          try { pending = pendingText ? JSON.parse(pendingText) : null; } catch { pending = null; }
          if (pending !== null && (!pending || typeof pending !== "object" || !("revision" in pending) ||
              typeof pending.revision !== "number" || !Number.isInteger(pending.revision) || pending.revision < 0)) {
            localStorage.removeItem(pendingKey);
            pending = null;
          }
          const normalizedRemote = remote.state ? normalizeServerState(remote.state as DemoData, site) : null;
          if (pending || offlineEdits.current) trackNewerLocalWorkRequests(current.current, normalizedRemote, dirtyWrIdsRef.current);
          const diverged = (pending && typeof pending === "object" && "revision" in pending && pending.revision !== remote.revision) ||
            (offlineEdits.current && (!knownRevision.current || revision.current !== remote.revision));
          if (diverged && normalizedRemote) {
            // Auto-heal: keep local edits, merge newer server records, and let the next push publish the result.
            const merged = ensureFjSurveys(scopeData(migrateWorkRequestIdsTo10Digits(mergeRemoteState(current.current, normalizedRemote, dirtyWrIdsRef.current)), site));
            current.current = merged;
            if (active) setData(merged);
          }
          revision.current = remote.revision;
          knownRevision.current = true;
          if (pending || offlineEdits.current) {
            acknowledged.current = normalizedRemote ? JSON.stringify(normalizedRemote) : "";
          } else if (normalizedRemote) {
            // Never drop locally created or edited WRs that the server does not have yet.
            const next = dirtyWrIdsRef.current.size
              ? ensureFjSurveys(scopeData(migrateWorkRequestIdsTo10Digits(mergeRemoteState(current.current, normalizedRemote, dirtyWrIdsRef.current)), site))
              : normalizedRemote;
            acknowledged.current = JSON.stringify(normalizedRemote);
            current.current = next;
            if (active) setData(next);
          }
          connected.current = true;
          safeStorageSet(baseKey, JSON.stringify({ revision: revision.current }));
        }
        const snapshot = ensureFjSurveys(migrateWorkRequestIdsTo10Digits(reconcileAssurance(current.current)));
        if (snapshot !== current.current) { current.current = snapshot; if (active) setData(snapshot); }
        let outgoing = snapshot;
        let serialized = JSON.stringify(outgoing);
        if (serialized !== acknowledged.current) {
          // Merge newer server records before pushing so stale local copies never overwrite them.
          const latest = await stateRequest(site, personRef.current, "GET");
          if (latest.state && latest.revision !== revision.current) {
            outgoing = ensureFjSurveys(migrateWorkRequestIdsTo10Digits(mergeRemoteState(snapshot, latest.state, dirtyWrIdsRef.current)));
            serialized = JSON.stringify(outgoing);
            revision.current = latest.revision;
            if (JSON.stringify(current.current) === JSON.stringify(snapshot)) { current.current = outgoing; if (active) setData(outgoing); }
          }
          outgoing = scopeData(migrateWorkRequestIdsTo10Digits(outgoing), site);
          serialized = JSON.stringify(outgoing);
          const result = await stateRequest(site, personRef.current, "POST", { revision: revision.current, state: outgoing });
          revision.current = result.revision;
          if (!result.state || typeof result.state !== "object" || !("workRequests" in result.state) || !Array.isArray(result.state.workRequests)) {
            throw new Error("Server returned an invalid saved state.");
          }
          const savedState = normalizeServerState(result.state as DemoData, site);
          acknowledged.current = JSON.stringify(savedState);
          offlineEdits.current = false;
          const unchangedDuringSync = JSON.stringify(current.current) === serialized;
          const next = unchangedDuringSync ? savedState :
            ensureFjSurveys(scopeData(migrateWorkRequestIdsTo10Digits(mergeRemoteState(current.current, savedState, dirtyWrIdsRef.current)), site));
          current.current = next;
          if (active) setData(next);
          const savedById = new Map(savedState.workRequests.map((wr) => [wr.WR_ID, wr]));
          const currentById = new Map(next.workRequests.map((wr) => [wr.WR_ID, wr]));
          for (const id of dirtyWrIdsRef.current) {
            if (JSON.stringify(currentById.get(id) ?? null) === JSON.stringify(savedById.get(id) ?? null)) dirtyWrIdsRef.current.delete(id);
          }
          safeStorageSet(baseKey, JSON.stringify({ revision: revision.current }));
          if (JSON.stringify(next) === acknowledged.current) localStorage.removeItem(pendingKey);
          else safeStorageSet(pendingKey, JSON.stringify({ revision: revision.current }));
        } else {
          const result = await stateRequest(site, personRef.current, "GET");
          if (result.revision !== revision.current && result.state && JSON.stringify(current.current) === serialized) {
            if (typeof result.state !== "object" || !("workRequests" in result.state) || !Array.isArray(result.state.workRequests)) throw new Error("Invalid server state.");
            const next = normalizeServerState(result.state as DemoData, site);
            revision.current = result.revision;
            acknowledged.current = JSON.stringify(next);
            safeStorageSet(baseKey, JSON.stringify({ revision: revision.current }));
            current.current = next;
            if (active) setData(next);
          }
        }
        if (active) setSyncError(null);
      } catch (error) {
        console.error("CAFM state sync failed", error);
        const message = error instanceof Error ? error.message : "State sync failed.";
        if (message.includes("changed") && connected.current) blocked.current = true;
        if (active) setSyncError(message);
      } finally {
        busy.current = false;
      }
    }
    void sync();
    // Debounced immediate push: a local mutation saves ~150ms later instead of waiting for the next poll tick.
    schedulePush.current = (delay = 150) => {
      if (pushTimer.current !== null) window.clearTimeout(pushTimer.current);
      pushTimer.current = window.setTimeout(() => {
        pushTimer.current = null;
        if (busy.current) { schedulePush.current(250); return; }
        void sync();
      }, delay);
    };
    const run = () => { if (document.visibilityState === "visible") void sync(); };
    const interval = window.setInterval(run, 2500);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      active = false;
      schedulePush.current = () => {};
      if (pushTimer.current !== null) { window.clearTimeout(pushTimer.current); pushTimer.current = null; }
      window.clearInterval(interval);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [ready, site, pendingKey, baseKey]);

  const commitSnapshot = async (expected: DemoData, next: DemoData, options?: { optimistic?: boolean; forceReset?: boolean }) => {
    if (!connected.current || blocked.current) throw new Error("Sync is unavailable or has a conflict; resolve it before importing.");
    if (busy.current) throw new Error("Synchronization is in progress. Try again.");
    const before = JSON.stringify(expected);
    if (JSON.stringify(current.current) !== before) throw new Error("Data changed since preview. Run the dry-run again.");
    const optimistic = options?.optimistic === true;
    next = scopeData(migrateWorkRequestIdsTo10Digits(reconcileAssurance(migratePmState({ ...next, workRequests: next.workRequests.map((wr) => {
      const old = expected.workRequests.find((item) => item.WR_ID === wr.WR_ID && item.SiteId === wr.SiteId);
      return old && old !== wr ? logChecklistCorrections(old, wr, personRef.current, new Date().toISOString()) : wr;
    }) }))), site);
    const after = JSON.stringify(next);
    busy.current = true;
    let committed = false;
    if (optimistic) {
      current.current = next;
      setData(next);
    }
    try {
      const result = await stateRequest(site, personRef.current, "POST", { revision: revision.current, state: next, ...(options?.forceReset ? { forceReset: true } : {}) });
      committed = true;
      revision.current = result.revision;
      if (!result.state || typeof result.state !== "object" || !("workRequests" in result.state) || !Array.isArray(result.state.workRequests)) throw new Error("Server returned an invalid saved state.");
      const savedState = normalizeServerState(result.state as DemoData, site);
      acknowledged.current = JSON.stringify(savedState);
      if (JSON.stringify(current.current) !== (optimistic ? after : before)) {
        blocked.current = true;
        throw new Error("Changes were saved on the server, but local data changed during the commit. Local edits were retained; resolve the conflict.");
      }
      current.current = savedState;
      setData(savedState);
      dirtyWrIdsRef.current.clear();
      let cacheError: string | null = null;
      try {
        safeStorageSet(storageKey, acknowledged.current);
        safeStorageSet(baseKey, JSON.stringify({ revision: revision.current }));
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
    if (!window.confirm(`Replace saved demo data for ${site} with the Section 62 Visit #1 and 10-Year cycle seed? This cannot be undone.`)) return;
    const previous = current.current;
    const next = { ...scopeData(seedData(), site), mobileMutationIds: previous.mobileMutationIds };
    void commitSnapshot(previous, next, { forceReset: true }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Reset failed.";
      console.error("Could not reset demo data", error);
      setSyncError(`Reset failed: ${message}`);
    });
  };

  const setUserData: React.Dispatch<React.SetStateAction<DemoData>> = (update) => {
    if (!connected.current) offlineEdits.current = true;
    setData((previous) => {
      let next = reconcileAssurance(typeof update === "function" ? update(previous) : update);
      const now = new Date().toISOString();
      next = { ...next, workRequests: next.workRequests.map((wr) => {
        const old = previous.workRequests.find((item) => item.WR_ID === wr.WR_ID && item.SiteId === wr.SiteId);
        return old && old !== wr ? logChecklistCorrections(old, wr, personRef.current, now) : wr;
      }) };
      const workRequests = stampChangedWorkRequests(previous.workRequests, next.workRequests);
      const previousById = new Map(previous.workRequests.map((wr) => [wr.WR_ID, wr]));
      for (const wr of next.workRequests) {
        const old = previousById.get(wr.WR_ID);
        if (!old || JSON.stringify(old) !== JSON.stringify(wr)) dirtyWrIdsRef.current.add(wr.WR_ID);
      }
      const nextIds = new Set(next.workRequests.map((wr) => wr.WR_ID));
      for (const wr of previous.workRequests) if (!nextIds.has(wr.WR_ID)) dirtyWrIdsRef.current.add(wr.WR_ID);
      return workRequests === next.workRequests ? next : { ...next, workRequests };
    });
    schedulePush.current();
  };
  return <StoreContext.Provider value={{ data, setData: setUserData, reset, commitSnapshot }}>
    {!!data.pmMigrationNotes?.length && <details className="bg-amber-50 p-2 text-sm text-amber-900"><summary>PM assignment migration notes ({data.pmMigrationNotes.length})</summary>{data.pmMigrationNotes.map((note) => <p key={note}>{note}</p>)}</details>}
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
