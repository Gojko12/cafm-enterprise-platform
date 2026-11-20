"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useSiteContext } from "@/lib/contexts/SiteContext";
import { logChecklistCorrections, LEGACY_SITE_ALIAS } from "@cafm/shared-schema";
import type { SiteId } from "@cafm/shared-schema";
import { ensureFjSurveys } from "./fj-satisfaction";
import type { DemoData } from "./cafm-data";
import { seedAccessProfiles } from "./access-profiles";
import { ahuTemplate } from "./equipment-inspection";
import { reconcileAssurance } from "./assurance-workflow";
import { migratePmState } from "./pm-orders";
import { mergeRemoteState, mergeUserEdits, stampChangedWorkRequests } from "./state-merge";
import { migrateWorkRequestIdsTo10Digits } from "./wr-id-migration";
import type { GovernanceProof } from "./wr-governance-types";
import { stateRequest, StateRequestError } from "./cafm-state-request";
import { buildSyncDelta } from "./sync-delta";
import { resolveGovernanceActor } from "./governance-actor";
export { stateRequest } from "./cafm-state-request";
export { useActiveUserPermissions } from "./active-user-permissions";
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
function pruneLegacyBackups(storage: Storage) {
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key && /^cafm[-_]/i.test(key) && (/backup|prev/i.test(key) || key.startsWith("cafm-demo-legacy-pending:") ||
      key.startsWith("cafm-demo-base-") && !key.startsWith(`${BASE_KEY}:`))) storage.removeItem(key);
  }
}

function safeStorageSet(key: string, value: string, site: SiteId): boolean {
  const storage = window.localStorage;
  try { storage.setItem(key, value); return true; }
  catch (error) {
    if (!(error instanceof DOMException) || (error.name !== "QuotaExceededError" && error.name !== "NS_ERROR_DOM_QUOTA_REACHED")) throw error;
    pruneLegacyBackups(storage);
    for (let index = storage.length - 1; index >= 0; index--) {
      const candidate = storage.key(index);
      const match = candidate?.match(/^cafm-demo-data-v\d+:(.+)$/);
      if (candidate && match && match[1] !== site && match[1] !== LEGACY_SITE_ALIAS[site] &&
          !storage.getItem(`${PENDING_KEY}:${match[1]}`)) storage.removeItem(candidate);
    }
    try { storage.setItem(key, value); return true; }
    catch (retryError) {
      if (!(retryError instanceof DOMException) || (retryError.name !== "QuotaExceededError" && retryError.name !== "NS_ERROR_DOM_QUOTA_REACHED")) throw retryError;
      console.warn("Browser storage quota exceeded after cleanup; server sync remains active.", key);
      return false;
    }
  }
}
interface Store {
  data: DemoData;
  setData: React.Dispatch<React.SetStateAction<DemoData>>;
  reset: () => void;
  commitSnapshot: (expected: DemoData, next: DemoData, options?: { optimistic?: boolean; forceReset?: boolean; governanceProof?: GovernanceProof }) => Promise<void>;
  alertsMuted: boolean;
  setAlertsMuted: (muted: boolean) => void;
}

const ALERTS_MUTED_KEY = "cafm_alerts_muted_v1";

const StoreContext = createContext<Store | null>(null);

export function CafmStoreProvider({ children }: { children: React.ReactNode }) {
  const { activeSiteId, activePerson } = useSiteContext();
  return <ScopedStoreProvider key={activeSiteId} site={activeSiteId} person={activePerson}>{children}</ScopedStoreProvider>;
}

function ScopedStoreProvider({ children, site, person }: { children: React.ReactNode; site: SiteId; person: string }) {
  const [data, setData] = useState<DemoData>(() => scopeData(seedData(), site));
  const personRef = useRef(person);
  personRef.current = person;
  const actorIdRef = useRef(person);
  actorIdRef.current = resolveGovernanceActor(data, site, person)?.id ?? person;
  const storageKey = `${STORAGE_KEY}:${site}`;
  const pendingKey = `${PENDING_KEY}:${site}`;
  const baseKey = `${BASE_KEY}:${site}`;
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [legacyBackup, setLegacyBackup] = useState(false);
  const [cacheWarning, setCacheWarning] = useState(false);
  const [alertsMuted, setAlertsMutedState] = useState(false);
  useEffect(() => { try { setAlertsMutedState(window.localStorage.getItem(ALERTS_MUTED_KEY) === "1"); } catch { /* private mode: alerts stay audible */ } }, []);
  const setAlertsMuted = (muted: boolean) => { setAlertsMutedState(muted); try { window.localStorage.setItem(ALERTS_MUTED_KEY, muted ? "1" : "0"); } catch { /* storage unavailable: session-only mute */ } };
  const legacyPendingSnapshot = useRef<{ snapshot: string; pending: unknown; base: string | null } | null>(null);
  const previousSnapshot = useRef<DemoData | null>(null);
  const cachedSnapshot = useRef("");
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
  const dirtyFieldsRef = useRef(new Set<string>());
  const hasUnsavedUserEditsRef = useRef(false);
  const pendingActor = useRef<string | null>(null);
  const editVersion = useRef(0);
  const pushTimer = useRef<number | null>(null);
  const schedulePush = useRef<(delay?: number) => void>(() => {});
  current.current = data;

  useEffect(() => {
    let active = true;
    async function initialize() {
      let savedKey: string | undefined;
      try {
      pruneLegacyBackups(localStorage);
      const legacySite = LEGACY_SITE_ALIAS[site];
      const candidates = [storageKey, ...LEGACY_STORAGE_KEYS.flatMap((key) => [`${key}:${site}`, ...(legacySite ? [`${key}:${legacySite}`] : []), key])];
      let saved: string | null = null;
      for (const key of candidates) {
        const value = localStorage.getItem(key);
        if (value !== null && (key === storageKey || value)) { savedKey = key; saved = value; break; }
      }
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
      const savedPendingText = localStorage.getItem(pendingKey);
      const savedPending: unknown = savedPendingText ? JSON.parse(savedPendingText) : null;
      if (saved && savedPending && typeof savedPending === "object" && !("userEdits" in savedPending)) {
        legacyPendingSnapshot.current = { snapshot: saved, pending: savedPending, base: baseText };
        localStorage.removeItem(pendingKey);
        setLegacyBackup(true);
      }
      if (savedPending && typeof savedPending === "object" && "userEdits" in savedPending && savedPending.userEdits === true) {
        if (!("revision" in savedPending) || typeof savedPending.revision !== "number" || !Number.isInteger(savedPending.revision) || savedPending.revision < 0 ||
            !("dirtyWrIds" in savedPending) || !Array.isArray(savedPending.dirtyWrIds) || !savedPending.dirtyWrIds.every((id: unknown) => typeof id === "string") ||
            !("dirtyFields" in savedPending) || !Array.isArray(savedPending.dirtyFields) || !savedPending.dirtyFields.every((field: unknown) => typeof field === "string")) {
          throw new Error("Stored pending synchronization data has an invalid format.");
        }
        dirtyWrIdsRef.current = new Set(savedPending.dirtyWrIds);
        dirtyFieldsRef.current = new Set(savedPending.dirtyFields);
        hasUnsavedUserEditsRef.current = true;
        pendingActor.current = "actorId" in savedPending && typeof savedPending.actorId === "string" ? savedPending.actorId : actorIdRef.current;
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
        if (hasUnsavedUserEditsRef.current && pending && typeof pending === "object" && "revision" in pending && pending.revision !== remote.revision) {
          // Keep local edits but merge newer server records; the next sync pushes the merged result.
          const normalizedRemote = remote.state ? normalizeServerState(remote.state as DemoData, site) : null;
          if (normalizedRemote) initial = mergeUserEdits(initial, normalizedRemote, dirtyWrIdsRef.current, dirtyFieldsRef.current);
          acknowledged.current = normalizedRemote ? JSON.stringify(normalizedRemote) : "";
        } else if (hasUnsavedUserEditsRef.current && pending && typeof pending === "object" && "revision" in pending && pending.revision === remote.revision) {
          const normalizedRemote = remote.state ? normalizeServerState(remote.state as DemoData, site) : null;
          acknowledged.current = normalizedRemote ? JSON.stringify(normalizedRemote) : "";
        } else if (remote.state !== null) {
          if (!remote.state || typeof remote.state !== "object" || !("workRequests" in remote.state) || !Array.isArray(remote.state.workRequests)) {
            throw new Error("Invalid server state.");
          }
          initial = normalizeServerState(remote.state as DemoData, site);
          acknowledged.current = JSON.stringify(initial);
        }
        connected.current = true;
        if (!blocked.current) safeStorageSet(baseKey, JSON.stringify({ revision: revision.current }), site);
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
        console.warn("Could not hydrate demo data; resetting the local cache.", error);
        try {
          [storageKey, baseKey, pendingKey, `cafm-wr-watermark:${site}`, ...(savedKey ? [savedKey] : [])]
            .forEach((key) => localStorage.removeItem(key));
        } catch (storageError) { console.warn("Could not clear the local CAFM cache.", storageError); }
        if (active) {
          const fallback = scopeData(seedData(), site);
          revision.current = 0;
          acknowledged.current = "";
          knownRevision.current = false;
          connected.current = false;
          dirtyWrIdsRef.current.clear();
          dirtyFieldsRef.current.clear();
          hasUnsavedUserEditsRef.current = false;
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
      const serialized = JSON.stringify(data);
      const saved = safeStorageSet(storageKey, serialized, site);
      cachedSnapshot.current = saved ? serialized : "";
      let pendingSaved = true;
      if (saved && hasUnsavedUserEditsRef.current) {
        pendingSaved = safeStorageSet(pendingKey, JSON.stringify({ revision: revision.current, userEdits: true, actorId: pendingActor.current, dirtyWrIds: [...dirtyWrIdsRef.current], dirtyFields: [...dirtyFieldsRef.current] }), site);
      }
      if (!saved || !pendingSaved) localStorage.removeItem(pendingKey);
      setCacheWarning(!saved || !pendingSaved);
    } catch (error) {
      console.error("Could not save demo data", error);
      setSyncError("Could not save demo data to local storage.");
    }
  }, [data, ready, storageKey, pendingKey, site]);

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
          const diverged = (hasUnsavedUserEditsRef.current && revision.current !== remote.revision) ||
            (offlineEdits.current && (!knownRevision.current || revision.current !== remote.revision));
          if (diverged && normalizedRemote) {
            // Auto-heal: keep local edits, merge newer server records, and let the next push publish the result.
            const merged = mergeUserEdits(current.current, normalizedRemote, dirtyWrIdsRef.current, dirtyFieldsRef.current, acknowledged.current ? JSON.parse(acknowledged.current) as DemoData : undefined);
            current.current = merged;
            if (active) setData(merged);
          }
          revision.current = remote.revision;
          knownRevision.current = true;
          if (hasUnsavedUserEditsRef.current || offlineEdits.current) {
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
          safeStorageSet(baseKey, JSON.stringify({ revision: revision.current }), site);
        }
        const snapshot = ensureFjSurveys(migrateWorkRequestIdsTo10Digits(reconcileAssurance(current.current)));
        const sentVersion = editVersion.current;
        if (snapshot !== current.current) { current.current = snapshot; if (active) setData(snapshot); }
        let outgoing = snapshot;
        let serialized = JSON.stringify(outgoing);
        if (hasUnsavedUserEditsRef.current && serialized !== acknowledged.current) {
          // Merge newer server records before pushing so stale local copies never overwrite them.
          const latest = await stateRequest(site, personRef.current, "GET");
          if (sentVersion !== editVersion.current) { schedulePush.current(); return; }
          if (latest.state && latest.revision !== revision.current) {
            const remote = normalizeServerState(latest.state as DemoData, site);
            outgoing = mergeUserEdits(snapshot, remote, dirtyWrIdsRef.current, dirtyFieldsRef.current, acknowledged.current ? JSON.parse(acknowledged.current) as DemoData : undefined);
            serialized = JSON.stringify(outgoing);
            revision.current = latest.revision;
            acknowledged.current = JSON.stringify(remote);
            if (JSON.stringify(current.current) === JSON.stringify(snapshot)) { current.current = outgoing; if (active) setData(outgoing); }
          }
          outgoing = scopeData(migrateWorkRequestIdsTo10Digits(outgoing), site);
          serialized = JSON.stringify(outgoing);
          // Stage B: push only what changed since the acknowledged server state; fall back to a
          // full-state upload before the first successful acknowledgment.
          const deltaBase: unknown = acknowledged.current ? JSON.parse(acknowledged.current) : null;
          const result = await stateRequest(site, pendingActor.current ?? personRef.current, "POST",
            deltaBase ? { revision: revision.current, delta: buildSyncDelta(deltaBase, outgoing) } : { revision: revision.current, state: outgoing },
            pendingActor.current ?? actorIdRef.current);
          revision.current = result.revision;
          if (!result.state || typeof result.state !== "object" || !("workRequests" in result.state) || !Array.isArray(result.state.workRequests)) {
            throw new Error("Server returned an invalid saved state.");
          }
          const savedState = normalizeServerState(result.state as DemoData, site);
          acknowledged.current = JSON.stringify(savedState);
          offlineEdits.current = false;
          const unchangedDuringSync = JSON.stringify(current.current) === serialized;
          const next = unchangedDuringSync ? savedState :
            mergeUserEdits(current.current, savedState, dirtyWrIdsRef.current, dirtyFieldsRef.current);
          current.current = next;
          if (active) setData(next);
          const savedById = new Map(savedState.workRequests.map((wr) => [wr.WR_ID, wr]));
          const currentById = new Map(next.workRequests.map((wr) => [wr.WR_ID, wr]));
          for (const id of dirtyWrIdsRef.current) {
            if (JSON.stringify(currentById.get(id) ?? null) === JSON.stringify(savedById.get(id) ?? null)) dirtyWrIdsRef.current.delete(id);
          }
          if (sentVersion === editVersion.current) {
            hasUnsavedUserEditsRef.current = false;
            pendingActor.current = null;
            dirtyFieldsRef.current.clear();
            dirtyWrIdsRef.current.clear();
          }
          safeStorageSet(baseKey, JSON.stringify({ revision: revision.current }), site);
          if (!hasUnsavedUserEditsRef.current) localStorage.removeItem(pendingKey);
          else if (cachedSnapshot.current === JSON.stringify(current.current)) {
            if (!safeStorageSet(pendingKey, JSON.stringify({ revision: revision.current, userEdits: true, actorId: pendingActor.current, dirtyWrIds: [...dirtyWrIdsRef.current], dirtyFields: [...dirtyFieldsRef.current] }), site)) {
              localStorage.removeItem(pendingKey);
              if (active) setCacheWarning(true);
            }
          } else {
            localStorage.removeItem(pendingKey);
          }
        } else {
          if (hasUnsavedUserEditsRef.current && serialized === acknowledged.current) {
            hasUnsavedUserEditsRef.current = false;
            pendingActor.current = null;
            dirtyFieldsRef.current.clear();
            dirtyWrIdsRef.current.clear();
            localStorage.removeItem(pendingKey);
          }
          const result = await stateRequest(site, personRef.current, "GET");
          if (!hasUnsavedUserEditsRef.current && result.revision !== revision.current && result.state && JSON.stringify(current.current) === serialized) {
            if (typeof result.state !== "object" || !("workRequests" in result.state) || !Array.isArray(result.state.workRequests)) throw new Error("Invalid server state.");
            const next = normalizeServerState(result.state as DemoData, site);
            revision.current = result.revision;
            acknowledged.current = JSON.stringify(next);
            safeStorageSet(baseKey, JSON.stringify({ revision: revision.current }), site);
            current.current = next;
            if (active) setData(next);
          }
        }
        if (active) setSyncError(null);
      } catch (error) {
        if (error instanceof StateRequestError && (error.status === 503 || error.status === 409 && /state (has )?changed/i.test(error.message))) {
          await new Promise((resolve) => window.setTimeout(resolve, 200));
          connected.current = false;
          if (active) { setSyncError(null); schedulePush.current(0); }
          return;
        }
        const context = error instanceof StateRequestError ? ` (HTTP ${error.status}, site ${site})` : "";
        console.error("CAFM state sync failed", { site, person: personRef.current, actorId: actorIdRef.current, revision: revision.current, operation: hasUnsavedUserEditsRef.current ? "push" : "poll", pendingWorkRequests: [...dirtyWrIdsRef.current], pendingFields: [...dirtyFieldsRef.current], error, details: error instanceof StateRequestError ? error.details : undefined });
        const message = error instanceof Error ? error.message : "State sync failed.";
        if (active) setSyncError(`${message}${context}`);
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

  const commitSnapshot = async (expected: DemoData, next: DemoData, options?: { optimistic?: boolean; forceReset?: boolean; governanceProof?: GovernanceProof }) => {
    if (!connected.current || blocked.current) throw new Error("Sync is unavailable or has a conflict; resolve it before importing.");
    if (pendingActor.current && pendingActor.current !== actorIdRef.current) throw new Error("Wait for the previous person's pending changes to sync.");
    // If a background GET sync is in flight, wait for it (up to 5s) instead of failing immediately.
    const waitStart = Date.now();
    while (busy.current && Date.now() - waitStart < 5000) await new Promise((resolve) => window.setTimeout(resolve, 100));
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
      previousSnapshot.current = expected;
      current.current = next;
      setData(next);
    }
    try {
      // Stage B: explicit commits (imports, QA actions) also push deltas whenever a server state has
      // been acknowledged and the commit is not a forceReset; a forceReset keeps sending the full state.
      const commitBase: unknown = !options?.forceReset && acknowledged.current ? JSON.parse(acknowledged.current) : null;
      const result = await stateRequest(site, personRef.current, "POST",
        commitBase
          ? { revision: revision.current, delta: buildSyncDelta(commitBase, next), ...(options?.governanceProof ? { governanceProof: options.governanceProof } : {}) }
          : { revision: revision.current, state: next, ...(options?.forceReset ? { forceReset: true } : {}), ...(options?.governanceProof ? { governanceProof: options.governanceProof } : {}) },
        actorIdRef.current);
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
      dirtyFieldsRef.current.clear();
      hasUnsavedUserEditsRef.current = false;
      pendingActor.current = null;
      let cacheError: string | null = null;
      try {
        const saved = safeStorageSet(storageKey, acknowledged.current, site);
        cachedSnapshot.current = saved ? acknowledged.current : "";
        safeStorageSet(baseKey, JSON.stringify({ revision: revision.current }), site);
        setCacheWarning(!saved);
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
          current.current = previousSnapshot.current ?? expected;
          setData(current.current);
        } else {
          blocked.current = true;
          setSyncError("The QA update could not be saved and local data changed during the request. Local edits were retained; resolve the conflict.");
        }
      }
      throw error;
    } finally {
      previousSnapshot.current = null;
      busy.current = false;
    }
  };

  const reset = () => {
    if (!window.confirm(`Replace saved demo data for ${site} with the Section 62 Visit #1 and 10-Year cycle seed? This cannot be undone.`)) return;
    const previous = current.current;
    const next = { ...scopeData(seedData(), site), mobileMutationIds: previous.mobileMutationIds };
    void commitSnapshot(previous, next, { forceReset: true }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Reset failed.";
      const context = error instanceof StateRequestError ? ` (HTTP ${error.status}, site ${site})` : "";
      console.error("Could not reset demo data", { site, error, details: error instanceof StateRequestError ? error.details : undefined });
      setSyncError(`Reset failed: ${message}${context}`);
    });
  };

  const setUserData: React.Dispatch<React.SetStateAction<DemoData>> = (update) => {
    if (pendingActor.current && pendingActor.current !== actorIdRef.current) {
      setSyncError("Wait for the previous person's pending changes to sync before editing.");
      return;
    }
    pendingActor.current = actorIdRef.current;
    hasUnsavedUserEditsRef.current = true;
    editVersion.current++;
    if (!connected.current) offlineEdits.current = true;
    setData((previous) => {
      let next = reconcileAssurance(typeof update === "function" ? update(previous) : update);
      const now = new Date().toISOString();
      next = { ...next, workRequests: next.workRequests.map((wr) => {
        const old = previous.workRequests.find((item) => item.WR_ID === wr.WR_ID && item.SiteId === wr.SiteId);
        return old && old !== wr ? logChecklistCorrections(old, wr, personRef.current, now) : wr;
      }) };
      const workRequests = stampChangedWorkRequests(previous.workRequests, next.workRequests);
      for (const key of Object.keys(next) as (keyof DemoData)[]) {
        if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) dirtyFieldsRef.current.add(key);
      }
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
  return <StoreContext.Provider value={{ data, setData: setUserData, reset, commitSnapshot, alertsMuted, setAlertsMuted }}>
    {!alertsMuted && <>
      {!!data.pmMigrationNotes?.length && <details className="bg-amber-50 p-2 text-sm text-amber-900"><summary>PM assignment migration notes ({data.pmMigrationNotes.length})</summary>{data.pmMigrationNotes.map((note) => <p key={note}>{note}</p>)}</details>}
      {syncError && <div role="alert" className="bg-red-100 p-2 text-sm text-red-900"><span>State sync: {syncError}</span> <button type="button" onClick={() => setAlertsMuted(true)} className="ml-2 underline font-semibold">Hide alerts</button></div>}
      {cacheWarning && <div role="alert" className="bg-amber-100 p-2 text-sm text-amber-900"><span>Browser storage is full. Edits remain in memory and will sync to the server, but may be lost if the page closes before synchronization.</span> <button type="button" onClick={() => setAlertsMuted(true)} className="ml-2 underline font-semibold">Hide alerts</button></div>}
      {legacyBackup && <div role="alert" className="bg-amber-100 p-2 text-sm text-amber-900"><span>An older pending local snapshot is held in memory only and was not automatically synchronized. It will be lost when the site changes or this page closes.</span> <button type="button" onClick={() => setAlertsMuted(true)} className="ml-2 underline font-semibold">Hide alerts</button></div>}
    </>}
    {ready ? children : <div>Loading saved CAFM data...</div>}
  </StoreContext.Provider>;
}

export function useCafmStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useCafmStore must be used within CafmStoreProvider");
  return store;
}
