"use client";

import { useEffect, useState } from "react";
import type { SiteId, UserAccessProfile } from "@cafm/shared-schema";
import { ALL_SITES, DEFAULT_SITE_ADMIN_GOVERNANCE, assignRoles, isPersonProfile, migrateRoles, seedAccessProfiles } from "@/lib/access-profiles";
import { seedSiteData, stateRequest, useActiveUserPermissions, useCafmStore } from "@/lib/cafm-store";
import type { DemoData } from "@/lib/cafm-data";
import { useSiteContext } from "@/lib/contexts/SiteContext";

const sites: Record<SiteId, string> = { "SITE-01": "ESOC Darmstadt", "SITE-02": "ESTEC Noordwijk", "SITE-03": "ESRIN Frascati" };
const controls = [
  ["canManageUsersAndVPA", "Manage Site Users & VPA"],
  ["canManageRoleAssignments", "Manage LJ Trade Managers"],
  ["canManageAuditQuotas", "Manage QA Audit Quotas"],
  ["canManageFreezesAndShifts", "Manage Freezes & Shifts"],
  ["canResetOrExportSiteData", "Export/Import Site Data"],
] as const;
type SiteSnapshot = { revision: number; state: Record<string, unknown> & { userAccessProfiles: UserAccessProfile[] } };

export function SiteAdminGovernance() {
  const { activeSiteId, activePerson } = useSiteContext();
  const { profile } = useActiveUserPermissions();
  const { data, commitSnapshot } = useCafmStore();
  const [remote, setRemote] = useState<Partial<Record<SiteId, SiteSnapshot>>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<Partial<Record<SiteId, string>>>({});
  const [expanded, setExpanded] = useState("");
  const allowed = !!profile?.isSuperAdmin;

  useEffect(() => {
    let active = true;
    setRemote({});
    if (!allowed) return;
    void Promise.allSettled(ALL_SITES.filter((site) => site !== activeSiteId).map(async (site) => {
      let result = await stateRequest(site, activePerson, "GET");
      if (!result.state) result = await stateRequest(site, activePerson, "POST", { revision: result.revision, state: seedSiteData(site) });
      if (!result.state || typeof result.state !== "object" || !("craftspeople" in result.state) || !Array.isArray(result.state.craftspeople) || !("users" in result.state) || !Array.isArray(result.state.users)) throw new Error(`${site} state is invalid. Open that site to resolve it.`);
      const source = result.state as DemoData;
      const state = { ...source, userAccessProfiles: source.userAccessProfiles ?? seedAccessProfiles([site], source.craftspeople, source.users) };
      const migrated = migrateRoles(state.userAccessProfiles, Array.isArray(state.roleDefinitions) ? state.roleDefinitions : undefined);
      return [site, { revision: result.revision, state: { ...state, userAccessProfiles: migrated.profiles, roleDefinitions: migrated.roles } }] as const;
    })).then((results) => {
      if (!active) return;
      const entries = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : "Could not load site administrators."] : []);
      setRemote(Object.fromEntries(entries));
      setError(failures.join(" "));
    });
    return () => { active = false; };
  }, [activeSiteId, activePerson, allowed]);

  const update = async (site: SiteId, target: UserAccessProfile, change: (item: UserAccessProfile) => UserAccessProfile) => {
    if (!allowed || !profile?.managedSiteIds?.includes(site)) { setError("Super Admin permission for this site is required."); return; }
    setBusy(true); setError("");
    try {
      if (site === activeSiteId) {
        await commitSnapshot(data, { ...data, userAccessProfiles: data.userAccessProfiles.map((item) => item.id === target.id ? change(item) : item) });
      } else {
        const snapshot = remote[site];
        if (!snapshot) throw new Error(`Load ${site} before editing its administrators.`);
        const next = { ...snapshot.state, userAccessProfiles: snapshot.state.userAccessProfiles.map((item) => item.id === target.id ? change(item) : item) };
        const result = await stateRequest(site, activePerson, "POST", { revision: snapshot.revision, state: next });
        setRemote((current) => ({ ...current, [site]: { revision: result.revision, state: next } }));
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save administrator governance."); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
    <h2 className="text-xl font-bold">👑 Global Super Admin — Multi-Site Administrators Governance</h2>
    {!allowed && <p>Only a Super Admin can manage site administrators.</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="grid gap-3 lg:grid-cols-3">{ALL_SITES.map((site) => {
      const profiles = site === activeSiteId ? data.userAccessProfiles : remote[site]?.state.userAccessProfiles;
      const admins = profiles?.filter((item) => item.isSiteAdmin && !item.isSuperAdmin && item.primaryRole === "SiteAdministrator") ?? [];
      const candidates = profiles?.filter((item) => isPersonProfile(item) && !item.isSiteAdmin && !item.isSuperAdmin && item.primaryRole !== "SuperAdmin") ?? [];
      const canEdit = allowed && !!profile?.managedSiteIds?.includes(site) && !busy;
      return <div key={site} className="space-y-2 rounded border p-3"><h3 className="font-bold">{sites[site]} · {site}</h3>
        {!profiles ? <p>{allowed ? "Site data unavailable." : "Switch to this site to view administrators."}</p> : admins.length ? admins.map((admin) => <div key={admin.id} className="rounded border p-2"><strong>{admin.fullName}</strong>
          <div className="flex flex-wrap gap-2"><button disabled={!canEdit} onClick={() => setExpanded(expanded === admin.id ? "" : admin.id)}>Configure Site Admin Limits</button>
            <button disabled={!canEdit} onClick={() => { if (window.confirm(`Revoke site administrator access for ${admin.fullName}?`)) void update(site, admin, (item) => assignRoles(item, ["craftperson"], site === activeSiteId ? data.roleDefinitions : (remote[site]?.state.roleDefinitions as typeof data.roleDefinitions))); }}>Revoke Site Admin</button></div>
          {expanded === admin.id && controls.map(([key, label]) => <label key={key} className="block"><input type="checkbox" disabled={!canEdit} checked={admin.siteAdminGovernance?.[key] ?? false} onChange={(event) => void update(site, admin, (item) => ({ ...item, siteAdminGovernance: { ...(item.siteAdminGovernance ?? { ...DEFAULT_SITE_ADMIN_GOVERNANCE, canManageUsersAndVPA: false, canManageRoleAssignments: false, canManageAuditQuotas: false, canManageFreezesAndShifts: false, canResetOrExportSiteData: false }), [key]: event.target.checked } }))} /> {label}</label>)}
        </div>) : <p>No site administrators.</p>}
        <select aria-label={`Select administrator for ${site}`} value={selection[site] ?? ""} onChange={(event) => setSelection((current) => ({ ...current, [site]: event.target.value }))} disabled={!canEdit}><option value="">Select user</option>{candidates.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select>{" "}
        <button disabled={!canEdit || !selection[site]} onClick={() => { const item = candidates.find((candidate) => candidate.id === selection[site]); if (item) void update(site, item, (current) => assignRoles(current, ["site-admin"], site === activeSiteId ? data.roleDefinitions : (remote[site]?.state.roleDefinitions as typeof data.roleDefinitions))); }}>+ Assign Site Administrator</button>
      </div>;
    })}</div>
  </section>;
}
